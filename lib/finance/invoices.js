const { amount } = require("./utils");

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

module.exports = { isCancelled, validInvoice, invoiceStatus, invoiceAmounts };
