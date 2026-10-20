// Server-side crm lead ingest helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const { getAdminSupabase } = require('./admin-supabase');
const { randomUUID } = require('crypto');

function clean(value, max = 2000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isBlockedLeadName(value) {
  const normalized = clean(value, 240).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalized === 'robertnat' || normalized.startsWith('centr_') || normalized.startsWith('reyting');
}

function normalizedText(value) {
  return clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[º°]/g, 'o').replace(/ª/g, 'a').replace(/\s+/g, ' ');
}

function isFirstBachillerato(value) {
  return /\b(?:1(?:o|a|er)?|primer|primero)\s*(?:de\s+)?bach(?:illerato)?\b/.test(normalizedText(value));
}

function payloadCourse(payload) {
  const candidates = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizedText(key).replace(/[^a-z0-9]+/g, '_');
      if (/(^|_)(curso|course|school_year|year_of_study)($|_)/.test(normalizedKey) && child != null && typeof child !== 'object') {
        candidates.push(clean(child, 240));
      }
      visit(child, depth + 1);
    }
  };
  visit(payload);
  return candidates.find(Boolean) || '';
}

function labeledCourse(value) {
  for (const line of clean(value, 10000).split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const label = normalizedText(line.slice(0, separator)).replace(/[^a-z0-9]+/g, '_');
    if (/(^|_)(curso|course|school_year|year_of_study)($|_)/.test(label)) return clean(line.slice(separator + 1), 240);
  }
  return '';
}

function detectedCourse(input) {
  return clean(input.course, 240) || payloadCourse(input.payload) || labeledCourse(input.comment || input.bodyText || input.summary);
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

async function findExistingFuture(crm, { source, externalId, email, phone }) {
  if (externalId) {
    const { data } = await crm.from('crm_future_leads').select('id,original_lead_id').eq('source', source).eq('external_id', externalId).limit(1);
    if (data && data[0]) return data[0];
  }
  if (email) {
    const { data } = await crm.from('crm_future_leads').select('id,original_lead_id').ilike('email', email).limit(1);
    if (data && data[0]) return data[0];
  }
  if (phone) {
    const { data } = await crm.from('crm_future_leads').select('id,original_lead_id').eq('phone', phone).limit(1);
    if (data && data[0]) return data[0];
  }
  return null;
}

async function storeDirectFutureLead(crm, { row, source, externalId, course, existingFuture }) {
  const originalLeadId = existingFuture?.original_lead_id || randomUUID();
  const futureRow = {
    original_lead_id: originalLeadId,
    academic_year: '2028-29',
    name: row.name,
    email: row.email,
    phone: row.phone,
    owner_name: row.owner_names?.[0] || null,
    lead_type: row.lead_type,
    heat: null,
    contact_role: null,
    source,
    external_id: externalId,
    campaign_name: row.source_payload?.campaign_name || row.campaign_notion_urls?.[0] || null,
    course,
    source_created_at: row.source_created_at,
    lead_snapshot: { id: originalLeadId, ...row, crm_stage: 'Por contactar', created_at: row.source_created_at },
    call_history: [],
    event_history: [],
    moved_by_user_id: null,
    moved_by_name: 'Clasificación automática · 1º de Bachillerato',
    moved_at: new Date().toISOString(),
  };
  if (existingFuture) {
    const { data, error } = await crm.from('crm_future_leads').update(futureRow).eq('id', existingFuture.id).select('*').single();
    if (error) throw error;
    return { result: 'updated_future', lead: null, futureLead: data };
  }
  const { data, error } = await crm.from('crm_future_leads').insert(futureRow).select('*').single();
  if (error) throw error;
  return { result: 'routed_future', lead: null, futureLead: data };
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
  const course = detectedCourse(input);
  const payload = { ...(existing?.source_payload || {}), ...(input.payload || {}), ...(course ? { course } : {}), source, external_id: externalId, received_at: new Date().toISOString() };
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
  if (isFirstBachillerato(course)) {
    if (existing) {
      const { error: updateError } = await crm.from('crm_leads').update(row).eq('id', existing.id);
      if (updateError) throw updateError;
      const { data, error } = await crm.rpc('move_crm_lead_to_future', {
        p_lead_id: existing.id,
        p_academic_year: '2028-29',
        p_actor_id: null,
        p_actor_name: 'Clasificación automática · 1º de Bachillerato',
      });
      if (error) throw error;
      return { result: 'moved_future', lead: null, futureLead: { id: data, academic_year: '2028-29' } };
    }
    const existingFuture = await findExistingFuture(crm, { source, externalId, email, phone });
    return storeDirectFutureLead(crm, { row, source, externalId, course, existingFuture });
  }
  if (existing) {
    const { data, error } = await crm.from('crm_leads').update(row).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return { result: 'updated', lead: data };
  }
  const { data, error } = await crm.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  return { result: 'created', lead: data };
}

module.exports = { detectedCourse, ingestCrmLead, isBlockedLeadName, isFirstBachillerato };
