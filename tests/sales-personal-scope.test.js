const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSalesRowsForAdmin, markPersonalSalesDashboard } = require('../lib/sales-personal-scope');

test('filters sales data to the logged-in administrator', () => {
  const rows = {
    leads: [
      { id: 'lead-manuel', email: 'manuel-client@example.com', owner_names: ['Manuel Fernández'], source_payload: {} },
      { id: 'lead-maria', email: 'maria-client@example.com', owner_names: ['María'], source_payload: {} },
    ],
    users: [
      { id: 'user-manuel', lead_id: 'lead-manuel', email: 'manuel-client@example.com' },
      { id: 'user-maria', lead_id: 'lead-maria', email: 'maria-client@example.com' },
    ],
    payments: [
      { id: 'payment-manuel', user_id: 'user-manuel' },
      { id: 'payment-maria', user_id: 'user-maria' },
    ],
    events: [
      { id: 'event-manuel', lead_id: 'lead-manuel' },
      { id: 'event-maria', lead_id: 'lead-maria' },
    ],
    sessions: [
      { id: 'session-manuel', user_id: 'crm-manuel' },
      { id: 'session-maria', user_id: 'crm-maria' },
    ],
    crmUsers: [
      { id: 'crm-manuel', name: 'Manuel Fernández', email: 'manuel@project-robin.com' },
      { id: 'crm-maria', name: 'María', email: 'maria@project-robin.com' },
    ],
    applications: [
      { id: 'application-manuel', lead_id: 'lead-manuel' },
      { id: 'application-maria', lead_id: 'lead-maria' },
    ],
    historicalFacts: [
      { id: 'historical-manuel', manager: 'Manuel' },
      { id: 'historical-maria', manager: 'María' },
      { id: 'historical-varios', manager: 'Varios' },
    ],
    availability: { events: true },
  };

  const filtered = filterSalesRowsForAdmin(rows, { nombre: 'Manuel', email: 'manuel@project-robin.com' });

  assert.deepEqual(filtered.leads.map((row) => row.id), ['lead-manuel']);
  assert.deepEqual(filtered.users.map((row) => row.id), ['user-manuel']);
  assert.deepEqual(filtered.payments.map((row) => row.id), ['payment-manuel']);
  assert.deepEqual(filtered.events.map((row) => row.id), ['event-manuel']);
  assert.deepEqual(filtered.sessions.map((row) => row.id), ['session-manuel']);
  assert.deepEqual(filtered.applications.map((row) => row.id), ['application-manuel']);
  assert.deepEqual(filtered.historicalFacts.map((row) => row.id), ['historical-manuel']);
  assert.equal(filtered.availability.events, true);
});

test('marks Meta spend as global and keeps only the personal agent rows', () => {
  const dashboard = {
    agents: [{ key: 'manuel' }, { key: 'maria' }],
    team: {
      agents: [{ key: 'manuel' }, { key: 'maria' }],
      fifo: [{ key: 'manuel' }, { key: 'maria' }],
    },
  };

  const result = markPersonalSalesDashboard(dashboard, { nombre: 'Manuel' });

  assert.deepEqual(result.agents.map((row) => row.key), ['manuel']);
  assert.deepEqual(result.team.agents.map((row) => row.key), ['manuel']);
  assert.deepEqual(result.team.fifo.map((row) => row.key), ['manuel']);
  assert.deepEqual(result.scope, { type: 'personal', userName: 'Manuel', metaSpend: 'global' });
});
