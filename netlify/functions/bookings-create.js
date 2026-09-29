/**
 * POST /api/bookings/create
 * Auth: cliente (no admin).
 * Body: { start_at: ISO string, duration_min?: 30 }
 *
 * Flujo (Google Meet):
 *  1) Carga user + asesor asignado (assigned_to).
 *  2) Crea un evento en el Google Calendar del asesor con enlace Meet
 *     (lib/google-calendar.createMeetEvent). summary = "<Nombre> · <lead_id>".
 *     El evento sale en el calendario del asesor y se invita al cliente.
 *  3) Persiste la reserva; si falla, elimina el evento recién creado.
 *  4) Envía emails al cliente y al asesor con el enlace Meet.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { createMeetEvent, deleteCalendarEvent, listEvents } = require('../../lib/google-calendar');
const { adminName, canonicalAdvisorEmail } = require('../../lib/admins');
const { createOperationLogger, errorCode } = require('../../lib/observability');
const { evaluateSlot } = require('../../lib/booking-availability');
const { bookingConfig } = require('../../lib/booking-config');
const { isoDate, numberValue } = require('../../lib/validation');
const { sendBookingNotifications } = require('../../lib/booking-create');
const { hasApplicationAdminRole } = require('../../lib/authorization');

async function insertBookingOrRollback({ sb, row, advisorEmail, eventId, removeEvent = deleteCalendarEvent }) {
  const { data, error } = await sb.from('bookings').insert(row).select().single();
  if (!error && data) return data;

  let cleanupError = null;
  try {
    await removeEvent(advisorEmail, eventId);
  } catch (errorDeletingEvent) {
    cleanupError = errorDeletingEvent;
  }
  const persistenceError = error || new Error('booking_insert_failed');
  if (cleanupError) persistenceError.calendarCleanupError = cleanupError;
  throw persistenceError;
}

exports.handler = async (event) => {
  const session = readSessionFromEvent(event);
  const log = createOperationLogger(event, {
    operation: 'bookings.create',
    actor_id: session && session.uid,
    actor_role: session && session.role,
    integration: 'google_calendar',
  });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return methodNotAllowed(['POST']);
  }
  if (!verifyOrigin(event)) {
    log.warn('rejected', { error_code: 'bad_origin' });
    return json({ error: 'bad_origin' }, { statusCode: 403 });
  }
  if (!session) {
    log.warn('rejected', { error_code: 'unauthorized' });
    return json({ error: 'unauthorized' }, { statusCode: 401 });
  }
  const body = parseJsonBody(event) || {};
  const startAt = isoDate(body.start_at);
  const durationMin = body.duration_min == null
    ? 30
    : numberValue(body.duration_min, { min: 15, max: 240, integer: true });
  if (!startAt) {
    log.warn('rejected', { error_code: 'invalid_start_at' });
    return json({ error: 'invalid_start_at' }, { statusCode: 400 });
  }
  if (durationMin == null) {
    log.warn('rejected', { error_code: 'invalid_duration' });
    return json({ error: 'invalid_duration' }, { statusCode: 400 });
  }
  if (new Date(startAt).getTime() < Date.now() + 5 * 60000) {
    log.warn('rejected', { error_code: 'start_in_past' });
    return json({ error: 'start_in_past' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const { data: user, error: eu } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, assigned_to, role, historial, application_phase, phase_changed_at, tipo, num_carreras, pago_completed, intereses, created_at')
      .eq('id', session.uid)
      .single();
    if (eu || !user) {
      log.warn('rejected', { error_code: 'user_not_found' });
      return json({ error: 'user_not_found' }, { statusCode: 404 });
    }
    if (hasApplicationAdminRole(user)) {
      log.warn('rejected', { error_code: 'admins_cannot_book' });
      return json({ error: 'admins_cannot_book' }, { statusCode: 403 });
    }

    const advisorEmail = canonicalAdvisorEmail(user.assigned_to);
    if (!advisorEmail) {
      log.warn('rejected', { error_code: 'no_admin_assigned' });
      return json({ error: 'no_admin_assigned' }, { statusCode: 400 });
    }
    const advisor = adminName(advisorEmail);

    const fullName = `${user.nombre || ''} ${user.apellidos || ''}`.trim() || user.email;
    const topic = `${fullName} · ${user.lead_id || user.id}`;
    const agenda = `Sesión Robin con ${advisor} y ${fullName}.`;

    // Revalida el slot inmediatamente antes de crear el evento. La pantalla de
    // disponibilidad puede llevar abierta varios minutos y ya estar obsoleta.
    const requestedStart = new Date(startAt);
    const requestedEnd = new Date(requestedStart.getTime() + durationMin * 60000);
    let currentEvents;
    try {
      currentEvents = await listEvents(advisorEmail, requestedStart.toISOString(), requestedEnd.toISOString());
    } catch (e) {
      log.warn('degraded', { error_code: errorCode(e, 'availability_check_failed') });
      return json({ error: 'availability_check_failed' }, { statusCode: 502 });
    }
    const slot = evaluateSlot(
      currentEvents,
      requestedStart,
      durationMin,
      bookingConfig().availabilityTitle
    );
    if (!slot.available) {
      log.warn('rejected', { error_code: 'slot_unavailable' });
      return json({ error: 'slot_unavailable' }, { statusCode: 409 });
    }

    // 1) Crear evento Meet en el calendario del asesor
    let meeting;
    try {
      meeting = await createMeetEvent({
        advisorEmail,
        summary: topic,
        description: agenda,
        startAtIso: new Date(startAt).toISOString(),
        durationMin,
        attendees: [user.email].filter(Boolean),
      });
    } catch (e) {
      log.warn('degraded', { error_code: errorCode(e, 'meet_create_failed') });
      return json({ error: 'meet_create_failed', detail: e.message }, { statusCode: 502 });
    }

    const joinUrl = meeting.meetUrl;
    const meetCode = meeting.meetCode || null;
    const eventId = meeting.eventId || null;
    if (!eventId || !/^https:\/\/meet\.google\.com\/[a-z-]+/i.test(String(joinUrl || ''))) {
      try {
        await deleteCalendarEvent(advisorEmail, eventId);
      } catch (cleanupError) {
        log.warn('degraded', { error_code: errorCode(cleanupError, 'calendar_cleanup_failed') });
      }
      log.warn('degraded', { error_code: 'meet_details_missing' });
      return json({ error: 'meet_create_failed' }, { statusCode: 502 });
    }

    // 2) Insertar la reserva. Si Supabase falla, se elimina el evento de Calendar.
    let booking;
    try {
      booking = await insertBookingOrRollback({
        sb,
        advisorEmail,
        eventId,
        row: {
          user_id: user.id,
          admin_email: advisorEmail,
          topic,
          start_at: new Date(startAt).toISOString(),
          duration_min: durationMin,
          meet_join_url: joinUrl,
          meet_code: meetCode,
          calendar_event_id: eventId,
          status: 'scheduled',
        },
      });
    } catch (persistenceError) {
      if (persistenceError.calendarCleanupError) {
        log.warn('degraded', {
          error_code: errorCode(persistenceError.calendarCleanupError, 'calendar_cleanup_failed'),
        });
      }
      console.error('[booking_insert_error]', errorCode(persistenceError, 'booking_insert_failed'));
      throw persistenceError;
    }

    const emailResults = await sendBookingNotifications({
      sb, user, advisor, advisorEmail, joinUrl, startAt, durationMin, fullName, log,
    });

    log.success({ entity_type: 'booking', entity_id: booking.id });
    return json({
      ok: true,
      booking,
      emails: emailResults,
    });
  } catch (e) {
    log.failure(e, { entity_type: 'booking' });
    return serverError(e);
  }
};

module.exports.insertBookingOrRollback = insertBookingOrRollback;
