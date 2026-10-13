import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';
import historical from '../lib/crm-historical-metrics.js';

const { CRM_HISTORY_CUTOVER, historicalCampaignChannel, normalizeHistoricalValue } = historical;
const METHODOLOGY_VERSION = 'notion-history-2026-10-08-sql-v1';
const EXPECTED = { leads: 1168, clients: 109, organic: 303 };

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

function sql(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error('Uso: node scripts/generate-historical-crm-seed.mjs INPUT_JSON OUTPUT_SQL');

const sourceBuffer = await fs.readFile(inputPath);
const source = JSON.parse(sourceBuffer.toString('utf8'));
const cutoff = new Date(CRM_HISTORY_CUTOVER);
const secret = crypto.randomBytes(32);
const batchId = crypto.randomUUID();
const rows = source.leads.map((lead) => {
  const acquiredAt = madridLocalToIso(lead.acquisition_date);
  if (!acquiredAt || new Date(acquiredAt) >= cutoff) return null;
  const campaignName = String(lead.campaign || 'Orgánico').trim() || 'Orgánico';
  const manager = ['Noel', 'María', 'Manuel', 'Varios'].includes(lead.manager) ? lead.manager : 'Sin gestor';
  return {
    legacyKey: crypto.createHmac('sha256', secret).update(`study:${lead.lead_id}`).digest('hex'),
    acquiredAt,
    cohortMonth: `${acquiredAt.slice(0, 7)}-01`,
    campaignName,
    campaignKey: normalizeHistoricalValue(campaignName),
    channel: historicalCampaignChannel(campaignName),
    manager,
    isClient: Boolean(lead.client_in),
  };
}).filter(Boolean);

const totals = {
  leads: rows.length,
  clients: rows.filter((row) => row.isClient).length,
  organic: rows.filter((row) => row.channel === 'organic').length,
};
if (JSON.stringify(totals) !== JSON.stringify(EXPECTED)) throw new Error(`Totales inesperados: ${JSON.stringify(totals)}`);

const campaigns = [...new Map(rows.map((row) => [row.campaignKey, row])).values()];
const sourceSha256 = crypto.createHash('sha256').update(sourceBuffer).update(CRM_HISTORY_CUTOVER).update(METHODOLOGY_VERSION).digest('hex');
const summary = JSON.stringify({ cutoff: CRM_HISTORY_CUTOVER, methodologyVersion: METHODOLOGY_VERSION, totals, mode: 'direct_sql_no_pii' });

const campaignValues = campaigns.map((row) => `  (${sql(batchId)}, ${sql(row.campaignName)}, ${sql(row.campaignKey)}, ${sql(row.channel)}, null, null, ${sql(row.channel === 'meta' ? 'unmatched' : 'not_applicable')})`).join(',\n');
const factValues = rows.map((row) => `  (${sql(batchId)}, ${sql(row.legacyKey)}, ${sql(row.acquiredAt)}::timestamptz, ${sql(row.cohortMonth)}::date, ${sql(row.campaignName)}, ${sql(row.campaignKey)}, ${sql(row.channel)}, ${sql(row.manager)}, ${sql(row.isClient)}, null, 'unknown', null)`).join(',\n');

const output = `-- Datos históricos seudonimizados. No contiene nombres, emails ni teléfonos.
begin;

insert into public.crm_metric_import_batches (
  id, source, source_sha256, methodology_version, cutoff_at,
  status, expected_rows, imported_rows, summary
) values (
  ${sql(batchId)}, 'notion_historical_study', ${sql(sourceSha256)},
  ${sql(METHODOLOGY_VERSION)}, ${sql(CRM_HISTORY_CUTOVER)}::timestamptz,
  'staged', ${rows.length}, 0, ${sql(summary)}::jsonb
)
on conflict (id) do nothing;

insert into public.crm_historical_campaign_map (
  import_batch_id, campaign_name, campaign_key, channel,
  meta_campaign_id, meta_campaign_name, match_method
) values
${campaignValues}
on conflict (import_batch_id, campaign_key) do nothing;

insert into public.crm_historical_lead_facts (
  import_batch_id, legacy_lead_key, acquired_at, cohort_month,
  campaign_name, campaign_key, channel, manager, is_client,
  client_at, client_date_source, portal_user_id
) values
${factValues}
on conflict (import_batch_id, legacy_lead_key) do nothing;

update public.crm_metric_import_batches
set imported_rows = (
  select count(*)
  from public.crm_historical_lead_facts
  where import_batch_id = ${sql(batchId)}
)
where id = ${sql(batchId)};

do $$
declare
  current_status text;
begin
  select status into current_status
  from public.crm_metric_import_batches
  where id = ${sql(batchId)};

  if current_status <> 'active' then
    perform public.crm_activate_historical_metric_batch(${sql(batchId)}::uuid);
  end if;
end;
$$;

commit;

select
  count(*) as leads,
  count(*) filter (where is_client) as clientes,
  count(*) filter (where channel = 'organic') as organicos,
  count(*) filter (where channel = 'meta') as meta,
  count(*) filter (where channel = 'schools') as colegios
from public.crm_active_historical_lead_facts;
`;

await fs.writeFile(outputPath, output, 'utf8');
console.log(JSON.stringify({ outputPath, batchId, totals, campaigns: campaigns.length, bytes: Buffer.byteLength(output) }, null, 2));
