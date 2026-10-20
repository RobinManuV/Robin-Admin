// Server-side config helpers used by request handlers; provider calls and domain rules stay behind this boundary.

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

module.exports = { EXPENSE_ACCOUNTS, EXPENSE_ACCOUNT_ENV, normalizeAccount, configuredExpenseAccounts, expenseAccountNumbers };
