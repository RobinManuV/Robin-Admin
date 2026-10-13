/**
 * POST /api/admin/payments/add
 * Body: { user_id, preset, concept?, amount?, vat_treatment?, units?,
 *         class_mode?, hours?, due_date? (YYYY-MM-DD) }
 * El asesor añade un pago extra a un cliente (servicio adicional contratado).
 * Se crea como una fila en `payments` con installment >= 4, estado 'unlocked'
 * (el cliente puede pagarlo directamente). Las 3 cuotas estándar no se tocan.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { prepareExtraPayment } = require('../../lib/extra-payments');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const user_id = body.user_id;
  const due_date = body.due_date ? String(body.due_date).trim() : null;

  if (!user_id) return json({ error: 'missing_user_id' }, { statusCode: 400 });
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return json({ error: 'invalid_due_date' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const { data: admin } = await sb
      .from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // Comprobar que el cliente existe
    const { data: client, error: ce } = await sb
      .from('users').select('id, nombre, apellidos, contract_data').eq('id', user_id).single();
    if (ce || !client) return json({ error: 'client_not_found' }, { statusCode: 404 });

    let prepared;
    try {
      prepared = prepareExtraPayment(client, body);
    } catch (validationError) {
      return json({ error: validationError.code || 'invalid_extra_payment' }, { statusCode: 400 });
    }

    // Siguiente número de installment (>= 4, no choca con las 3 cuotas estándar)
    const { data: rows, error: e1 } = await sb
      .from('payments').select('installment').eq('user_id', user_id);
    if (e1) throw e1;
    let next = 4;
    (rows || []).forEach((r) => { if (Number(r.installment) >= next) next = Number(r.installment) + 1; });

    const nowIso = new Date().toISOString();
    const { data: ins, error: e2 } = await sb
      .from('payments')
      .insert({
        user_id,
        installment: next,
        amount: prepared.amount,
        currency: 'EUR',
        status: 'unlocked',
        unlocked_at: nowIso,
        concept: prepared.concept,
        due_date,
        payment_data: prepared.paymentData,
      })
      .select()
      .single();
    if (e2) throw e2;

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, user_id);
    return json({ ok: true, payment: ins });
  } catch (e) {
    console.error('admin-payments-add error', e);
    return serverError(e);
  }
};
