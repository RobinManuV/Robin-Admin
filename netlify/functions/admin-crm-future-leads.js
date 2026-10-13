const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError } = require('../../lib/http');
const { displayName, syncCrmIdentity } = require('../../lib/crm-identity');

const ACADEMIC_YEARS = new Set(['2027-28', '2028-29']);

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json', detail: 'La solicitud no tiene un formato válido.' }, { statusCode: 400 });
    const leadId = String(body.leadId || '').trim();
    const academicYear = String(body.academicYear || '').trim();
    if (!leadId) return json({ error: 'lead_id_required', detail: 'Falta identificar el lead.' }, { statusCode: 400 });
    if (!ACADEMIC_YEARS.has(academicYear)) {
      return json({ error: 'invalid_academic_year', detail: 'Selecciona 2027-28 o 2028-29.' }, { statusCode: 400 });
    }

    const crm = getAdminSupabase();
    const actor = await syncCrmIdentity(crm, admin);
    const { data, error } = await crm.rpc('move_crm_lead_to_future', {
      p_lead_id: leadId,
      p_academic_year: academicYear,
      p_actor_id: actor.available ? admin.id : null,
      p_actor_name: displayName(admin),
    });
    if (error) {
      if (error.code === 'P0002') return json({ error: 'lead_not_found', detail: 'El lead ya no existe en el CRM activo.' }, { statusCode: 404 });
      throw error;
    }
    return json({ ok: true, futureLeadId: data, academicYear });
  } catch (error) {
    return serverError(error, 'admin_crm_future_leads');
  }
};
