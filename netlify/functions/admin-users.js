const { getSupabase } = require('../../lib/supabase');
const { hashPassword, readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { passwordPolicy } = require('../../shared/password-policy.cjs');
const { signedUrl } = require('../../lib/storage');

async function requireAdmin(sb, event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data } = await sb.from('users').select('id,email,username,role').eq('id', session.uid).single();
  return isApplicationAdmin(data) ? data : null;
}

async function serializeUsers(sb, rows) {
  return Promise.all(rows.map(async (row) => ({
    id: row.id, email: row.email, username: row.username, nombre: row.nombre,
    apellidos: row.apellidos, role: row.role,
    avatar_url: row.avatar_path ? await signedUrl(sb, row.avatar_path, { expiresIn: 3600 }) : null,
  })));
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  if (event.httpMethod === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  try {
    const sb = getSupabase();
    const actor = await requireAdmin(sb, event);
    if (!actor) return json({ error: 'forbidden' }, { statusCode: 403 });
    if (event.httpMethod === 'GET') {
      const { data, error } = await sb.from('users').select('id,email,username,nombre,apellidos,role,avatar_path').order('nombre');
      if (error) throw error;
      return json({ users: await serializeUsers(sb, (data || []).filter(isApplicationAdmin)) });
    }
    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
    if (body.action === 'delete') {
      if (!body.id || String(body.id) === String(actor.id)) return json({ error: 'cannot_delete_current_user' }, { statusCode: 400 });
      const { data: target } = await sb.from('users').select('id,role').eq('id', body.id).single();
      if (!target || !isApplicationAdmin(target)) return json({ error: 'admin_not_found' }, { statusCode: 404 });
      const { error } = await sb.from('users').delete().eq('id', body.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action !== 'create') return json({ error: 'invalid_action' }, { statusCode: 400 });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || !email || !email.includes('@')) return json({ error: 'invalid_fields' }, { statusCode: 400 });
    if (!passwordPolicy(password).ok) return json({ error: 'weak_password' }, { statusCode: 400 });
    const username = email.split('@')[0];
    const { data, error } = await sb.from('users').insert({ nombre: name, email, username, role: 'admin', password_hash: hashPassword(password), requires_onboarding: false }).select('id,email,username,nombre,apellidos,role,avatar_path').single();
    if (error) throw error;
    return json({ user: (await serializeUsers(sb, [data]))[0] }, { statusCode: 201 });
  } catch (error) {
    if (error?.code === '23505') return json({ error: 'user_already_exists' }, { statusCode: 409 });
    return serverError(error, 'admin.users');
  }
};
