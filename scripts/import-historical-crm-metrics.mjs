import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import historical from '../lib/crm-historical-metrics.js';

const {
  CRM_HISTORY_CUTOVER,
  historicalCampaignChannel,
  normalizeHistoricalValue,
} = historical;

const EXPECTED = Object.freeze({
  leads: 1168,
  clients: 109,
  organic: 303,
  managers: { Noel: 236, María: 258, Manuel: 229, Varios: 3, 'Sin gestor': 442 },
});
const METHODOLOGY_VERSION = 'notion-history-2026-10-08-v1';

function argsFrom(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (['apply', 'activate', 'allow-unmatched-meta'].includes(key)) args[key] = true;
    else args[key] = argv[++index];
  }
  return args;
}

const args = argsFrom(process.argv.slice(2));

function usage() {
  console.log(`Uso:
  node scripts/import-historical-crm-metrics.mjs --input /ruta/lead_analysis.json [--report preview.json]
  node scripts/import-historical-crm-metrics.mjs --input /ruta/lead_analysis.json --apply [--activate] [--allow-unmatched-meta]
  node scripts/import-historical-crm-metrics.mjs --activate-batch UUID

Variables para --apply:
  ADMIN_SUPABASE_URL, ADMIN_SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  CRM_HISTORY_HASH_SECRET (opcional; si falta se genera uno efímero seguro)
  META_ACCESS_TOKEN y, opcionalmente, META_AD_ACCOUNT_ID / META_API_VERSION`);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0034') && digits.length > 9) digits = digits.slice(4);
  else if (digits.startsWith('34') && digits.length > 9) digits = digits.slice(2);
  return digits;
}

function madridLocalToIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate += desired - represented;
  }
  return new Date(candidate).toISOString();
}

function sourceIdentity(lead) {
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  if (email) return `email:${email}`;
  if (phone) return `phone:${phone}`;
  return `study:${lead.lead_id}`;
}

function pseudonymousKey(lead, secret) {
  return crypto.createHmac('sha256', secret).update(sourceIdentity(lead)).digest('hex');
}

function assertExpected(rows) {
  const managers = Object.fromEntries(Object.keys(EXPECTED.managers).map((manager) => [manager, rows.filter((row) => row.manager === manager).length]));
  const actual = {
    leads: rows.length,
    clients: rows.filter((row) => row.is_client).length,
    organic: rows.filter((row) => row.channel === 'organic').length,
    managers,
  };
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED)) {
    throw new Error(`historical_totals_mismatch\nEsperado: ${JSON.stringify(EXPECTED)}\nObtenido: ${JSON.stringify(actual)}`);
  }
  return actual;
}

async function pagedRows(client, table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function portalUsersByEmail() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing_portal_supabase_credentials');
  const portal = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = await pagedRows(portal, 'users', 'id,email,role,contract_signed,contract_signed_at');
  const buckets = new Map();
  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    const rows = buckets.get(email) || [];
    rows.push(user);
    buckets.set(email, rows);
  }
  return new Map([...buckets].map(([email, rows]) => [email, rows.length === 1 ? rows[0] : null]));
}

async function metaGraph(path, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const version = process.env.META_API_VERSION || 'v26.0';
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries({ ...params, access_token: token }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const rows = [];
  let next = url.toString();
  while (next) {
    const response = await fetch(next);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `meta_http_${response.status}`);
    rows.push(...(payload.data || []));
    next = payload.paging?.next || '';
  }
  return rows;
}

async function metaAccountId() {
  const configured = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  if (configured) return configured.startsWith('act_') ? configured : `act_${configured}`;
  const accounts = await metaGraph('me/adaccounts', { fields: 'id,account_status', limit: 100 });
  const active = (accounts || []).find((account) => Number(account.account_status) === 1) || accounts?.[0];
  if (!active?.id) throw new Error('meta_account_not_found');
  return active.id;
}

