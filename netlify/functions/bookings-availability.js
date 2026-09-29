/**
 * GET /api/bookings/availability?from=YYYY-MM-DD&days=14
 * Auth: cliente.
 *
 * Devuelve los huecos LIBRES del asesor asignado (users.assigned_to), calculados
 * a partir de ventanas explícitas y eventos ocupados de Google Calendar.
 *
 * Respuesta: { advisor, slot_min, days: [ { date, slots: [{ start, label }] } ] }
 *
 * Config (env opcional):
 *   BOOKING_AVAIL_TITLE (default "LLAMADAS CLIENTES")
 *   BOOKING_SLOT_MIN    (default 30) · BOOKING_MAX_DAYS (default 14)
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { adminName, canonicalAdvisorEmail } = require('../../lib/admins');
const { bookingConfig, requestedDays } = require('../../lib/booking-config');
const gcal = require('../../lib/google-calendar');

const TZ = 'Europe/Madrid';

// offset (ms) que Europe/Madrid lleva respecto a UTC en ese instante
function tzOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = dtf.formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === '24' ? 0 : p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// Convierte hora de pared de Madrid (Y,M,D,h,m) al instante UTC correcto.
function madridWallToUtc(y, mo, d, h, mi) {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const off = tzOffsetMs(guess);
  return new Date(guess.getTime() - off);
}

function overlaps(sMs, eMs, busy) {
  for (const b of busy) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (sMs < be && eMs > bs) return true;
  }
  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const q = event.queryStringParameters || {};
  const config = bookingConfig();
  const days = requestedDays(q.days, config.maxDays);

  try {
    const sb = getSupabase();
    const { data: user, error } = await sb
      .from('users').select('id, assigned_to, role').eq('id', session.uid).single();
    if (error || !user) return json({ error: 'user_not_found' }, { statusCode: 404 });
    const advisorEmail = canonicalAdvisorEmail(user.assigned_to);
    if (!advisorEmail) return json({ error: 'no_admin_assigned' }, { statusCode: 400 });

    // Rango: desde 'from' (o ahora) durante 'days' días
    const now = new Date();
    let from = now;
    if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
      from = madridWallToUtc(+q.from.slice(0, 4), +q.from.slice(5, 7), +q.from.slice(8, 10), 0, 0);
    }
    const timeMin = new Date(Math.max(from.getTime(), now.getTime()));
    const timeMax = new Date(from.getTime() + days * 24 * 3600 * 1000);

    // MODO INVERSO: la disponibilidad son ÚNICAMENTE los eventos "LLAMADAS CLIENTES"
    // que el asesor tenga en su calendario. Fuera de esas ventanas no hay huecos.
    // El resto de eventos (opacos) bloquean los slots que caigan dentro para no doblar reservas.
    let events = [];
    let calendarOk = true;
    try {
      events = await gcal.listEvents(advisorEmail, timeMin.toISOString(), timeMax.toISOString());
    } catch (e) {
      calendarOk = false;
      console.error('availability listEvents error', e.message);
    }

    const AVAIL_TITLE = config.availabilityTitle.toLowerCase();
    const isWindow = (ev) => String(ev.summary || '').toLowerCase().includes(AVAIL_TITLE);

    const windows = [];
    const busy = [];
    for (const ev of events) {
      const sMs = new Date(ev.start).getTime();
      const eMs = new Date(ev.end).getTime();
      if (isNaN(sMs) || isNaN(eMs) || eMs <= sMs) continue;
      if (isWindow(ev)) {
        windows.push({ start: sMs, end: eMs });
      } else if (ev.transparency !== 'transparent' && !ev.allDay) {
        // eventos ocupados reales (p. ej. una reserva ya creada) → bloquean
        busy.push({ start: new Date(ev.start).toISOString(), end: new Date(ev.end).toISOString() });
      }
    }

    const minStartMs = now.getTime() + 30 * 60000; // al menos 30 min en el futuro
    const SLOTMS = config.slotMin * 60000;

    // Genera slots alineados al inicio de cada ventana, evitando solapes con eventos ocupados
    const slotsByDate = {};
    for (const w of windows) {
      for (let t = w.start; t + SLOTMS <= w.end; t += SLOTMS) {
        if (t < minStartMs) continue;
        if (overlaps(t, t + SLOTMS, busy)) continue;
        const s = new Date(t);
        const dateLabel = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(s);
        const label = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(s);
        (slotsByDate[dateLabel] = slotsByDate[dateLabel] || []).push({ start: s.toISOString(), label, _ms: t });
      }
    }

    // Estructura por día en el rango solicitado (orden cronológico, sin duplicados)
    const out = [];
    for (let i = 0; i < days; i++) {
      const dayRef = new Date(from.getTime() + i * 24 * 3600 * 1000);
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dayRef);
      const dedup = Array.from(new Map((slotsByDate[p] || []).map((sl) => [sl._ms, sl])).values());
      const slots = dedup.sort((a, b) => a._ms - b._ms).map(({ _ms, ...rest }) => rest);
      out.push({ date: p, slots });
    }

    return json({
      advisor: adminName(advisorEmail),
      advisor_email: advisorEmail,
      slot_min: config.slotMin,
      calendar_connected: calendarOk,
      availability_mode: 'llamadas_clientes',
      windows_count: windows.length,
      days: out,
    });
  } catch (e) {
    console.error('bookings-availability error', e);
    return serverError(e);
  }
};
