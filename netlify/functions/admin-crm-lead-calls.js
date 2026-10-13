const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError } = require('../../lib/http');
const { displayName, syncCrmIdentity } = require('../../lib/crm-identity');

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

function toCall(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    durationMinutes: Number(row.duration_minutes),
    notes: String(row.notes || ''),
    authorName: String(row.author_name || 'Administrador'),
    occurredAt: row.occurred_at,
  };
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  try {
    const admin = await requireAdmin(event);
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const crm = getAdminSupabase();

    if (event.httpMethod === 'GET') {
      const leadId = String(event.queryStringParameters?.leadId || '').trim();
      if (!leadId) return json({ error: 'lead_id_required', detail: 'Falta identificar el lead.' }, { statusCode: 400 });
      const { data, error } = await crm.from('crm_lead_calls')
        .select('id,lead_id,duration_minutes,notes,author_name,occurred_at')
        .eq('lead_id', leadId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return json({ calls: (data || []).map(toCall) });
    }

    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json', detail: 'La llamada no tiene un formato válido.' }, { statusCode: 400 });
    const leadId = String(body.leadId || '').trim();
    const durationMinutes = Number(body.durationMinutes);
    const notes = String(body.notes || '').trim().slice(0, 4000);
    if (!leadId) return json({ error: 'lead_id_required', detail: 'Falta identificar el lead.' }, { statusCode: 400 });
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      return json({ error: 'invalid_duration', detail: 'Introduce una duración entre 1 y 1440 minutos.' }, { statusCode: 400 });
    }

    const { data: lead, error: leadError } = await crm.from('crm_leads').select('id').eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return json({ error: 'lead_not_found', detail: 'El lead ya no existe.' }, { statusCode: 404 });

    const actor = await syncCrmIdentity(crm, admin);
    const insert = {
      lead_id: leadId,
      actor_id: actor.available ? admin.id : null,
      author_name: displayName(admin),
      duration_minutes: durationMinutes,
      notes: notes || null,
    };
    const { data, error } = await crm.from('crm_lead_calls').insert(insert)
      .select('id,lead_id,duration_minutes,notes,author_name,occurred_at').single();
    if (error) throw error;
    return json({ call: toCall(data) }, { statusCode: 201 });
  } catch (error) {
    return serverError(error, 'admin_crm_lead_calls');
  }
};
