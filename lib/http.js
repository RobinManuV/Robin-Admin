/**
 * Helpers comunes para Netlify Functions (handlers tradicionales con event/context).
 */

function json(body, { statusCode = 200, headers = {}, cookies = [] } = {}) {
  const out = {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers, 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
  if (cookies.length) {
    // Netlify Functions soportan multiValueHeaders para set varios Set-Cookie
    out.multiValueHeaders = { 'Set-Cookie': cookies };
  }
  return out;
}

function methodNotAllowed(allowed) {
  return json(
    { error: 'method_not_allowed' },
    { statusCode: 405, headers: { Allow: allowed.join(', ') } }
  );
}

function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    if (event.isBase64Encoded) {
      return JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'));
    }
    return JSON.parse(event.body);
  } catch (e) {
    return null; // null = invalid JSON
  }
}


const crypto = require('crypto');
const { errorCode } = require('./observability');

// Comparación en tiempo constante (anti timing-attack) para secretos compartidos.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a), 'utf8');
  const bb = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}

function verifyConfiguredSecret(expected, provided) {
  if (!String(expected || '')) {
    return { ok: false, error: 'missing_secret_configuration', statusCode: 500 };
  }
  if (!safeEqual(provided, expected)) {
    return { ok: false, error: 'unauthorized', statusCode: 401 };
  }
  return { ok: true, error: null, statusCode: 200 };
}

// Error 500 genérico: loguea el detalle real en los logs de Netlify (visibles para el
// equipo) pero NO lo expone al cliente en producción. En deploys de preview/desarrollo
// sí incluye `detail` para facilitar la depuración.
function serverError(e, tag) {
  try {
    console.error(JSON.stringify({
      level: 'error',
      operation: tag || 'server_request',
      result: 'error',
      error_code: errorCode(e),
    }));
  } catch (error) { console.warn('[server_error_log_failed]'); }
  const isProd = process.env.CONTEXT === 'production';
  const body = { error: 'server_error' };
  if (!isProd && e && e.message) body.detail = e.message;
  return json(body, { statusCode: 500 });
}

function headerCI(event, name) {
  if (!event || !event.headers) return '';
  const lower = name.toLowerCase();
  for (const k of Object.keys(event.headers)) {
    if (k.toLowerCase() === lower) return event.headers[k];
  }
  return '';
}

// Conjunto de orígenes permitidos: env ALLOWED_ORIGINS (CSV) + URLs que Netlify inyecta
// (URL / DEPLOY_PRIME_URL / DEPLOY_URL) + el propio Host de la petición (same-origin).
function allowedOrigins(event) {
  const out = new Set();
  (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .forEach((o) => out.add(o.replace(/\/$/, '')));
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]
    .filter(Boolean).forEach((u) => out.add(u.replace(/\/$/, '')));
  const host = headerCI(event, 'host');
  if (host) { out.add('https://' + host); out.add('http://' + host); }
  return out;
}

// Defensa CSRF en profundidad: el Origin (o, en su defecto, el Referer) de la petición
// debe pertenecer al propio sitio. Si no hay ninguno de los dos (cliente no-navegador),
// se permite: SameSite=lax ya protege a los navegadores y los webhooks usan secreto propio.
function verifyOrigin(event) {
  let candidate = headerCI(event, 'origin');
  if (!candidate) {
    const ref = headerCI(event, 'referer') || headerCI(event, 'referrer');
    if (ref) { try { candidate = new URL(ref).origin; } catch (error) { console.warn("[optional_operation_failed]", error && error.message); } }
  }
  if (!candidate) return true;
  return allowedOrigins(event).has(candidate.replace(/\/$/, ''));
}

module.exports = {
  json,
  methodNotAllowed,
  parseJsonBody,
  safeEqual,
  serverError,
  verifyConfiguredSecret,
  verifyOrigin,
};
