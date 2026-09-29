/**
 * POST /api/admin/payments/set-amount
 * Body: { user_id, installment (2 ó 3), amount }
 * El asesor ajusta el importe de una cuota posterior a la primera, siempre que
 * no esté pagada. El importe queda "personalizado": ensurePayments no lo
 * recalcula (marca payment_data.amount_custom = true).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { ensurePayments } = require('../../lib/payments');
const { numberValue, stringValue } = require('../../lib/validation');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const user_id = stringValue(body.user_id, { max: 64 });
  const installment = numberValue(body.installment, { min: 2, max: 3, integer: true });
  const rawAmount = numberValue(body.amount, { min: 0.01, max: 100000 });
  const amount = rawAmount == null ? null : Math.round(rawAmount * 100) / 100;

  if (!user_id || !(installment === 2 || installment === 3)) {
    return json({ error: 'invalid_params' }, { statusCode: 400 });
  }
  if (amount == null) {
    return json({ error: 'invalid_amount' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const { data: admin } = await sb
      .from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: u } = await sb
      .from('users')
      .select('id, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed, pago_completed_at, pago_data')
      .eq('id', user_id)
      .single();
    if (!u) return json({ error: 'user_not_found' }, { statusCode: 404 });

    const rows = await ensurePayments(sb, u);
    const target = rows.find((r) => r.installment === installment);
    if (!target) return json({ error: 'payment_not_found' }, { statusCode: 404 });
    if (target.status === 'paid') return json({ error: 'already_paid' }, { statusCode: 409 });

    const payment_data = Object.assign({}, target.payment_data || {}, {
      amount_custom: true,
      amount_custom_by: adminEmail,
      amount_custom_at: new Date().toISOString(),
    });

    const { data: upd, error: e1 } = await sb
      .from('payments')
      .update({ amount, payment_data })
      .eq('id', target.id)
      .select()
      .single();
    if (e1) throw e1;

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, user_id);
    return json({ ok: true, payment: upd });
  } catch (e) {
    console.error('admin-payments-set-amount error', e);
    return serverError(e);
  }
};
