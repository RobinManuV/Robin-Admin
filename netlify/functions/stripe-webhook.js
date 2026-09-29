/**
 * POST /api/stripe/webhook  (público · sin auth ni verifyOrigin)
 * Verifica la firma con STRIPE_WEBHOOK_SECRET y cumple el pago de forma
 * autoritativa al recibir checkout.session.completed.
 *
 * Requiere el body crudo (Stripe firma el payload exacto). Netlify entrega
 * event.body como string; lo usamos tal cual (o lo decodificamos si viene b64).
 */
const { getSupabase } = require('../../lib/supabase');
const stripeLib = require('../../lib/stripe');
const { json } = require('../../lib/http');
const { createOperationLogger } = require('../../lib/observability');

exports.handler = async (event) => {
  const log = createOperationLogger(event, {
    operation: 'webhook.stripe',
    actor_role: 'provider',
    integration: 'stripe',
  });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!stripeLib.isConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    log.warn('degraded', { error_code: 'stripe_not_configured' });
    return { statusCode: 503, body: 'stripe_not_configured' };
  }

  const stripe = stripeLib.getStripe();
  const h = event.headers || {};
  const sig = h['stripe-signature'] || h['Stripe-Signature'];
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : (event.body || '');

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    log.warn('rejected', { error_code: 'invalid_signature' });
    return { statusCode: 400, body: `Webhook Error: ${e && e.message}` };
  }

  try {
    const sb = getSupabase();

    if (evt.type === 'checkout.session.completed' ||
        evt.type === 'checkout.session.async_payment_succeeded') {
      const cs = evt.data.object;
      const result = await stripeLib.fulfillCheckout(sb, cs);
      const awaitingAsyncPayment = result && result.reason === 'not_paid' && evt.type === 'checkout.session.completed';
      if (!awaitingAsyncPayment) stripeLib.assertFulfilled(result);
      try {
        await sb.from('webhook_log').insert({
          source: 'stripe',
          payload: { event_id: evt.id, type: evt.type, session_id: cs.id },
          result: awaitingAsyncPayment ? 'awaiting_async_payment' : (result.already ? 'already_processed' : 'ok'),
          message: 'stripe checkout fulfillment',
        });
      } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
    }

    log.success({ entity_type: 'stripe_event', entity_id: evt.id });
    return json({ received: true });
  } catch (e) {
    // Un fallo de persistencia debe ser reintentado por Stripe. Las operaciones
    // de cumplimiento son idempotentes y toleran la entrega repetida del evento.
    log.failure(e, { entity_type: 'stripe_event', entity_id: evt && evt.id });
    return json({ received: false }, { statusCode: 500 });
  }
};
