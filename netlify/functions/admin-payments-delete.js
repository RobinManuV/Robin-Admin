/**
 * POST /api/admin/payments/delete
 * Body: { user_id, payment_id }
 * Elimina un pago extra (installment >= 4). NUNCA elimina las cuotas estándar
 * (installment 1, 2 o 3): para esas la respuesta es 403.
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
  const payment_id = body.payment_id;
  if (!user_id || !payment_id) return json({ error: 'missing_params' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb
      .from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // Verificar que el pago pertenece al cliente y es un extra (installment >= 4).
    const { data: p, error: e1 } = await sb
      .from('payments')
      .select('id, user_id, installment, status')
      .eq('id', payment_id)
      .single();
    if (e1 || !p) return json({ error: 'not_found' }, { statusCode: 404 });
    if (p.user_id !== user_id) return json({ error: 'mismatch' }, { statusCode: 403 });
    if (Number(p.installment) < 4) {
      return json({ error: 'cannot_delete_standard', detail: 'Las 3 cuotas estándar no se pueden eliminar.' }, { statusCode: 403 });
    }

    const { error: e2 } = await sb.from('payments').delete().eq('id', payment_id);
    if (e2) throw e2;

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, user_id);
    return json({ ok: true });
  } catch (e) {
    console.error('admin-payments-delete error', e);
    return serverError(e);
  }
};
