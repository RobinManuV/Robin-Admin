const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { loadExpenseEntries, periodBounds, summarizeExpenses } = require('../../lib/finance-dashboard');
const { buildSalesDashboard } = require('../../lib/sales-dashboard');

const PERIODS = new Set(['30d', 'month', '3m', '365d', 'ytd']);
const metaCache = new Map();
const META_CACHE_MS = 30 * 60 * 1000;

const ymd = (date) => date.toISOString().slice(0, 10);
const addDays = (date, count) => new Date(date.getTime() + count * 86400000);

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,role').eq('id', session.uid).single();
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
  const cacheKey = `${ymd(bounds.start)}:${ymd(bounds.end)}`;
  const cached = metaCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < META_CACHE_MS) return cached.data;
  const accountId = await metaAccountId();
  const [insights, account] = await Promise.all([
    metaGraph(`${accountId}/insights`, {
      fields: 'campaign_id,campaign_name,spend',
      level: 'campaign',
      time_range: JSON.stringify({ since: ymd(bounds.start), until: ymd(addDays(bounds.end, -1)) }),
      limit: 500,
    }),
    metaGraph(accountId, { fields: 'currency' }),
  ]);
  const adIds = [...new Set(leads.map((lead) => lead.source_payload?.ad_id).filter(Boolean).map(String))];
  const adCampaigns = await resolveAds(adIds);
  const data = {
    campaigns: (insights.data || []).map((row) => ({ id: String(row.campaign_id || ''), name: row.campaign_name || 'Campaña sin nombre', spend: Number(row.spend || 0) })),
    adCampaigns,
    currency: account.currency || 'EUR',
  };
  metaCache.set(cacheKey, { savedAt: Date.now(), data });
  return data;
}

async function loadRows() {
  const portal = getSupabase();
  const crm = getAdminSupabase();
  const [{ data: users, error: usersError }, { data: payments, error: paymentsError }, { data: leads, error: leadsError }] = await Promise.all([
    portal.from('users').select('id,lead_id,email,role,pago_completed,pago_completed_at,tipo,origin,has_eu_id,num_carreras,contract_data'),
    portal.from('payments').select('id,user_id,installment,amount,currency,status,paid_at,created_at'),
    crm.from('crm_leads').select('id,notion_numeric_id,email,source_created_at,created_at,owner_names,campaign_notion_urls,source_payload'),
  ]);
  if (usersError) throw usersError;
  if (paymentsError) throw paymentsError;
  if (leadsError) throw leadsError;
  return { users: (users || []).filter((user) => !isApplicationAdmin(user)), payments: payments || [], leads: leads || [] };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    if (!await requireAdmin(event)) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const requested = String(event.queryStringParameters?.period || 'ytd');
    const period = PERIODS.has(requested) ? requested : 'ytd';
    const bounds = periodBounds(period);
    const [rows, expenses] = await Promise.all([
      loadRows(),
      loadExpenseEntries(bounds.start, bounds.end),
    ]);

    let meta = { campaigns: [], adCampaigns: new Map(), currency: 'EUR' };
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
    return json(buildSalesDashboard({
      period,
      leads,
      users: rows.users,
      payments: rows.payments,
      marketingExpense: expenseTotals?.marketing || 0,
      marketingAvailable: expenses.available,
      metaCampaigns: meta.campaigns,
      metaAvailable,
      metaCurrency: meta.currency,
    }));
  } catch (error) {
    console.error('admin-sales-dashboard error', error);
    return serverError(error, 'admin.sales_dashboard');
  }
};
