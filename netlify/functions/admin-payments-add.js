/**
 * POST /api/admin/payments/add
 * Body: { user_id, concept, amount, due_date? (YYYY-MM-DD) }
 * El asesor añade un pago extra a un cliente (servicio adicional contratado).
 * Se crea como una fila en `payments` con installment >= 4, estado 'unlocked'
 * (el cliente puede pagarlo directamente). Las 3 cuotas estándar no se tocan.
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
  const concept = String(body.concept || '').trim();
  const amount = Number(body.amount);
  const due_date = body.due_date ? String(body.due_date).trim() : null;

  if (!user_id) return json({ error: 'missing_user_id' }, { statusCode: 400 });
  if (!concept) return json({ error: 'missing_concept' }, { statusCode: 400 });
  if (!isFinite(amount) || amount <= 0) return json({ error: 'invalid_amount' }, { statusCode: 400 });
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
      .from('users').select('id').eq('id', user_id).single();
    if (ce || !client) return json({ error: 'client_not_found' }, { statusCode: 404 });

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
        amount: Math.round(amount * 100) / 100,
        currency: 'EUR',
        status: 'unlocked',
        unlocked_at: nowIso,
        concept,
        due_date,
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
