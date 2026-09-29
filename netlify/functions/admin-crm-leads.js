const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError, parseJsonBody } = require('../../lib/http');
const { isBlockedLeadName } = require('../../lib/crm-lead-ingest');

const campaignNameCache = new Map();
const CAMPAIGN_CACHE_MS = 6 * 60 * 60 * 1000;

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

async function metaCampaignNames(leads) {
  const version = process.env.META_API_VERSION || 'v26.0';
  const allAdIds = [...new Set(leads.map((lead) => lead.source_payload?.ad_id || String(lead.campaign_notion_urls?.[0] || '').match(/^meta-ad:(.+)$/)?.[1]).filter(Boolean))];
  const names = new Map();
  for (const lead of leads) {
    const adId = lead.source_payload?.ad_id || String(lead.campaign_notion_urls?.[0] || '').match(/^meta-ad:(.+)$/)?.[1];
    const storedCampaign = String(lead.source_payload?.campaign_name || lead.campaign_notion_urls?.[0] || '').trim();
    if (adId && storedCampaign && !storedCampaign.startsWith('meta-ad:')) names.set(String(adId), storedCampaign);
  }
  if (!process.env.META_ACCESS_TOKEN) return names;
  const adIds = allAdIds.filter((adId) => {
    if (names.has(String(adId))) return false;
    const cached = campaignNameCache.get(adId);
    if (cached && Date.now() - cached.savedAt < CAMPAIGN_CACHE_MS) { names.set(adId, cached.name); return false; }
    return true;
  });
  for (let index = 0; index < adIds.length; index += 50) {
    const ids = adIds.slice(index, index + 50);
    try {
      const url = new URL(`https://graph.facebook.com/${version}/`);
      url.searchParams.set('ids', ids.join(','));
      url.searchParams.set('fields', 'campaign{name}');
      url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = await response.json();
      for (const adId of ids) {
        const name = String(payload?.[adId]?.campaign?.name || '').trim();
        if (name) { names.set(adId, name); campaignNameCache.set(adId, { name, savedAt: Date.now() }); }
      }
    } catch (_) {}
  }
  return names;
}

exports.handler = async (event) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE']);
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const crm = getAdminSupabase();
    if (event.httpMethod === 'GET') {
      const { data, error } = await crm.from('crm_leads').select('*').order('notion_numeric_id', { ascending: false });
      if (error) throw error;
      const leads = data || [];
      const campaignNames = await metaCampaignNames(leads);
      return json({ leads: leads.map((lead) => {
        const adId = lead.source_payload?.ad_id || String(lead.campaign_notion_urls?.[0] || '').match(/^meta-ad:(.+)$/)?.[1];
        const campaignName = adId && campaignNames.get(adId);
        return campaignName ? { ...lead, source_payload: { ...(lead.source_payload || {}), campaign_name: campaignName } } : lead;
      }) });
    }
    const body = parseJsonBody(event);
    if (event.httpMethod === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase() || null;
      const phone = String(body.phone || '').trim() || null;
      if (!name) return json({ error: 'name_required' }, { statusCode: 400 });
      if (isBlockedLeadName(name)) return json({ error: 'blocked_spam_lead' }, { statusCode: 400 });
      const now = new Date().toISOString();
      const { data, error } = await crm.from('crm_leads').insert({ name, email, phone, body_text: String(body.notes || '').trim() || null, crm_stage: 'Por contactar', owner_names: body.owner ? [String(body.owner).trim()] : [], source_payload: { source: 'manual', created_by: admin.id }, source_created_at: now, source_updated_at: now }).select('*').single();
      if (error) throw error;
      return json({ lead: data }, { statusCode: 201 });
    }
    if (event.httpMethod === 'DELETE') {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 200) : (body.id ? [body.id] : []);
      if (!ids.length) return json({ error: 'invalid_request' }, { statusCode: 400 });
      const { error } = await crm.from('crm_leads').delete().in('id', ids);
      if (error) throw error;
      return json({ ok: true, deleted: ids.length });
    }
    if (!body.id || !body.patch || typeof body.patch !== 'object') return json({ error: 'invalid_request' }, { statusCode: 400 });
    if (body.patch.source !== undefined) {
      const { data: current, error: currentError } = await crm.from('crm_leads').select('source_payload').eq('id', body.id).single();
      if (currentError) throw currentError;
      body.patch.source_payload = { ...(current?.source_payload || {}), source: String(body.patch.source || '').trim().toLowerCase() || 'manual' };
      delete body.patch.source;
    }
    const allowed = ['owner_names', 'source_payload', 'lead_type', 'crm_stage', 'heat', 'comment', 'lost_at'];
    const update = Object.fromEntries(Object.entries(body.patch).filter(([key]) => allowed.includes(key)));
    const { data, error } = await crm.from('crm_leads').update(update).eq('id', body.id).select('*').single();
    if (error) throw error;
    return json({ lead: data });
  } catch (error) {
    console.error('admin-crm-leads error', error);
    return serverError(error);
  }
};
