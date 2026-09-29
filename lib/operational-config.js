const DEFAULT_SUPPORT_INBOXES = Object.freeze([
  'hello@project-robin.com',
  'projectrobinn@gmail.com',
]);
const DEFAULT_PUBLIC_BASE_URL = 'https://project-robin.com';

function commaSeparated(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function currentEnvironment() {
  return {
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
    SUPPORT_INBOXES: process.env.SUPPORT_INBOXES,
    TEAM_EMAIL: process.env.TEAM_EMAIL,
    URL: process.env.URL,
  };
}

function supportInboxes(env = currentEnvironment()) {
  const configured = commaSeparated(env.SUPPORT_INBOXES);
  return configured.length ? configured : [...DEFAULT_SUPPORT_INBOXES];
}

function teamEmail(env = currentEnvironment()) {
  return String(env.TEAM_EMAIL || '').trim() || supportInboxes(env)[0];
}

function publicBaseUrl(env = currentEnvironment()) {
  const value = env.PUBLIC_BASE_URL || env.URL || env.DEPLOY_PRIME_URL || env.DEPLOY_URL || DEFAULT_PUBLIC_BASE_URL;
  return String(value).trim().replace(/\/$/, '');
}

function portalUrl(env = currentEnvironment()) {
  return `${publicBaseUrl(env)}/portal/`;
}

module.exports = {
  commaSeparated,
  DEFAULT_PUBLIC_BASE_URL,
  DEFAULT_SUPPORT_INBOXES,
  portalUrl,
  publicBaseUrl,
  supportInboxes,
  teamEmail,
};
