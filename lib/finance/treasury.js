// Server-side treasury helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const { ymd, amount, addDays, addMonths, round } = require("./utils");
const { v2List } = require("./holded");
const { madridToday } = require("./periods");
const { getAdminSupabase } = require("../admin-supabase");

async function ecbRates() {
  const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.csv', { headers: { Accept: 'text/csv' } });
  if (!response.ok) throw new Error(`ecb_http_${response.status}`);
  const rows = (await response.text()).trim().split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim()));
  const currencies = rows[0].slice(1);
  return rows.slice(1).map((row) => ({ date: row[0], rates: Object.fromEntries(currencies.map((currency, index) => [currency, Number(row[index + 1])]).filter(([, value]) => Number.isFinite(value) && value > 0)) }));
}
function rateFor(rows, currency, date) {
  const code = String(currency || 'EUR').toUpperCase();
  if (code === 'EUR') return 1;
  const target = typeof date === 'string' ? date : ymd(date);
  const row = rows.find((item) => item.date <= target && item.rates[code]);
  return row?.rates?.[code] || null;
}
function signedMovement(movement) {
  const value = amount(movement.amount ?? movement.accounting_amount);
  if (movement.sign === 'out') return -Math.abs(value);
  if (movement.sign === 'in') return Math.abs(value);
  return value;
}
async function treasuryAccounts() {
  return v2List('/treasury/accounts', { archived: false, limit: 50 });
}
async function treasuryMovements(account, start, end) {
  const suffix = account.type === 'cash' ? 'cash-movements' : 'bank-movements';
  return v2List(`/treasury/accounts/${encodeURIComponent(account.id)}/${suffix}`, { start_date: ymd(start), end_date: ymd(end), limit: 200 });
}
function monthEndDates(today) {
  const dates = [];
  for (let offset = 12; offset >= 1; offset -= 1) {
    const firstCurrent = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const cutoff = addDays(addMonths(firstCurrent, 1 - offset), -1);
    if (cutoff >= addDays(today, -365)) dates.push(cutoff);
  }
  return dates;
}
async function computeTreasurySnapshots({ includeBackfill = false } = {}) {
  const today = madridToday();
  const cutoffs = includeBackfill ? [...monthEndDates(today), today] : [today];
  const start = addDays(cutoffs[0], -2);
  const [accounts, rates] = await Promise.all([treasuryAccounts(), ecbRates()]);
  const movementSets = await Promise.all(accounts.map(async (account) => ({ account, movements: await treasuryMovements(account, start, today) })));
  return cutoffs.map((cutoff) => {
    const accountRows = [];
    let totalEur = 0;
    movementSets.forEach(({ account, movements }) => {
      const current = amount(account.balance);
      const movementAfterCutoff = movements.reduce((total, movement) => {
        const rawDate = movement.value_date || movement.booking_date || movement.date;
        const date = rawDate ? new Date(rawDate) : null;
        return date && date >= addDays(cutoff, 1) ? total + signedMovement(movement) : total;
      }, 0);
      const nativeBalance = round(current - movementAfterCutoff);
      const rate = rateFor(rates, account.currency, cutoff);
      const eurBalance = rate ? round(nativeBalance / rate) : null;
      if (eurBalance !== null) totalEur += eurBalance;
      accountRows.push({ id: account.id, name: account.name, type: account.type, currency: String(account.currency || 'EUR').toUpperCase(), balance: nativeBalance, rate_to_eur: rate ? round(1 / rate) : null, balance_eur: eurBalance });
    });
    return { snapshot_date: ymd(cutoff), total_eur: round(totalEur), accounts: accountRows, fx_rates: Object.fromEntries([...new Set(accountRows.map((row) => row.currency))].map((currency) => [currency, accountRows.find((row) => row.currency === currency)?.rate_to_eur ?? null])), source: cutoff.getTime() === today.getTime() ? 'scheduled' : 'holded_month_end', captured_at: new Date().toISOString() };
  });
}
async function saveTreasurySnapshots(rows) {
  const admin = getAdminSupabase();
  const { error } = await admin.from('finance_treasury_snapshots').upsert(rows, { onConflict: 'snapshot_date' });
  if (error) throw error;
  return rows;
}
async function captureTreasuryHistory(options = {}) {
  const rows = await computeTreasurySnapshots(options);
  return saveTreasurySnapshots(rows);
}
async function readTreasuryHistory() {
  const start = ymd(addDays(madridToday(), -365));
  const admin = getAdminSupabase();
  const { data, error } = await admin.from('finance_treasury_snapshots').select('snapshot_date,total_eur,accounts,source,captured_at').gte('snapshot_date', start).order('snapshot_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

module.exports = { ecbRates, rateFor, signedMovement, treasuryAccounts, treasuryMovements, monthEndDates, computeTreasurySnapshots, saveTreasurySnapshots, captureTreasuryHistory, readTreasuryHistory };
