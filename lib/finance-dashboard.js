const { applicationPlanForUser } = require('../shared/financial-config.cjs');
const { getAdminSupabase } = require('./admin-supabase');

const DAY_MS = 86400000;
const MADRID_TZ = 'Europe/Madrid';
const EXPENSE_ACCOUNTS = Object.freeze({
  operational: ['62300000', '62600000', '62700004', '62700005', '62800000', '64900000'],
  marketing: ['62700002', '62700000'],
  other: ['62900000', '67800000', '66800000'],
  capex: ['68170001', '68170002', '68170003', '68170004', '62300002'],
});
const EXPENSE_ACCOUNT_ENV = Object.freeze({
  operational: 'HOLDED_EXPENSE_ACCOUNTS_OPERATIONAL',
  marketing: 'HOLDED_EXPENSE_ACCOUNTS_MARKETING',
  other: 'HOLDED_EXPENSE_ACCOUNTS_OTHER',
  capex: 'HOLDED_EXPENSE_ACCOUNTS_CAPEX',
});
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

function normalizeAccount(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return normalizeAccount(value.id ?? value.number ?? value.code ?? value.account);
  return String(value).trim().toLowerCase();
}

function configuredExpenseAccounts() {
  return Object.fromEntries(Object.entries(EXPENSE_ACCOUNTS).map(([category, defaults]) => {
    const configured = String(process.env[EXPENSE_ACCOUNT_ENV[category]] || '')
      .split(/[;,\n]/)
      .map(normalizeAccount)
      .filter(Boolean);
    return [category, [...new Set([...defaults.map(normalizeAccount), ...configured])]];
  }));
}

function expenseAccountNumbers() {
  return [...new Set(Object.values(configuredExpenseAccounts()).flat())];
}

function madridToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}

function periodBounds(period, today = madridToday()) {
  let end = addDays(today, 1);
  let start;
  let granularity;
  if (period === '30d') { start = addDays(today, -29); granularity = 'day'; }
  else if (period === 'month') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); granularity = 'day'; }
  else if (period === 'last_month') {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    granularity = 'day';
  }
  else if (period === '3m') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)); granularity = 'week'; }
  else if (period === '365d') { start = addDays(today, -364); granularity = 'month'; }
  else {
    const academicYear = today.getUTCMonth() >= 8 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    start = new Date(Date.UTC(academicYear, 8, 1));
    granularity = 'month';
    period = 'ytd';
  }
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

function contractedAmountForUser(user, payments = []) {
  if (!isContractedUserIncluded(user)) return 0;
  return sumPlanForUser(user, payments);
}

function isContractedUserIncluded(user) {
  return Boolean(user && !CONTRACTED_EXCLUDED_CLIENT_IDS.has(String(user.id)));
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
  const accountNumbers = expenseAccountNumbers();
  // El libro diario completo puede superar el límite práctico de paginación.
  // Holded permite filtrar por cuenta: consultamos cada cuenta solicitada para
  // garantizar que no se pierda ningún apunte, incluso en periodos de un año.
  for (let index = 0; index < accountNumbers.length; index += 4) {
    const accounts = accountNumbers.slice(index, index + 4);
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
    account: purchaseLineAccounts(line)[0] || '',
    weight: purchaseLineBase(line),
  }));
  const totalWeight = weightedLines.reduce((total, line) => total + line.weight, 0);
  const trackedAccounts = expenseAccountNumbers();
  const tracked = weightedLines.filter((line) => trackedAccounts.includes(normalizeAccount(line.account)));
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

