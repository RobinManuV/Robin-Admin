/** GET /api/admin/dashboard — HTTP/auth boundary. */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { loadAdminDashboard } = require('../../lib/admin-dashboard');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: admin, error } = await sb
      .from('users')
      .select('id, email, username, role, nombre, apellidos')
      .eq('id', session.uid)
      .single();
    if (error || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });

    return json(await loadAdminDashboard(sb, admin, normalizeEmail(admin)));
  } catch (error) {
    console.error('admin-dashboard error', error);
    return serverError(error);
  }
};
