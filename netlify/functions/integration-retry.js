const { getSupabase } = require('../../lib/supabase');
const { json } = require('../../lib/http');
const { createOperationLogger, errorCode } = require('../../lib/observability');

const MAX_ATTEMPTS = 5;

async function dispatch(sb, payload) {
  if (payload.integration === 'google_sheets' && payload.operation === 'upsert_client') {
    return require('../../lib/google-sheets').upsertClientRow(sb, payload.user_id);
  }
  if (payload.integration === 'holded' && payload.operation === 'invoice_payment') {
    return require('../../lib/holded').generateInvoiceForPaymentRow(sb, payload.payment_id);
  }
  throw new Error('unsupported_retry_operation');
}

async function loadPendingJobs(sb) {
  const { data, error } = await sb
    .from('webhook_log')
    .select('id, payload')
    .eq('source', 'integration_retry')
    .eq('result', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return data || [];
}

exports.handler = async (event) => {
  const log = createOperationLogger(event, { operation: 'integrations.retry', actor_role: 'system' });
  log.start();
  let scheduled = false;
  try { scheduled = !!(event && event.body && JSON.parse(event.body).next_run); } catch (error) {
    log.warn('rejected', { error_code: 'invalid_schedule_body' });
  }
  if (!scheduled) {
    log.warn('rejected', { error_code: 'not_scheduled' });
    return json({ error: 'not_found' }, { statusCode: 404 });
  }

  const sb = getSupabase();
  const jobs = await loadPendingJobs(sb);

  const summary = { processed: 0, completed: 0, failed: 0 };
  for (const job of jobs) {
    summary.processed++;
    const payload = job.payload || {};
    const attempts = Number(payload.attempts || 0) + 1;
    try {
      const result = await dispatch(sb, payload);
      if (!result || (!result.ok && !result.skipped)) throw new Error((result && result.reason) || 'retry_failed');
      const { error: updateError } = await sb.from('webhook_log').update({
        result: 'completed',
        payload: { ...payload, attempts, completed_at: new Date().toISOString() },
        message: result.skipped ? `skipped:${result.reason || 'not_configured'}` : 'retry_completed',
      }).eq('id', job.id);
      if (updateError) throw updateError;
      summary.completed++;
      log.result('retry_completed', {
        entity_type: 'integration_retry',
        entity_id: job.id,
        integration: payload.integration,
        attempt: attempts,
      });
    } catch (retryError) {
      const final = attempts >= MAX_ATTEMPTS;
      await sb.from('webhook_log').update({
        result: final ? 'failed' : 'pending',
        payload: { ...payload, attempts, last_attempt_at: new Date().toISOString() },
        message: errorCode(retryError, 'retry_failed'),
      }).eq('id', job.id);
      summary.failed++;
      log.warn(final ? 'retry_failed' : 'retry_pending', {
        entity_type: 'integration_retry',
        entity_id: job.id,
        integration: payload.integration,
        attempt: attempts,
        error_code: errorCode(retryError, 'retry_failed'),
      });
    }
  }
  log.success({ count: summary.processed });
  return json({ ok: true, ...summary });
};

module.exports.dispatch = dispatch;
module.exports.loadPendingJobs = loadPendingJobs;
