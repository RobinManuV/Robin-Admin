/**
 * POST /api/payments/checkout  Body: { installment }
 * Crea una Stripe Checkout Session para una cuota desbloqueada (2-3 o extra >=4).
 * Devuelve { url }. Confirmación vía stripe-webhook / payments-verify.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { ensurePayments } = require('../../lib/payments');
const stripeLib = require('../../lib/stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  if (!stripeLib.isConfigured()) return json({ error: 'stripe_not_configured' }, { statusCode: 503 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
  const installment = Number(body.installment);
  if (!Number.isInteger(installment) || installment < 2) {
    return json({ error: 'invalid_installment' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const { data: u, error: e1 } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed, pago_completed_at, pago_data')
      .eq('id', session.uid)
      .single();
    if (e1 || !u) return json({ error: 'unauthorized' }, { statusCode: 401 });

    await ensurePayments(sb, u);

    const { data: p, error: e2 } = await sb
      .from('payments')
      .select('*')
      .eq('user_id', u.id)
      .eq('installment', installment)
      .single();
    if (e2 || !p) return json({ error: 'not_found' }, { statusCode: 404 });
    if (p.status === 'paid') return json({ error: 'already_paid' }, { statusCode: 409 });
    if (p.status !== 'unlocked') return json({ error: 'not_unlocked' }, { statusCode: 409 });

    const stripe = stripeLib.getStripe();
    const base = stripeLib.getBaseUrl(event);
    const label = p.concept ? String(p.concept) : 'Cuota ' + p.installment;

    const cs = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (p.currency || 'EUR').toLowerCase(),
          unit_amount: stripeLib.toCents(p.amount),
          product_data: { name: ('Project Robin · ' + label).slice(0, 240) },
        },
      }],
      customer_email: u.email || undefined,
      client_reference_id: String(u.id),
      success_url: `${base}/portal/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/portal/?pay=cancel`,
      metadata: {
        kind: 'installment',
        user_id: String(u.id),
        payment_id: String(p.id),
        installment: String(p.installment),
      },
    });

    return json({ url: cs.url, id: cs.id });
  } catch (e) {
    console.error('payments-checkout error', e);
    return serverError(e);
  }
};
