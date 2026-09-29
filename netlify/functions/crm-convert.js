const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent, hashPassword } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { identityExists } = require('../../lib/identity');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { passwordPolicy } = require('../../shared/password-policy.cjs');
const { normalizeTipo, ensureDriveFolder } = require('../../lib/notion');
const { sendAccountAccessEmail } = require('../../lib/account-access-email');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'forbidden_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const portal = getSupabase();
    const { data: admin } = await portal.from('users').select('id,email,username,role').eq('id', session.uid).single();
    if (!admin || !isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });
    const body = parseJsonBody(event);
    if (!body || !body.leadId) return json({ error: 'missing_lead_id' }, { statusCode: 400 });

    const crm = getAdminSupabase();
    const { data: lead, error: leadError } = await crm.from('crm_leads')
      .select('id,notion_numeric_id,name,email,lead_type,source_payload').eq('id', body.leadId).single();
    if (leadError || !lead) return json({ error: 'lead_not_found' }, { statusCode: 404 });
    if (!lead.email) return json({ error: 'lead_email_required' }, { statusCode: 400 });

    const leadId = String(lead.notion_numeric_id || lead.id);
    // Imported Notion rows use their Notion page UUID as the CRM id. Native
    // website/Meta leads have no Notion page and must not depend on one.
    const notionPageId = lead.source_payload?.notion_url ? lead.id : null;
    const tipo = normalizeTipo(body.clientType || lead.lead_type);
    const assignedTo = normalizeEmail(admin);
    let result = 'created';
    let userId;
    let emailSent = false;
    const { data: existing } = await portal.from('users').select('id,assigned_to').eq('lead_id', leadId).maybeSingle();
    if (existing) {
      result = 'exists';
      userId = existing.id;
      const { error } = await portal.from('users').update({ assigned_to: assignedTo, tipo, notion_page_id: notionPageId }).eq('id', existing.id);
      if (error) throw error;
      await ensureDriveFolder(portal, existing.id);
    } else {
      if (await identityExists(portal, [leadId, lead.email])) return json({ error: 'identity_collision' }, { statusCode: 409 });
      const password = String(process.env.NOTION_BOOTSTRAP_PASSWORD || process.env.DEFAULT_PASSWORD || '');
      if (!password || !passwordPolicy(password).ok) return json({ error: 'invalid_bootstrap_password_configuration' }, { statusCode: 500 });
      const { data: inserted, error: insertError } = await portal.from('users').insert({
        lead_id: leadId, notion_page_id: notionPageId, username: leadId, email: lead.email,
        password_hash: hashPassword(password), requires_onboarding: true, dni_completed: false,
        profile_completed: false, nombre: lead.name || null, assigned_to: assignedTo, tipo,
      }).select('id').single();
      if (insertError) throw insertError;
      userId = inserted.id;
      await ensureDriveFolder(portal, inserted.id);
      const accessEmail = await sendAccountAccessEmail({ email: lead.email, name: lead.name, username: leadId, password });
      emailSent = !!accessEmail.sent;
    }
    const { error: crmError } = await crm.from('crm_leads').update({ crm_stage: 'Cliente' }).eq('id', lead.id);
    if (crmError) throw crmError;
    return json({ ok: true, result, userId, emailSent, loginUrl: '/portal/' });
  } catch (error) {
    console.error('crm-convert error', error);
    return serverError(error, 'crm.convert');
  }
};
