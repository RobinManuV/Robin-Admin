const { getSupabase } = require('../../lib/supabase');
const { hashPassword, readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { passwordPolicy } = require('../../shared/password-policy.cjs');
const { signedUrl } = require('../../lib/storage');
const { identityExists } = require('../../lib/identity');
const { isProAdmin, normalizeVisibleTabs } = require('../../lib/admin-profiles');

async function requireAdmin(sb, event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data } = await sb.from('users').select('id,email,username,role').eq('id', session.uid).single();
  return isApplicationAdmin(data) ? data : null;
}

async function serializeUsers(sb, rows) {
  return Promise.all(rows.map(async (row) => ({
    id: row.id, display_id: row.display_id, email: row.email, username: row.username, nombre: row.nombre,
    apellidos: row.apellidos, role: row.role, is_pro: isProAdmin(row),
    visible_tabs: normalizeVisibleTabs(row.visible_tabs),
    avatar_url: row.avatar_path ? await signedUrl(sb, row.avatar_path, { expiresIn: 3600 }) : null,
  })));
}

async function listAdminUsers(sb) {
  const withOptionalColumns = await sb.from('users')
    .select('id,display_id,email,username,nombre,apellidos,role,avatar_path,visible_tabs')
    .order('nombre');
  if (!withOptionalColumns.error) return withOptionalColumns.data || [];

  // display_id was added after the original users schema. Keep admin access
  // management available on databases where that optional migration has not
  // been applied yet; the UUID remains the stable primary key.
  if (withOptionalColumns.error.code !== '42703') throw withOptionalColumns.error;
  const legacy = await sb.from('users')
    .select('id,email,username,nombre,apellidos,role,avatar_path')
    .order('nombre');
  if (legacy.error) throw legacy.error;
  return legacy.data || [];
}

async function getAdminUser(sb, id) {
  const withOptionalColumns = await sb.from('users')
    .select('id,display_id,email,username,nombre,apellidos,role,avatar_path,visible_tabs')
    .eq('id', id)
    .single();
  if (!withOptionalColumns.error) return withOptionalColumns.data;
  if (withOptionalColumns.error.code !== '42703') throw withOptionalColumns.error;
  const legacy = await sb.from('users')
    .select('id,email,username,nombre,apellidos,role,avatar_path')
    .eq('id', id)
    .single();
  if (legacy.error) throw legacy.error;
  return legacy.data;
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  if (event.httpMethod === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  try {
    const sb = getSupabase();
    const actor = await requireAdmin(sb, event);
    if (!actor) return json({ error: 'forbidden' }, { statusCode: 403 });
    if (event.httpMethod === 'GET') {
      const data = await listAdminUsers(sb);
      return json({ users: await serializeUsers(sb, data.filter(isApplicationAdmin)), current_is_pro: isProAdmin(actor) });
    }
    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
    if (!isProAdmin(actor)) return json({ error: 'pro_admin_required' }, { statusCode: 403 });
    if (body.action === 'permissions') {
      if (!body.id) return json({ error: 'invalid_fields' }, { statusCode: 400 });
      if (!Array.isArray(body.visible_tabs)) return json({ error: 'invalid_fields' }, { statusCode: 400 });
      const target = await getAdminUser(sb, body.id);
      if (!target || !isApplicationAdmin(target)) return json({ error: 'admin_not_found' }, { statusCode: 404 });
      if (isProAdmin(target)) return json({ error: 'pro_admin_permissions_locked' }, { statusCode: 400 });
      const visibleTabs = normalizeVisibleTabs(body.visible_tabs);
      const { error } = await sb.from('users').update({ visible_tabs: visibleTabs }).eq('id', body.id);
      if (error) throw error;
      return json({ ok: true, visible_tabs: visibleTabs });
    }
    if (body.action === 'delete') {
      if (!body.id || String(body.id) === String(actor.id)) return json({ error: 'cannot_delete_current_user' }, { statusCode: 400 });
      const { data: target } = await sb.from('users').select('id,email,role').eq('id', body.id).single();
      if (!target || !isApplicationAdmin(target)) return json({ error: 'admin_not_found' }, { statusCode: 404 });
      if (isProAdmin(target)) return json({ error: 'cannot_delete_pro_admin' }, { statusCode: 403 });
      const { error } = await sb.from('users').delete().eq('id', body.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action !== 'create') return json({ error: 'invalid_action' }, { statusCode: 400 });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const username = String(body.username || email.split('@')[0] || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || !email || !email.includes('@') || !/^[a-z0-9._-]{3,50}$/.test(username)) return json({ error: 'invalid_fields' }, { statusCode: 400 });
    if (!passwordPolicy(password).ok) return json({ error: 'weak_password' }, { statusCode: 400 });
    if (await identityExists(sb, [email, username])) return json({ error: 'user_already_exists' }, { statusCode: 409 });
    const { data: inserted, error } = await sb.from('users').insert({ nombre: name, email, username, role: 'admin', password_hash: hashPassword(password), requires_onboarding: false }).select('id').single();
    if (error) throw error;
    const created = await getAdminUser(sb, inserted.id);
    return json({ user: (await serializeUsers(sb, [created]))[0] }, { statusCode: 201 });
  } catch (error) {
    if (error?.code === '23505') return json({ error: 'user_already_exists' }, { statusCode: 409 });
    return serverError(error, 'admin.users');
  }
};
