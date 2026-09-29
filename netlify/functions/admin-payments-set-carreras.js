const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { ensurePayments } = require('../../lib/payments');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const user_id = body.user_id;
  const num = Number(body.num_carreras);
  if (!user_id || !(num === 1 || num === 2 || num === 3)) return json({ error: 'invalid_params' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { error: e1 } = await sb.from('users').update({ num_carreras: num }).eq('id', user_id);
    if (e1) throw e1;

    const { data: u, error: eUser } = await sb.from('users')
      .select('id, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed, pago_completed_at, pago_data')
      .eq('id', user_id).single();
    if (eUser || !u) return json({ error: 'user_not_found', detail: eUser && eUser.message }, { statusCode: 404 });
    const rows = await ensurePayments(sb, u);

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, user_id);
    return json({ ok: true, num_carreras: num, payments: rows });
  } catch (e) {
    console.error('admin-payments-set-carreras error', e);
    return serverError(e);
  }
};
