/**
 * POST /api/sub-admin/mutate · Crear / editar / borrar contenido del portal de
 * suscriptores. Body: { entity, action, payload }
 *   entity : 'event' (community_events: eventos/grupos/ofertas/viajes) | 'partner' | 'user' | 'request'
 *   action : 'create' | 'update' | 'delete'
 *   payload: campos del registro (incluye id para update/delete)
 * Gate: sólo sesión con role='subscriber_admin'.
 */
const { getSubscriptionsSupabase } = require('../../lib/subscriptions-supabase');
const { readSubscriptionsAdmin } = require('../../lib/subscriptions-admin-auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { parseImageDataUrl, uploadPartnerLogo } = require('../../lib/subscriptions-partner-logo');

// Campos permitidos por entidad (whitelist)
const EVENT_FIELDS   = ['title', 'type', 'description', 'location', 'city', 'starts_at', 'ends_at', 'capacity', 'expires_at', 'meta', 'image_url', 'active', 'sort_order'];
const PARTNER_FIELDS = ['name', 'category', 'city', 'description', 'benefits', 'discount', 'contact_url', 'booking_url', 'eligibility', 'logo_url', 'active', 'sort_order'];
const USER_FIELDS    = ['ciudad', 'nombre', 'apellidos', 'subscription_status', 'subscription_plan', 'robin_level_override'];
const REQUEST_FIELDS = ['status', 'title', 'details', 'category'];
const DISCOUNT_FIELDS = ['code', 'percent_off', 'active', 'max_redemptions', 'note', 'duration_months'];
const CHALLENGE_FIELDS = ['title', 'description', 'advance_days', 'files', 'questions', 'active', 'sort_order'];
const FAQ_FIELDS = ['question', 'answer', 'category', 'published', 'sort_order', 'updated_at'];
const SUBMISSION_FIELDS = ['status', 'note'];

function normDuration(data) {
  if (Object.prototype.hasOwnProperty.call(data, 'duration_months')) {
    const d = parseInt(data.duration_months, 10);
    data.duration_months = (Number.isFinite(d) && d >= 1 && d <= 12) ? d : null; // null = ilimitado
  }
}

function pick(obj, fields) {
  const out = {};
  fields.forEach((f) => { if (obj[f] !== undefined) out[f] = obj[f]; });
  return out;
}

const TABLES = { event: 'community_events', partner: 'partners', user: 'subscribers', request: 'service_requests', discount_code: 'discount_codes', notification: 'notifications', challenge: 'challenges', submission: 'challenge_submissions', faq: 'subscription_faqs' };
const FIELDS = { event: EVENT_FIELDS, partner: PARTNER_FIELDS, user: USER_FIELDS, request: REQUEST_FIELDS, discount_code: DISCOUNT_FIELDS, notification: ['title', 'content'], challenge: CHALLENGE_FIELDS, submission: SUBMISSION_FIELDS, faq: FAQ_FIELDS };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = await readSubscriptionsAdmin(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const { entity, action, payload = {} } = body;
  const table = TABLES[entity];
  const fields = FIELDS[entity];
  if (!table || !fields) return json({ error: 'bad_entity' }, { statusCode: 400 });
  if (!['create', 'update', 'delete'].includes(action)) return json({ error: 'bad_action' }, { statusCode: 400 });

  // Reglas de seguridad: usuarios sólo se actualizan (no crear/borrar desde aquí)
  if (entity === 'user' && action !== 'update') return json({ error: 'user_update_only' }, { statusCode: 400 });
  if (entity === 'request' && action === 'create') return json({ error: 'request_no_create' }, { statusCode: 400 });
  if (entity === 'submission' && action !== 'update') return json({ error: 'submission_update_only' }, { statusCode: 400 });

  try {
    const sb = getSubscriptionsSupabase();

    // --- Validación de entregas de retos (aplica/retira días) ---
    if (entity === 'submission' && action === 'update') {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      const newStatus = ['validated', 'rejected', 'pending'].includes(payload.status) ? payload.status : 'pending';
      const { data: sub, error: eSub } = await sb.from('challenge_submissions')
        .select('id, user_id, challenge_id, status').eq('id', payload.id).single();
      if (eSub || !sub) return json({ error: 'not_found' }, { statusCode: 404 });
      const wasValidated = sub.status === 'validated';
      const nowIso = new Date().toISOString();
      const { error: eUpd } = await sb.from('challenge_submissions')
        .update({ status: newStatus, note: payload.note != null ? payload.note : null, validated_at: newStatus === 'validated' ? nowIso : null })
        .eq('id', sub.id);
      if (eUpd) throw eUpd;
      const { data: ch } = await sb.from('challenges').select('advance_days, title').eq('id', sub.challenge_id).single();
      const days = (ch && ch.advance_days) || 0;
      async function bumpDays(delta) {
        if (!delta) return;
        const { data: u } = await sb.from('subscribers').select('bonus_days').eq('id', sub.user_id).single();
        const cur = (u && u.bonus_days) || 0;
        await sb.from('subscribers').update({ bonus_days: Math.max(0, cur + delta) }).eq('id', sub.user_id);
      }
      if (newStatus === 'validated' && !wasValidated) {
        await bumpDays(days);
        const { data: notif } = await sb.from('notifications')
          .insert({ title: 'Reto validado', content: `Tu reto "${(ch && ch.title) || ''}" ha sido validado. +${days} días de adelanto en tu plan.`, type: 'info', created_by: session.username || 'subscriber_admin' })
          .select('id').single();
        if (notif) await sb.from('notification_recipients').insert({ notification_id: notif.id, user_id: sub.user_id, status: 'pending' });
      } else if (wasValidated && newStatus !== 'validated') {
        await bumpDays(-days);
      }
      return json({ ok: true, status: newStatus });
    }

    // --- Notificaciones (solo informativas) para suscriptores ---
    if (entity === 'notification' && action === 'create') {
      const title = (payload.title || '').trim();
      const content = (payload.content || '').trim();
      if (!title) return json({ error: 'missing_title' }, { statusCode: 400 });
      if (!content) return json({ error: 'missing_content' }, { statusCode: 400 });
      // Destinatarios: lista explicita o TODOS los suscriptores
      let userIds = Array.isArray(payload.user_ids) ? payload.user_ids.filter(Boolean) : [];
      if (payload.all || !userIds.length) {
        const { data: subs, error: eSubs } = await sb.from('subscribers').select('id').or('is_subscriber.eq.true,role.eq.subscriber');
        if (eSubs) throw eSubs;
        userIds = (subs || []).map((u) => u.id);
      }
      if (!userIds.length) return json({ error: 'no_recipients' }, { statusCode: 400 });
      const { data: notif, error: e1 } = await sb.from('notifications')
        .insert({ title, content, type: 'info', created_by: session.username || 'subscriber_admin' })
        .select('*').single();
      if (e1) throw e1;
      const rows = userIds.map((uid) => ({ notification_id: notif.id, user_id: uid, status: 'pending' }));
      const { error: e2 } = await sb.from('notification_recipients').insert(rows);
      if (e2) throw e2;
      return json({ ok: true, item: notif, recipients: userIds.length });
    }

    if (action === 'delete') {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      if (entity === 'notification') {
        await sb.from('notification_recipients').delete().eq('notification_id', payload.id);
      }
      const { error } = await sb.from(table).delete().eq('id', payload.id);
      if (error) throw error;
      return json({ ok: true });
    }

    const data = pick(payload, fields);
    if (entity === 'partner' && payload.logo_data_url) {
      const image = parseImageDataUrl(payload.logo_data_url);
      if (!image) return json({ error: 'invalid_logo', detail: 'Usa PNG, JPG o WebP de hasta 2 MB.' }, { statusCode: 400 });
      const { logoUrl } = await uploadPartnerLogo(sb, image, payload.id);
      data.logo_url = logoUrl;
    }
    if (entity === 'faq') {
      data.question = String(data.question || '').trim();
      data.answer = String(data.answer || '').trim();
      data.category = String(data.category || 'General').trim().slice(0, 80) || 'General';
      data.published = data.published !== false;
      data.sort_order = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
      data.updated_at = new Date().toISOString();
      if (!data.question || data.question.length > 300) return json({ error: 'invalid_question' }, { statusCode: 400 });
      if (!data.answer || data.answer.length > 5000) return json({ error: 'invalid_answer' }, { statusCode: 400 });
    }

    if (action === 'create') {
      if (entity === 'event' && !data.title) return json({ error: 'missing_title' }, { statusCode: 400 });
      if (entity === 'partner' && !data.name) return json({ error: 'missing_name' }, { statusCode: 400 });
      if (entity === 'challenge' && !data.title) return json({ error: 'missing_title' }, { statusCode: 400 });
      if (entity === 'discount_code') {
        if (!data.code || !String(data.code).trim()) return json({ error: 'missing_code' }, { statusCode: 400 });
        const pct = Number(data.percent_off);
        if (!(pct > 0 && pct <= 100)) return json({ error: 'bad_percent' }, { statusCode: 400 });
        data.code = String(data.code).trim().toUpperCase();
        normDuration(data);
      }
      const { data: row, error } = await sb.from(table).insert(data).select('*').single();
      if (error) throw error;
      return json({ ok: true, item: row });
    }

    // update
    if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
    if (entity === 'discount_code' && Object.prototype.hasOwnProperty.call(data, 'code')) {
      data.code = String(data.code || '').trim().toUpperCase();
    }
    if (entity === 'discount_code') normDuration(data);
    if (entity === 'user' && Object.prototype.hasOwnProperty.call(data, 'ciudad')) {
      const c = (data.ciudad || '').trim();
      data.ciudad = c === '' ? null : c;
    }
    const { data: row, error } = await sb.from(table).update(data).eq('id', payload.id).select('*').single();
    if (error) throw error;
    return json({ ok: true, item: row });
  } catch (e) {
    console.error('sub-admin-mutate error', e);
    return serverError(e);
  }
};
