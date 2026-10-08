const {
  bucketKey,
  contractedAmountForUser,
  formatRange,
  inBounds,
  isContractedUserIncluded,
  makeBuckets,
  periodBounds,
} = require('./finance-dashboard');
const { buildCrmPerformance } = require('./crm-performance');
const {
  CRM_HISTORY_CUTOVER,
  historicalCampaign,
  historicalManagerKey,
  normalizeHistoricalValue,
} = require('./crm-historical-metrics');

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
const NATIVE_SOURCES = new Set(['meta', 'facebook', 'instagram', 'website', 'organic', 'organico', 'organic_social', 'organico_rrss', 'rrss', 'social_organic', 'referral', 'referido', 'referidos', 'schools', 'school', 'colegio', 'colegios', 'other', 'otros', 'otro', 'manual']);

function isNativeLead(lead) {
  const payload = lead.source_payload || {};
  const source = normalized(payload.source);
  if (source === 'notion') return false;
  return NATIVE_SOURCES.has(source) || Boolean(payload.ad_id || payload.campaign_id);
}

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
  if (payload.ad_id || payload.campaign_id) return 'meta';
  return null;
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
  const ids = [lead.id].filter((value) => value !== undefined && value !== null).map(String);
  for (const id of ids) if (indexes.byLeadId.has(id)) return indexes.byLeadId.get(id);
  return lead.email ? indexes.byEmail.get(normalized(lead.email)) || null : null;
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

function campaignForLead(lead) {
  const payload = lead.source_payload || {};
  const id = clean(lead.resolved_campaign_id || payload.campaign_id);
  const name = clean(lead.resolved_campaign_name || payload.campaign_name);
  return id || name ? { id: id || null, name: name || 'Campaña sin nombre' } : null;
}

function campaignMatches(leadCampaign, metaCampaign) {
  if (!leadCampaign) return false;
  if (leadCampaign.id && metaCampaign.id && String(leadCampaign.id) === String(metaCampaign.id)) return true;
  return Boolean(leadCampaign.name && metaCampaign.name && normalized(leadCampaign.name) === normalized(metaCampaign.name));
}

