const { getAdminSupabase } = require('./admin-supabase');

function clean(value, max = 2000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isBlockedLeadName(value) {
  const normalized = clean(value, 240).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalized === 'robertnat' || normalized.startsWith('centr_') || normalized.startsWith('reyting');
}

async function findExisting(crm, { source, externalId, email, phone }) {
  if (externalId) {
    const { data } = await crm.from('crm_leads').select('*').contains('source_payload', { source, external_id: externalId }).limit(1);
    if (data && data[0]) return data[0];
  }
  if (email) {
    const { data } = await crm.from('crm_leads').select('*').ilike('email', email).limit(1);
    if (data && data[0]) return data[0];
  }
  if (phone) {
    const { data } = await crm.from('crm_leads').select('*').eq('phone', phone).limit(1);
    if (data && data[0]) return data[0];
  }
  return null;
}

async function ingestCrmLead(input) {
  const crm = getAdminSupabase();
  const source = clean(input.source || 'website', 40).toLowerCase();
  const externalId = clean(input.externalId, 160) || null;
  const email = clean(input.email, 320).toLowerCase() || null;
  const phone = clean(input.phone, 80) || null;
  const name = clean(input.name, 240) || email || phone || 'Lead sin nombre';
  if (isBlockedLeadName(name)) return { result: 'ignored', lead: null };
  const existing = await findExisting(crm, { source, externalId, email, phone });
  const payload = { ...(existing?.source_payload || {}), ...(input.payload || {}), source, external_id: externalId, received_at: new Date().toISOString() };
  const sourceComment = clean(input.comment || input.bodyText || input.summary, 10000) || null;
  const row = {
    name, email, phone,
    summary: clean(input.summary, 2000) || null,
    body_text: clean(input.bodyText, 10000) || null,
    comment: existing?.comment || sourceComment,
    lead_type: input.leadType || existing?.lead_type || null,
    crm_stage: existing?.crm_stage || 'Por contactar',
    owner_names: input.owner ? [clean(input.owner, 120)] : (existing?.owner_names || []),
    campaign_notion_urls: input.campaign ? [clean(input.campaign, 500)] : (existing?.campaign_notion_urls || []),
    source_payload: payload,
    source_created_at: input.createdAt || existing?.source_created_at || new Date().toISOString(),
    source_updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { data, error } = await crm.from('crm_leads').update(row).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return { result: 'updated', lead: data };
  }
  const { data, error } = await crm.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  return { result: 'created', lead: data };
}

module.exports = { ingestCrmLead, isBlockedLeadName };
