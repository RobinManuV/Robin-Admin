const { createOperationLogger, errorCode } = require('./observability');

async function queueRetry(sb, { integration, operation, payload, error }) {
  const log = createOperationLogger(null, {
    operation: 'integrations.queue_retry',
    actor_role: 'system',
    integration,
  });
  log.start();
  const retryPayload = {
    integration,
    operation,
    ...(payload || {}),
    attempts: 0,
    queued_at: new Date().toISOString(),
  };
  const { error: logError } = await sb.from('webhook_log').insert({
    source: 'integration_retry',
    payload: retryPayload,
    result: 'pending',
    message: errorCode(error, 'integration_failed'),
  });
  const entityType = payload && payload.user_id ? 'user' : payload && payload.payment_id ? 'payment' : 'integration_job';
  const entityId = payload && (payload.user_id || payload.payment_id);
  if (logError) {
    log.failure(logError, { entity_type: entityType, entity_id: entityId });
  } else {
    log.warn('queued', {
      entity_type: entityType,
      entity_id: entityId,
      error_code: errorCode(error, 'integration_failed'),
    });
  }
  return { ok: false, queued: !logError, reason: errorCode(error, 'integration_failed') };
}

async function syncGoogleSheets(sb, userId) {
  const result = await require('./google-sheets').upsertClientRow(sb, userId);
  if (result && result.ok) return result;
  if (result && ['not_configured', 'not_assigned'].includes(result.reason)) return result;
  return queueRetry(sb, {
    integration: 'google_sheets',
    operation: 'upsert_client',
    payload: { user_id: userId },
    error: new Error((result && result.reason) || 'sheets_sync_failed'),
  });
}

async function syncHoldedInvoice(sb, paymentId) {
  const result = await require('./holded').generateInvoiceForPaymentRow(sb, paymentId);
  if (result && (result.ok || result.skipped)) return result;
  return queueRetry(sb, {
    integration: 'holded',
    operation: 'invoice_payment',
    payload: { payment_id: paymentId },
    error: new Error((result && result.reason) || 'holded_sync_failed'),
  });
}

module.exports = { queueRetry, syncGoogleSheets, syncHoldedInvoice };
