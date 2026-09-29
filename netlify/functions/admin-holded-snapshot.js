const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const holded = require('../../lib/holded');

const amount = (value) => Number(value || 0);
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const isoDate = (unix) => unix ? new Date(Number(unix) * 1000).toISOString().slice(0, 10) : null;

function statusFor(invoice, nowSec) {
  if (invoice.draft) return 'draft';
  if (Number(invoice.status) === 1 || amount(invoice.paymentsPending) <= 0) return 'paid';
  if (Number(invoice.status) === 2) return 'partial';
  if (Number(invoice.status) === 3 || (invoice.dueDate && Number(invoice.dueDate) < nowSec)) return 'overdue';
  return 'pending';
}

function isCancelled(invoice) {
  const text = [invoice.statusName, invoice.statusText, invoice.state, invoice.docStatus].filter(Boolean).join(' ').toLowerCase();
  return Boolean(Number(invoice.status) === 3 || invoice.cancelled || invoice.canceled || invoice.isCancelled || invoice.isCanceled || invoice.voided || /anulad|cancel|void/.test(text));
}

function totals(invoices, nowSec) {
  const valid = invoices.filter((invoice) => !invoice.draft && !isCancelled(invoice));
  const billed = valid.reduce((sum, invoice) => sum + amount(invoice.total), 0);
  const base = valid.reduce((sum, invoice) => sum + amount(invoice.subtotal), 0);
  const collected = valid.reduce((sum, invoice) => {
    const gross = amount(invoice.total);
    const paidRatio = gross > 0 ? Math.min(1, Math.max(0, amount(invoice.paymentsTotal) / gross)) : 0;
    return sum + amount(invoice.subtotal) * paidRatio;
  }, 0);
  const tax = valid.reduce((sum, invoice) => sum + amount(invoice.tax), 0);
  const statuses = valid.map((invoice) => statusFor(invoice, nowSec));
  const overdue = valid.reduce((sum, invoice, index) => {
    if (statuses[index] !== 'overdue') return sum;
    const gross = amount(invoice.total);
    const pendingRatio = gross > 0 ? Math.min(1, Math.max(0, amount(invoice.paymentsPending) / gross)) : 0;
    return sum + amount(invoice.subtotal) * pendingRatio;
  }, 0);
  return {
    sales: round(base), billed: round(billed), base: round(base), tax: round(tax), collected: round(collected), pending: round(overdue),
    overdue: round(overdue),
    invoices: valid.length,
    paidInvoices: statuses.filter((status) => status === 'paid').length,
    pendingInvoices: statuses.filter((status) => status === 'overdue').length,
    partialInvoices: statuses.filter((status) => status === 'partial').length,
    overdueInvoices: statuses.filter((status) => status === 'overdue').length,
    drafts: invoices.filter((invoice) => invoice.draft).length,
    averageTicket: valid.length ? round(billed / valid.length) : 0,
    collectionRate: base ? round(collected / base * 100) : 0,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const sb = getSupabase();
    const { data: admin, error } = await sb.from('users').select('id,email,username,role').eq('id', session.uid).single();
    if (error || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const previousYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const previousYearEnd = new Date(now.getFullYear(), 0, 1);
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const queryStart = new Date(Math.min(previousYearStart.getTime(), trendStart.getTime()));
    const invoices = await holded.listSalesInvoices({ start: Math.floor(queryStart.getTime() / 1000), end: nowSec });
    const inRange = (invoice, start) => Number(invoice.date || 0) >= Math.floor(start.getTime() / 1000);
    const monthInvoices = invoices.filter((invoice) => inRange(invoice, monthStart));
    const yearInvoices = invoices.filter((invoice) => inRange(invoice, yearStart));
    const previousYearInvoices = invoices.filter((invoice) => Number(invoice.date || 0) >= previousYearStart.getTime() / 1000 && Number(invoice.date || 0) < previousYearEnd.getTime() / 1000);
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const rows = invoices.filter((invoice) => Number(invoice.date || 0) >= start.getTime() / 1000 && Number(invoice.date || 0) < end.getTime() / 1000);
      const previousStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
      const previousEnd = new Date(start.getFullYear() - 1, start.getMonth() + 1, 1);
      const previousRows = invoices.filter((invoice) => Number(invoice.date || 0) >= previousStart.getTime() / 1000 && Number(invoice.date || 0) < previousEnd.getTime() / 1000);
      const summary = totals(rows, nowSec);
      return { month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(start), sales: summary.sales, previousYearSales: totals(previousRows, nowSec).sales, billed: summary.billed, collected: summary.collected, pending: summary.pending, invoices: summary.invoices };
    });

    return json({
      syncedAt: new Date().toISOString(),
      currency: String(invoices.find((invoice) => invoice.currency)?.currency || 'EUR').toUpperCase(),
      currentMonth: totals(monthInvoices, nowSec),
      currentYear: totals(yearInvoices, nowSec),
      previousYear: totals(previousYearInvoices, nowSec),
      last12Months: monthly,
      recentInvoices: invoices.filter((invoice) => !isCancelled(invoice)).slice(0, 50).map((invoice) => ({
        id: invoice.id,
        number: invoice.docNumber || 'Borrador',
        customer: invoice.contactName || 'Sin contacto',
        date: isoDate(invoice.date),
        dueDate: isoDate(invoice.dueDate),
        subtotal: round(amount(invoice.subtotal)),
        tax: round(amount(invoice.tax)),
        total: round(amount(invoice.total)),
        paid: round(amount(invoice.paymentsTotal)),
        pending: round(Math.max(0, amount(invoice.paymentsPending))),
        status: statusFor(invoice, nowSec),
        currency: String(invoice.currency || 'EUR').toUpperCase(),
      })),
    });
  } catch (error) {
    return serverError(error, 'admin.holded_snapshot');
  }
};
