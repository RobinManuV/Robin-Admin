/**
 * Predicados de autorización compartidos por las Netlify Functions.
 *
 * No autentica peticiones ni sustituye `readSessionFromEvent`: clasifica una
 * sesión/fila ya autenticada sin conceder permisos desde datos del frontend.
 */
const { ADMIN_EMAILS } = require('./admins');
const {
  hasApplicationAdminRole,
  normalizeApplicationRole,
} = require('../shared/application-roles.cjs');

function normalizeEmail(value) {
  const raw = value && typeof value === 'object'
    ? (value.email || value.username || '')
    : value;
  return String(raw || '').trim().toLowerCase();
}

function isListedAdvisor(value) {
  return ADMIN_EMAILS.has(normalizeEmail(value));
}

function isApplicationAdmin(value) {
  if (!value || typeof value !== 'object') return false;
  return hasApplicationAdminRole(value) || isListedAdvisor(value);
}

function ownsRecord(actor, record, ownerKey = 'user_id') {
  if (!actor || !record || actor.id == null || record[ownerKey] == null) return false;
  return String(actor.id) === String(record[ownerKey]);
}

module.exports = {
  normalizeEmail,
  normalizeApplicationRole,
  hasApplicationAdminRole,
  isListedAdvisor,
  isApplicationAdmin,
  ownsRecord,
};
