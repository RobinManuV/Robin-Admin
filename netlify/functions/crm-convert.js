const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent, hashPassword } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { identityExists } = require('../../lib/identity');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { passwordPolicy } = require('../../shared/password-policy.cjs');
const { normalizeTipo, ensureDriveFolder } = require('../../lib/notion');
const { sendAccountAccessEmail } = require('../../lib/account-access-email');
const { contractedAmountForUser } = require('../../lib/finance-dashboard');
const { resolveCrmOwner, syncCrmIdentity } = require('../../lib/crm-identity');
const { ensurePayments } = require('../../lib/payments');
const { randomUUID } = require('crypto');

const normalizedPerson = (value) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function matchesAdvisor(user, requested) {
  const values = [user.email, user.username, user.nombre, [user.nombre, user.apellidos].filter(Boolean).join(' ')];
  return values.some((value) => normalizedPerson(value) === requested);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'forbidden_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const portal = getSupabase();
    const { data: admin } = await portal.from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
    if (!admin || !isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });
    const body = parseJsonBody(event);
    if (!body || !body.leadId) return json({ error: 'missing_lead_id' }, { statusCode: 400 });
    const requestedAdvisor = normalizedPerson(body.advisor);
    if (!requestedAdvisor) return json({ error: 'advisor_required' }, { statusCode: 400 });

    const { data: adminRows, error: adminRowsError } = await portal.from('users').select('id,email,username,nombre,apellidos,role');
    if (adminRowsError) throw adminRowsError;
    const advisor = (adminRows || []).filter(isApplicationAdmin).find((candidate) => matchesAdvisor(candidate, requestedAdvisor));
    if (!advisor) return json({ error: 'advisor_invalid' }, { statusCode: 400 });

    const crm = getAdminSupabase();
    const { data: lead, error: leadError } = await crm.from('crm_leads')
      .select('id,notion_numeric_id,name,email,lead_type,owner_names,source_payload,is_test').eq('id', body.leadId).single();
    if (leadError || !lead) return json({ error: 'lead_not_found' }, { statusCode: 404 });
    if (!lead.email) return json({ error: 'lead_email_required' }, { statusCode: 400 });

    const leadId = String(lead.notion_numeric_id || lead.id);
    // Imported Notion rows use their Notion page UUID as the CRM id. Native
    // website/Meta leads have no Notion page and must not depend on one.
    const notionPageId = lead.source_payload?.notion_url ? lead.id : null;
    const tipo = normalizeTipo(body.clientType || lead.lead_type);
    const assignedTo = normalizeEmail(advisor);
    const salesAgent = String(lead.owner_names?.[0] || admin.nombre || admin.email || '').trim();
    const isTestLead = lead.is_test === true && lead.source_payload?.simulated === true && Boolean(lead.source_payload?.test_run);
    let result = 'created';
    let userId;
    let emailSent = false;
    const { data: existing } = await portal.from('users').select('id,assigned_to').eq('lead_id', leadId).maybeSingle();
    if (existing) {
      result = 'exists';
      userId = existing.id;
      const { error } = await portal.from('users').update({ assigned_to: assignedTo, tipo, notion_page_id: notionPageId }).eq('id', existing.id);
      if (error) throw error;
      if (!isTestLead) await ensureDriveFolder(portal, existing.id);
    } else {
      if (await identityExists(portal, [leadId, lead.email])) return json({ error: 'identity_collision' }, { statusCode: 409 });
      const password = isTestLead ? `Test-${randomUUID()}-Aa1!` : String(process.env.NOTION_BOOTSTRAP_PASSWORD || process.env.DEFAULT_PASSWORD || '');
      if (!password || !passwordPolicy(password).ok) return json({ error: 'invalid_bootstrap_password_configuration' }, { statusCode: 500 });
      const { data: inserted, error: insertError } = await portal.from('users').insert({
        lead_id: leadId, notion_page_id: notionPageId, username: leadId, email: lead.email,
        password_hash: hashPassword(password), requires_onboarding: true, dni_completed: false,
        profile_completed: false, nombre: lead.name || null, assigned_to: assignedTo, tipo,
      }).select('id').single();
      if (insertError) throw insertError;
      userId = inserted.id;
      if (!isTestLead) {
        await ensureDriveFolder(portal, inserted.id);
        const accessEmail = await sendAccountAccessEmail({ email: lead.email, name: lead.name, username: leadId, password });
        emailSent = !!accessEmail.sent;
      }
    }
    if (isTestLead) {
      const nowIso = new Date().toISOString();
      const { error: testUserError } = await portal.from('users').update({
        requires_onboarding: false,
        dni_completed: true,
        profile_completed: true,
        contract_signed: true,
        contract_signed_at: nowIso,
        contract_data: { simulated: true, test_run: lead.source_payload.test_run, tipo, fecha_firma: nowIso, version_template: 'test-mode' },
        pago_completed: true,
        pago_completed_at: nowIso,
        pago_data: { simulated: true, test_run: lead.source_payload.test_run, source: 'test-mode' },
      }).eq('id', userId);
      if (testUserError) throw testUserError;
      const { data: testUser, error: testUserLoadError } = await portal.from('users')
        .select('id,tipo,origin,has_eu_id,num_carreras,pago_completed,pago_completed_at,pago_data').eq('id', userId).single();
      if (testUserLoadError) throw testUserLoadError;
      await ensurePayments(portal, testUser);
    }
    const [{ data: portalUser, error: portalUserError }, { data: portalPayments, error: portalPaymentsError }] = await Promise.all([
      portal.from('users').select('id,tipo,origin,has_eu_id,num_carreras,contract_data').eq('id', userId).single(),
      portal.from('payments').select('user_id,installment,amount,status').eq('user_id', userId),
    ]);
    if (portalUserError) throw portalUserError;
    if (portalPaymentsError) throw portalPaymentsError;
    const actor = await syncCrmIdentity(crm, admin);
    const owner = await resolveCrmOwner({ portal, crm, ownerName: salesAgent });
    const crmUpdate = {
      crm_stage: 'Cliente',
      source_payload: {
        ...(lead.source_payload || {}),
        sales_agent: salesAgent || null,
        advisor_email: assignedTo,
        converted_by: admin.id,
      },
    };
    if (actor.available && owner.available) {
      crmUpdate.updated_by_user_id = admin.id;
      crmUpdate.owner_id = owner.user?.id || null;
      crmUpdate.price_at_signature = contractedAmountForUser(portalUser, portalPayments || []);
    }
    const { error: crmError } = await crm.from('crm_leads').update(crmUpdate).eq('id', lead.id);
    if (crmError) throw crmError;
    return json({ ok: true, result, userId, emailSent, loginUrl: '/portal/', assignedTo, salesAgent: salesAgent || null });
  } catch (error) {
    console.error('crm-convert error', error);
    return serverError(error, 'crm.convert');
  }
};
