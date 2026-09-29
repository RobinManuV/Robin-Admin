/**
 * Helper compartido de Stripe (pasarela de pago real, modo Checkout hosted).
 * Env vars:
 *   - STRIPE_SECRET_KEY      (sk_test_... / sk_live_...)
 *   - STRIPE_WEBHOOK_SECRET  (whsec_... · sólo para stripe-webhook)
 * Sin STRIPE_SECRET_KEY, isConfigured()=false y los endpoints devuelven
 * `stripe_not_configured`.
 */
let _stripe = null;

function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('stripe_not_configured');
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

// URL base del despliegue (para success_url / cancel_url).
function getBaseUrl(event) {
  const forwardedHost = event && event.headers && (event.headers['x-forwarded-host'] || event.headers['X-Forwarded-Host']);
  if (forwardedHost) return `https://${forwardedHost}`;
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');
  const h = (event && event.headers) || {};
  const proto = h['x-forwarded-proto'] || 'https';
  const host = h['host'] || h['Host'];
  return host ? `${proto}://${host}` : '';
}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function assertFulfilled(result) {
  if (result && result.ok) return result;
  const reason = (result && result.reason) || 'unknown';
  const error = new Error(`stripe_fulfillment_failed:${reason}`);
  error.code = 'stripe_fulfillment_failed';
  error.reason = reason;
  throw error;
}

/**
 * Marca un pago como pagado a partir de una Checkout Session de Stripe.
 * Idempotente: si ya está pagado no hace nada. Usado por el webhook y por verify.
 */
async function fulfillInstallment(sb, session, md) {
  const { invoiceNumber } = require('./payments');
  const paymentId = md.payment_id;
  if (!paymentId) return { ok: false, reason: 'no_payment_id' };
  const { data: p, error } = await sb.from('payments').select('*').eq('id', paymentId).single();
  if (error || !p) return { ok: false, reason: 'payment_not_found' };
  if (p.status === 'paid') return { ok: true, already: true, installment: p.installment };
  const nowIso = new Date().toISOString();
  let u = { id: p.user_id };
  try {
    const { data: uu } = await sb.from('users').select('id, lead_id').eq('id', p.user_id).single();
    if (uu) u = uu;
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
  const payment_data = {
    ...(p.payment_data || {}),
    method: 'card',
    processor: 'stripe',
    simulated: false,
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent || null,
    amount: (session.amount_total != null ? session.amount_total / 100 : Number(p.amount)),
    currency: (session.currency || p.currency || 'eur').toUpperCase(),
    at: nowIso,
  };
  const { data: flipped, error: e2 } = await sb.from('payments').update({
    status: 'paid',
    paid_at: nowIso,
    invoice_number: p.invoice_number || invoiceNumber(u, p),
    payment_data,
  }).eq('id', p.id).neq('status', 'paid').select('id');
  if (e2) throw e2;
  if (!flipped || !flipped.length) {
    return { ok: true, already: true, installment: p.installment };
  }
  // Genera la factura en Holded (best-effort, idempotente; no aborta el pago).
  await require('./integration-sync').syncHoldedInvoice(sb, p.id);
  // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
  await require('./integration-sync').syncGoogleSheets(sb, p.user_id);
  return { ok: true, installment: p.installment };
}

async function fulfillCheckout(sb, session) {
  const md = session.metadata || {};
  const kind = md.kind;
  if (session.payment_status && session.payment_status !== 'paid') {
    return { ok: false, reason: 'not_paid' };
  }
  if (kind === 'installment') {
    return await fulfillInstallment(sb, session, md);
  }
  if (kind === 'onboarding') {
    const { markOnboardingPaid } = require('./onboarding-fulfill');
    const pago_data = {
      amount: (session.amount_total != null ? session.amount_total / 100 : undefined),
      currency: (session.currency || 'eur').toUpperCase(),
      method: 'card',
      processor: 'stripe',
      simulated: false,
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent || null,
      at: new Date().toISOString(),
    };
    return await markOnboardingPaid(sb, md.user_id, pago_data);
  }
  return { ok: false, reason: 'unknown_kind' };
}

module.exports = { assertFulfilled, isConfigured, getStripe, getBaseUrl, toCents, fulfillCheckout };
