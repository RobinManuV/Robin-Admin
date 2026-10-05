const { randomUUID } = require('crypto');
const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent, hashPassword } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { ensurePayments } = require('../../lib/payments');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { activeSalesTestRun } = require('../../lib/sales-test-mode');

const TEST_DOMAIN = 'test-mode.project-robin.invalid';
const CAMPAIGNS = [
  { id: 'TEST-META-001', name: 'TEST · Webinar orientación', spend: 1240, leads: 8 },
  { id: 'TEST-META-002', name: 'TEST · Ingeniería Europa', spend: 860, leads: 7 },
  { id: 'TEST-META-003', name: 'TEST · Estudios internacionales', spend: 590, leads: 5 },
];
const STAGES = ['Por contactar', 'Por contactar', 'Contactado', 'Contactado', 'Propuesta enviada', 'Llamada programada', 'Llamada tenida', 'En espera', 'Cliente', 'Cliente', 'Lost'];
const NAMES = ['Alba Martín', 'Bruno Costa', 'Carla Romero', 'Diego Vidal', 'Elena Prieto', 'Fabio Torres', 'Gabriela León', 'Hugo Serrano', 'Inés Molina', 'Jorge Pastor', 'Laura Cano', 'Marcos Rey', 'Nerea Soler', 'Óscar Peña', 'Paula Gil', 'Raúl Vega', 'Sara Mora', 'Tomás Ríos', 'Vera Blanco', 'Yago Cruz'];

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const portal = getSupabase();
  const { data } = await portal.from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
  return data && isApplicationAdmin(data) ? data : null;
}

async function createTestClient(portal, admin, lead, runId, index) {
  const leadId = String(lead.id);
  const now = new Date().toISOString();
  const contractData = { simulated: true, test_run: runId, tipo: 'general', fecha_firma: now, version_template: 'test-mode' };
  const pagoData = { simulated: true, test_run: runId, source: 'test-mode' };
  const { data: user, error } = await portal.from('users').insert({
    lead_id: leadId,
    username: `test-${runId.slice(-8)}-${index + 1}`,
    email: lead.email,
    password_hash: hashPassword(`Test-${randomUUID()}-Aa1!`),
    nombre: lead.name,
    assigned_to: normalizeEmail(admin),
    tipo: 'general',
    origin: 'meta',
    requires_onboarding: false,
    dni_completed: true,
    profile_completed: true,
    contract_signed: true,
    contract_signed_at: now,
    contract_data: contractData,
    pago_completed: true,
    pago_completed_at: now,
    pago_data: pagoData,
  }).select('id,lead_id,tipo,origin,has_eu_id,num_carreras,contract_data,pago_completed,pago_completed_at,pago_data').single();
  if (error) throw error;
  await ensurePayments(portal, user);
  return user;
}

async function launch(portal, crm, admin) {
  const current = await activeSalesTestRun(crm);
  if (current) return { ok: true, active: true, alreadyActive: true, ...current };
  const runId = `sales_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const { error: runError } = await crm.from('sales_test_runs').insert({ test_run: runId, launched_by: admin.id, status: 'active' });
  if (runError) throw runError;
  const rows = NAMES.map((name, index) => {
    const campaign = CAMPAIGNS[index % CAMPAIGNS.length];
    const stage = STAGES[index % STAGES.length];
    const created = new Date(now.getTime() - (29 - index) * 86400000);
    return {
      name: `TEST · ${name}`,
      email: `${runId}-${String(index + 1).padStart(2, '0')}@${TEST_DOMAIN}`,
      phone: `+3499000${String(index + 1).padStart(4, '0')}`,
      lead_type: 'General',
      crm_stage: stage,
      is_test: true,
      source_created_at: created.toISOString(),
      contact_at: stage === 'Por contactar' ? null : new Date(created.getTime() + 3600000).toISOString(),
      lost_at: stage === 'Lost' ? new Date(created.getTime() + 5 * 86400000).toISOString() : null,
      inside_at: stage === 'Cliente' ? new Date(created.getTime() + 7 * 86400000).toISOString() : null,
      price_at_signature: stage === 'Cliente' ? 1700 : null,
      owner_names: [admin.nombre || admin.email || 'Equipo'],
      source_payload: { source: 'meta', test_run: runId, simulated: true, campaign_id: campaign.id, campaign_name: campaign.name, ad_id: `TEST-AD-${index + 1}`, lost_reason: stage === 'Lost' ? 'other' : null },
    };
  });
  const { data: leads, error: leadsError } = await crm.from('crm_leads').insert(rows).select('id,name,email,crm_stage');
  if (leadsError) throw leadsError;
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);
  const { error: campaignsError } = await crm.from('sales_simulated_meta_campaigns').insert(CAMPAIGNS.map((campaign) => ({ test_run: runId, campaign_id: campaign.id, campaign_name: campaign.name, period_start: since, period_end: until, spend: campaign.spend, leads: campaign.leads })));
  if (campaignsError) throw campaignsError;
  const clients = (leads || []).filter((lead) => lead.crm_stage === 'Cliente');
  for (let index = 0; index < clients.length; index += 1) await createTestClient(portal, admin, clients[index], runId, index);
  return { ok: true, active: true, test_run: runId, leads: (leads || []).length, clients: clients.length };
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
    if (body?.action === 'launch') return json(await launch(portal, crm, admin));
    if (body?.action === 'stop') return json(await stop(portal, crm));
    return json({ error: 'invalid_action' }, { statusCode: 400 });
  } catch (error) {
    console.error('admin-sales-test error', error);
    return serverError(error, 'admin.sales_test');
  }
};