async function historicalMetaCampaigns(rows) {
  if (!process.env.META_ACCESS_TOKEN) return [];
  const accountId = await metaAccountId();
  const minDate = rows.map((row) => row.acquired_at.slice(0, 10)).sort()[0];
  return metaGraph(`${accountId}/insights`, {
    fields: 'campaign_id,campaign_name,spend,actions',
    level: 'campaign',
    time_range: JSON.stringify({ since: minDate, until: '2026-09-22' }),
    limit: 500,
  });
}

async function manualCampaignMap(path) {
  if (!path) return {};
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function buildCampaignMap(rows, metaRows, manual) {
  const metaByName = new Map();
  for (const row of metaRows || []) {
    const key = normalizeHistoricalValue(row.campaign_name);
    const matches = metaByName.get(key) || [];
    matches.push(row);
    metaByName.set(key, matches);
  }
  const unique = new Map(rows.map((row) => [row.campaign_key, row.campaign_name]));
  return [...unique].map(([campaignKey, campaignName]) => {
    const channel = historicalCampaignChannel(campaignName);
    if (channel !== 'meta') return { campaign_name: campaignName, campaign_key: campaignKey, channel, meta_campaign_id: null, meta_campaign_name: null, match_method: 'not_applicable' };
    const override = manual[campaignName] || manual[campaignKey];
    if (override) {
      const id = typeof override === 'string' ? override : override.id;
      const name = typeof override === 'string' ? campaignName : override.name || campaignName;
      return { campaign_name: campaignName, campaign_key: campaignKey, channel, meta_campaign_id: String(id), meta_campaign_name: name, match_method: 'manual_id' };
    }
    const matches = metaByName.get(campaignKey) || [];
    if (matches.length === 1) return { campaign_name: campaignName, campaign_key: campaignKey, channel, meta_campaign_id: String(matches[0].campaign_id), meta_campaign_name: matches[0].campaign_name, match_method: 'exact_name' };
    return { campaign_name: campaignName, campaign_key: campaignKey, channel, meta_campaign_id: null, meta_campaign_name: null, match_method: 'unmatched', match_count: matches.length };
  });
}

async function prepare(inputPath, secret, includePortal) {
  const sourceBuffer = await fs.readFile(inputPath);
  const input = JSON.parse(sourceBuffer.toString('utf8'));
  const cutoff = new Date(CRM_HISTORY_CUTOVER);
  const portalByEmail = includePortal ? await portalUsersByEmail() : new Map();
  const rows = input.leads.map((lead) => {
    const acquiredAt = madridLocalToIso(lead.acquisition_date);
    if (!acquiredAt || new Date(acquiredAt) >= cutoff) return null;
    const email = normalizeEmail(lead.email);
    const portalUser = email ? portalByEmail.get(email) : null;
    const linkedPortalUser = lead.client_in ? portalUser : null;
    const clientAt = linkedPortalUser?.contract_signed && linkedPortalUser.contract_signed_at ? new Date(linkedPortalUser.contract_signed_at).toISOString() : null;
    const campaignName = String(lead.campaign || 'Orgánico').trim() || 'Orgánico';
    const manager = ['Noel', 'María', 'Manuel', 'Varios'].includes(lead.manager) ? lead.manager : 'Sin gestor';
    return {
      legacy_lead_key: pseudonymousKey(lead, secret),
      acquired_at: acquiredAt,
      cohort_month: acquiredAt.slice(0, 7) + '-01',
      campaign_name: campaignName,
      campaign_key: normalizeHistoricalValue(campaignName),
      channel: historicalCampaignChannel(campaignName),
      manager,
      is_client: Boolean(lead.client_in),
      client_at: clientAt,
      client_date_source: clientAt ? 'portal_contract' : 'unknown',
      portal_user_id: linkedPortalUser?.id || null,
    };
  }).filter(Boolean);
  const totals = assertExpected(rows);
  const sourceSha256 = crypto.createHash('sha256').update(sourceBuffer).update(CRM_HISTORY_CUTOVER).update(METHODOLOGY_VERSION).digest('hex');
  return { rows, totals, sourceSha256 };
}

async function activateBatch(batchId) {
  const url = process.env.ADMIN_SUPABASE_URL;
  const key = process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing_admin_supabase_credentials');
  const crm = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await crm.rpc('crm_activate_historical_metric_batch', { p_batch_id: batchId });
  if (error) throw error;
  console.log(JSON.stringify({ activated: true, batch: data }, null, 2));
}

async function main() {
  if (args['activate-batch']) return activateBatch(args['activate-batch']);
  if (!args.input) { usage(); process.exitCode = 1; return; }

  const apply = Boolean(args.apply);
  const secret = process.env.CRM_HISTORY_HASH_SECRET || (apply ? crypto.randomBytes(32).toString('hex') : 'preview-only-not-for-import');
  const prepared = await prepare(args.input, secret, apply);
  const metaRows = await historicalMetaCampaigns(prepared.rows);
  const campaignMap = buildCampaignMap(prepared.rows, metaRows || [], await manualCampaignMap(args['campaign-map']));
  const unmatchedMeta = campaignMap.filter((row) => row.channel === 'meta' && !row.meta_campaign_id);
  const preview = {
    cutoff: CRM_HISTORY_CUTOVER,
    methodologyVersion: METHODOLOGY_VERSION,
    totals: prepared.totals,
    portalMatchedClients: prepared.rows.filter((row) => row.client_date_source === 'portal_contract').length,
    campaigns: campaignMap,
    unmatchedMetaCampaigns: unmatchedMeta.map((row) => row.campaign_name),
  };
  console.log(JSON.stringify(preview, null, 2));
  if (args.report) await fs.writeFile(args.report, JSON.stringify(preview, null, 2) + '\n', 'utf8');
  if (!apply) return;
  if (unmatchedMeta.length && !args['allow-unmatched-meta']) throw new Error('unmatched_meta_campaigns_use_campaign_map_or_allow_unmatched_meta');

  const url = process.env.ADMIN_SUPABASE_URL;
  const key = process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing_admin_supabase_credentials');
  const crm = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: batch, error: batchError } = await crm.from('crm_metric_import_batches').insert({
    source: 'notion_historical_study',
    source_sha256: prepared.sourceSha256,
    methodology_version: METHODOLOGY_VERSION,
    cutoff_at: CRM_HISTORY_CUTOVER,
    expected_rows: prepared.rows.length,
    summary: preview,
  }).select('*').single();
  if (batchError) throw batchError;

  try {
    const maps = campaignMap.map(({ match_count, ...row }) => ({ ...row, import_batch_id: batch.id }));
    const { error: mapError } = await crm.from('crm_historical_campaign_map').insert(maps);
    if (mapError) throw mapError;
    for (let index = 0; index < prepared.rows.length; index += 250) {
      const chunk = prepared.rows.slice(index, index + 250).map((row) => ({ ...row, import_batch_id: batch.id }));
      const { error } = await crm.from('crm_historical_lead_facts').insert(chunk);
      if (error) throw error;
    }
    const { count, error: countError } = await crm.from('crm_historical_lead_facts').select('id', { count: 'exact', head: true }).eq('import_batch_id', batch.id);
    if (countError) throw countError;
    if (count !== prepared.rows.length) throw new Error(`uploaded_row_count_mismatch:${count}`);
    const { error: updateError } = await crm.from('crm_metric_import_batches').update({ imported_rows: count }).eq('id', batch.id);
    if (updateError) throw updateError;
    if (args.activate) {
      const { data: activated, error: activationError } = await crm.rpc('crm_activate_historical_metric_batch', { p_batch_id: batch.id });
      if (activationError) throw activationError;
      console.log(JSON.stringify({ staged: true, activated: true, batchId: batch.id, rows: count, batch: activated }, null, 2));
    } else {
      console.log(JSON.stringify({ staged: true, batchId: batch.id, rows: count, next: `node scripts/import-historical-crm-metrics.mjs --activate-batch ${batch.id}` }, null, 2));
    }
  } catch (error) {
    await crm.from('crm_metric_import_batches').update({ status: 'failed', summary: { ...preview, error: String(error?.message || error) } }).eq('id', batch.id);
    throw error;
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
