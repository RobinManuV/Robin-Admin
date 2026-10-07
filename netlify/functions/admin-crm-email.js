const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError, parseJsonBody } = require('../../lib/http');
const { getGmailAccessToken, getGmailStatus, personalize, sendMessage } = require('../../lib/google-gmail');

const MAX_EMAILS_PER_REQUEST = 10;

function validEmail(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '').trim());
}

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

exports.handler = async (event) => {
  if (!['GET', 'PUT', 'POST', 'PATCH', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'PUT', 'POST', 'PATCH', 'DELETE']);
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const action = event.queryStringParameters?.action;
    if (event.httpMethod === 'GET' && action === 'gmail-status') {
      return json(await getGmailStatus());
    }
    const db = getAdminSupabase();

    if (event.httpMethod === 'GET') {
      const [draftResult, templateResult] = await Promise.all([
        db.from('crm_email_drafts').select('subject,body,recipient_ids,campaign_filter').eq('owner_id', admin.id).maybeSingle(),
        db.from('crm_email_templates').select('id,name,subject,body,updated_at').eq('owner_id', admin.id).order('updated_at', { ascending: false }),
      ]);
      if (draftResult.error) throw draftResult.error;
      if (templateResult.error) throw templateResult.error;
      const draft = draftResult.data ? { subject: draftResult.data.subject || '', body: draftResult.data.body || '', recipientIds: draftResult.data.recipient_ids || [], campaignFilter: draftResult.data.campaign_filter || 'all' } : null;
      const templates = (templateResult.data || []).map((item) => ({ id: item.id, name: item.name, subject: item.subject || '', body: item.body || '', updatedAt: item.updated_at }));
      return json({ draft, templates });
    }

    const body = parseJsonBody(event);
    if (event.httpMethod === 'POST' && action === 'send') {
      const recipientIds = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds.map(String))] : [];
      const subject = String(body.subject || '').trim().slice(0, 500);
      const messageBody = String(body.body || '').slice(0, 50000);
      if (!recipientIds.length) return json({ error: 'Selecciona al menos un destinatario.' }, { statusCode: 400 });
      if (recipientIds.length > MAX_EMAILS_PER_REQUEST) return json({ error: `Envía como máximo ${MAX_EMAILS_PER_REQUEST} destinatarios por lote.` }, { statusCode: 400 });
      if (!subject || !messageBody.trim()) return json({ error: 'El asunto y el cuerpo del correo son obligatorios.' }, { statusCode: 400 });
      let accessToken;
      try { accessToken = await getGmailAccessToken(); }
      catch (error) { return json({ error: error.message, code: error.code || 'gmail_not_ready' }, { statusCode: 412 }); }

      const { data: leads, error: leadsError } = await db.from('crm_leads')
        .select('*')
        .in('id', recipientIds);
      if (leadsError) throw leadsError;
      const byId = new Map((leads || []).map((lead) => [String(lead.id), lead]));
      const sent = [];
      const skipped = [];
      const failed = [];
      for (const id of recipientIds) {
        const lead = byId.get(id);
        if (!lead) { skipped.push({ id, reason: 'Lead no encontrado.' }); continue; }
        if (lead.crm_stage && lead.crm_stage !== 'Por contactar') { skipped.push({ id, reason: 'El lead ya no está en Por contactar.' }); continue; }
        if (!validEmail(lead.email)) { skipped.push({ id, reason: 'No tiene un correo electrónico válido.' }); continue; }
        try {
          const personalizedSubject = personalize(subject, lead);
          const personalizedBody = personalize(messageBody, lead);
          const result = await sendMessage({ to: lead.email, subject: personalizedSubject, body: personalizedBody, accessToken });
          sent.push({ id, email: lead.email, messageId: result.id });
        } catch (error) {
          failed.push({ id, email: lead.email, reason: error.message || 'No se pudo enviar.' });
          if (error.code === 'gmail_permission_denied' || error.code === 'gmail_not_ready') break;
        }
      }
      return json({ sent, skipped, failed });
    }
    if (event.httpMethod === 'PUT') {
      const recipientIds = Array.isArray(body.recipientIds) ? [...new Set(body.recipientIds.map(String))].slice(0, 1000) : [];
      const update = { owner_id: admin.id, subject: String(body.subject || '').slice(0, 500), body: String(body.body || '').slice(0, 50000), recipient_ids: recipientIds, campaign_filter: String(body.campaignFilter || 'all').slice(0, 500), updated_at: new Date().toISOString() };
      const { error } = await db.from('crm_email_drafts').upsert(update, { onConflict: 'owner_id' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (event.httpMethod === 'POST') {
      const name = String(body.name || '').trim().slice(0, 120);
      if (!name) return json({ error: 'Pon un nombre a la plantilla' }, { statusCode: 400 });
      const insert = { owner_id: admin.id, name, subject: String(body.subject || '').slice(0, 500), body: String(body.body || '').slice(0, 50000) };
      const { data, error } = await db.from('crm_email_templates').insert(insert).select('id,name,subject,body,updated_at').single();
      if (error) throw error;
      return json({ template: { id: data.id, name: data.name, subject: data.subject || '', body: data.body || '', updatedAt: data.updated_at } }, { statusCode: 201 });
    }

    if (event.httpMethod === 'PATCH') {
      const id = String(body.id || '').trim();
      const name = String(body.name || '').trim().slice(0, 120);
      if (!id || !name) return json({ error: 'La plantilla y su nombre son obligatorios' }, { statusCode: 400 });
      const update = { name, subject: String(body.subject || '').slice(0, 500), body: String(body.body || '').slice(0, 50000), updated_at: new Date().toISOString() };
      const { data, error } = await db.from('crm_email_templates').update(update).eq('id', id).eq('owner_id', admin.id).select('id,name,subject,body,updated_at').single();
      if (error) throw error;
      return json({ template: { id: data.id, name: data.name, subject: data.subject || '', body: data.body || '', updatedAt: data.updated_at } });
    }

    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'La plantilla es obligatoria' }, { statusCode: 400 });
    const { error } = await db.from('crm_email_templates').delete().eq('id', id).eq('owner_id', admin.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error('admin-crm-email error', error);
    return serverError(error);
  }
};
