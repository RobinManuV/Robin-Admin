/**
 * /api/admin/tasks
 *   GET  -> lista tareas open|done del admin (?status=open|done|all, default open)
 *   POST -> { action: 'create', title, description?, user_id?, due_at? }
 *           { action: 'toggle', id }
 *           { action: 'delete', id }
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

    if (event.httpMethod === 'GET') {
      const status = (event.queryStringParameters && event.queryStringParameters.status) || 'open';
      let q = sb
        .from('admin_tasks')
        .select('id, admin_email, user_id, title, description, due_at, status, created_at, done_at')
        .eq('admin_email', admin.email)
        .order('created_at', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return json({ tasks: data || [] });
    }

    if (event.httpMethod === 'POST') {
      if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
      const body = parseJsonBody(event) || {};
      const action = body.action || 'create';

      if (action === 'create') {
        const title = (body.title || '').trim();
        if (!title) return json({ error: 'missing_title' }, { statusCode: 400 });
        const row = {
          admin_email: admin.email,
          user_id: body.user_id || null,
          title,
          description: body.description || null,
          due_at: body.due_at || null,
          status: 'open',
        };
        const { data, error } = await sb.from('admin_tasks').insert(row).select().single();
        if (error) return json({ error: 'insert_failed', detail: error.message }, { statusCode: 500 });
        return json({ task: data });
      }

      if (action === 'toggle') {
        if (!body.id) return json({ error: 'missing_id' }, { statusCode: 400 });
        const { data: cur, error: e0 } = await sb
          .from('admin_tasks')
          .select('id, status, admin_email')
          .eq('id', body.id)
          .single();
        if (e0 || !cur) return json({ error: 'not_found' }, { statusCode: 404 });
        if (cur.admin_email !== admin.email) return json({ error: 'forbidden' }, { statusCode: 403 });
        const newStatus = cur.status === 'open' ? 'done' : 'open';
        const update = { status: newStatus, done_at: newStatus === 'done' ? new Date().toISOString() : null };
        const { data, error } = await sb.from('admin_tasks').update(update).eq('id', body.id).select().single();
        if (error) return json({ error: 'update_failed', detail: error.message }, { statusCode: 500 });
        return json({ task: data });
      }

      if (action === 'delete') {
        if (!body.id) return json({ error: 'missing_id' }, { statusCode: 400 });
        const { error } = await sb.from('admin_tasks').delete().eq('id', body.id).eq('admin_email', admin.email);
        if (error) return json({ error: 'delete_failed', detail: error.message }, { statusCode: 500 });
        return json({ ok: true });
      }

      return json({ error: 'unknown_action' }, { statusCode: 400 });
    }

    return methodNotAllowed(['GET', 'POST']);
  } catch (e) {
    console.error('admin-tasks error', e);
    return serverError(e);
  }
};
