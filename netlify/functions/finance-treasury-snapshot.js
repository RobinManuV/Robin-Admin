/**
 * Captura diaria del saldo de todas las cuentas activas de Tesorería de Holded.
 * Netlify la invoca cada hora en el minuto 59; solo escribe durante las 23:00
 * de Europe/Madrid para cubrir automáticamente los cambios CET/CEST.
 */
const { json } = require('../../lib/http');
const { captureTreasuryHistory } = require('../../lib/finance-dashboard');

function madridHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()));
}

exports.handler = async (event) => {
  let scheduled = false;
  try { scheduled = Boolean(event?.body && JSON.parse(event.body).next_run); } catch (_) {}
  if (!scheduled) return json({ error: 'not_found' }, { statusCode: 404 });
  if (madridHour() !== 23) return json({ ok: true, skipped: true, reason: 'outside_capture_window' });
  try {
    const rows = await captureTreasuryHistory({ includeBackfill: false });
    return json({ ok: true, snapshot: rows[rows.length - 1] });
  } catch (error) {
    console.error('finance-treasury-snapshot error', error && (error.message || error));
    return json({ ok: false, error: 'treasury_snapshot_failed' }, { statusCode: 500 });
  }
};
