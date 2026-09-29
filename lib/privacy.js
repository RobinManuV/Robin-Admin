const SAFE_LOG_KEYS = new Set([
  'event', 'event_id', 'type', 'session_id', 'status',
  'payment_id', 'user_id', 'installment', 'booking_id', 'file_id',
  'transcript_name', 'conference_record', 'ce_type', 'mode', 'origin',
  'tag', 'recipient_type', 'recipient_count', 'has_transcript',
  'has_attachments', 'integration', 'operation', 'attempts',
  'count',
]);

function minimizeLogPayload(payload) {
  const output = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return output;
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_LOG_KEYS.has(key)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
    output[key] = typeof value === 'string' ? value.slice(0, 180) : value;
  }
  return output;
}

function emailLogMetadata({ to, tag, attachments } = {}) {
  const recipients = Array.isArray(to) ? to : to ? [to] : [];
  return minimizeLogPayload({
    tag: tag || 'email',
    recipient_count: recipients.length,
    has_attachments: Array.isArray(attachments) && attachments.length > 0,
  });
}

module.exports = { emailLogMetadata, minimizeLogPayload };
