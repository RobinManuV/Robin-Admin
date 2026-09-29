/**
 * GET /api/careers          → cliente: SUS carreras asignadas
 * GET /api/careers?all=1[&user_id=UUID]
 *   → admin: biblioteca completa y, si se indica alumno, sus template IDs asignados
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { uuid } = require('../../lib/validation');

async function listAdminCareerState(sb, userId = null) {
  const { data: rows, error } = await sb
    .from('career_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  let assignedTemplateIds = [];
  if (userId) {
    const { data: assignments, error: assignmentsError } = await sb
      .from('client_careers')
      .select('career_template_id')
      .eq('user_id', userId);
    if (assignmentsError) throw assignmentsError;
    assignedTemplateIds = (assignments || []).map((row) => row.career_template_id);
  }

  return { templates: rows || [], assigned_template_ids: assignedTemplateIds };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const query = event.queryStringParameters || {};
  const wantAll = query.all === '1';
  const requestedUserId = query.user_id ? uuid(query.user_id) : null;
  if (query.user_id && !requestedUserId) return json({ error: 'invalid_user_id' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: u } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!u) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(u);

    if (wantAll) {
      if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
      return json(await listAdminCareerState(sb, requestedUserId));
    }

    // Cliente: sus carreras asignadas (con datos del template)
    const { data: cc, error } = await sb
      .from('client_careers')
      .select('id, assigned_at, career_template_id, career_templates ( id, name, university, city, required_docs )')
      .eq('user_id', u.id);
    if (error) throw error;
    const careers = (cc || []).map((r) => ({
      assignment_id: r.id,
      assigned_at: r.assigned_at,
      ...r.career_templates,
    }));
    return json({ careers });
  } catch (e) {
    console.error('careers-list error', e);
    return serverError(e);
  }
};

exports.listAdminCareerState = listAdminCareerState;
