const CRM_HISTORY_CUTOVER = '2026-09-22T22:00:00.000Z'; // 23/09/2026 00:00 Europe/Madrid

const clean = (value) => String(value || '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

function historicalCampaignChannel(name) {
  const key = normalize(name);
  if (!key || key === 'organico') return 'organic';
  if (key.includes('voramar') || key.includes('kings college') || key.includes('the ark')) return 'schools';
  return 'meta';
}

function historicalManagerKey(value) {
  const key = normalize(value);
  if (key === 'noel') return 'noel';
  if (key === 'manuel') return 'manuel';
  if (key === 'maria') return 'maria';
  return null;
}

function historicalCampaign(fact) {
  const id = clean(fact.meta_campaign_id);
  const name = clean(fact.meta_campaign_name || fact.campaign_name);
  return id || name ? { id: id || null, name: name || 'Campaña sin nombre' } : null;
}

function isMissingHistoricalSchema(error) {
  const text = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  return /42P01|PGRST204|PGRST205|crm_active_historical_lead_facts|crm_historical_lead_facts/i.test(text);
}

async function loadActiveHistoricalFacts(crm) {
  const { data, error } = await crm.from('crm_active_historical_lead_facts').select('*');
  if (!error) return { rows: data || [], available: true };
  if (isMissingHistoricalSchema(error)) return { rows: [], available: false };
  throw error;
}

function enrichHistoricalCampaigns(facts, metaCampaigns) {
  const byName = new Map();
  for (const campaign of metaCampaigns || []) {
    const key = normalize(campaign.name);
    if (!key) continue;
    const rows = byName.get(key) || [];
    rows.push(campaign);
    byName.set(key, rows);
  }
  return (facts || []).map((fact) => {
    if (fact.meta_campaign_id || fact.channel !== 'meta') return fact;
    const matches = byName.get(normalize(fact.campaign_name)) || [];
    if (matches.length !== 1) return fact;
    return {
      ...fact,
      meta_campaign_id: String(matches[0].id || '') || null,
      meta_campaign_name: matches[0].name || fact.campaign_name,
      campaign_match_method: 'exact_name',
    };
  });
}

module.exports = {
  CRM_HISTORY_CUTOVER,
  enrichHistoricalCampaigns,
  historicalCampaign,
  historicalCampaignChannel,
  historicalManagerKey,
  isMissingHistoricalSchema,
  loadActiveHistoricalFacts,
  normalizeHistoricalValue: normalize,
};
