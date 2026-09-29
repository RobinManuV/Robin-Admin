const LOGIN_FIELDS = ['username', 'email', 'lead_id'];

function quotePostgrestValue(value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function buildLoginFilter(identifier) {
  const value = quotePostgrestValue(String(identifier || '').trim());
  return LOGIN_FIELDS.map((field) => `${field}.eq.${value}`).join(',');
}

async function findInTable(sb, table, identifier) {
  const value = String(identifier || '').trim();
  if (!value) return [];
  const { data, error } = await sb
    .from(table)
    .select('*')
    .or(buildLoginFilter(value))
    .limit(2);
  if (error) throw error;
  return data || [];
}

async function findIdentityCandidates(sb, identifier) {
  const users = await findInTable(sb, 'users', identifier);
  return users.map((row) => ({ table: 'users', row }));
}

function resolvePasswordCandidate(candidates, password, verifyPassword) {
  const verified = (candidates || []).filter(({ row }) =>
    row && row.password_hash && verifyPassword(password, row.password_hash)
  );
  if (verified.length === 0) return { status: 'invalid', candidate: null };
  if (verified.length > 1) return { status: 'ambiguous', candidate: null };
  return { status: 'ok', candidate: verified[0] };
}

async function identityExists(sb, identifiers) {
  const unique = [...new Set((identifiers || []).map((v) => String(v || '').trim()).filter(Boolean))];
  for (const identifier of unique) {
    if ((await findIdentityCandidates(sb, identifier)).length) return true;
  }
  return false;
}

module.exports = {
  buildLoginFilter,
  findIdentityCandidates,
  identityExists,
  resolvePasswordCandidate,
};
