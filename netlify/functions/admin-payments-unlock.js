const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { ensurePayments } = require('../../lib/payments');
const { sendEmail } = require('../../lib/email');
const { portalUrl } = require('../../lib/operational-config');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const user_id = body.user_id;
  const installment = Number(body.installment);
  if (!user_id || !(installment === 2 || installment === 3)) {
    return json({ error: 'invalid_params' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: u } = await sb
      .from('users')
      .select('id, email, nombre, apellidos, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed, pago_completed_at, pago_data')
      .eq('id', user_id)
      .single();
    if (!u) return json({ error: 'user_not_found' }, { statusCode: 404 });

    const rows = await ensurePayments(sb, u);
    const target = rows.find((r) => r.installment === installment);
    if (!target) return json({ error: 'payment_not_found' }, { statusCode: 404 });
    if (target.status === 'paid') return json({ error: 'already_paid' }, { statusCode: 409 });

    const nowIso = new Date().toISOString();
    const { error: e1 } = await sb
      .from('payments')
      .update({ status: 'unlocked', unlocked_at: target.unlocked_at || nowIso })
      .eq('id', target.id);
    if (e1) throw e1;

    // Email al cliente (best-effort)
    let emailResult = null;
    if (u.email) {
      const nombre = (u.nombre || '').trim() || 'estudiante';
      const importeStr = Number(target.amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const subject = `Cuota ${installment} disponible para pagar — Project Robin`;
      const paymentPortalUrl = portalUrl();
      const text =
`Hola ${nombre},

Tu asesor de Project Robin ha desbloqueado la cuota ${installment} de tu paquete.

Importe: ${importeStr} €
Puedes realizar el pago entrando en el portal: ${paymentPortalUrl}

Si tienes cualquier duda, responde a este correo.

— Project Robin Students Mobility S.L.`;
      const html = text.replace(/\n/g, '<br>');
      emailResult = await sendEmail({ to: u.email, subject, text, html, tag: 'payment_unlocked' });
    }

    return json({ ok: true, installment, unlocked_at: nowIso, email: emailResult });
  } catch (e) {
    console.error('admin-payments-unlock error', e);
    return serverError(e);
  }
};
