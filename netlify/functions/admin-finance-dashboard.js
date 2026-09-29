const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const holded = require('../../lib/holded');
const {
  buildFinanceDashboard,
  captureTreasuryHistory,
  listLedgerEntries,
  madridToday,
  periodBounds,
  readTreasuryHistory,
} = require('../../lib/finance-dashboard');

const PERIODS = new Set(['30d', 'month', '3m', '365d', 'ytd']);

async function requireAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const { data: user } = await getSupabase().from('users').select('id,email,username,role').eq('id', session.uid).single();
  return user && isApplicationAdmin(user) ? user : null;
}

async function loadPortalFinanceRows() {
  const sb = getSupabase();
  const [{ data: users, error: usersError }, { data: payments, error: paymentsError }] = await Promise.all([
    sb.from('users').select('id,email,nombre,apellidos,tipo,origin,has_eu_id,num_carreras,contract_signed,contract_signed_at,contract_data,pago_completed,pago_completed_at,created_at,role'),
    sb.from('payments').select('id,user_id,installment,amount,currency,status,unlocked_at,paid_at,invoice_number,payment_data,created_at'),
  ]);
  if (usersError) throw usersError;
  if (paymentsError) throw paymentsError;
  return { users: (users || []).filter((user) => !isApplicationAdmin(user)), payments: payments || [] };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    if (!await requireAdmin(event)) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const requested = String(event.queryStringParameters?.period || 'ytd');
    const period = PERIODS.has(requested) ? requested : 'ytd';
    const bounds = periodBounds(period);
    const invoiceStart = bounds.previousStart < bounds.start ? bounds.previousStart : bounds.start;

    const [invoices, portalRows, ledgerResult] = await Promise.all([
      holded.listSalesInvoices({ start: Math.floor(invoiceStart.getTime() / 1000), end: Math.floor(bounds.end.getTime() / 1000) }),
      loadPortalFinanceRows(),
      listLedgerEntries(bounds.start, bounds.end).then((entries) => ({ entries, available: true })).catch((error) => ({ entries: [], available: false, error: error.message })),
    ]);

    let treasuryHistory = [];
    let treasuryAvailable = true;
    try {
      treasuryHistory = await readTreasuryHistory();
      const today = madridToday().toISOString().slice(0, 10);
      if (!treasuryHistory.length || treasuryHistory[treasuryHistory.length - 1]?.snapshot_date !== today) {
        await captureTreasuryHistory({ includeBackfill: treasuryHistory.length === 0 });
        treasuryHistory = await readTreasuryHistory();
      }
    } catch (error) {
      treasuryAvailable = false;
      console.error('admin-finance-dashboard treasury warning', error && (error.message || error));
    }

    const dashboard = await buildFinanceDashboard({
      period,
      invoices,
      users: portalRows.users,
      payments: portalRows.payments,
      ledgerEntries: ledgerResult.entries,
      treasuryHistory: treasuryAvailable ? treasuryHistory : null,
    });
    dashboard.sources = {
      holdedInvoices: true,
      holdedAccounting: ledgerResult.available,
      portal: true,
      treasury: treasuryAvailable,
      ecb: treasuryAvailable,
    };
    dashboard.warnings = [
      ...(!ledgerResult.available ? ['holded_accounting_unavailable'] : []),
      ...(!treasuryAvailable ? ['treasury_history_unavailable'] : []),
    ];
    return json(dashboard);
  } catch (error) {
    console.error('admin-finance-dashboard error', error);
    return serverError(error, 'admin.finance_dashboard');
  }
};
