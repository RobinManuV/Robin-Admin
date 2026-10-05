/**
 * GET /api/admin/integration-snapshot
 * Read model compacto para el gestor Robin: clientes y pagos existentes.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const stripe = require('../../lib/stripe');
const holded = require('../../lib/holded');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { activeSalesTestRun, testLeadIds } = require('../../lib/sales-test-mode');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const sb = getSupabase();
    const { data: admin, error: adminError } = await sb
      .from('users')
      .select('id, email, username, role, nombre, apellidos')
      .eq('id', session.uid)
      .single();
    if (adminError || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: clients, error: clientsError } = await sb
      .from('users')
      .select('id, lead_id, username, email, role, requires_onboarding, dni_completed, profile_completed, contract_signed, nombre, apellidos, tipo, origin, assigned_to, application_phase, application_level, pais, telefono_alumno, intereses, pago_completed, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (clientsError) throw clientsError;
    const testRun = await activeSalesTestRun(getAdminSupabase());
    const allowedLeadIds = testRun?.status === 'active' ? new Set(await testLeadIds(getAdminSupabase(), testRun.test_run)) : null;
    const clientRows = (clients || []).filter((row) => !isApplicationAdmin(row) && (!allowedLeadIds || allowedLeadIds.has(String(row.lead_id || ''))));
    const clientIds = clientRows.map((row) => row.id);
    let payments = [];
    if (clientIds.length) {
      const { data, error } = await sb
        .from('payments')
        .select('id, user_id, installment, amount, currency, status, unlocked_at, paid_at, invoice_number, concept, due_date, created_at')
        .in('user_id', clientIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      payments = data || [];
    }
    return json({
      admin: { id: admin.id, email: normalizeEmail(admin), username: admin.username, nombre: admin.nombre, apellidos: admin.apellidos },
      clients: clientRows,
      payments,
      connections: {
        stripe: stripe.isConfigured(),
        holded: holded.isConfigured(),
        email: Boolean(process.env.RESEND_API_KEY),
      },
    });
  } catch (error) {
    return serverError(error, 'admin.integration_snapshot');
  }
};