function buildSalesDashboard({ period, bounds: suppliedBounds, leads, users, payments, marketingExpense, marketingAvailable, metaCampaigns, metaDaily = [], metaAvailable, metaCurrency = 'EUR', crmEvents = [], crmSessions = [], crmUsers = [], crmApplications = [], crmAvailability = {}, historicalFacts = [] }) {
  const bounds = suppliedBounds || periodBounds(period);
  const indexes = userIndexes(users);
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const nativeLeads = leads.filter((lead) => {
    const raw = leadDate(lead);
    return isNativeLead(lead) && raw && new Date(raw) >= new Date(CRM_HISTORY_CUTOVER);
  });
  const historicalCohort = historicalFacts.filter((fact) => fact.acquired_at && inBounds(new Date(fact.acquired_at), bounds));
  const historicalByPortalUserId = new Map(historicalFacts
    .filter((fact) => fact.portal_user_id)
    .map((fact) => [String(fact.portal_user_id), fact]));
  const leadByUserId = new Map();
  nativeLeads.forEach((lead) => {
    const user = userForLead(lead, indexes);
    if (user && !leadByUserId.has(user.id)) leadByUserId.set(user.id, lead);
  });
  const paymentsByUser = new Map();
  payments.forEach((payment) => {
    const rows = paymentsByUser.get(payment.user_id) || [];
    rows.push(payment);
    paymentsByUser.set(payment.user_id, rows);
  });

  const cohort = nativeLeads.filter((lead) => {
    const raw = leadDate(lead);
    return raw && inBounds(new Date(raw), bounds);
  }).map((lead) => {
    const user = userForLead(lead, indexes);
    return {
      lead,
      user,
      channel: leadChannel(lead),
    };
  });
  const signedUsers = users.filter((user) => isContractedUserIncluded(user) && user.contract_signed_at && inBounds(new Date(user.contract_signed_at), bounds));
  const rowForUser = (user, lead = null, historicalFact = null) => {
    const userPayments = paymentsByUser.get(user.id) || [];
    const paid = userPayments.filter((payment) => payment.status === 'paid').reduce((total, payment) => total + Number(payment.amount || 0), 0);
    return {
      user,
      lead,
      historicalFact,
      channel: lead ? leadChannel(lead) : historicalFact?.channel || null,
      campaign: lead ? campaignForLead(lead) : historicalFact ? historicalCampaign(historicalFact) : null,
      managerKey: lead ? agentKey(lead.source_payload?.sales_agent || lead.owner_names) : historicalManagerKey(historicalFact?.manager),
      contracted: contractedAmountForUser(user, userPayments),
      paid: round(paid),
    };
  };
  const signedRows = signedUsers.map((user) => rowForUser(
    user,
    leadByUserId.get(user.id) || null,
    historicalByPortalUserId.get(String(user.id)) || null,
  ));

  const nativeCohortClients = cohort
    .filter((row) => row.user && isContractedUserIncluded(row.user))
    .map((row) => rowForUser(row.user, row.lead, null));
  const historicalCohortClients = historicalCohort
    .filter((fact) => fact.is_client)
    .map((fact) => {
      const user = fact.portal_user_id ? usersById.get(String(fact.portal_user_id)) || null : null;
      if (user) return rowForUser(user, null, fact);
      return {
        user: null,
        lead: null,
        historicalFact: fact,
        channel: fact.channel,
        campaign: historicalCampaign(fact),
        managerKey: historicalManagerKey(fact.manager),
        contracted: 0,
        paid: 0,
        historicalOnly: true,
      };
    });
  const conversionRows = [...nativeCohortClients, ...historicalCohortClients];

  // Conversión y CAC usan cohortes de adquisición de CRM + histórico. Meta
  // aporta el gasto, no sustituye el recuento de personas de la cohorte.
  const leadCount = cohort.length + historicalCohort.length;
  const contracts = conversionRows.length;
  const contracted = round(signedRows.reduce((total, row) => total + row.contracted, 0));
  const buckets = makeBuckets(bounds).map((bucket, index, all) => ({
    key: bucket.key,
    label: bucket.label,
    tick: all.length <= 13 || index % 5 === 0 || index === all.length - 1 ? bucket.label : '',
    leads: 0,
    contracts: 0,
    conversionClients: 0,
    conversion: null,
  }));
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  cohort.forEach(({ lead }) => {
    const date = new Date(leadDate(lead));
    const bucket = bucketByKey.get(bucketKey(date, bounds.granularity));
    if (bucket) bucket.leads += 1;
  });
  nativeCohortClients.forEach((row) => {
    const bucket = bucketByKey.get(bucketKey(new Date(leadDate(row.lead)), bounds.granularity));
    if (bucket) bucket.conversionClients += 1;
  });
  historicalCohort.forEach((fact) => {
    const bucket = bucketByKey.get(bucketKey(new Date(fact.acquired_at), bounds.granularity));
    if (bucket) {
      bucket.leads += 1;
      if (fact.is_client) bucket.conversionClients += 1;
    }
  });
  signedUsers.forEach((user) => {
    const bucket = bucketByKey.get(bucketKey(new Date(user.contract_signed_at), bounds.granularity));
    if (bucket) bucket.contracts += 1;
  });
  buckets.forEach((bucket) => { bucket.conversion = percentage(bucket.conversionClients, bucket.leads); });

  const identifiedChannelContracted = round(signedRows.filter((row) => row.channel).reduce((total, row) => total + row.contracted, 0));
  const channelRows = CHANNELS.map((channel) => {
    const channelLeads = cohort.filter((row) => row.channel === channel.key).length
      + historicalCohort.filter((fact) => fact.channel === channel.key).length;
    const channelContracts = conversionRows.filter((row) => row.channel === channel.key);
    const channelContracted = round(signedRows.filter((row) => row.channel === channel.key).reduce((total, row) => total + row.contracted, 0));
    return { ...channel, leads: channelLeads, contracts: channelContracts.length, contracted: channelContracted, percentage: percentage(channelContracted, identifiedChannelContracted) };
  });

  const campaignDefinitions = new Map();
  if (metaAvailable) {
    metaCampaigns.filter((campaign) => campaign.leads || campaign.spend).forEach((campaign) => {
      const key = campaign.id ? `id:${campaign.id}` : `name:${normalizeHistoricalValue(campaign.name)}`;
      campaignDefinitions.set(key, { ...campaign, source: 'meta' });
    });
  }
  historicalCohort.filter((fact) => fact.channel !== 'organic').forEach((fact) => {
    const key = fact.meta_campaign_id ? `id:${fact.meta_campaign_id}` : `name:${fact.campaign_key}`;
    if (!campaignDefinitions.has(key)) {
      campaignDefinitions.set(key, {
        id: fact.meta_campaign_id || null,
        name: fact.meta_campaign_name || fact.campaign_name,
        spend: null,
        leads: null,
        source: fact.channel,
      });
    }
  });
  const campaigns = [...campaignDefinitions.values()].map((campaign) => {
    const spend = campaign.spend == null ? null : round(campaign.spend);
    const campaignContracts = conversionRows.filter((row) => campaignMatches(row.campaign, campaign));
    const monetaryContracts = signedRows.filter((row) => campaignMatches(row.campaign, campaign));
    const campaignContracted = round(monetaryContracts.reduce((total, row) => total + row.contracted, 0));
    const campaignPaid = round(monetaryContracts.reduce((total, row) => total + row.paid, 0));
    const campaignCrmLeads = cohort.filter((row) => campaignMatches(campaignForLead(row.lead), campaign));
    const campaignHistoricalLeads = historicalCohort.filter((fact) => campaignMatches(historicalCampaign(fact), campaign));
    const matchedCrmLeads = campaignCrmLeads.length + campaignHistoricalLeads.length;
    // Meta aporta la inversión. El volumen de leads procede siempre del CRM
    // y del histórico validado para no mezclar conversiones publicitarias con
    // personas efectivamente incorporadas a la cohorte comercial.
    const leads = matchedCrmLeads;
    const contacted = campaignCrmLeads.filter((row) => row.lead.contact_at || !['por contactar', ''].includes(normalized(row.lead.crm_stage))).length;
    return {
      id: campaign.id || null,
      name: campaign.name,
      channel: campaign.source === 'schools' ? 'schools' : 'meta',
      leads,
      contracts: campaignContracts.length,
      conversion: percentage(campaignContracts.length, leads),
      spend,
      contracted: campaignContracted,
      paid: campaignPaid,
      contacted,
      matchedCrmLeads,
      contactRate: campaignHistoricalLeads.length || !campaignCrmLeads.length ? null : percentage(contacted, leads),
      cpl: spend != null && leads ? round(spend / leads) : null,
      cac: spend != null && campaignContracts.length ? round(spend / campaignContracts.length) : null,
      roas: spend ? round(campaignContracted / spend) : null,
      roasCollected: spend ? round(campaignPaid / spend) : null,
      margin: null,
    };
  }).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, 'es'));

  const totalMetaSpend = metaAvailable ? round(metaCampaigns.reduce((total, campaign) => total + Number(campaign.spend || 0), 0)) : null;
  const paidByChannel = new Map(CHANNELS.map((channel) => [channel.key, round(signedRows.filter((row) => row.channel === channel.key).reduce((total, row) => total + row.paid, 0))]));
  const totalMetaPaid = paidByChannel.get('meta') || 0;
  const marginsByChannel = CHANNELS.map((channel) => channel.key === 'meta'
    ? { ...channel, status: metaAvailable ? 'ready' : 'unavailable', paid: totalMetaPaid, spend: totalMetaSpend, margin: totalMetaSpend !== null && totalMetaPaid ? round((totalMetaPaid - totalMetaSpend) / totalMetaPaid * 100) : null }
    : { ...channel, status: 'unavailable', paid: paidByChannel.get(channel.key) || 0, spend: null, margin: null });

  const agentDefinitions = [
    { key: 'noel', name: 'Noel' },
    { key: 'manuel', name: 'Manuel' },
    { key: 'maria', name: 'María' },
  ];
  const agents = agentDefinitions.map((agent) => {
    const rows = cohort.filter((row) => agentKey(row.lead.source_payload?.sales_agent || row.lead.owner_names) === agent.key).length
      + historicalCohort.filter((fact) => historicalManagerKey(fact.manager) === agent.key).length;
    const clients = conversionRows.filter((row) => row.managerKey === agent.key).length;
    return { ...agent, leads: rows, sales: clients, conversion: percentage(clients, rows) };
  });
  const availableConversions = agents.map((agent) => agent.conversion).filter((value) => value !== null);
  const teamAverage = availableConversions.length ? round(availableConversions.reduce((total, value) => total + value, 0) / availableConversions.length) : null;
  const team = buildCrmPerformance({
    bounds,
    leads,
    events: crmEvents,
    sessions: crmSessions,
    crmUsers,
    applications: crmApplications,
    signedRows,
    payments,
    availability: crmAvailability,
  });
  team.summary.newLeads = leadCount;
  team.summary.contracts = contracts;
  team.agents = team.agents.map((agent) => {
    const cohortAgent = agents.find((row) => row.key === agent.key);
    return {
      ...agent,
      cohortLeads: cohortAgent?.leads || 0,
      cohortClients: cohortAgent?.sales || 0,
    };
  });

  const acquisitionBuckets = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    tick: bucket.tick,
    leads: bucket.leads,
    clients: bucket.contracts,
  }));

  return {
    period: bounds.id,
    rangeLabel: formatRange(bounds),
    granularity: bounds.granularity,
    syncedAt: new Date().toISOString(),
    kpis: {
      contracted,
      contracts,
      leads: leadCount,
      conversion: percentage(contracts, leadCount),
      cac: metaAvailable && contracts ? round(totalMetaSpend / contracts) : null,
      lac: metaAvailable && leadCount ? round(totalMetaSpend / leadCount) : null,
    },
    buckets,
    acquisition: {
      leads: leadCount,
      newClients: signedUsers.length,
      buckets: acquisitionBuckets,
    },
    channels: channelRows,
    campaigns,
    team,
    marginsByChannel,
    agents: [...agents, { key: 'team', name: 'Media del equipo', leads: null, sales: null, conversion: teamAverage }],
    teamAverage,
    sources: { portal: true, adminCrm: true, holdedMarketing: marketingAvailable, meta: metaAvailable, historical: Boolean(crmAvailability.historical) },
    meta: { currency: metaCurrency, spend: totalMetaSpend },
  };
}

module.exports = { CHANNELS, buildSalesDashboard, leadChannel };
