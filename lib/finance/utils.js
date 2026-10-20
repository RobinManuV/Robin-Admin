// Server-side utils helpers used by request handlers; provider calls and domain rules stay behind this boundary.

const DAY_MS = 86400000;
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const amount = (value) => Number(value || 0);
const ymd = (date) => date.toISOString().slice(0, 10);
const fromUnix = (value) => value ? new Date(Number(value) * 1000) : null;
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date, count) => new Date(date.getTime() + count * DAY_MS);
const addMonths = (date, count) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, date.getUTCDate()));

module.exports = { DAY_MS, round, amount, ymd, fromUnix, startOfUtcDay, addDays, addMonths };
