const { addDays, startOfUtcDay, ymd, addMonths } = require("./utils");

const MADRID_TZ = 'Europe/Madrid';
function madridToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}
function addUtcMonthsClamped(date, months) {
  const targetMonth = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), targetMonth, Math.min(date.getUTCDate(), lastDay)));
}
function parseRangeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function periodBounds(period, today = madridToday(), customRange = null) {
  let end = addDays(today, 1);
  let start;
  let granularity;
  if (period === 'custom') {
    start = parseRangeDate(customRange?.from);
    const inclusiveEnd = parseRangeDate(customRange?.to);
    if (!start || !inclusiveEnd || start > inclusiveEnd) throw new Error('invalid_date_range');
    end = addDays(inclusiveEnd, 1);
    const days = Math.max(1, Math.round((end - start) / 86400000));
    granularity = days <= 62 ? 'day' : days <= 186 ? 'week' : 'month';
  }
  else if (period === '30d') { start = addDays(today, -29); granularity = 'day'; }
  else if (period === 'month') { start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); granularity = 'day'; }
  else if (period === 'last_month') {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    granularity = 'day';
  }
  else if (period === '3m') { start = addUtcMonthsClamped(today, -3); granularity = 'week'; }
  else if (period === '365d') { start = addDays(today, -364); granularity = 'month'; }
  else {
    const fiscalYear = today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    start = new Date(Date.UTC(fiscalYear, 6, 1));
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

module.exports = { MADRID_TZ, madridToday, addUtcMonthsClamped, parseRangeDate, periodBounds, inBounds, weekStart, bucketKey, bucketLabel, makeBuckets, bucketMap };
