/**
 * lib/admins.js — Fuente única de verdad de los asesores (admins) de Project Robin.
 *
 * Cada asesor tiene su propia cuenta Google Workspace (calendario + Meet).
 *
 * Env por asesor (refresh token OAuth con scopes Calendar + Meet):
 *   - GOOGLE_REFRESH_TOKEN_NOEL
 *   - GOOGLE_REFRESH_TOKEN_MANUEL
 *   - GOOGLE_REFRESH_TOKEN_MARIA
 * Comparten GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (la misma OAuth app que Drive).
 */

const ADVISORS = [
  { email: 'noel@project-robin.com',   name: 'Noel',   refreshEnv: 'GOOGLE_REFRESH_TOKEN_NOEL' },
  { email: 'manuel@project-robin.com', name: 'Manuel', refreshEnv: 'GOOGLE_REFRESH_TOKEN_MANUEL' },
  { email: 'maria@project-robin.com',  name: 'María',  refreshEnv: 'GOOGLE_REFRESH_TOKEN_MARIA' },
];

// Set de emails admin (lowercase) para chequeos de rol/autorización.
const ADMIN_EMAILS = new Set(ADVISORS.map((a) => a.email.toLowerCase()));

// Mapa email -> nombre de pila (para topics, emails, agenda).
const ADMIN_NAMES = ADVISORS.reduce((acc, a) => {
  acc[a.email.toLowerCase()] = a.name;
  return acc;
}, {});

function isAdminEmail(email) {
  return ADMIN_EMAILS.has(canonicalAdvisorEmail(email));
}

function adminName(email) {
  const canon = canonicalAdvisorEmail(email).toLowerCase();
  if (ADMIN_NAMES[canon]) return ADMIN_NAMES[canon];
  const local = (String(email || '').toLowerCase().split('@')[0] || '');
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Devuelve el refresh token configurado para ese asesor (o null).
function refreshTokenFor(email) {
  const canon = canonicalAdvisorEmail(email);
  const a = ADVISORS.find((x) => x.email.toLowerCase() === canon);
  if (!a) return null;
  return process.env[a.refreshEnv] ? String(process.env[a.refreshEnv]).trim() : null;
}

function canonicalAdvisorEmail(email) {
  return String(email || '').toLowerCase().trim();
}

module.exports = { ADVISORS, ADMIN_EMAILS, ADMIN_NAMES, isAdminEmail, adminName, refreshTokenFor, canonicalAdvisorEmail };
