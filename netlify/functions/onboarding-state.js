const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: u, error } = await sb.from('users').select('*').eq('id', session.uid).single();
    if (error || !u) return json({ error: 'unauthorized' }, { statusCode: 401 });

    const next_step = !u.requires_onboarding
      ? null
      : !u.origin
        ? 'origin'
        : !u.dni_completed
          ? 'dni'
          : !u.contract_signed
            ? 'contract'
            : !u.profile_completed
              ? 'profile'
              : !u.pago_completed
                ? 'payment'
                : null;

    return json({
      requires_onboarding: !!u.requires_onboarding,
      dni_completed: !!u.dni_completed,
      contract_signed: !!u.contract_signed,
      profile_completed: !!u.profile_completed,
      pago_completed: !!u.pago_completed,
      tipo: u.tipo || 'general',
      origin: u.origin || null,
      application_level: u.application_level || null,
      pais: u.pais || null,
      has_eu_id: u.has_eu_id == null ? null : !!u.has_eu_id,
      next_step,
      data: {
        nombre: u.nombre || '',
        apellidos: u.apellidos || '',
        direccion: u.direccion || '',
        fecha_nacimiento: u.fecha_nacimiento || '',
        dni_numero: u.dni_numero || '',
        telefono_alumno: u.telefono_alumno || u.questionnaire?.telefono_alumno || '',
        email: u.email || '',
        intereses: u.intereses || [],
        questionnaire: u.questionnaire || null,
      },
    });
  } catch (e) {
    console.error('state error', e);
    return serverError(e);
  }
};
