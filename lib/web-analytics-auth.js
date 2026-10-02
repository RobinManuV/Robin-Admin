/**
 * Autorización común de la pestaña "Web": sesión válida + administrador de aplicación.
 * Mismo criterio que admin-meta-insights.
 */
const { getSupabase } = require('./supabase');
const { readSessionFromEvent } = require('./auth');
const { isApplicationAdmin } = require('./authorization');
const { json } = require('./http');

async function requireWebAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return { error: json({ error: 'unauthorized' }, { statusCode: 401 }) };
  const sb = getSupabase();
  const { data: admin, error } = await sb.from('users').select('id,email,username,role').eq('id', session.uid).single();
  if (error || !admin) return { error: json({ error: 'unauthorized' }, { statusCode: 401 }) };
  if (!isApplicationAdmin(admin)) return { error: json({ error: 'forbidden' }, { statusCode: 403 }) };
  return { admin };
}

// Fecha de hoy en Madrid (YYYY-MM-DD)
const madridToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

// Minutos de diferencia de Madrid con UTC en una fecha (60 en invierno, 120 en verano)
function madridOffsetMinutes(dateStr) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${dateStr}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
  const m = label.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 60;
}
const madridMidnightUtc = (dateStr) => new Date(Date.parse(`${dateStr}T00:00:00Z`) - madridOffsetMinutes(dateStr) * 60000);

// Rango de fechas de la petición (?from=YYYY-MM-DD&to=YYYY-MM-DD, ambos incluidos, en hora de Madrid).
// Por defecto: últimos 28 días.
function readRange(event) {
  const q = event.queryStringParameters || {};
  const valid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v));
  const to = valid(q.to) ? q.to : madridToday();
  const from = valid(q.from) ? q.from : new Date(Date.parse(to) - 27 * 86400000).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days < 1 || days > 400) return { from: to, to, days: 1 };
  return { from, to, days };
}

// Límites exactos en UTC: desde las 00:00 del día "from" hasta las 24:00 del día "to" (hora de Madrid)
function rangeBounds({ from, to }) {
  const next = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
  return { fromTs: madridMidnightUtc(from).toISOString(), toTs: madridMidnightUtc(next).toISOString() };
}

module.exports = { requireWebAdmin, readRange, rangeBounds };
