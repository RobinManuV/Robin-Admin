const {
  bucketKey,
  contractedAmountForUser,
  formatRange,
  inBounds,
  makeBuckets,
  periodBounds,
} = require('./finance-dashboard');

const CHANNELS = Object.freeze([
  { key: 'meta', label: 'Meta' },
  { key: 'organic', label: 'Orgánico' },
  { key: 'organic_social', label: 'Orgánico RRSS' },
  { key: 'referral', label: 'Referidos' },
  { key: 'other', label: 'Otros' },
  { key: 'schools', label: 'Colegios' },
]);

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value || '').trim();
const normalized = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const leadDate = (lead) => lead.source_created_at || null;

function leadChannel(lead) {
  const payload = lead.source_payload || {};
  const source = normalized(payload.source);
  if (['meta', 'facebook', 'instagram'].includes(source)) return 'meta';
  if (['organic', 'organico', 'website'].includes(source)) {
    const utm = normalized(payload.utm_source);
    return /(^|\W)(meta|facebook|instagram|fb|ig)(\W|$)/.test(utm) ? 'meta' : 'organic';
  }
  if (['organic_social', 'organico_rrss', 'rrss', 'social_organic'].includes(source)) return 'organic_social';
  if (['referral', 'referido', 'referidos'].includes(source)) return 'referral';
  if (['schools', 'school', 'colegio', 'colegios'].includes(source)) return 'schools';
  if (['other', 'otros', 'otro', 'manual'].includes(source)) return 'other';
  if (payload.ad_id || payload.campaign_id || lead.resolved_campaign_id) return 'meta';
  const storedCampaign = clean(lead.campaign_notion_urls?.[0]);
  return storedCampaign && storedCampaign !== 'Pendiente de identificar' ? 'meta' : 'other';
}

function campaignForLead(lead) {
  const payload = lead.source_payload || {};
  const stored = clean(lead.campaign_notion_urls?.[0]);
  const name = clean(lead.resolved_campaign_name || payload.campaign_name || payload.form_name || (!stored.startsWith('meta-ad:') ? stored : ''));
  const id = clean(lead.resolved_campaign_id || payload.campaign_id);
  return name ? { key: id || `name:${normalized(name)}`, id: id || null, name } : null;
}

function userIndexes(users) {
  const byLeadId = new Map();
  const byEmail = new Map();
  users.forEach((user) => {
    if (user.lead_id) byLeadId.set(String(user.lead_id), user);
    if (user.email) byEmail.set(normalized(user.email), user);
  });
  return { byLeadId, byEmail };
}

function userForLead(lead, indexes) {
  const ids = [lead.notion_numeric_id, lead.id].filter((value) => value !== undefined && value !== null).map(String);
  for (const id of ids) if (indexes.byLeadId.has(id)) return indexes.byLeadId.get(id);
  return lead.email ? indexes.byEmail.get(normalized(lead.email)) || null : null;
}

function isBuyer(user) {
  return Boolean(user?.pago_completed && user?.pago_completed_at);
}

function agentKey(value) {
  const owner = normalized(Array.isArray(value) ? value[0] : value);
  if (owner.includes('noel')) return 'noel';
  if (owner.includes('manuel')) return 'manuel';
  if (owner.includes('maria')) return 'maria';
  return null;
}

function percentage(numerator, denominator) {
  return denominator ? round(numerator / denominator * 100) : null;
}

