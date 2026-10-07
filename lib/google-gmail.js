const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_INFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function getOAuthConfig() {
  return {
    clientId: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    refreshToken: String(process.env.CRM_GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN_HELLO || '').trim(),
  };
}

async function requestAccessToken() {
  const config = getOAuthConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    const error = new Error('Falta configurar la cuenta compartida de Gmail.');
    error.code = 'gmail_not_configured';
    throw error;
  }
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error('No se pudo renovar el acceso de Google. Reautoriza la cuenta compartida.');
    error.code = payload.error === 'invalid_grant' ? 'gmail_reauthorization_required' : 'gmail_oauth_failed';
    throw error;
  }
  return payload.access_token;
}

async function getGmailStatus() {
  try {
    await getGmailAccessToken();
    return { ready: true, sender: String(process.env.CRM_GMAIL_FROM || 'hello@project-robin.com').trim() };
  } catch (error) {
    return { ready: false, reason: error.message || 'Gmail no está configurado.' };
  }
}

async function getGmailAccessToken() {
    const accessToken = await requestAccessToken();
    const response = await fetch(`${TOKEN_INFO_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`);
    const tokenInfo = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('No se pudo comprobar el permiso de Gmail.');
      error.code = 'gmail_scope_check_failed';
      throw error;
    }
    const scopes = String(tokenInfo.scope || '').split(/\s+/);
    if (!scopes.includes(GMAIL_SEND_SCOPE)) {
      const error = new Error('La cuenta de Google debe reautorizarse con el permiso de envío de Gmail.');
      error.code = 'gmail_scope_missing';
      throw error;
    }
    return accessToken;
}

function headerValue(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value) {
  const safe = headerValue(value);
  return /^[\x20-\x7E]*$/.test(safe) ? safe : `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`;
}

function toText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function personalize(template, lead) {
  return String(template || '').replace(/#([\p{L}\p{N}_-]+)/gu, (placeholder, key) => (
    Object.prototype.hasOwnProperty.call(lead, key) ? toText(lead[key]) : placeholder
  ));
}

function encodeRawMessage({ to, from, subject, body }) {
  const lines = [
    `To: ${headerValue(to)}`,
    `From: ${headerValue(from)}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(body || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim(),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

async function sendMessage({ to, from, subject, body, accessToken }) {
  const token = accessToken || await getGmailAccessToken();
  const response = await fetch(GMAIL_SEND_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: encodeRawMessage({ to, from: from || process.env.CRM_GMAIL_FROM || 'hello@project-robin.com', subject, body }) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) {
    const error = new Error(response.status === 403
      ? 'Google ha rechazado el envío. Comprueba que Gmail API esté habilitada y la autorización incluya gmail.send.'
      : `Gmail no pudo enviar el correo (HTTP ${response.status}).`);
    error.code = response.status === 403 ? 'gmail_permission_denied' : 'gmail_send_failed';
    error.status = response.status;
    throw error;
  }
  return { id: result.id, threadId: result.threadId };
}

module.exports = { GMAIL_SEND_SCOPE, encodeRawMessage, getGmailAccessToken, getGmailStatus, personalize, sendMessage };
