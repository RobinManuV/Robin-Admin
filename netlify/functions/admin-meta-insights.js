const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { activeSalesTestRun, isLeadInTestRun } = require('../../lib/sales-test-mode');

const number = (value) => Number(value || 0);
const CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_REFRESH_MS = 5 * 60 * 1000;
let cachedSnapshot = null;
let cachedAt = 0;
let pendingSnapshot = null;

function actionValue(items, preferredTypes) {
  for (const type of preferredTypes) {
    const match = (items || []).find((item) => item.action_type === type);
    if (match) return number(match.value);
  }
  return 0;
}

function metrics(row = {}) {
  const spend = number(row.spend);
  const leads = actionValue(row.actions, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']);
  const purchases = actionValue(row.actions, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);
  const revenue = actionValue(row.action_values, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);
  return {
    spend,
    impressions: number(row.impressions),
    clicks: number(row.clicks),
    reach: number(row.reach),
    ctr: number(row.ctr),
    cpc: number(row.cpc),
    cpm: number(row.cpm),
    leads,
    purchases,
    revenue,
    cpl: leads ? spend / leads : 0,
    cac: purchases ? spend / purchases : 0,
    roas: spend ? revenue / spend : 0,
  };
}

async function graph(path, params = {}) {
  const version = process.env.META_API_VERSION || 'v26.0';
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN no configurado');
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Meta API ${response.status}`);
  return payload;
}

async function adAccountId() {
  const configured = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  if (configured) return configured.startsWith('act_') ? configured : `act_${configured}`;
  const accounts = await graph('me/adaccounts', { fields: 'id,account_status', limit: 100 });
  const active = (accounts.data || []).find((account) => Number(account.account_status) === 1) || accounts.data?.[0];
  if (!active?.id) throw new Error('No se encontró una cuenta publicitaria accesible');
  return active.id;
}

async function loadSnapshot() {
  const accountId = await adAccountId();
  const fields = 'campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpc,cpm,actions,action_values';
  const [summaryResult, campaignsResult, dailyResult, accountResult] = await Promise.all([
    graph(`${accountId}/insights`, { fields, date_preset: 'last_30d', level: 'account', limit: 1 }),
    graph(`${accountId}/insights`, { fields, date_preset: 'last_30d', level: 'campaign', limit: 500 }),
    graph(`${accountId}/insights`, { fields: 'date_start,spend,cpm', date_preset: 'last_30d', level: 'account', time_increment: 1, limit: 100 }),
    graph(accountId, { fields: 'name,currency,timezone_name' }),
  ]);
  const statuses = await graph(`${accountId}/campaigns`, { fields: 'id,effective_status', limit: 500 });
  const statusById = Object.fromEntries((statuses.data || []).map((item) => [item.id, item.effective_status]));
  const campaigns = (campaignsResult.data || []).map((row) => ({ id: row.campaign_id, name: row.campaign_name || 'Campaña sin nombre', status: statusById[row.campaign_id] || 'UNKNOWN', ...metrics(row) })).sort((a, b) => b.spend - a.spend);
  return { period: 'last_30d', account: { id: accountId, name: accountResult.name || accountId, currency: accountResult.currency || 'EUR', timezone: accountResult.timezone_name || '' }, summary: metrics(summaryResult.data?.[0]), campaigns, daily: (dailyResult.data || []).map((row) => ({ date: row.date_start, spend: number(row.spend), cpm: number(row.cpm) })), syncedAt: new Date().toISOString() };
}

async function loadTestSnapshot(crm, runId) {
  const [{ data: fixtures, error: fixturesError }, { data: leads, error: leadsError }] = await Promise.all([
    crm.from('sales_simulated_meta_campaigns').select('campaign_id,campaign_name,spend,leads').eq('test_run', runId),
    crm.from('crm_leads').select('crm_stage,price_at_signature,source_payload,is_test').eq('is_test', true).contains('source_payload', { test_run: runId }),
  ]);
  if (fixturesError) throw fixturesError;
  if (leadsError) throw leadsError;
  const testLeads = (leads || []).filter((lead) => isLeadInTestRun(lead, runId));
  const campaigns = (fixtures || []).map((row) => {
    const campaignLeads = testLeads.filter((lead) => lead.source_payload?.campaign_id === row.campaign_id);
    const purchases = campaignLeads.filter((lead) => lead.crm_stage === 'Cliente').length;
    const revenue = campaignLeads.reduce((total, lead) => total + (lead.crm_stage === 'Cliente' ? number(lead.price_at_signature) : 0), 0);
    const spend = number(row.spend);
    const leadCount = campaignLeads.length || number(row.leads);
    return { id: row.campaign_id, name: row.campaign_name, status: 'TEST_ACTIVE', spend, impressions: leadCount * 950, clicks: leadCount * 18, reach: leadCount * 720, ctr: 1.89, cpc: leadCount ? spend / (leadCount * 18) : 0, cpm: leadCount ? spend / (leadCount * 950) * 1000 : 0, leads: leadCount, purchases, revenue, cpl: leadCount ? spend / leadCount : 0, cac: purchases ? spend / purchases : 0, roas: spend ? revenue / spend : 0 };
  });
  const summary = campaigns.reduce((total, campaign) => ({ spend: total.spend + campaign.spend, impressions: total.impressions + campaign.impressions, clicks: total.clicks + campaign.clicks, reach: total.reach + campaign.reach, leads: total.leads + campaign.leads, purchases: total.purchases + campaign.purchases, revenue: total.revenue + campaign.revenue }), { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchases: 0, revenue: 0 });
  return { period: 'test', account: { id: 'test-mode', name: 'Cuenta simulada · TEST', currency: 'EUR', timezone: 'Europe/Madrid' }, summary: { ...summary, ctr: summary.impressions ? summary.clicks / summary.impressions * 100 : 0, cpc: summary.clicks ? summary.spend / summary.clicks : 0, cpm: summary.impressions ? summary.spend / summary.impressions * 1000 : 0, cpl: summary.leads ? summary.spend / summary.leads : 0, cac: summary.purchases ? summary.spend / summary.purchases : 0, roas: summary.spend ? summary.revenue / summary.spend : 0 }, campaigns, daily: [], syncedAt: new Date().toISOString(), simulated: true };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const sb = getSupabase();
    const { data: admin, error } = await sb.from('users').select('id,email,username,role').eq('id', session.uid).single();
    if (error || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const crm = getAdminSupabase();
    const testRun = await activeSalesTestRun(crm);
    if (testRun?.status === 'active') return json(await loadTestSnapshot(crm, testRun.test_run));

    const age = Date.now() - cachedAt;
    const force = event.queryStringParameters?.refresh === '1';
    if (cachedSnapshot && age < (force ? MIN_REFRESH_MS : CACHE_TTL_MS)) return json(cachedSnapshot);
    if (!pendingSnapshot) pendingSnapshot = loadSnapshot().then((snapshot) => { cachedSnapshot = snapshot; cachedAt = Date.now(); return snapshot; }).finally(() => { pendingSnapshot = null; });
    try { return json(await pendingSnapshot); }
    catch (error) {
      if (cachedSnapshot) return json({ ...cachedSnapshot, stale: true });
      if (/too many calls|rate limit/i.test(String(error?.message || ''))) return json({ error: 'meta_rate_limited', detail: 'Meta ha limitado temporalmente las consultas. Espera unos minutos antes de actualizar de nuevo.' }, { statusCode: 429 });
      throw error;
    }
  } catch (error) {
    return serverError(error, 'admin.meta_insights');
  }
};
