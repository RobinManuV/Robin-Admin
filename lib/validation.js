const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function stringValue(value, { min = 1, max = 1000, pattern } = {}) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) return null;
  if (pattern && !pattern.test(normalized)) return null;
  return normalized;
}

function uuid(value) {
  const normalized = stringValue(value, { max: 64 });
  return normalized && UUID_RE.test(normalized) ? normalized.toLowerCase() : null;
}

function email(value) {
  const normalized = stringValue(value, { max: 254 });
  return normalized && EMAIL_RE.test(normalized) ? normalized.toLowerCase() : null;
}

function isoDate(value) {
  const normalized = stringValue(value, { max: 64 });
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberValue(value, { min = -Number.MAX_VALUE, max = Number.MAX_VALUE, integer = false } = {}) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  return parsed;
}

function enumValue(value, allowed) {
  const normalized = stringValue(value, { max: 120 });
  return normalized && allowed.includes(normalized) ? normalized : null;
}

function dataUrl(value, { maxBytes = 20 * 1024 * 1024, allowedMime } = {}) {
  if (typeof value !== 'string') return { ok: false, error: 'invalid_file' };
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { ok: false, error: 'invalid_file' };
  if (match[2].length % 4 !== 0) return { ok: false, error: 'invalid_file' };
  const mime = match[1].toLowerCase();
  if (allowedMime && !allowedMime.includes(mime)) return { ok: false, error: 'invalid_mime' };
  const padding = (match[2].match(/=*$/) || [''])[0].length;
  const bytes = Math.max(0, Math.floor(match[2].length * 3 / 4) - padding);
  if (bytes > maxBytes) return { ok: false, error: 'file_too_large' };
  return { ok: true, mime, bytes };
}

function pagination(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const limit = numberValue(query && query.limit, { min: 1, max: maxLimit, integer: true }) || defaultLimit;
  const offset = numberValue(query && query.offset, { min: 0, max: 1_000_000, integer: true }) || 0;
  return { limit, offset };
}

module.exports = { dataUrl, email, enumValue, isoDate, numberValue, pagination, stringValue, uuid };
