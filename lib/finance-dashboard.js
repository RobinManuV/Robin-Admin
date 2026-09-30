const { applicationPlanForUser } = require('../shared/financial-config.cjs');
const { getAdminSupabase } = require('./admin-supabase');

const DAY_MS = 86400000;
const MADRID_TZ = 'Europe/Madrid';
const EXPENSE_ACCOUNTS = Object.freeze({
  operational: [62300000, 62600000, 62700004, 62700005, 62800000, 64900000],
  marketing: [62700002, 62700000],
  other: [62900000, 67800000, 66800000],
  capex: [68170001, 68170002, 68170003, 68170004, 62300002],
});
const EXPENSE_ACCOUNT_NUMBERS = [...new Set(Object.values(EXPENSE_ACCOUNTS).flat())];
const CONTRACTED_EXCLUDED_CLIENT_IDS = new Set([
  '561bcb03-ce90-4908-bb83-7402ecca02d1', // Santiago Martin Miguel
  '1aa03c5e-f616-4f16-9abf-740f85ade79a', // Daniel Hollingsworth
]);
const CONTRACTED_AMOUNT_OVERRIDES = new Map([
  ['57985b08-3665-4ae2-b1b4-bc5b2bc49048', 2799], // Brais Barreira Valiña
  ['07a59e65-45bf-46e2-b7f4-6bbaede492ac', 2199], // Mateo Roetti Gomez
]);

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const amount = (value) => Number(value || 0);
const ymd = (date) => date.toISOString().slice(0, 10);
const fromUnix = (value) => value ? new Date(Number(value) * 1000) : null;
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date, count) => new Date(date.getTime() + count * DAY_MS);
const addMonths = (date, count) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, date.getUTCDate()));

function madridToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}

function periodBounds(period, today = madridToday()) {
  const end = addDays(today, 1);
  let start;
  let granularity;
  if (period === '30d') { start = addDays(today, -29); granularity = 'day'; }
  else if (period === 'month') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); granularity = 'day'; }
  else if (period === '3m') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)); granularity = 'week'; }
  else if (period === '365d') { start = addDays(today, -364); granularity = 'month'; }
  else { start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1)); granularity = 'month'; period = 'ytd'; }
  return {
    id: period,
    start,
    end,
    previousStart: new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate())),
    previousEnd: new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate())),
    granularity,
  };
}

function inBounds(date, bounds) {
  return date && date >= bounds.start && date < bounds.end;
}

function isCancelled(invoice) {
  const text = [invoice.statusName, invoice.statusText, invoice.state, invoice.docStatus].filter(Boolean).join(' ').toLowerCase();
  return Boolean(Number(invoice.status) === 3 || invoice.cancelled || invoice.canceled || invoice.isCancelled || invoice.isCanceled || invoice.voided || /anulad|cancel|void/.test(text));
}

function validInvoice(invoice) {
  return !invoice.draft && !isCancelled(invoice);
}

function invoiceStatus(invoice, nowSec = Math.floor(Date.now() / 1000)) {
  if (invoice.draft) return 'draft';
  if (amount(invoice.paymentsPending) <= 0 || Number(invoice.status) === 1) return 'paid';
  if (Number(invoice.status) === 2 || (amount(invoice.paymentsTotal) > 0 && amount(invoice.paymentsPending) > 0)) return 'partial';
  if (invoice.dueDate && Number(invoice.dueDate) < nowSec) return 'overdue';
  return 'pending';
}

function invoiceAmounts(invoice) {
  const total = amount(invoice.total);
  const collected = Math.min(total, Math.max(0, amount(invoice.paymentsTotal)));
  return { total, collected, pending: Math.max(0, total - collected), tax: amount(invoice.tax), subtotal: amount(invoice.subtotal) };
}

function weekStart(date) {
  const day = date.getUTCDay() || 7;
  return addDays(startOfUtcDay(date), 1 - day);
}

