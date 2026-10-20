// Server-side expenses helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const { expenseAccountNumbers, normalizeAccount, configuredExpenseAccounts } = require("./config");
const { amount, round, ymd, addDays } = require("./utils");
const { validInvoice } = require("./invoices");
const { inBounds, bucketMap, bucketKey, makeBuckets } = require("./periods");
const { v2List, mapWithConcurrency, v2Fetch, listLedgerEntries } = require("./holded");

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
function inferredExpenseCategory(account = {}) {
  const number = normalizeAccount(account.accountNum ?? account.accountNumber ?? account.number ?? account.code);
  const text = [account.name, account.desc, account.description].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/marketing|publicidad|anuncio|ads|meta|facebook|instagram|google|campan/.test(text) || /^627/.test(number)) return 'marketing';
  if (/amortiz|inmovilizado|activo fijo|equipamiento/.test(text) || /^(20|21|28|68)/.test(number)) return 'capex';
  if (/financier|interes|extraordinari|multa|donacion/.test(text) || /^(66|67)/.test(number)) return 'other';
  return 'operational';
}
function expenseCategoryLookup(expenseAccounts = []) {
  const lookup = new Map();
  Object.entries(configuredExpenseAccounts()).forEach(([category, accounts]) => {
    accounts.forEach((account) => lookup.set(normalizeAccount(account), { category, account: normalizeAccount(account) }));
  });
  (expenseAccounts || []).forEach((expenseAccount) => {
    const ids = [expenseAccount?.id, expenseAccount?._id, expenseAccount?.expenseAccountId].map(normalizeAccount).filter(Boolean);
    const numbers = [expenseAccount?.accountNum, expenseAccount?.accountNumber, expenseAccount?.number, expenseAccount?.code].map(normalizeAccount).filter(Boolean);
    const configuredMatch = [...numbers, ...ids].map((candidate) => lookup.get(candidate)).find(Boolean);
    const resolved = configuredMatch || {
      category: inferredExpenseCategory(expenseAccount),
      account: numbers[0] || ids[0],
    };
    [...ids, ...numbers].forEach((candidate) => lookup.set(candidate, resolved));
  });
  return lookup;
}
function categoryForAccounts(accounts, lookup) {
  for (const account of accounts) {
    const normalized = normalizeAccount(account);
    if (lookup.has(normalized)) {
      const resolved = lookup.get(normalized);
      return typeof resolved === 'string' ? { category: resolved, account: normalized } : resolved;
    }
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
function purchaseDocumentsToExpenseEntries(documents, start, end, expenseAccounts = []) {
  const lookup = expenseCategoryLookup(expenseAccounts);
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
    const holded = require('../holded');
    const loader = options.listPurchaseDocuments || holded.listPurchaseDocuments;
    const accountLoader = options.listExpenseAccounts || holded.listExpenseAccounts;
    const [documents, expenseAccounts] = await Promise.all([
      loader({
      start: Math.floor(start.getTime() / 1000),
      end: Math.floor(end.getTime() / 1000),
      }),
      accountLoader().catch((error) => {
        console.warn('holded expense accounts warning', error?.message || error);
        return [];
      }),
    ]);
    purchaseResult = purchaseDocumentsToExpenseEntries(documents, start, end, expenseAccounts);
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
  const debit = entry.debit ?? entry.debit_amount ?? entry.debitAmount;
  const credit = entry.credit ?? entry.credit_amount ?? entry.creditAmount;
  if (debit !== undefined || credit !== undefined) return amount(debit) - amount(credit);
  const explicit = entry.amount ?? entry.value ?? entry.accounting_amount;
  return explicit === undefined || explicit === null || explicit === '' ? 0 : amount(explicit);
}
function categorizeExpenses(entries, buckets, bounds) {
  const accountToCategory = new Map();
  Object.entries(configuredExpenseAccounts()).forEach(([category, accounts]) => accounts.forEach((account) => accountToCategory.set(normalizeAccount(account), category)));
  const totals = { operational: 0, marketing: 0, taxes: 0, other: 0, capex: 0, payments: 0, total: 0 };
  const byBucket = bucketMap(buckets);
  entries.forEach((entry) => {
    // Las facturas de compra incluyen también gastos pendientes y los asientos
    // usan estados como "posted". Exigir "completed" los descartaba a todos.
    const account = normalizeAccount(entry.account ?? entry.accountingAccountNumber ?? entry.account_number ?? entry.account_num ?? entry.requested_account);
    const category = entry.category || accountToCategory.get(account);
    const date = purchaseDocumentDate(entry);
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

module.exports = { purchaseLineBase, purchaseExpenseShares, cashflowEntriesFromPayments, purchaseDocumentDate, purchaseDocumentLines, accountCandidates, purchaseLineAccounts, purchaseDocumentAccounts, inferredExpenseCategory, expenseCategoryLookup, categoryForAccounts, purchaseLineValue, purchaseDocumentBase, purchaseDocumentTax, purchaseDocumentsToExpenseEntries, listCashflowExpenseEntries, loadExpenseEntries, ledgerValue, categorizeExpenses, summarizeExpenses };
