/**
 * /api/admin/chat  ·  El ASESOR ve e interviene en el chat alumno⇄IA.
 *
 *   GET  ?user_id=<uuid>        -> { messages[], ai_paused, client }
 *   POST { user_id, content }   -> INTERVENCIÓN: guarda el mensaje del asesor,
 *                                  pausa la IA en ese chat y notifica al alumno.
 *   POST { user_id, action:'resume' } -> devuelve el control a la IA (quita la pausa).
 *
 * Seguridad: solo admins. Un admin de la lista (superadmin) ve cualquier alumno;
 * el resto solo los alumnos que tenga asignados (users.assigned_to = su email).
 * Mensajes de los últimos 7 días (el resto los borra chat-cleanup.js).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, isListedAdvisor, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

const WINDOW_DAYS = 7;
const MAX_LEN = 4000;

function cutoffISO() {
  return new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
}

/** Devuelve el admin de la sesión (o null si no es admin). */
async function getAdmin(sb, session) {
  const { data: admin } = await sb
    .from('users')
    .select('id, email, username, role')
    .eq('id', session.uid)
    .single();
  if (!admin) return null;
  const email = normalizeEmail(admin);
  const isSuper = isListedAdvisor(admin);
  const isAdmin = isApplicationAdmin(admin);
  if (!isAdmin) return null;
  return { id: admin.id, email, isSuper };
}

/** Comprueba que el admin puede ver a ese alumno. Devuelve el cliente o null. */
async function loadClientForAdmin(sb, admin, userId) {
  const { data: client } = await sb
    .from('users')
    .select('id, nombre, apellidos, email, username, assigned_to')
    .eq('id', userId)
    .single();
  if (!client) return null;
  if (!admin.isSuper && (client.assigned_to || '').toLowerCase() !== admin.email) return null;
  return client;
}

async function loadMessages(sb, userId) {
  const { data } = await sb
    .from('ai_chat_messages')
    .select('id, role, content, author_admin_id, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoffISO())
    .order('created_at', { ascending: true });
  return data || [];
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  if (method === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });

  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const admin = await getAdmin(sb, session);
    if (!admin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // user_id (query en GET, body en POST)
    let userId, body = {};
    if (method === 'GET') {
      userId = (event.queryStringParameters || {}).user_id || null;
    } else {
      body = parseJsonBody(event) || {};
      userId = body.user_id || null;
    }
    if (!userId) return json({ error: 'missing_user_id' }, { statusCode: 400 });

    const client = await loadClientForAdmin(sb, admin, userId);
    if (!client) return json({ error: 'client_not_found' }, { statusCode: 404 });

    if (method === 'GET') {
      const { data: state } = await sb
        .from('ai_chat_state').select('ai_paused').eq('user_id', userId).maybeSingle();
      const messages = await loadMessages(sb, userId);
      return json({ ok: true, messages, ai_paused: !!(state && state.ai_paused), client });
    }

    // ---- POST ----
    // Reactivar la IA
    if (body.action === 'resume') {
      await sb.from('ai_chat_state').upsert(
        { user_id: userId, ai_paused: false, paused_by: admin.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      const messages = await loadMessages(sb, userId);
      return json({ ok: true, messages, ai_paused: false });
    }

    // Intervención del asesor
    const content = String(body.content || '').trim().slice(0, MAX_LEN);
    if (!content) return json({ error: 'empty_message' }, { statusCode: 400 });

    const { error: eIns } = await sb.from('ai_chat_messages').insert({
      user_id: userId, role: 'advisor', content, author_admin_id: admin.id,
    });
    if (eIns) throw eIns;

    // Pausa la IA: a partir de ahora atiende la persona hasta que pulse "Devolver a la IA".
    await sb.from('ai_chat_state').upsert(
      { user_id: userId, ai_paused: true, paused_by: admin.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

    // Notifica al alumno (mismo sistema de notificaciones del portal).
    try {
      const { data: notif } = await sb.from('notifications')
        .insert({
          title: 'Tu asesor te ha respondido',
          content: 'Tu asesor de Robin ha escrito en tu chat. Entra para leerle y contestarle.',
          type: 'info',
          created_by: 'system:advisor-chat',
        })
        .select('id').single();
      if (notif) {
        await sb.from('notification_recipients')
          .insert({ notification_id: notif.id, user_id: userId, status: 'pending' });
      }
    } catch (e) {
      console.error('admin-chat notif error', e.message);
    }

    const messages = await loadMessages(sb, userId);
    return json({ ok: true, messages, ai_paused: true });
  } catch (e) {
    return serverError(e, 'admin-chat');
  }
};
