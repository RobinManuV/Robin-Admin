/**
 * /api/admin/notifications
 *   GET  -> lista notificaciones (con destinatarios y su estado) — para el panel de seguimiento
 *   POST -> { title, content, type: 'info'|'terms', user_ids: [uuid...] }  crea la notificación
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

async function getAdmin(sb, uid) {
  const { data: admin, error } = await sb
    .from('users')
    .select('id, email, username, role')
    .eq('id', uid)
    .single();
  if (error || !admin) return null;
  const email = normalizeEmail(admin);
  const isAdmin = isApplicationAdmin(admin);
  if (!isAdmin) return null;
  return { ...admin, email };
}

exports.handler = async (event) => {
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const admin = await getAdmin(sb, session.uid);
    if (!admin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // ---------- GET: listado + estado por destinatario ----------
    if (event.httpMethod === 'GET') {
      const { data: notifs, error } = await sb
        .from('notifications')
        .select('id, title, content, type, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = (notifs || []).map((n) => n.id);
      let recipients = [];
      if (ids.length) {
        const { data: recs } = await sb
          .from('notification_recipients')
          .select('id, notification_id, user_id, status, seen_at, accepted_at')
          .in('notification_id', ids);
        recipients = recs || [];
      }
      // Nombres de los destinatarios
      const uids = Array.from(new Set(recipients.map((r) => r.user_id)));
      let usersById = {};
      if (uids.length) {
        const { data: us } = await sb
          .from('users')
          .select('id, nombre, apellidos, email, lead_id')
          .in('id', uids);
        (us || []).forEach((u) => { usersById[u.id] = u; });
      }
      const out = (notifs || []).map((n) => {
        const recs = recipients
          .filter((r) => r.notification_id === n.id)
          .map((r) => ({
            user_id: r.user_id,
            status: r.status,
            seen_at: r.seen_at,
            accepted_at: r.accepted_at,
            nombre: usersById[r.user_id]?.nombre || '',
            apellidos: usersById[r.user_id]?.apellidos || '',
            email: usersById[r.user_id]?.email || '',
            lead_id: usersById[r.user_id]?.lead_id || '',
          }));
        const total = recs.length;
        const done = recs.filter((r) => r.status === (n.type === 'terms' ? 'accepted' : 'seen') || r.status === 'accepted').length;
        return { ...n, recipients: recs, total, done };
      });
      return json({ notifications: out });
    }

    // ---------- POST: crear notificación ----------
    if (event.httpMethod === 'POST') {
      if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
      const body = parseJsonBody(event) || {};
      const title = (body.title || '').trim();
      const content = (body.content || '').trim();
      const type = body.type === 'terms' ? 'terms' : 'info';
      const userIds = Array.isArray(body.user_ids) ? body.user_ids.filter(Boolean) : [];
      if (!title) return json({ error: 'missing_title' }, { statusCode: 400 });
      if (!content) return json({ error: 'missing_content' }, { statusCode: 400 });
      if (!userIds.length) return json({ error: 'no_recipients' }, { statusCode: 400 });

      const { data: notif, error: e1 } = await sb
        .from('notifications')
        .insert({ title, content, type, created_by: admin.email })
        .select()
        .single();
      if (e1) return json({ error: 'insert_failed', detail: e1.message }, { statusCode: 500 });

      const rows = userIds.map((uid) => ({
        notification_id: notif.id,
        user_id: uid,
        status: 'pending',
      }));
      const { error: e2 } = await sb.from('notification_recipients').insert(rows);
      if (e2) return json({ error: 'recipients_failed', detail: e2.message }, { statusCode: 500 });

      return json({ notification: notif, recipients: userIds.length });
    }

    return methodNotAllowed(['GET', 'POST']);
  } catch (e) {
    console.error('admin-notifications error', e);
    return serverError(e);
  }
};
