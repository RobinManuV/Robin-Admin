const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

function passwordByteLength(value) {
  const password = String(value == null ? '' : value);
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(password, 'utf8');
  return new TextEncoder().encode(password).length;
}

function passwordPolicy(value) {
  if (typeof value !== 'string' || !value) return { ok: false, error: 'missing_password' };
  if (value.length < PASSWORD_MIN_LENGTH) return { ok: false, error: 'password_too_short' };
  if (passwordByteLength(value) > PASSWORD_MAX_BYTES) return { ok: false, error: 'password_too_long' };
  return { ok: true, error: null };
}

module.exports = { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordByteLength, passwordPolicy };