function purchaseDocumentDate(document) {
  const raw = document?.date ?? document?.issuedAt ?? document?.createdAt ?? document?.created_at;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const numeric = Number(raw);
    const millis = numeric > 100000000000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(raw);
  const date = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function purchaseDocumentLines(document) {
  if (Array.isArray(document?.items)) return document.items;
  if (Array.isArray(document?.products)) return document.products;
  if (Array.isArray(document?.lines)) return document.lines;
  return [];
}

function accountCandidates(value) {
  if (!value || typeof value !== 'object') return [normalizeAccount(value)].filter(Boolean);
  return [value.id, value.number, value.code, value.account].map(normalizeAccount).filter(Boolean);
}

function purchaseLineAccounts(line) {
  return [
    line?.account,
    line?.accountId,
    line?.account_id,
    line?.expAccountId,
    line?.expenseAccountId,
    line?.accountingAccount,
    line?.accountingAccountId,
    line?.accountingAccountNumber,
  ].flatMap(accountCandidates);
}

function purchaseDocumentAccounts(document) {
  return [
    document?.expAccountId,
    document?.expenseAccountId,
    document?.account,
    document?.accountId,
    document?.accountingAccount,
    document?.accountingAccountId,
    document?.accountingAccountNumber,
  ].flatMap(accountCandidates);
}

function expenseCategoryLookup() {
  const lookup = new Map();
  Object.entries(configuredExpenseAccounts()).forEach(([category, accounts]) => {
    accounts.forEach((account) => lookup.set(normalizeAccount(account), category));
  });
  return lookup;
}

function categoryForAccounts(accounts, lookup) {
  for (const account of accounts) {
    const normalized = normalizeAccount(account);
    if (lookup.has(normalized)) return { category: lookup.get(normalized), account: normalized };
  }
  return null;
}

function purchaseLineValue(line) {
  const explicit = line?.subtotal ?? line?.base ?? line?.netAmount ?? line?.net_amount;
  if (explicit !== undefined && explicit !== null && explicit !== '') return Math.abs(amount(explicit));
  return purchaseLineBase(line);
}

function purchaseDocumentBase(document) {
  const explicit = document?.subtotal ?? document?.base ?? document?.netAmount ?? document?.net_amount;
  if (explicit !== undefined && explicit !== null && explicit !== '') return Math.abs(amount(explicit));
  const total = Math.abs(amount(document?.total));
  const tax = Math.abs(amount(document?.tax ?? document?.taxesTotal ?? document?.tax_total));
  return Math.max(0, total - tax);
}

function purchaseDocumentTax(document) {
  const explicit = document?.tax ?? document?.taxesTotal ?? document?.tax_total ?? document?.vat;
  return Math.abs(amount(explicit));
}

function purchaseDocumentsToExpenseEntries(documents, start, end) {
  const lookup = expenseCategoryLookup();
  const bounds = { start, end };
  const entries = [];
  let classifiedDocuments = 0;
  let unclassifiedDocuments = 0;
  let excludedDocuments = 0;

  (documents || []).forEach((document) => {
    const date = purchaseDocumentDate(document);
    if (!validInvoice(document) || !inBounds(date, bounds)) {
      excludedDocuments += 1;
      return;
    }
    const documentType = String(document.documentType || document.docType || document.type || 'purchase').toLowerCase();
    const isRefund = documentType === 'purchaserefund' || documentType === 'purchase_refund';
    const rows = purchaseDocumentLines(document).map((line) => ({
      match: categoryForAccounts(purchaseLineAccounts(line), lookup),
      value: purchaseLineValue(line),
    })).filter((row) => row.match);

    if (!rows.length) {
      const match = categoryForAccounts(purchaseDocumentAccounts(document), lookup);
      if (match) rows.push({ match, value: purchaseDocumentBase(document) });
    }
    if (!rows.length) {
      unclassifiedDocuments += 1;
      return;
    }

    const fallbackShare = purchaseDocumentBase(document) / rows.length;
    const entriesBefore = entries.length;
    rows.forEach((row, line) => {
      const value = round(row.value || fallbackShare);
      if (!value) return;
      entries.push({
        entry_number: `purchase:${document.id || document.docNumber || classifiedDocuments}`,
        line,
        date: ymd(date),
        account: row.match.account,
        category: row.match.category,
        debit: isRefund ? 0 : value,
        credit: isRefund ? value : 0,
        source: 'purchase_document',
      });
    });
    if (entries.length > entriesBefore) {
      const tax = round(purchaseDocumentTax(document));
      if (tax) {
        entries.push({
          entry_number: `purchase-tax:${document.id || document.docNumber || classifiedDocuments}`,
          line: rows.length,
          date: ymd(date),
          account: 'purchase_tax',
          category: 'taxes',
          debit: isRefund ? 0 : tax,
          credit: isRefund ? tax : 0,
          source: 'purchase_document',
        });
      }
      classifiedDocuments += 1;
    }
  });

  return {
    entries,
    documentCount: (documents || []).length,
    classifiedDocuments,
    unclassifiedDocuments,
    excludedDocuments,
  };
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
    paymentCount: payments.length,
    relevantPaymentCount: relevantPayments.length,
    skippedDocuments,
  };
}

