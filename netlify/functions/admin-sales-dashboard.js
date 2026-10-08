const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { loadExpenseEntries, periodBounds, summarizeExpenses } = require('../../lib/finance-dashboard');
const { buildSalesDashboard } = require('../../lib/sales-dashboard');
const { isMissingPerformanceSchema } = require('../../lib/crm-identity');
const { activeSalesTestRun, isLeadInTestRun } = require('../../lib/sales-test-mode');
const { filterSalesRowsForAdmin, markPersonalSalesDashboard } = require('../../lib/sales-personal-scope');

const PERIODS = new Set(['30d', 'month', 'last_month', '3m', '365d', 'ytd']);
const metaCache = new Map();
const META_CACHE_MS = 30 * 60 * 1000;

const ymd = (date) => date.toISOString().slice(0, 10);
const addDays = (date, count) => new Date(date.getTime() + count * 86400000);
const number = (value) => Number(value || 0);

function actionValue(items, preferredTypes) {
  for (const type of preferredTypes) {
    const match = (items || []).find((item) => item.action_type === type);
    if (match) return number(match.value);
  }
  return 0;
}

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,nombre,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

async function metaGraph(path, params = {}) {
  const version = process.env.META_API_VERSION || 'v26.0';
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('meta_not_configured');
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `meta_http_${response.status}`);
  return payload;
}

async function metaAccountId() {
  const configured = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  if (configured) return configured.startsWith('act_') ? configured : `act_${configured}`;
  const accounts = await metaGraph('me/adaccounts', { fields: 'id,account_status,currency', limit: 100 });
  const active = (accounts.data || []).find((account) => Number(account.account_status) === 1) || accounts.data?.[0];
  if (!active?.id) throw new Error('meta_account_not_found');
  return active.id;
}

async function resolveAds(adIds) {
  const result = new Map();
  for (let index = 0; index < adIds.length; index += 50) {
    const ids = adIds.slice(index, index + 50);
    const payload = await metaGraph('', { ids: ids.join(','), fields: 'campaign{id,name}' });
    ids.forEach((id) => {
      const campaign = payload?.[id]?.campaign;
      if (campaign?.name) result.set(String(id), { id: String(campaign.id || ''), name: campaign.name });
    });
  }
  return result;
}

