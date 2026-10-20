function analyticsKey() {
  return String(process.env.HOLDED_API_KEY || '').trim();
}

function isAnalyticsConfigured() {
  return !!analyticsKey();
}

async function listDocuments(docType, { start, end } = {}) {
  if (!isAnalyticsConfigured()) throw new Error('holded_analytics_not_configured');
  const url = new URL(`https://api.holded.com/api/invoicing/v1/documents/${encodeURIComponent(docType)}`);
  if (start) url.searchParams.set('starttmp', String(start));
  if (end) url.searchParams.set('endtmp', String(end));
  url.searchParams.set('sort', 'created-desc');
  const res = await fetch(url, { headers: { key: analyticsKey(), Accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('holded_analytics_http_' + res.status);
    err.detail = data;
    throw err;
  }
  return Array.isArray(data) ? data : (Array.isArray(data && data.data) ? data.data : []);
}

async function listSalesInvoices(options = {}) {
  return listDocuments('invoice', options);
}

async function listPurchaseDocuments(options = {}) {
  // Las compras son la fuente principal. Una incidencia aislada al consultar
  // rectificativas no debe descartar todas las facturas de compra válidas.
  const purchases = await listDocuments('purchase', options);
  let refunds = [];
  try {
    refunds = await listDocuments('purchaserefund', options);
  } catch (error) {
    console.warn('holded purchase refunds warning', error?.message || error);
  }
  return [
    ...purchases.map((document) => ({ ...document, documentType: 'purchase' })),
    ...refunds.map((document) => ({ ...document, documentType: 'purchaserefund' })),
  ];
}

async function listExpenseAccounts() {
  if (!isAnalyticsConfigured()) throw new Error('holded_analytics_not_configured');
  const url = 'https://api.holded.com/api/invoicing/v1/expensesaccounts';
  const res = await fetch(url, { headers: { key: analyticsKey(), Accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('holded_expense_accounts_http_' + res.status);
    err.detail = data;
    throw err;
  }
  return Array.isArray(data) ? data : (Array.isArray(data && data.data) ? data.data : []);
}

module.exports = {
  isAnalyticsConfigured,
  listDocuments,
  listExpenseAccounts,
  listPurchaseDocuments,
  listSalesInvoices,
};
