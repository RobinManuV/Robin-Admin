const { sendEmail } = require('./email');
const { portalUrl } = require('./operational-config');

const SUBJECT = 'Tu acceso al portal de aplicación de Robin';

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function buildAccountAccessMessage({ name, username, password, loginUrl = portalUrl() }) {
  const greeting = firstName(name) ? `Hola ${firstName(name)},` : 'Hola,';
  const text = `${greeting}

Tu cuenta de cliente de Robin ya está preparada.

Acceso: ${loginUrl}
Usuario: ${username}
Contraseña: ${password}

Desde el portal podrás completar el onboarding y continuar con tu proceso de aplicación.

El equipo de Robin`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#17263d"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#102b4b;color:#fff;padding:24px 28px;font-size:22px;font-weight:700">Bienvenido a Robin</td></tr><tr><td style="padding:28px"><p>${escapeHtml(greeting)}</p><p>Tu cuenta de cliente de Robin ya está preparada.</p><div style="background:#f4f6f9;border-radius:8px;padding:18px;margin:20px 0"><p style="margin:0 0 8px"><strong>Usuario:</strong> ${escapeHtml(username)}</p><p style="margin:0"><strong>Contraseña:</strong> ${escapeHtml(password)}</p></div><p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#102b4b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Acceder al portal</a></p><p style="font-size:14px;line-height:1.6">Desde el portal podrás completar el onboarding y continuar con tu proceso de aplicación.</p><p>El equipo de Robin</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: SUBJECT, text, html };
}

async function sendAccountAccessEmail({ email, name, username, password }) {
  if (!email) return { sent: false, reason: 'no_email' };
  const message = buildAccountAccessMessage({ name, username, password });
  return sendEmail({ to: email, ...message, tag: 'account_access' });
}

module.exports = { SUBJECT, buildAccountAccessMessage, sendAccountAccessEmail };
