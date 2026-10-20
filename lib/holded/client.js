// Server-side client helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const HOLDED_BASE = 'https://api.holded.com/api/v2';

function pat() {
  return String(process.env.HOLDED_API_PAT || '').trim();
}

function isConfigured() {
  return !!pat();
}

function norm(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function holdedFetch(path, { method = 'GET', body, raw = false } = {}) {
  if (!isConfigured()) throw new Error('holded_not_configured');
  const res = await fetch(HOLDED_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + pat(),
      Accept: raw ? 'application/pdf, application/json' : 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    if (!res.ok) {
      const text = await res.text();
      const err = new Error('holded_http_' + res.status);
      try { err.detail = JSON.parse(text); } catch (_) { err.detail = text; }
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('holded_http_' + res.status);
    err.detail = data;
    throw err;
  }
  return data;
}

module.exports = { holdedFetch, isConfigured, norm };
