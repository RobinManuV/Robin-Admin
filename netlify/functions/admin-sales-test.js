const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { activeSalesTestRun } = require('../../lib/sales-test-mode');

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const portal = getSupabase();
  const { data } = await portal.from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
  return data && isApplicationAdmin(data) ? data : null;
}

async function stop(portal, crm) {
  const current = await activeSalesTestRun(crm);
  if (!current) return { ok: true, active: false, removed: { leads: 0, users: 0 } };
  const runId = current.test_run;
  await crm.from('sales_test_runs').update({ status: 'stopping' }).eq('test_run', runId);
  const { data: leads, error: leadsError } = await crm.from('crm_leads').select('id').eq('is_test', true).contains('source_payload', { test_run: runId });
  if (leadsError) throw leadsError;
  const leadIds = (leads || []).map((lead) => String(lead.id));
  let users = [];
  if (leadIds.length) {
    const { data, error } = await portal.from('users').select('id').in('lead_id', leadIds);
    if (error) throw error;
    users = data || [];
  }
  const { data: taggedUsers, error: taggedUsersError } = await portal.from('users').select('id').contains('contract_data', { simulated: true, test_run: runId });
  if (taggedUsersError) throw taggedUsersError;
  const userIds = [...new Set([...users, ...(taggedUsers || [])].map((user) => user.id))];
  if (userIds.length) {
    const { error: paymentsError } = await portal.from('payments').delete().in('user_id', userIds);
    if (paymentsError) throw paymentsError;
    const { error: usersError } = await portal.from('users').delete().in('id', userIds);
    if (usersError) throw usersError;
  }
  const { error: deleteLeadsError } = await crm.from('crm_leads').delete().eq('is_test', true).contains('source_payload', { test_run: runId });
  if (deleteLeadsError) throw deleteLeadsError;
  const { error: campaignsError } = await crm.from('sales_simulated_meta_campaigns').delete().eq('test_run', runId);
  if (campaignsError) throw campaignsError;
  const { error: runError } = await crm.from('sales_test_runs').update({ status: 'stopped', stopped_at: new Date().toISOString() }).eq('test_run', runId);
  if (runError) throw runError;
  return { ok: true, active: false, removed: { leads: leadIds.length, users: userIds.length } };
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  if (event.httpMethod === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const portal = getSupabase();
    const crm = getAdminSupabase();
    if (event.httpMethod === 'GET') {
      const current = await activeSalesTestRun(crm);
      return json({ active: Boolean(current), ...(current || {}) });
    }
    const body = parseJsonBody(event);
    if (body?.action === 'stop') return json(await stop(portal, crm));
    return json({ error: 'invalid_action' }, { statusCode: 400 });
  } catch (error) {
    console.error('admin-sales-test error', error);
    return serverError(error, 'admin.sales_test');
  }
};
