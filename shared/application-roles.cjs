const APPLICATION_ADMIN_ROLES = Object.freeze(['admin', 'supervisor']);

function normalizeApplicationRole(value) {
  const raw = value && typeof value === 'object' ? value.role : value;
  return String(raw || '').trim().toLowerCase();
}

function hasApplicationAdminRole(value) {
  return APPLICATION_ADMIN_ROLES.includes(normalizeApplicationRole(value));
}

module.exports = {
  APPLICATION_ADMIN_ROLES,
  normalizeApplicationRole,
  hasApplicationAdminRole,
};
