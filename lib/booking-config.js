const DEFAULT_BOOKING_CONFIG = Object.freeze({
  availabilityTitle: 'LLAMADAS CLIENTES',
  maxDays: 14,
  slotMin: 30,
});

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value == null ? '' : value), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function currentEnvironment() {
  return {
    BOOKING_AVAIL_TITLE: process.env.BOOKING_AVAIL_TITLE,
    BOOKING_MAX_DAYS: process.env.BOOKING_MAX_DAYS,
    BOOKING_SLOT_MIN: process.env.BOOKING_SLOT_MIN,
  };
}

function bookingConfig(env = currentEnvironment()) {
  return {
    availabilityTitle: String(env.BOOKING_AVAIL_TITLE || '').trim() || DEFAULT_BOOKING_CONFIG.availabilityTitle,
    maxDays: boundedInteger(env.BOOKING_MAX_DAYS, DEFAULT_BOOKING_CONFIG.maxDays, 1, 31),
    slotMin: boundedInteger(env.BOOKING_SLOT_MIN, DEFAULT_BOOKING_CONFIG.slotMin, 5, 240),
  };
}

function requestedDays(value, maxDays) {
  return boundedInteger(value, maxDays, 1, maxDays);
}

module.exports = { bookingConfig, boundedInteger, DEFAULT_BOOKING_CONFIG, requestedDays };
