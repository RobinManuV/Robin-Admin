// Server-side admin profiles helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const PRO_ADMIN_EMAILS = new Set([
  'noel@project-robin.com',
  'maria@project-robin.com',
  'manuel@project-robin.com',
  'santimartin1203@gmail.com',
]);

const DEVELOPER_ADMIN_EMAIL = 'santimartin1203@gmail.com';

const ADMIN_VISIBLE_TABS = [
  'home.summary',
  'home.leads',
  'home.students',
  'home.analytics',
  'home.settings',
  'crm.to_contact',
  'crm.contacted',
  'crm.clients',
  'crm.lost',
  'platform.student_portal',
  'platform.robin_plan',
  'analytics.sales',
  'analytics.campaigns',
  'analytics.web',
  'analytics.operations',
];

function isProAdmin(user) {
  const email = typeof user === 'string' ? user : user?.email;
  return PRO_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

function isDeveloperAdmin(user) {
  const email = typeof user === 'string' ? user : user?.email;
  return String(email || '').trim().toLowerCase() === DEVELOPER_ADMIN_EMAIL;
}

function normalizeVisibleTabs(value) {
  if (!Array.isArray(value)) return [...ADMIN_VISIBLE_TABS];
  return [...new Set(value.filter((item) => ADMIN_VISIBLE_TABS.includes(item)))];
}

module.exports = { PRO_ADMIN_EMAILS, ADMIN_VISIBLE_TABS, DEVELOPER_ADMIN_EMAIL, isProAdmin, isDeveloperAdmin, normalizeVisibleTabs };
