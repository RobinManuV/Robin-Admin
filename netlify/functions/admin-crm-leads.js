const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError, parseJsonBody } = require('../../lib/http');
const { isBlockedLeadName } = require('../../lib/crm-lead-ingest');
const { resolveCrmOwner, syncCrmIdentity } = require('../../lib/crm-identity');
const { activeSalesTestRun, isLeadInTestRun } = require('../../lib/sales-test-mode');

const campaignNameCache = new Map();
const CAMPAIGN_CACHE_MS = 6 * 60 * 60 * 1000;
const LOST_REASONS = new Set(['price', 'more_destinations', 'competition', 'other']);

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
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
    const portal = getSupabase();
    const testRun = await activeSalesTestRun(crm);
    if (event.httpMethod === 'GET') {
      const { data, error } = await crm.from('crm_leads').select('*')
        .order('source_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      const leads = testRun?.status === 'active' ? (data || []).filter((lead) => isLeadInTestRun(lead, testRun.test_run)) : (data || []);
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
      const allowedSources = new Set(['organic', 'organic_social', 'referral', 'other', 'schools']);
      const source = allowedSources.has(String(body.source || '')) ? String(body.source) : 'other';
      const actor = await syncCrmIdentity(crm, admin);
      const owner = body.owner ? await resolveCrmOwner({ portal, crm, ownerName: body.owner }) : { available: actor.available, user: null };
      const simulated = testRun?.status === 'active';
      const insert = { name: simulated && !name.startsWith('TEST ·') ? `TEST · ${name}` : name, email, phone, body_text: String(body.notes || '').trim() || null, crm_stage: 'Por contactar', owner_names: body.owner ? [String(body.owner).trim()] : [], is_test: simulated, source_payload: { source, created_via: 'manual', created_by: admin.id, ...(simulated ? { simulated: true, test_run: testRun.test_run } : {}) }, source_created_at: now, source_updated_at: now };
      if (actor.available && owner.available) {
        insert.updated_by_user_id = admin.id;
        insert.owner_id = owner.user?.id || null;
      }
      const { data, error } = await crm.from('crm_leads').insert(insert).select('*').single();
      if (error) throw error;
      return json({ lead: data }, { statusCode: 201 });
    }
    if (event.httpMethod === 'DELETE') {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 200) : (body.id ? [body.id] : []);
      if (!ids.length) return json({ error: 'invalid_request' }, { statusCode: 400 });
      let deletion = crm.from('crm_leads').delete().in('id', ids);
      if (testRun?.status === 'active') deletion = deletion.eq('is_test', true).contains('source_payload', { test_run: testRun.test_run });
      const { error } = await deletion;
      if (error) throw error;
      return json({ ok: true, deleted: ids.length });
    }
    if (!body.id || !body.patch || typeof body.patch !== 'object') return json({ error: 'invalid_request' }, { statusCode: 400 });
    const lostReason = body.patch.lost_reason == null ? '' : String(body.patch.lost_reason).trim().toLowerCase();
    const lostReasonDetail = body.patch.lost_reason_detail == null ? '' : String(body.patch.lost_reason_detail).trim();
    if (body.patch.crm_stage === 'Lost') {
      if (!LOST_REASONS.has(lostReason)) return json({ error: 'lost_reason_required' }, { statusCode: 400 });
      if (lostReason === 'other' && !lostReasonDetail) return json({ error: 'lost_reason_detail_required' }, { statusCode: 400 });
      if (lostReasonDetail.length > 120) return json({ error: 'lost_reason_detail_too_long' }, { statusCode: 400 });
    }
    if (body.patch.source !== undefined || body.patch.lost_reason !== undefined || body.patch.lost_reason_detail !== undefined) {
      const { data: current, error: currentError } = await crm.from('crm_leads').select('source_payload').eq('id', body.id).single();
      if (currentError) throw currentError;
      body.patch.source_payload = { ...(current?.source_payload || {}) };
      if (body.patch.source !== undefined) body.patch.source_payload.source = String(body.patch.source || '').trim().toLowerCase() || 'manual';
      if (body.patch.lost_reason !== undefined) body.patch.source_payload.lost_reason = lostReason || null;
      if (body.patch.lost_reason_detail !== undefined) body.patch.source_payload.lost_reason_detail = lostReasonDetail || null;
      delete body.patch.source;
      delete body.patch.lost_reason;
      delete body.patch.lost_reason_detail;
    }
    const allowed = ['owner_names', 'source_payload', 'lead_type', 'crm_stage', 'heat', 'comment', 'lost_at'];
    const update = Object.fromEntries(Object.entries(body.patch).filter(([key]) => allowed.includes(key)));
    const actor = await syncCrmIdentity(crm, admin);
    if (actor.available) {
      update.updated_by_user_id = admin.id;
      if (update.owner_names !== undefined) {
        const ownerName = Array.isArray(update.owner_names) ? update.owner_names[0] : '';
        const owner = await resolveCrmOwner({ portal, crm, ownerName });
        if (owner.available) update.owner_id = owner.user?.id || null;
      }
    }
    let mutation = crm.from('crm_leads').update(update).eq('id', body.id);
    if (testRun?.status === 'active') mutation = mutation.eq('is_test', true).contains('source_payload', { test_run: testRun.test_run });
    const { data, error } = await mutation.select('*').single();
    if (error) throw error;
    return json({ lead: data });
  } catch (error) {
    console.error('admin-crm-leads error', error);
    return serverError(error);
  }
};