function bucketKey(date, granularity) {
  if (granularity === 'day') return ymd(startOfUtcDay(date));
  if (granularity === 'week') return ymd(weekStart(date));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function bucketLabel(date, granularity) {
  if (granularity === 'day') return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
  if (granularity === 'week') return `Sem. ${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date).replace('.', '')}`;
  return new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
}

function makeBuckets(bounds) {
  const buckets = [];
  let cursor = bounds.granularity === 'week' ? weekStart(bounds.start) : bounds.granularity === 'month' ? new Date(Date.UTC(bounds.start.getUTCFullYear(), bounds.start.getUTCMonth(), 1)) : bounds.start;
  while (cursor < bounds.end) {
    buckets.push({ key: bucketKey(cursor, bounds.granularity), label: bucketLabel(cursor, bounds.granularity), sales: 0, collected: 0, pending: 0, contracted: 0, newClients: 0, expenses: 0, previousSales: 0 });
    cursor = bounds.granularity === 'day' ? addDays(cursor, 1) : bounds.granularity === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1);
  }
  return buckets;
}

function bucketMap(buckets) {
  return new Map(buckets.map((bucket) => [bucket.key, bucket]));
}

function sumPlanForUser(user, payments) {
  const override = CONTRACTED_AMOUNT_OVERRIDES.get(String(user.id));
  if (override !== undefined) return round(override);
  const plan = applicationPlanForUser(user);
  const byInstallment = new Map(payments.map((payment) => [Number(payment.installment), payment]));
  return round(plan.reduce((total, planned) => total + amount(byInstallment.get(planned.installment)?.amount ?? planned.amount), 0));
}

function isLatam(user) {
  return String(user.origin || '').toLowerCase() === 'otros' && user.has_eu_id === false;
}

