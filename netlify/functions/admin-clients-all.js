/**
 * GET /api/admin/clients/all
 * Devuelve TODOS los clientes de la base (no admins) con su estado de asignación.
 * Pensado para que un admin pueda reasignar manualmente desde el panel.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { attachStudentPhones } = require('../../lib/student-phone');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: admin, error: e1 } = await sb
      .from('users')
      .select('id, email, username, role')
      .eq('id', session.uid)
      .single();
    if (e1 || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });

    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: rows, error: e2 } = await sb
      .from('users')
      .select(
        'id, lead_id, username, email, role, requires_onboarding, dni_completed, profile_completed, nombre, apellidos, dni_numero, direccion, fecha_nacimiento, questionnaire, intereses, lived_abroad, lived_abroad_country, lived_abroad_other, lived_abroad_set, tipo, origin, application_level, has_eu_id, assigned_to, created_at'
      )
      .order('created_at', { ascending: false });
    if (e2) throw e2;

    const clients = await attachStudentPhones(sb, (rows || []).filter((r) => {
      const isAdminRow = isApplicationAdmin(r);
      return !isAdminRow;
    }));

    return json({ admin_email: adminEmail, clients });
  } catch (e) {
    console.error('admin-clients-all error', e);
    return serverError(e);
  }
};
