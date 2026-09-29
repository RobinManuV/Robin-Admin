/**
 * POST /api/profile/lived-abroad
 * Guarda si el alumno ha vivido fuera de España en alguno de los 3 últimos años.
 *
 * Body: { user_id?, lived_abroad: bool, lived_abroad_country?, lived_abroad_other? }
 * Permisos:
 *  - Admin: puede editar el de cualquier alumno (user_id) siempre.
 *  - Cliente: sólo puede editar el SUYO y SÓLO la primera vez (lived_abroad_set=false).
 *    Una vez fijado, queda bloqueado para el alumno (sólo el admin puede cambiarlo).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

const VALID_COUNTRIES = ['UK', 'US', 'Francia', 'otros'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: caller } = await sb.from('users')
      .select('id, email, username, role').eq('id', session.uid).single();
    if (!caller) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(caller);

    const target_uid = (isAdmin && body.user_id) ? body.user_id : caller.id;
    if (!isAdmin && body.user_id && body.user_id !== caller.id) {
      return json({ error: 'forbidden' }, { statusCode: 403 });
    }

    // Estado actual (para la regla de "sólo la primera vez" del alumno)
    const { data: cur } = await sb.from('users')
      .select('lived_abroad_set').eq('id', target_uid).single();
    if (!isAdmin && cur && cur.lived_abroad_set === true) {
      return json({ error: 'locked', detail: 'Ya registrado. Pide a tu asesor que lo modifique.' }, { statusCode: 403 });
    }

    // Validación
    const livedAbroad = !!body.lived_abroad;
    let country = null;
    let other = null;
    if (livedAbroad) {
      country = String(body.lived_abroad_country || '').trim();
      if (!VALID_COUNTRIES.includes(country)) {
        return json({ error: 'invalid_country' }, { statusCode: 400 });
      }
      if (country === 'otros') {
        other = String(body.lived_abroad_other || '').trim().slice(0, 200);
        if (!other) return json({ error: 'missing_other' }, { statusCode: 400 });
      }
    }

    const patch = {
      lived_abroad: livedAbroad,
      lived_abroad_country: country,
      lived_abroad_other: other,
      lived_abroad_set: true,
    };
    const { error } = await sb.from('users').update(patch).eq('id', target_uid);
    if (error) throw error;

    return json({ ok: true, ...patch });
  } catch (e) {
    console.error('lived-abroad error', e);
    return serverError(e);
  }
};
