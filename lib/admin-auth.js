// Server-side admin auth helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const { isApplicationAdmin } = require('./authorization');

async function findAdminForSession(sb, session, columns = 'id,email,username,role') {
  if (!session?.uid) return null;
  const { data: admin } = await sb.from('users').select(columns).eq('id', session.uid).single();
  return admin && isApplicationAdmin(admin) ? admin : null;
}

module.exports = { findAdminForSession };
