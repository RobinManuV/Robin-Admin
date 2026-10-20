const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { getSubscriptionsSupabase } = require('../../lib/subscriptions-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { isDeveloperAdmin } = require('../../lib/admin-profiles');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

const DATABASES = {
  portal: getSupabase,
  admin: getAdminSupabase,
  robinplan: getSubscriptionsSupabase,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  try {
    const session = readSessionFromEvent(event);
    if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const authDb = getSupabase();
    const { data: actor, error: actorError } = await authDb.from('users')
      .select('id,email,role')
      .eq('id', session.uid)
      .single();
    if (actorError || !isApplicationAdmin(actor) || !isDeveloperAdmin(actor)) {
      return json({ error: 'developer_admin_required' }, { statusCode: 403 });
    }

    const body = parseJsonBody(event);
    const database = String(body?.database || '');
    const statement = String(body?.statement || '').trim();
    if (!DATABASES[database]) return json({ error: 'invalid_database' }, { statusCode: 400 });
    if (!statement || statement.length > 50000) return json({ error: 'invalid_statement' }, { statusCode: 400 });

    const { data, error } = await DATABASES[database]().rpc('admin_execute_sql', { statement });
    if (error) throw error;
    return json({ database, result: data });
  } catch (error) {
    return serverError(error, 'admin.database');
  }
};
