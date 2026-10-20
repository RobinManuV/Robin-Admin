// Server-side holded helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const { ymd, addDays } = require("./utils");
const { expenseAccountNumbers } = require("./config");

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
    groups.forEach((group, groupIndex) => {
      const requestedAccount = accounts[groupIndex];
      group.forEach((entry) => entries.push({
        ...entry,
        // Algunas respuestas de Holded omiten la cuenta porque ya se envió
        // como filtro. Conservamos ese contexto para poder categorizarla.
        requested_account: requestedAccount,
      }));
    });
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

module.exports = { v2Fetch, v2List, listLedgerEntries, mapWithConcurrency };
