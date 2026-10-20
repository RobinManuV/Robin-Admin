const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value || '').trim();
const normalized = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const percentage = (numerator, denominator) => denominator ? round(numerator / denominator * 100) : null;

module.exports = { clean, normalized, percentage, round };
