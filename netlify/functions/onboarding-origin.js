/**
 * POST /api/onboarding/origin
 * Primer paso del onboarding: el cliente indica su origen.
 * Body:
 *   { origin: 'espana' }                          -> proceso estándar
 *   { origin: 'otros', application_level: 'grado'|'maestria',
 *     pais: string, has_eu_id: boolean }           -> proceso internacional
 * Guarda los datos en users y deja el flujo continuar al paso DNI.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const origin = String(body.origin || '').trim().toLowerCase();
  if (origin !== 'espana' && origin !== 'otros') {
    return json({ error: 'invalid_origin' }, { statusCode: 400 });
  }

  const update = { origin };

  if (origin === 'otros') {
    const level = String(body.application_level || '').trim().toLowerCase();
    if (level !== 'grado' && level !== 'maestria') {
      return json({ error: 'invalid_level' }, { statusCode: 400 });
    }
    const pais = String(body.pais || '').trim();
    if (!pais) return json({ error: 'missing_pais' }, { statusCode: 400 });
    if (typeof body.has_eu_id !== 'boolean') {
      return json({ error: 'missing_eu_id' }, { statusCode: 400 });
    }
    update.application_level = level;
    update.pais = pais.slice(0, 120);
    update.has_eu_id = body.has_eu_id;
  } else {
    // España: proceso estándar; limpiamos campos internacionales por si el
    // cliente vuelve atrás y cambia su respuesta.
    update.application_level = null;
    update.pais = null;
    update.has_eu_id = null;
  }

  try {
    const sb = getSupabase();
    const { error } = await sb.from('users').update(update).eq('id', session.uid);
    if (error) throw error;
    return json({ ok: true, origin, next_step: 'dni' });
  } catch (e) {
    console.error('onboarding-origin error', e);
    return serverError(e);
  }
};
