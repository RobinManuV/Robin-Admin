const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinanceDashboard,
  loadExpenseEntries,
  periodBounds,
  purchaseDocumentsToExpenseEntries,
  summarizeExpenses,
} = require('../lib/finance-dashboard');

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-10-01T00:00:00.000Z');
const bounds = { start, end, granularity: 'day' };

test('uses July 1 for YTD and supports rolling and custom date ranges', () => {
  const today = new Date('2026-10-08T00:00:00.000Z');
  const ytd = periodBounds('ytd', today);
  const rolling = periodBounds('3m', today);
  const custom = periodBounds('custom', today, { from: '2026-08-15', to: '2026-09-30' });

  assert.equal(ytd.start.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(ytd.end.toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(rolling.start.toISOString(), '2026-07-08T00:00:00.000Z');
  assert.equal(rolling.end.toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(custom.start.toISOString(), '2026-08-15T00:00:00.000Z');
  assert.equal(custom.end.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(custom.granularity, 'day');
});

test('classifies purchase invoices and purchase refunds by accounting date', () => {
  const result = purchaseDocumentsToExpenseEntries([
    {
      id: 'purchase-1',
      documentType: 'purchase',
      date: Math.floor(new Date('2026-09-10T00:00:00.000Z').getTime() / 1000),
      subtotal: 1000,
      tax: 210,
      items: [{ account: '62700002', units: 1, price: 1000 }],
    },
    {
      id: 'refund-1',
      documentType: 'purchaserefund',
      date: Math.floor(new Date('2026-09-11T00:00:00.000Z').getTime() / 1000),
      subtotal: 100,
      tax: 21,
      items: [{ account: '62700002', units: 1, price: 100 }],
    },
  ], start, end);

  assert.equal(result.documentCount, 2);
  assert.equal(result.classifiedDocuments, 2);
  assert.equal(result.unclassifiedDocuments, 0);
  assert.equal(result.entries.length, 4);

  const totals = summarizeExpenses(result.entries, bounds);
  assert.equal(totals.marketing, 900);
  assert.equal(totals.taxes, 189);
  assert.equal(totals.payments, 900);
  assert.equal(totals.total, 1089);
});

test('accepts internal Holded account IDs configured through environment variables', () => {
  const previous = process.env.HOLDED_EXPENSE_ACCOUNTS_MARKETING;
  process.env.HOLDED_EXPENSE_ACCOUNTS_MARKETING = 'internal-marketing-id';
  try {
    const result = purchaseDocumentsToExpenseEntries([{
      id: 'purchase-internal',
      documentType: 'purchase',
      date: '2026-09-15',
      subtotal: 450,
      tax: 94.5,
      expAccountId: 'internal-marketing-id',
      items: [],
    }], start, end);
    const totals = summarizeExpenses(result.entries, bounds);
    assert.equal(result.classifiedDocuments, 1);
    assert.equal(totals.marketing, 450);
    assert.equal(totals.taxes, 94.5);
  } finally {
    if (previous === undefined) delete process.env.HOLDED_EXPENSE_ACCOUNTS_MARKETING;
    else process.env.HOLDED_EXPENSE_ACCOUNTS_MARKETING = previous;
  }
});

test('distinguishes a valid empty Holded response from an unavailable integration', async () => {
  const result = await loadExpenseEntries(start, end, { listPurchaseDocuments: async () => [] });
  assert.equal(result.available, true);
  assert.equal(result.source, 'purchase_documents');
  assert.equal(result.diagnostics.status, 'empty');
  assert.equal(result.diagnostics.code, 'holded_expenses_no_documents');
});

test('reports purchase documents whose expense accounts are not configured', () => {
  const result = purchaseDocumentsToExpenseEntries([{
    id: 'purchase-unclassified',
    documentType: 'purchase',
    date: '2026-09-20',
    subtotal: 300,
    items: [{ account: 'unknown-account', units: 1, price: 300 }],
  }], start, end);
  assert.equal(result.classifiedDocuments, 0);
  assert.equal(result.unclassifiedDocuments, 1);
  assert.deepEqual(result.entries, []);
});

test('resolves Holded internal expense account ids through the expense account catalogue', () => {
  const result = purchaseDocumentsToExpenseEntries([{
    id: 'purchase-catalogued',
    documentType: 'purchase',
    date: Math.floor(Date.parse('2026-09-12T00:00:00Z') / 1000),
    subtotal: 250,
    tax: 52.5,
    total: 302.5,
    expAccountId: 'internal-meta-account',
    items: [],
  }], new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'), [{
    id: 'internal-meta-account',
    name: 'Publicidad y campañas',
    accountNum: 62700002,
  }]);

  assert.equal(result.classifiedDocuments, 1);
  assert.equal(result.unclassifiedDocuments, 0);
  assert.equal(result.entries[0].category, 'marketing');
  assert.equal(result.entries[0].debit, 250);
  assert.equal(result.entries[1].category, 'taxes');
  assert.equal(result.entries[1].debit, 52.5);
});

test('calculates VAT payable as sales VAT minus purchase VAT', async () => {
  const purchaseResult = purchaseDocumentsToExpenseEntries([{
    id: 'purchase-vat',
    documentType: 'purchase',
    date: '2026-09-12',
    subtotal: 100,
    tax: 21,
    items: [{ account: '62300000', units: 1, price: 100 }],
  }], start, end);
  const dashboard = await buildFinanceDashboard({
    period: 'last_month',
    invoices: [{ id: 'sale-vat', date: Math.floor(new Date('2026-09-10T00:00:00.000Z').getTime() / 1000), subtotal: 1000, tax: 210, total: 1210, paymentsTotal: 1210, paymentsPending: 0, status: 1 }],
    users: [],
    payments: [],
    ledgerEntries: purchaseResult.entries,
    treasuryHistory: [],
  });
  assert.equal(dashboard.expenses.purchaseTax, 21);
  assert.equal(dashboard.expenses.salesTax, 210);
  assert.equal(dashboard.expenses.netTax, 189);
  assert.equal(dashboard.expenses.total, 121);
  assert.equal(dashboard.buckets.reduce((total, bucket) => total + bucket.expenses, 0), 121);
});

test('keeps posted Holded ledger rows and the account used to request them', () => {
  const totals = summarizeExpenses([{
    entry_number: 'ledger-1',
    date: Math.floor(new Date('2026-09-18T00:00:00.000Z').getTime() / 1000),
    requested_account: '62700002',
    status: 'posted',
    amount: 350,
  }], bounds);

  assert.equal(totals.marketing, 350);
  assert.equal(totals.payments, 350);
  assert.equal(totals.total, 350);
});