async function loadMeta(bounds, leads) {
  const crm = getAdminSupabase();
  const activeSimulation = await activeSalesTestRun(crm);
  const simulationRun = activeSimulation?.status === 'active' ? activeSimulation.test_run : '';
  const cacheKey = `${ymd(bounds.start)}:${ymd(bounds.end)}:${simulationRun || 'live'}`;
  const cached = metaCache.get(cacheKey);
  let data = cached && Date.now() - cached.savedAt < META_CACHE_MS ? cached.data : null;
  if (simulationRun) {
    const { data: fixtures, error } = await crm.from('sales_simulated_meta_campaigns')
      .select('campaign_id,campaign_name,spend,leads,period_start,period_end')
      .eq('test_run', simulationRun)
      .lte('period_start', ymd(addDays(bounds.end, -1)))
      .gte('period_end', ymd(bounds.start));
    if (error) throw error;
    data = {
      campaigns: (fixtures || []).map((row) => ({ id: row.campaign_id, name: row.campaign_name, spend: number(row.spend), leads: number(row.leads) })),
      daily: [],
      currency: 'EUR',
      simulated: true,
    };
    metaCache.set(cacheKey, { savedAt: Date.now(), data });
  }
  if (!data) {
    const accountId = await metaAccountId();
    const timeRange = JSON.stringify({ since: ymd(bounds.start), until: ymd(addDays(bounds.end, -1)) });
    const [campaignInsights, dailyInsights, account] = await Promise.all([
      metaGraph(`${accountId}/insights`, {
        fields: 'campaign_id,campaign_name,spend,actions',
        level: 'campaign',
        time_range: timeRange,
        limit: 500,
      }),
      metaGraph(`${accountId}/insights`, {
        fields: 'spend,actions',
        level: 'account',
        time_increment: 1,
        time_range: timeRange,
        limit: 500,
      }),
      metaGraph(accountId, { fields: 'currency' }),
    ]);
    data = {
      campaigns: (campaignInsights.data || []).map((row) => ({
        id: String(row.campaign_id || ''),
        name: row.campaign_name || 'Campaña sin nombre',
        spend: number(row.spend),
        leads: actionValue(row.actions, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']),
      })),
      daily: (dailyInsights.data || []).map((row) => ({
        date: row.date_start,
        spend: number(row.spend),
        leads: actionValue(row.actions, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']),
      })),
      currency: account.currency || 'EUR',
    };
    metaCache.set(cacheKey, { savedAt: Date.now(), data });
  }
  const adIds = [...new Set(leads.map((lead) => lead.source_payload?.ad_id).filter(Boolean).map(String))];
  let adCampaigns = new Map();
  if (!data.simulated && adIds.length) {
    try {
      adCampaigns = await resolveAds(adIds);
    } catch (error) {
      // La resolución de anuncios solo mejora el cruce de nombres. No debe
      // invalidar el gasto real que Meta ya devolvió para calcular CAC/CPL.
      console.warn('admin-sales-dashboard Meta ad resolution warning', error && (error.message || error));
    }
  }
  return { ...data, adCampaigns };
}

async function pagedRows(queryFactory, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

async function optionalRows(queryFactory) {
  const { data, error } = await pagedRows(queryFactory);
  if (!error) return { rows: data || [], available: true };
  if (isMissingPerformanceSchema(error)) return { rows: [], available: false };
  throw error;
}

async function loadCrmLeads(crm) {
  const fields = 'id,email,name,source_created_at,created_at,owner_names,owner_id,source_payload,crm_stage,lead_type,heat,contact_at,meeting_at,inside_at,lost_at,stage_entered_at,is_test,price_at_signature';
  const result = await pagedRows(() => crm.from('crm_leads').select(fields));
  if (!result.error) return result.data || [];
  if (!isMissingPerformanceSchema(result.error)) throw result.error;
  const fallback = await pagedRows(() => crm.from('crm_leads').select('id,email,name,source_created_at,created_at,owner_names,source_payload,crm_stage,lead_type,heat,contact_at,meeting_at,inside_at,lost_at'));
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
}

async function loadRows() {
  const portal = getSupabase();
  const crm = getAdminSupabase();
  const [{ data: users, error: usersError }, { data: payments, error: paymentsError }, leads, events, sessions, crmUsers, applications] = await Promise.all([
    pagedRows(() => portal.from('users').select('id,lead_id,email,role,contract_signed,contract_signed_at,pago_completed,pago_completed_at,tipo,origin,has_eu_id,num_carreras,contract_data')),
    pagedRows(() => portal.from('payments').select('id,user_id,installment,amount,currency,status,paid_at,created_at')),
    loadCrmLeads(crm),
    optionalRows(() => crm.from('crm_lead_events').select('id,lead_id,user_id,actor_id,event_type,from_value,to_value,metadata,created_at').order('created_at', { ascending: true })),
    optionalRows(() => crm.from('crm_user_sessions').select('id,user_id,started_at,last_seen_at').order('started_at', { ascending: true })),
    optionalRows(() => crm.from('crm_users').select('id,name,email,role,active')),
    optionalRows(() => crm.from('crm_lead_applications').select('id,lead_id,position,status,created_at,updated_at')),
  ]);
  if (usersError) throw usersError;
  if (paymentsError) throw paymentsError;
  return {
    users: (users || []).filter((user) => !isApplicationAdmin(user)),
    payments: payments || [],
    leads,
    events: events.rows,
    sessions: sessions.rows,
    crmUsers: crmUsers.rows,
    applications: applications.rows,
    availability: { events: events.available, sessions: sessions.available, users: crmUsers.available, applications: applications.available },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const requested = String(event.queryStringParameters?.period || 'ytd');
    const period = PERIODS.has(requested) ? requested : 'ytd';
    const personal = event.queryStringParameters?.scope === 'personal';
    const bounds = periodBounds(period);
    const [loadedRows, expenses, testRun] = await Promise.all([
      loadRows(),
      loadExpenseEntries(bounds.start, bounds.end),
      activeSalesTestRun(getAdminSupabase()),
    ]);
    let rows = loadedRows;
    if (testRun?.status === 'active') {
      const testLeads = loadedRows.leads.filter((lead) => isLeadInTestRun(lead, testRun.test_run));
      const leadIds = new Set(testLeads.map((lead) => String(lead.id)));
      const testUsers = loadedRows.users.filter((user) => leadIds.has(String(user.lead_id || '')));
      const userIds = new Set(testUsers.map((user) => String(user.id)));
      rows = {
        ...loadedRows,
        leads: testLeads,
        users: testUsers,
        payments: loadedRows.payments.filter((payment) => userIds.has(String(payment.user_id))),
        events: loadedRows.events.filter((event) => leadIds.has(String(event.lead_id))),
        sessions: [],
        applications: loadedRows.applications.filter((application) => leadIds.has(String(application.lead_id))),
      };
    }
    if (personal) rows = filterSalesRowsForAdmin(rows, admin);

    let meta = { campaigns: [], daily: [], adCampaigns: new Map(), currency: 'EUR' };
    let metaAvailable = true;
    try { meta = await loadMeta(bounds, rows.leads); }
    catch (error) {
      metaAvailable = false;
      console.error('admin-sales-dashboard meta warning', error && (error.message || error));
    }
    const leads = rows.leads.map((lead) => {
      const resolved = meta.adCampaigns.get(String(lead.source_payload?.ad_id || ''));
      return resolved ? { ...lead, resolved_campaign_id: resolved.id, resolved_campaign_name: resolved.name } : lead;
    });
    const expenseTotals = expenses.available ? summarizeExpenses(expenses.entries, bounds) : null;
    const dashboard = buildSalesDashboard({
      period,
      leads,
      users: rows.users,
      payments: rows.payments,
      marketingExpense: expenseTotals?.marketing || 0,
      marketingAvailable: expenses.available,
      metaCampaigns: meta.campaigns,
      metaDaily: meta.daily,
      metaAvailable,
      metaCurrency: meta.currency,
      crmEvents: rows.events,
      crmSessions: rows.sessions,
      crmUsers: rows.crmUsers,
      crmApplications: rows.applications,
      crmAvailability: rows.availability,
    });
    return json(personal ? markPersonalSalesDashboard(dashboard, admin) : { ...dashboard, scope: { type: 'global', metaSpend: 'global' } });
  } catch (error) {
    console.error('admin-sales-dashboard error', error);
    return serverError(error, 'admin.sales_dashboard');
  }
};
