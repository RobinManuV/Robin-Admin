const normalized = (value) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function adminIdentityValues(admin) {
  const emailUser = String(admin?.email || '').split('@')[0];
  const values = [admin?.nombre, admin?.username, emailUser]
    .map(normalized)
    .filter((value) => value.length >= 3);
  const firstNames = values.map((value) => value.split(/[\s._-]+/)[0]).filter((value) => value.length >= 3);
  return [...new Set([...values, ...firstNames])];
}

function matchesAdmin(value, identities) {
  const candidate = normalized(value);
  if (!candidate) return false;
  const words = candidate.split(/[^a-z0-9]+/).filter(Boolean);
  return identities.some((identity) => candidate === identity || words.includes(identity));
}

function adminAgentKey(admin) {
  const identities = adminIdentityValues(admin);
  return ['noel', 'manuel', 'maria'].find((key) => identities.includes(key)) || null;
}

function adminDisplayName(admin) {
  const name = String(admin?.nombre || '').trim();
  if (name) return name;
  const raw = String(admin?.username || admin?.email || '').split('@')[0].trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Administrador';
}

function filterSalesRowsForAdmin(rows, admin) {
  const identities = adminIdentityValues(admin);
  const crmUserIds = new Set((rows.crmUsers || [])
    .filter((user) => matchesAdmin(user.name, identities) || matchesAdmin(user.email, identities))
    .map((user) => String(user.id)));
  const leads = (rows.leads || []).filter((lead) => {
    if (lead.owner_id && crmUserIds.has(String(lead.owner_id))) return true;
    const owners = Array.isArray(lead.owner_names) ? lead.owner_names : [lead.owner_names];
    return [lead.source_payload?.sales_agent, ...owners].some((value) => matchesAdmin(value, identities));
  });
  const leadIds = new Set(leads.map((lead) => String(lead.id)));
  const leadEmails = new Set(leads.map((lead) => normalized(lead.email)).filter(Boolean));
  const users = (rows.users || []).filter((user) => (
    leadIds.has(String(user.lead_id || '')) || leadEmails.has(normalized(user.email))
  ));
  const userIds = new Set(users.map((user) => String(user.id)));

  return {
    ...rows,
    leads,
    users,
    payments: (rows.payments || []).filter((payment) => userIds.has(String(payment.user_id))),
    events: (rows.events || []).filter((event) => leadIds.has(String(event.lead_id))),
    sessions: (rows.sessions || []).filter((session) => crmUserIds.has(String(session.user_id))),
    applications: (rows.applications || []).filter((application) => leadIds.has(String(application.lead_id))),
    historicalFacts: (rows.historicalFacts || []).filter((fact) => matchesAdmin(fact.manager, identities)),
  };
}

function markPersonalSalesDashboard(dashboard, admin) {
  const key = adminAgentKey(admin);
  const name = adminDisplayName(admin);
  if (key) {
    dashboard.agents = (dashboard.agents || []).filter((agent) => agent.key === key);
    dashboard.team.agents = (dashboard.team.agents || []).filter((agent) => agent.key === key);
    dashboard.team.fifo = (dashboard.team.fifo || []).filter((agent) => agent.key === key);
  }
  dashboard.scope = { type: 'personal', userName: name, metaSpend: 'global' };
  return dashboard;
}

module.exports = {
  adminAgentKey,
  adminDisplayName,
  filterSalesRowsForAdmin,
  markPersonalSalesDashboard,
};
