const utils = require('./finance/utils');
const periods = require('./finance/periods');
const config = require('./finance/config');
const invoices = require('./finance/invoices');
const contracted = require('./finance/contracted');
const holded = require('./finance/holded');
const expenses = require('./finance/expenses');
const treasury = require('./finance/treasury');
const dashboard = require('./finance/dashboard');

module.exports = { EXPENSE_ACCOUNTS: config.EXPENSE_ACCOUNTS,
  bucketKey: periods.bucketKey,
  buildFinanceDashboard: dashboard.buildFinanceDashboard,
  captureTreasuryHistory: treasury.captureTreasuryHistory,
  cashflowEntriesFromPayments: expenses.cashflowEntriesFromPayments,
  configuredExpenseAccounts: config.configuredExpenseAccounts,
  contractedAmountForUser: contracted.contractedAmountForUser,
  isContractedUserIncluded: contracted.isContractedUserIncluded,
  listCashflowExpenseEntries: expenses.listCashflowExpenseEntries,
  loadExpenseEntries: expenses.loadExpenseEntries,
  listLedgerEntries: holded.listLedgerEntries,
  formatRange: dashboard.formatRange,
  inBounds: periods.inBounds,
  makeBuckets: periods.makeBuckets,
  madridToday: periods.madridToday,
  periodBounds: periods.periodBounds,
  purchaseDocumentsToExpenseEntries: expenses.purchaseDocumentsToExpenseEntries,
  readTreasuryHistory: treasury.readTreasuryHistory,
  summarizeExpenses: expenses.summarizeExpenses };
