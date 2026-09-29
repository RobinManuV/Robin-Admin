/**
 * POST /api/onboarding/checkout
 * Crea una Stripe Checkout Session para la PRIMERA cuota del onboarding.
 * Devuelve { url } al que el frontend redirige. El pago se confirma vía
 * stripe-webhook (autoritativo) y/o payments-verify (al volver).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, serverError, verifyOrigin } = require('../../lib/http');
const stripeLib = require('../../lib/stripe');
const { applicationPlanForUser } = require('../../shared/financial-config.cjs');
const { createOperationLogger } = require('../../lib/observability');

exports.handler = async (event) => {
  const session = readSessionFromEvent(event);
  const log = createOperationLogger(event, {
    operation: 'onboarding.checkout',
    actor_id: session && session.uid,
    actor_role: session && session.role,
    integration: 'stripe',
  });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return methodNotAllowed(['POST']);
  }
  if (!verifyOrigin(event)) {
    log.warn('rejected', { error_code: 'bad_origin' });
    return json({ error: 'bad_origin' }, { statusCode: 403 });
  }
  if (!session) {
    log.warn('rejected', { error_code: 'unauthorized' });
    return json({ error: 'unauthorized' }, { statusCode: 401 });
  }
  if (!stripeLib.isConfigured()) {
    log.warn('degraded', { error_code: 'stripe_not_configured' });
    return json({ error: 'stripe_not_configured' }, { statusCode: 503 });
  }

  try {
    const sb = getSupabase();
    const { data: u, error: e1 } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, tipo, origin, num_carreras, has_eu_id, contract_signed, contract_data, pago_completed')
      .eq('id', session.uid)
      .single();
    if (e1 || !u) {
      log.warn('rejected', { error_code: 'unauthorized' });
      return json({ error: 'unauthorized' }, { statusCode: 401 });
    }
    if (!u.contract_signed) {
      log.warn('rejected', { error_code: 'contract_not_signed' });
      return json({ error: 'contract_not_signed' }, { statusCode: 409 });
    }
    if (u.pago_completed) {
      log.warn('rejected', { error_code: 'already_paid' });
      return json({ error: 'already_paid' }, { statusCode: 409 });
    }

    const first = applicationPlanForUser(u)[0];
    const amount = first.amount;

    const stripe = stripeLib.getStripe();
    const base = stripeLib.getBaseUrl(event);
    const nombre = [u.nombre, u.apellidos].filter(Boolean).join(' ') || (u.email || '');

    const cs = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: stripeLib.toCents(amount),
          product_data: {
            name: 'Project Robin · Primera cuota',
            description: ('Pago inicial del programa' + (nombre ? ' · ' + nombre : '')).slice(0, 240),
          },
        },
      }],
      customer_email: u.email || undefined,
      client_reference_id: String(u.id),
      success_url: `${base}/portal/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/portal/?pay=cancel`,
      metadata: { kind: 'onboarding', user_id: String(u.id), lead_id: u.lead_id || '' },
    });

    log.success({ entity_type: 'checkout_session', entity_id: cs.id });
    return json({ url: cs.url, id: cs.id });
  } catch (e) {
    log.failure(e);
    return serverError(e);
  }
};
