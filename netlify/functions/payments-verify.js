/**
 * POST /api/payments/verify  Body: { session_id }
 * Confirma inmediatamente (al volver de Stripe) recuperando la Checkout Session
 * y cumpliendo el pago de forma idempotente. El webhook sigue siendo el
 * mecanismo autoritativo; esto sólo mejora la UX del retorno.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const stripeLib = require('../../lib/stripe');
const { createOperationLogger } = require('../../lib/observability');
const { stringValue } = require('../../lib/validation');

exports.handler = async (event) => {
  const session = readSessionFromEvent(event);
  const log = createOperationLogger(event, {
    operation: 'payments.verify',
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

  const body = parseJsonBody(event);
  const checkoutSessionId = body && stringValue(body.session_id, { max: 255, pattern: /^cs_[a-zA-Z0-9_]+$/ });
  if (!checkoutSessionId) {
    const code = body && body.session_id ? 'invalid_session_id' : 'missing_session_id';
    log.warn('rejected', { error_code: code });
    return json({ error: code }, { statusCode: 400 });
  }

  try {
    const stripe = stripeLib.getStripe();
    const cs = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (!cs) {
      log.warn('rejected', { error_code: 'not_found' });
      return json({ error: 'not_found' }, { statusCode: 404 });
    }

    const md = cs.metadata || {};
    // Seguridad: la sesión debe pertenecer al usuario autenticado.
    if (String(md.user_id || cs.client_reference_id || '') !== String(session.uid)) {
      log.warn('rejected', { error_code: 'forbidden' });
      return json({ error: 'forbidden' }, { statusCode: 403 });
    }
    if (cs.payment_status !== 'paid') {
      log.result('not_paid', { entity_type: 'checkout_session', entity_id: cs.id });
      return json({ ok: false, status: cs.payment_status || 'unpaid' });
    }

    const sb = getSupabase();
    const result = await stripeLib.fulfillCheckout(sb, cs);
    stripeLib.assertFulfilled(result);
    log.success({ entity_type: 'checkout_session', entity_id: cs.id });
    return json({ ok: true, status: 'paid', kind: md.kind || null, result });
  } catch (e) {
    log.failure(e);
    return serverError(e);
  }
};
