const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { ensurePayments, invoiceNumber } = require('../../lib/payments');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const user_id = (event.queryStringParameters && event.queryStringParameters.user_id) || null;
  if (!user_id) return json({ error: 'missing_user_id' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: u, error } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, dni_numero, direccion, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed, pago_completed_at, pago_data')
      .eq('id', user_id)
      .single();
    if (error || !u) return json({ error: 'user_not_found', detail: error && error.message }, { statusCode: 404 });

    const rows = await ensurePayments(sb, u);
    const payments = rows.map((p) => ({
      id: p.id, installment: p.installment, amount: Number(p.amount),
      currency: p.currency, status: p.status, unlocked_at: p.unlocked_at,
      paid_at: p.paid_at, invoice_number: p.invoice_number || invoiceNumber(u, p),
      payment_data: p.payment_data,
      concept: p.concept || null, due_date: p.due_date || null,
    }));
    return json({
      user: {
        id: u.id, lead_id: u.lead_id, email: u.email,
        nombre: u.nombre, apellidos: u.apellidos,
        dni_numero: u.dni_numero, direccion: u.direccion,
        tipo: u.tipo || 'general', num_carreras: u.num_carreras || 1,
      },
      payments,
    });
  } catch (e) {
    console.error('admin-payments-list error', e);
    return serverError(e);
  }
};