async function loadExpenseEntries(start, end, options = {}) {
  let purchaseResult = null;
  let purchaseError = null;
  try {
    const loader = options.listPurchaseDocuments || require('./holded').listPurchaseDocuments;
    const documents = await loader({
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000),
    });
    purchaseResult = purchaseDocumentsToExpenseEntries(documents, start, end);
    if (purchaseResult.documentCount === 0) {
      return {
        ...purchaseResult,
        available: true,
        source: 'purchase_documents',
        diagnostics: {
          status: 'empty',
          code: 'holded_expenses_no_documents',
          documentCount: purchaseResult.documentCount,
          classifiedDocuments: purchaseResult.classifiedDocuments,
          unclassifiedDocuments: purchaseResult.unclassifiedDocuments,
          entryCount: purchaseResult.entries.length,
        },
      };
    }
    if (purchaseResult.entries.length > 0) {
      const partial = purchaseResult.unclassifiedDocuments > 0;
      return {
        ...purchaseResult,
        available: true,
        source: 'purchase_documents',
        diagnostics: {
          status: partial ? 'partial' : 'ok',
          code: partial ? 'holded_expenses_unclassified' : null,
          documentCount: purchaseResult.documentCount,
          classifiedDocuments: purchaseResult.classifiedDocuments,
          unclassifiedDocuments: purchaseResult.unclassifiedDocuments,
          entryCount: purchaseResult.entries.length,
        },
      };
    }
  } catch (error) {
    purchaseError = error?.message || 'holded_purchase_documents_error';
    console.error('holded expense documents warning', purchaseError);
  }

  let cashflowResult;
  try {
    cashflowResult = await listCashflowExpenseEntries(start, end);
  } catch (cashflowError) {
    cashflowResult = { entries: [], skippedDocuments: 0, error: cashflowError.message };
  }

  if (cashflowResult.entries.length > 0 && cashflowResult.skippedDocuments === 0) {
    return {
      ...cashflowResult,
      available: true,
      source: 'cashflow_payments',
      diagnostics: {
        status: 'fallback',
        code: 'holded_expenses_cash_fallback',
        primaryError: purchaseError,
        documentCount: purchaseResult?.documentCount || 0,
        classifiedDocuments: purchaseResult?.classifiedDocuments || 0,
        unclassifiedDocuments: purchaseResult?.unclassifiedDocuments || 0,
        entryCount: cashflowResult.entries.length,
      },
    };
  }

  const fallbackReason = cashflowResult.error
    ? 'cashflow_error'
    : cashflowResult.skippedDocuments > 0 ? 'cashflow_partial' : 'cashflow_empty';
  try {
    const entries = await listLedgerEntries(start, end);
    const available = entries.length > 0 || (!purchaseError && !purchaseResult?.documentCount);
    return {
      ...cashflowResult,
      entries,
      available,
      source: entries.length ? 'daily_ledger' : null,
      fallbackReason,
      diagnostics: {
        status: entries.length ? 'fallback' : available ? 'empty' : 'unavailable',
        code: entries.length ? 'holded_expenses_ledger_fallback' : available ? 'holded_expenses_no_documents' : 'holded_expenses_unclassified',
        primaryError: purchaseError,
        documentCount: purchaseResult?.documentCount || 0,
        classifiedDocuments: purchaseResult?.classifiedDocuments || 0,
        unclassifiedDocuments: purchaseResult?.unclassifiedDocuments || 0,
        entryCount: entries.length,
      },
    };
  } catch (ledgerError) {
    const ledgerErrorCode = ledgerError?.message || 'holded_ledger_error';
    console.error('holded expense ledger warning', ledgerErrorCode);
    return {
      ...cashflowResult,
      entries: [],
      available: false,
      source: null,
      ledgerError: ledgerErrorCode,
      fallbackReason,
      diagnostics: {
        status: 'unavailable',
        code: purchaseResult?.documentCount ? 'holded_expenses_unclassified' : purchaseError || ledgerErrorCode,
        primaryError: purchaseError,
        fallbackError: ledgerErrorCode,
        documentCount: purchaseResult?.documentCount || 0,
        classifiedDocuments: purchaseResult?.classifiedDocuments || 0,
        unclassifiedDocuments: purchaseResult?.unclassifiedDocuments || 0,
        entryCount: 0,
      },
    };
  }
}