function buildSalesDashboard({ period, leads, users, payments, marketingExpense, marketingAvailable, metaCampaigns, metaAvailable, metaCurrency = 'EUR' }) {
  const bounds = periodBounds(period);
  const indexes = userIndexes(users);
  const paymentsByUser = new Map();
  payments.forEach((payment) => {
    const rows = paymentsByUser.get(payment.user_id) || [];
    rows.push(payment);
    paymentsByUser.set(payment.user_id, rows);
  });

  const cohort = leads.filter((lead) => {
    const raw = leadDate(lead);
    return raw && inBounds(new Date(raw), bounds);
  }).map((lead) => {
    const user = userForLead(lead, indexes);
    const buyer = isBuyer(user);
    return {
      lead,
      user,
      buyer,
      channel: leadChannel(lead),
      campaign: campaignForLead(lead),
      contracted: buyer ? contractedAmountForUser(user, paymentsByUser.get(user.id) || []) : 0,
    };
  });

  const leadCount = cohort.length;
  const sales = cohort.filter((row) => row.buyer).length;
  const buckets = makeBuckets(bounds).map((bucket, index, all) => ({
    key: bucket.key,
    label: bucket.label,
    tick: all.length <= 13 || index % 5 === 0 || index === all.length - 1 ? bucket.label : '',
    leads: 0,
    sales: 0,
    conversion: null,
  }));
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  cohort.forEach((row) => {
    const date = new Date(leadDate(row.lead));
    const bucket = bucketByKey.get(bucketKey(date, bounds.granularity));
    if (!bucket) return;
    bucket.leads += 1;
    if (row.buyer) bucket.sales += 1;
  });
  buckets.forEach((bucket) => { bucket.conversion = percentage(bucket.sales, bucket.leads); });

  const channelRows = CHANNELS.map((channel) => {
    const rows = cohort.filter((row) => row.channel === channel.key);
    const channelSales = rows.filter((row) => row.buyer).length;
    return { ...channel, leads: rows.length, sales: channelSales, percentage: percentage(channelSales, sales) };
  });

  const insightById = new Map(metaCampaigns.filter((item) => item.id).map((item) => [String(item.id), item]));
  const insightByName = new Map(metaCampaigns.map((item) => [normalized(item.name), item]));
  const campaignMap = new Map();
  cohort.filter((row) => row.channel === 'meta' && row.campaign).forEach((row) => {
    const key = row.campaign.key;
    const current = campaignMap.get(key) || { id: row.campaign.id, name: row.campaign.name, leads: 0, sales: 0, contracted: 0 };
    current.leads += 1;
    if (row.buyer) {
      current.sales += 1;
      current.contracted += row.contracted;
    }
    campaignMap.set(key, current);
  });
  const campaigns = [...campaignMap.values()].map((campaign) => {
    const insight = (campaign.id && insightById.get(String(campaign.id))) || insightByName.get(normalized(campaign.name));
    const spend = metaAvailable ? round(insight?.spend || 0) : null;
    const contracted = round(campaign.contracted);
    return {
      id: campaign.id,
      name: campaign.name,
      leads: campaign.leads,
      sales: campaign.sales,
      conversion: percentage(campaign.sales, campaign.leads),
      spend,
      contracted,
      cac: spend !== null && campaign.sales ? round(spend / campaign.sales) : null,
      margin: spend !== null && contracted ? round((contracted - spend) / contracted * 100) : null,
    };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, 'es'));

  const totalMetaSpend = metaAvailable ? round(metaCampaigns.reduce((total, campaign) => total + Number(campaign.spend || 0), 0)) : null;
  const totalMetaContracted = round(cohort.filter((row) => row.channel === 'meta' && row.buyer).reduce((total, row) => total + row.contracted, 0));
  const marginsByChannel = CHANNELS.map((channel) => channel.key === 'meta'
    ? { ...channel, status: metaAvailable ? 'ready' : 'unavailable', contracted: totalMetaContracted, spend: totalMetaSpend, margin: totalMetaSpend !== null && totalMetaContracted ? round((totalMetaContracted - totalMetaSpend) / totalMetaContracted * 100) : null }
    : { ...channel, status: 'wip', contracted: null, spend: null, margin: null });

  const agentDefinitions = [
    { key: 'noel', name: 'Noel' },
    { key: 'manuel', name: 'Manuel' },
    { key: 'maria', name: 'María' },
  ];
  const agents = agentDefinitions.map((agent) => {
    const rows = cohort.filter((row) => agentKey(row.lead.source_payload?.sales_agent || row.lead.owner_names) === agent.key);
    const clients = rows.filter((row) => row.buyer).length;
    return { ...agent, leads: rows.length, sales: clients, conversion: percentage(clients, rows.length) };
  });
  const availableConversions = agents.map((agent) => agent.conversion).filter((value) => value !== null);
  const teamAverage = availableConversions.length ? round(availableConversions.reduce((total, value) => total + value, 0) / availableConversions.length) : null;

  return {
    period: bounds.id,
    rangeLabel: formatRange(bounds),
    granularity: bounds.granularity,
    syncedAt: new Date().toISOString(),
    kpis: {
      sales,
      leads: leadCount,
      conversion: percentage(sales, leadCount),
      cac: marketingAvailable && sales ? round(marketingExpense / sales) : null,
      lac: marketingAvailable && leadCount ? round(marketingExpense / leadCount) : null,
    },
    buckets,
    channels: channelRows,
    campaigns,
    marginsByChannel,
    agents: [...agents, { key: 'team', name: 'Media del equipo', leads: null, sales: null, conversion: teamAverage }],
    teamAverage,
    sources: { portal: true, adminCrm: true, holdedMarketing: marketingAvailable, meta: metaAvailable },
    meta: { currency: metaCurrency, spend: totalMetaSpend },
  };
}

module.exports = { CHANNELS, buildSalesDashboard, leadChannel };
