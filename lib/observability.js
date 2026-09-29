const crypto = require('crypto');

const ALLOWED_CONTEXT = new Set([
  'actor_id',
  'actor_role',
  'entity_type',
  'entity_id',
  'integration',
  'error_code',
  'attempt',
  'count',
]);

function header(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return value;
  }
  return null;
}

function cleanScalar(value) {
  if (value == null) return undefined;
  if (!['string', 'number', 'boolean'].includes(typeof value)) return undefined;
  return typeof value === 'string' ? value.slice(0, 160) : value;
}

function cleanContext(input) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_CONTEXT.has(key)) continue;
    const cleaned = cleanScalar(value);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

function errorCode(error, fallback = 'unexpected_error') {
  const safeMessage = error && typeof error.message === 'string' && /^[a-zA-Z0-9_.:-]+$/.test(error.message)
    ? error.message
    : null;
  const candidate = error && (error.code || safeMessage || error.name);
  const value = String(candidate || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return value || fallback;
}

function requestId(event, generate = () => crypto.randomUUID()) {
  return String(
    header(event, 'x-nf-request-id') ||
    header(event, 'x-request-id') ||
    generate()
  ).slice(0, 160);
}

function createOperationLogger(event, base, options = {}) {
  if (!base || !base.operation) throw new Error('missing_observability_operation');
  const now = options.now || Date.now;
  const sink = options.sink || console;
  const startedAt = now();
  const id = requestId(event, options.generateRequestId);
  const fixed = cleanContext(base);

  function emit(level, result, context = {}) {
    const record = {
      timestamp: new Date(now()).toISOString(),
      level,
      request_id: id,
      operation: String(base.operation).slice(0, 120),
      ...fixed,
      ...cleanContext(context),
      result: String(result).slice(0, 80),
      duration_ms: Math.max(0, now() - startedAt),
    };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    sink[method](JSON.stringify(record));
    return record;
  }

  return {
    requestId: id,
    start: (context) => emit('info', 'started', context),
    success: (context) => emit('info', 'ok', context),
    result: (result, context) => emit('info', result, context),
    warn: (result, context) => emit('warn', result, context),
    failure: (error, context = {}) => emit('error', 'error', {
      error_code: errorCode(error, context.error_code),
      ...context,
    }),
  };
}

module.exports = {
  cleanContext,
  createOperationLogger,
  errorCode,
  requestId,
};