function ledgerValue(entry) {
  // Cashflow's monthly result uses a negative `net`/credit for money leaving
  // the business, while expense-account ledger rows use debit minus credit.
  // Supporting both shapes prevents real outgoing movements being clipped to 0.
  if (entry.net !== undefined && entry.net !== null && entry.net !== '') return -amount(entry.net);
  return amount(entry.debit) - amount(entry.credit);
}

function categorizeExpenses(entries, buckets, bounds) {
  const accountToCategory = new Map();
  Object.entries(configuredExpenseAccounts()).forEach(([category, accounts]) => accounts.forEach((account) => accountToCategory.set(normalizeAccount(account), category)));
  const totals = { operational: 0, marketing: 0, taxes: 0, other: 0, capex: 0, payments: 0, total: 0 };
  const byBucket = bucketMap(buckets);
  entries.forEach((entry) => {
    if (entry.status && String(entry.status).toLowerCase() !== 'completed') return;
    const account = normalizeAccount(entry.account ?? entry.accountingAccountNumber ?? entry.account_number ?? entry.account_num);
    const category = entry.category || accountToCategory.get(account);
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
  totals.total = round(totals.payments + totals.taxes);
  return totals;
}

function summarizeExpenses(entries, bounds) {
  return categorizeExpenses(entries, makeBuckets(bounds), bounds);
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
  const signedClients = users.filter((user) => isContractedUserIncluded(user) && user.contract_signed_at && inBounds(new Date(user.contract_signed_at), bounds));
  let contracted = 0;
  contractedClients.forEach((user) => {
    const value = contractedAmountForUser(user, paymentsByUser.get(user.id) || []);
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
  expenses.purchaseTax = round(expenses.taxes);
  expenses.salesTax = round(periodInvoices.reduce((total, invoice) => total + invoiceAmounts(invoice).tax, 0));
  expenses.netTax = round(expenses.salesTax - expenses.purchaseTax);

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
    kpis: { sales, invoices: periodInvoices.length, contracted: round(contracted), students: signedClients.length, cac: null, anomaly },
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
  bucketKey,
  buildFinanceDashboard,
  captureTreasuryHistory,
  cashflowEntriesFromPayments,
  configuredExpenseAccounts,
  contractedAmountForUser,
  isContractedUserIncluded,
  listCashflowExpenseEntries,
  loadExpenseEntries,
  listLedgerEntries,
  formatRange,
  inBounds,
  makeBuckets,
  madridToday,
  periodBounds,
  purchaseDocumentsToExpenseEntries,
  readTreasuryHistory,
  summarizeExpenses,
};
