const { isApplicationAdmin } = require('./authorization');

const normalizePerson = (value) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function displayName(user) {
  return [user?.nombre, user?.apellidos].filter(Boolean).join(' ').trim()
    || String(user?.username || '').trim()
    || String(user?.email || '').split('@')[0]
    || 'Administrador';
}

function isMissingPerformanceSchema(error) {
  const text = [error?.code, error?.message, error?.details].filter(Boolean).join(' ');
  return /42P01|42703|PGRST204|PGRST205|crm_users|updated_by_user_id|owner_id/i.test(text);
}

async function syncCrmIdentity(crm, user) {
  if (!user?.id) return { available: false, user: null };
  const row = {
    id: user.id,
    name: displayName(user),
    email: user.email || null,
    role: isApplicationAdmin(user) ? 'admin' : 'agent',
    active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await crm.from('crm_users').upsert(row, { onConflict: 'id' });
  if (error) {
    if (isMissingPerformanceSchema(error)) return { available: false, user: row };
    throw error;
  }
  return { available: true, user: row };
}

function matchesPerson(user, requested) {
  const target = normalizePerson(requested);
  if (!target) return false;
  return [user?.email, user?.username, user?.nombre, displayName(user)]
    .some((value) => normalizePerson(value) === target || normalizePerson(String(value || '').split('@')[0]) === target);
}

async function resolveCrmOwner({ portal, crm, ownerName }) {
  if (!String(ownerName || '').trim()) return { available: true, user: null };
  const { data, error } = await portal.from('users').select('id,email,username,nombre,apellidos,role');
  if (error) throw error;
  const owner = (data || []).filter(isApplicationAdmin).find((candidate) => matchesPerson(candidate, ownerName)) || null;
  if (!owner) return { available: true, user: null };
  const synced = await syncCrmIdentity(crm, owner);
  return { ...synced, user: owner };
}

module.exports = {
  displayName,
  isMissingPerformanceSchema,
  matchesPerson,
  resolveCrmOwner,
  syncCrmIdentity,
};
