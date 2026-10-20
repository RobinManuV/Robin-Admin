// Server-side sales utils helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value || '').trim();
const normalized = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const percentage = (numerator, denominator) => denominator ? round(numerator / denominator * 100) : null;

module.exports = { clean, normalized, percentage, round };
