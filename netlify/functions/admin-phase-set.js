/**
 * POST /api/admin/phase   { user_id, phase: 1..9 }
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
  const user_id = body.user_id;
  const phase = Number(body.phase);
  if (!user_id || ![1,2,3,4,5,6,7,8,9].includes(phase)) return json({ error: 'invalid_params' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // 1) Leer fase actual para detectar cambio real
    const { data: cur } = await sb.from('users').select('application_phase').eq('id', user_id).single();
    const changed = !cur || Number(cur.application_phase) !== phase;
    const patch = { application_phase: phase };
    // 2) Si la fase cambia, marcar timestamp
    if (changed) patch.phase_changed_at = new Date().toISOString();
    const { error } = await sb.from('users').update(patch).eq('id', user_id);
    if (error) throw error;
    return json({ ok: true, phase, phase_changed: changed });
  } catch (e) {
    return serverError(e);
  }
};
