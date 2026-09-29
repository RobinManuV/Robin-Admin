const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { applicationPlanForUser } = require('../../shared/financial-config.cjs');
const { signedUrl } = require('../../lib/storage');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const sb = getSupabase();
    const { data: u, error } = await sb.from('users').select('*').eq('id', session.uid).single();
    if (error || !u) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const firstPayment = applicationPlanForUser(u)[0];
    const avatarUrl = u.avatar_path
      ? await signedUrl(sb, u.avatar_path, { expiresIn: 3600 })
      : null;
    return json({
      id: u.id,
      lead_id: u.lead_id,
      username: u.username,
      email: u.email,
      role: u.role,
      is_application_admin: isApplicationAdmin(u),
      requires_onboarding: !!u.requires_onboarding,
      dni_completed: !!u.dni_completed,
      profile_completed: !!u.profile_completed,
      contract_signed: !!u.contract_signed,
      contract_signed_at: u.contract_signed_at || null,
      tipo: u.tipo || 'general',
      num_carreras: u.num_carreras || 1,
      first_payment_amount: firstPayment ? firstPayment.amount : null,
      payment_currency: firstPayment ? 'EUR' : null,
      origin: u.origin || null,
      application_level: u.application_level || null,
      pais: u.pais || null,
      has_eu_id: u.has_eu_id == null ? null : !!u.has_eu_id,
      pago_completed: !!u.pago_completed,
      pago_completed_at: u.pago_completed_at || null,
      assigned_to: u.assigned_to || null,
      application_phase: u.application_phase || 1,
      nombre: u.nombre,
      apellidos: u.apellidos,
      telefono_alumno: u.telefono_alumno || u.questionnaire?.telefono_alumno || null,
      intereses: u.intereses || [],
      lived_abroad: !!u.lived_abroad,
      lived_abroad_country: u.lived_abroad_country || null,
      lived_abroad_other: u.lived_abroad_other || null,
      lived_abroad_set: !!u.lived_abroad_set,
      created_at: u.created_at || null,
      avatar_url: avatarUrl,
    });
  } catch (e) {
    console.error('me error', e);
    return serverError(e);
  }
};