async function v2Fetch(path, params = {}) {
  const token = String(process.env.HOLDED_API_PAT || '').trim();
  if (!token) throw new Error('holded_v2_not_configured');
  const url = new URL(`https://api.holded.com/api/v2${path}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`holded_v2_http_${response.status}`);
    error.detail = payload;
    throw error;
  }
  return payload;
}

async function v2List(path, params = {}, maxPages = 50) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await v2Fetch(path, { ...params, ...(cursor ? { cursor } : {}) });
    items.push(...(Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []));
    if (!payload?.has_more || !payload?.cursor) break;
    cursor = payload.cursor;
  }
  return items;
}

async function listLedgerEntries(start, end) {
  const params = { start_date: ymd(start), end_date: ymd(addDays(end, -1)), limit: 200 };
  const entries = [];
  // El libro diario completo puede superar el límite práctico de paginación.
  // Holded permite filtrar por cuenta: consultamos cada cuenta solicitada para
  // garantizar que no se pierda ningún apunte, incluso en periodos de un año.
  for (let index = 0; index < EXPENSE_ACCOUNT_NUMBERS.length; index += 4) {
    const accounts = EXPENSE_ACCOUNT_NUMBERS.slice(index, index + 4);
    const groups = await Promise.all(accounts.map((account) => v2List('/ledger-entries', { ...params, account }, 100)));
    groups.forEach((group) => entries.push(...group));
  }
  const unique = new Map();
  entries.forEach((entry) => {
    const key = [entry.entry_number, entry.line, entry.account ?? entry.account_number ?? entry.account_num, entry.date].join(':');
    unique.set(key, entry);
  });
  return [...unique.values()];
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function purchaseLineBase(line) {
  if (String(line?.type || '').toLowerCase() === 'title') return 0;
  const units = Number(line?.units ?? 1);
  const price = Number(line?.price ?? 0);
  const discount = Math.min(100, Math.max(0, Number(line?.discount ?? 0)));
  const base = units * price * (1 - discount / 100);
  return Number.isFinite(base) ? Math.max(0, base) : 0;
}

function purchaseExpenseShares(document) {
  const lines = Array.isArray(document?.lines) ? document.lines : Array.isArray(document?.items) ? document.items : [];
  const weightedLines = lines.map((line) => ({
    account: Number(line?.account),
    weight: purchaseLineBase(line),
  }));
  const totalWeight = weightedLines.reduce((total, line) => total + line.weight, 0);
  const tracked = weightedLines.filter((line) => EXPENSE_ACCOUNT_NUMBERS.includes(line.account));
  if (!tracked.length) return [];
  if (totalWeight > 0) return tracked.map((line) => ({ account: line.account, share: line.weight / totalWeight }));
  return tracked.map((line) => ({ account: line.account, share: 1 / tracked.length }));
}

function cashflowEntriesFromPayments(payments, documentsByKey) {
  const entries = [];
  payments.forEach((payment) => {
    const documentType = String(payment.document_type || '').toLowerCase();
    if (!['purchase', 'purchaserefund'].includes(documentType) || !payment.document_id) return;
    const document = documentsByKey.get(`${documentType}:${payment.document_id}`);
    const shares = purchaseExpenseShares(document);
    const paymentAmount = Math.abs(amount(payment.amount));
    if (!paymentAmount || !shares.length) return;
    shares.forEach(({ account, share }, line) => {
      const value = round(paymentAmount * share);
      entries.push({
        entry_number: `cashflow:${payment.id}`,
        line,
        date: payment.date,
        account,
        debit: documentType === 'purchase' ? value : 0,
        credit: documentType === 'purchaserefund' ? value : 0,
      });
    });
  });
  return entries;
}

async function listCashflowExpenseEntries(start, end) {
  const payments = await v2List('/payments', {
    start_date: ymd(start),
    end_date: ymd(addDays(end, -1)),
    limit: 200,
  }, 100);
  const relevantPayments = payments.filter((payment) => (
    ['purchase', 'purchaserefund'].includes(String(payment.document_type || '').toLowerCase())
    && payment.document_id
  ));
  const documentRefs = [...new Map(relevantPayments.map((payment) => {
    const type = String(payment.document_type).toLowerCase();
    return [`${type}:${payment.document_id}`, { type, id: String(payment.document_id) }];
  })).entries()];
  let skippedDocuments = 0;
  const documents = await mapWithConcurrency(documentRefs, 6, async ([key, ref]) => {
    const path = ref.type === 'purchase'
      ? `/purchases/${encodeURIComponent(ref.id)}`
      : `/purchases/refund/${encodeURIComponent(ref.id)}`;
    try {
      return [key, await v2Fetch(path)];
    } catch (error) {
      if (error?.message === 'holded_v2_http_404') {
        skippedDocuments += 1;
        return [key, null];
      }
      throw error;
    }
  });
  return {
    entries: cashflowEntriesFromPayments(relevantPayments, new Map(documents)),
    skippedDocuments,
  };
}

function ledgerValue(entry) {
  return amount(entry.debit) - amount(entry.credit);
}

function categorizeExpenses(entries, buckets, bounds) {
  const accountToCategory = new Map();
  Object.entries(EXPENSE_ACCOUNTS).forEach(([category, accounts]) => accounts.forEach((account) => accountToCategory.set(account, category)));
  const totals = { operational: 0, marketing: 0, taxes: 0, other: 0, capex: 0, payments: 0, total: 0 };
  const byBucket = bucketMap(buckets);
  entries.forEach((entry) => {
    const account = Number(entry.account ?? entry.account_number ?? entry.account_num);
    const category = accountToCategory.get(account);
    const rawDate = String(entry.date || '');
    const date = rawDate ? new Date(rawDate.length === 10 ? `${rawDate}T00:00:00.000Z` : rawDate) : null;
    if (!category || !inBounds(date, bounds)) return;
    const value = ledgerValue(entry);
    totals[category] += value;
    const bucket = byBucket.get(bucketKey(date, bounds.granularity));
    if (bucket) bucket.expenses += value;
  });
  Object.keys(totals).forEach((key) => { totals[key] = round(Math.max(0, totals[key])); });
  totals.payments = round(totals.operational + totals.marketing + totals.other + totals.capex);
  totals.total = totals.payments;
  return totals;
}

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

function formatRange(bounds) {
  const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt.format(bounds.start).replace('.', '')} – ${fmt.format(addDays(bounds.end, -1)).replace('.', '')}`;
}

async function buildFinanceDashboard({ period, invoices, users, payments, ledgerEntries, treasuryHistory }) {
  const bounds = periodBounds(period);
  const buckets = makeBuckets(bounds);
  const byBucket = bucketMap(buckets);
  const periodInvoices = invoices.filter(validInvoice).filter((invoice) => inBounds(fromUnix(invoice.date), bounds));
  const previousInvoices = invoices.filter(validInvoice).filter((invoice) => {
    const date = fromUnix(invoice.date);
    return date && date >= bounds.previousStart && date < bounds.previousEnd;
  });

  periodInvoices.forEach((invoice) => {
    const date = fromUnix(invoice.date);
    const bucket = byBucket.get(bucketKey(date, bounds.granularity));
    if (!bucket) return;
    const values = invoiceAmounts(invoice);
    bucket.sales += values.total;
    bucket.collected += values.collected;
    bucket.pending += values.pending;
  });
  previousInvoices.forEach((invoice) => {
    const shifted = new Date(Date.UTC(fromUnix(invoice.date).getUTCFullYear() + 1, fromUnix(invoice.date).getUTCMonth(), fromUnix(invoice.date).getUTCDate()));
    const bucket = byBucket.get(bucketKey(shifted, bounds.granularity));
    if (bucket) bucket.previousSales += invoiceAmounts(invoice).total;
  });

  const paymentsByUser = new Map();
  payments.forEach((payment) => {
    if (!paymentsByUser.has(payment.user_id)) paymentsByUser.set(payment.user_id, []);
    paymentsByUser.get(payment.user_id).push(payment);
  });
  const contractedClients = users.filter((user) => (
    !CONTRACTED_EXCLUDED_CLIENT_IDS.has(String(user.id))
    && user.pago_completed_at
    && inBounds(new Date(user.pago_completed_at), bounds)
  ));
  const signedClients = users.filter((user) => user.contract_signed_at && inBounds(new Date(user.contract_signed_at), bounds));
  let contracted = 0;
  contractedClients.forEach((user) => {
    const value = sumPlanForUser(user, paymentsByUser.get(user.id) || []);
    contracted += value;
    const bucket = byBucket.get(bucketKey(new Date(user.pago_completed_at), bounds.granularity));
    if (bucket) bucket.contracted += value;
  });
  signedClients.forEach((user) => {
    const bucket = byBucket.get(bucketKey(new Date(user.contract_signed_at), bounds.granularity));
    if (bucket) bucket.newClients += 1;
  });

  const paymentByHoldedId = new Map();
  const paymentByNumber = new Map();
  payments.forEach((payment) => {
    const data = payment.payment_data || {};
    if (data.holded_invoice_id) paymentByHoldedId.set(String(data.holded_invoice_id), payment);
    if (data.holded_invoice_num) paymentByNumber.set(String(data.holded_invoice_num), payment);
    if (payment.invoice_number) paymentByNumber.set(String(payment.invoice_number), payment);
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  const paymentForInvoice = (invoice) => paymentByHoldedId.get(String(invoice.id)) || paymentByNumber.get(String(invoice.docNumber || ''));

  const expenses = categorizeExpenses(ledgerEntries, buckets, bounds);
  let taxes = 0;
  periodInvoices.forEach((invoice) => {
    const payment = paymentForInvoice(invoice);
    const user = payment ? usersById.get(payment.user_id) : null;
    if (user && isLatam(user)) return;
    const values = invoiceAmounts(invoice);
    const invoiceTax = !user
      ? (values.total ? values.collected * Math.min(1, Math.max(0, values.tax / values.total)) : 0)
      : values.collected * 21 / 121;
    taxes += invoiceTax;
    const date = fromUnix(invoice.date);
    const bucket = date ? byBucket.get(bucketKey(date, bounds.granularity)) : null;
    if (bucket) bucket.expenses += invoiceTax;
  });
  expenses.taxes = round(taxes);
  expenses.payments = round(expenses.operational + expenses.marketing + expenses.other + expenses.capex);
  expenses.total = round(expenses.payments + expenses.taxes);

  let cumulativeContracted = 0;
  let cumulativeCollected = 0;
  buckets.forEach((bucket, index) => {
    cumulativeContracted += bucket.contracted;
    cumulativeCollected += bucket.collected;
    Object.keys(bucket).forEach((key) => { if (typeof bucket[key] === 'number') bucket[key] = round(bucket[key]); });
    bucket.cumulativeContracted = round(cumulativeContracted);
    bucket.cumulativeCollected = round(cumulativeCollected);
    bucket.tick = (buckets.length <= 13 || index % 5 === 0 || index === buckets.length - 1) ? bucket.label : '';
  });

  const sales = round(periodInvoices.reduce((total, invoice) => total + invoiceAmounts(invoice).total, 0));
  const collected = round(periodInvoices.reduce((total, invoice) => total + invoiceAmounts(invoice).collected, 0));
  const pending = round(Math.max(0, sales - collected));
  const invoiceRows = periodInvoices.sort((a, b) => Number(b.date || 0) - Number(a.date || 0)).map((invoice) => {
    const payment = paymentForInvoice(invoice);
    const user = payment ? usersById.get(payment.user_id) : null;
    const count = user ? applicationPlanForUser(user).length : null;
    const values = invoiceAmounts(invoice);
    return { id: invoice.id, number: invoice.docNumber || '—', customer: invoice.contactName || '—', clientType: user?.tipo || null, installment: payment && count ? `Pago ${payment.installment} de ${count}` : null, date: fromUnix(invoice.date) ? ymd(fromUnix(invoice.date)) : null, base: round(values.subtotal), tax: round(values.tax), total: round(values.total), status: invoiceStatus(invoice), currency: String(invoice.currency || 'EUR').toUpperCase() };
  });
  const anomaly = contracted < sales;

  return {
    period: bounds.id,
    rangeLabel: formatRange(bounds),
    granularity: bounds.granularity,
    syncedAt: new Date().toISOString(),
    available: true,
    kpis: { sales, invoices: periodInvoices.length, contracted: round(contracted), students: signedClients.length, cac: signedClients.length ? round(expenses.marketing / signedClients.length) : null, anomaly },
    buckets,
    collections: { sales, collected, emitted: sales, contracted: round(contracted), invoices: periodInvoices.length, pending, averageInvoice: periodInvoices.length ? round(sales / periodInvoices.length) : null, averageTicket: signedClients.length ? round(contracted / signedClients.length) : null },
    expenses,
    invoices: invoiceRows,
    cash: { available: Array.isArray(treasuryHistory), points: (treasuryHistory || []).map((row) => ({ date: row.snapshot_date, balance: amount(row.total_eur), source: row.source })), accounts: treasuryHistory?.at(-1)?.accounts || [] },
    reports: { profitAndLoss: 'wip', balance: 'wip' },
  };
}

module.exports = {
  EXPENSE_ACCOUNTS,
  buildFinanceDashboard,
  captureTreasuryHistory,
  cashflowEntriesFromPayments,
  listCashflowExpenseEntries,
  listLedgerEntries,
  madridToday,
  periodBounds,
  readTreasuryHistory,
};
