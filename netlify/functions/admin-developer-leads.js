const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { isDeveloperAdmin } = require('../../lib/admin-profiles');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  if (event.httpMethod === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  try {
    const session = readSessionFromEvent(event);
    if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const { data: actor, error: actorError } = await getSupabase().from('users')
      .select('id,email,role').eq('id', session.uid).single();
    if (actorError || !isApplicationAdmin(actor) || !isDeveloperAdmin(actor)) {
      return json({ error: 'developer_admin_required' }, { statusCode: 403 });
    }

    const db = getAdminSupabase();
    if (event.httpMethod === 'GET') {
      const requestedPage = Number(event.queryStringParameters?.page || 1);
      const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
      const pageSize = 50;
      const { data, count, error } = await db.from('crm_leads').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;
      return json({ rows: data || [], total: count || 0, page, pageSize });
    }

    const body = parseJsonBody(event);
    const id = body?.id;
    const column = String(body?.column || '');
    if (!id || !/^[a-z][a-z0-9_]*$/i.test(column) || column === 'id' || !Object.prototype.hasOwnProperty.call(body, 'value')) {
      return json({ error: 'invalid_update' }, { statusCode: 400 });
    }
    const { data: existing, error: findError } = await db.from('crm_leads').select('*').eq('id', id).single();
    if (findError || !existing) return json({ error: 'lead_not_found' }, { statusCode: 404 });
    if (!Object.prototype.hasOwnProperty.call(existing, column)) return json({ error: 'unknown_column' }, { statusCode: 400 });
    const { data: row, error } = await db.from('crm_leads').update({ [column]: body.value }).eq('id', id).select('*').single();
    if (error) throw error;
    return json({ row });
  } catch (error) {
    return serverError(error, 'admin.developer_leads');
  }
};
