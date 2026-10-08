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

function toNote(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    body: String(row.metadata?.body || ''),
    authorName: String(row.metadata?.author_name || 'Administrador'),
    createdAt: row.created_at,
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
      const { data, error } = await crm.from('crm_lead_events')
        .select('id,lead_id,metadata,created_at')
        .eq('lead_id', leadId)
        .eq('event_type', 'team_note')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return json({ notes: (data || []).map(toNote) });
    }

    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json', detail: 'La nota no tiene un formato válido.' }, { statusCode: 400 });
    const leadId = String(body.leadId || '').trim();
    const noteBody = String(body.body || '').trim().slice(0, 4000);
    if (!leadId) return json({ error: 'lead_id_required', detail: 'Falta identificar el lead.' }, { statusCode: 400 });
    if (!noteBody) return json({ error: 'note_required', detail: 'Escribe una nota antes de enviarla.' }, { statusCode: 400 });

    const { data: lead, error: leadError } = await crm.from('crm_leads').select('id').eq('id', leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return json({ error: 'lead_not_found', detail: 'El lead ya no existe.' }, { statusCode: 404 });

    const actor = await syncCrmIdentity(crm, admin);
    const insert = {
      lead_id: leadId,
      user_id: actor.available ? admin.id : null,
      actor_id: actor.available ? admin.id : null,
      event_type: 'team_note',
      metadata: { body: noteBody, author_name: displayName(admin) },
    };
    const { data, error } = await crm.from('crm_lead_events').insert(insert).select('id,lead_id,metadata,created_at').single();
    if (error) throw error;
    return json({ note: toNote(data) }, { statusCode: 201 });
  } catch (error) {
    return serverError(error, 'admin_crm_lead_notes');
  }
};
