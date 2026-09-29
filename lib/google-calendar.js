/**
 * lib/google-calendar.js
 * Google Calendar + Meet helpers para reservas de asesores.
 *
 * Auth: OAuth 2.0 con UN refresh token POR ASESOR (ver lib/admins.js).
 * Comparten GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 *
 * Capacidades:
 *   - getAccessToken(advisorEmail)         -> access token (cacheado por asesor)
 *   - freeBusy(advisorEmail, timeMin, timeMax) -> [{start,end}] intervalos ocupados
 *   - createMeetEvent({...})               -> crea evento Calendar con enlace Meet
 *   - deleteCalendarEvent(advisorEmail, eventId) -> elimina un evento creado
 *   - listTranscriptEntries(advisorEmail, transcriptName) -> texto de la transcripción (Meet REST API)
 *
 * Diseño best-effort: si Google falla, se lanza error controlado y el caller decide.
 * No usa googleapis; fetch nativo de Node 18+.
 */
const { refreshTokenFor } = require('./admins');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const MEET_API = 'https://meet.googleapis.com/v2';

// cache de access tokens por asesor: { [email]: { token, exp } }
const _cache = {};

function isConfigured(advisorEmail) {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && refreshTokenFor(advisorEmail));
}

async function getAccessToken(advisorEmail) {
  const key = String(advisorEmail || '').toLowerCase();
  const refresh = refreshTokenFor(key);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !refresh) {
    throw new Error('google_calendar_not_configured:' + key);
  }
  const now = Date.now();
  const c = _cache[key];
  if (c && now < c.exp - 60000) return c.token;

  const body = new URLSearchParams({
    client_id: String(process.env.GOOGLE_CLIENT_ID).trim(),
    client_secret: String(process.env.GOOGLE_CLIENT_SECRET).trim(),
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error('google_oauth_failed(' + key + '): ' + (data.error_description || data.error || resp.status));
  }
  _cache[key] = { token: data.access_token, exp: now + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

/**
 * Consulta free/busy del calendario primario del asesor.
 * @returns {Promise<Array<{start:string,end:string}>>} intervalos ocupados (ISO)
 */
async function freeBusy(advisorEmail, timeMinIso, timeMaxIso) {
  const token = await getAccessToken(advisorEmail);
  const resp = await fetch(`${CAL_API}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      timeZone: 'Europe/Madrid',
      items: [{ id: 'primary' }],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('google_freebusy_error: ' + JSON.stringify(data).slice(0, 400));
  const cal = (data.calendars && data.calendars.primary) || {};
  return (cal.busy || []).map((b) => ({ start: b.start, end: b.end }));
}

/**
 * Lista los eventos del calendario primario del asesor en un rango (con título).
 * singleEvents=true expande recurrencias. Ignora los cancelados.
 * @returns {Promise<Array<{summary,start,end,allDay,transparency,status}>>}
 */
async function listEvents(advisorEmail, timeMinIso, timeMaxIso) {
  const token = await getAccessToken(advisorEmail);
  const base = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
    timeZone: 'Europe/Madrid',
  });
  let pageToken = '';
  const items = [];
  do {
    const url = `${CAL_API}/calendars/primary/events?${base.toString()}` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error('google_events_list_error: ' + JSON.stringify(data).slice(0, 400));
    (data.items || []).forEach((ev) => {
      if (ev.status === 'cancelled') return;
      const start = ev.start && (ev.start.dateTime || ev.start.date);
      const end = ev.end && (ev.end.dateTime || ev.end.date);
      if (!start || !end) return;
      items.push({
        summary: ev.summary || '',
        start,
        end,
        allDay: !!(ev.start && ev.start.date && !ev.start.dateTime),
        transparency: ev.transparency || 'opaque',
        status: ev.status || 'confirmed',
      });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}

/**
 * Crea un evento en el calendario primario del asesor con enlace Google Meet.
 * @returns {Promise<{eventId, htmlLink, meetUrl, meetCode}>}
 */
async function createMeetEvent({ advisorEmail, summary, description, startAtIso, durationMin, attendees }) {
  const token = await getAccessToken(advisorEmail);
  const start = new Date(startAtIso);
  const end = new Date(start.getTime() + (durationMin || 30) * 60000);
  const requestId = 'robin-' + start.getTime() + '-' + Math.random().toString(36).slice(2, 8);

  const body = {
    summary,
    description: description || '',
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Madrid' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Madrid' },
    attendees: (attendees || []).filter(Boolean).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  };

  const url = `${CAL_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('google_create_event_error: ' + JSON.stringify(data).slice(0, 500));

  // Extrae el enlace Meet
  let meetUrl = data.hangoutLink || null;
  let meetCode = null;
  const ep = (data.conferenceData && data.conferenceData.entryPoints) || [];
  const video = ep.find((e) => e.entryPointType === 'video');
  if (video && video.uri) {
    meetUrl = video.uri;
    // meetCode: última parte de https://meet.google.com/abc-defg-hij
    const m = video.uri.match(/meet\.google\.com\/([a-z\-]+)/i);
    if (m) meetCode = m[1];
  }
  return { eventId: data.id, htmlLink: data.htmlLink || null, meetUrl, meetCode };
}

/**
 * Elimina un evento del calendario primario del asesor. Se usa como compensación
 * cuando Calendar crea el Meet pero Supabase no puede persistir la reserva.
 */
async function deleteCalendarEvent(advisorEmail, eventId) {
  if (!eventId) return { deleted: false, reason: 'missing_event_id' };
  const token = await getAccessToken(advisorEmail);
  const url = `${CAL_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404 || resp.status === 410) {
    return { deleted: false, already_missing: true };
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error('google_delete_event_error: ' + JSON.stringify(data).slice(0, 300));
  }
  return { deleted: true };
}

/**
 * Recupera el texto completo de una transcripción de Meet.
 * transcriptName ej: "conferenceRecords/{record}/transcripts/{transcript}"
 * Requiere scope meetings.space.readonly y que el asesor sea el organizador.
 */
async function listTranscriptEntries(advisorEmail, transcriptName) {
  const token = await getAccessToken(advisorEmail);
  let pageToken = '';
  const lines = [];
  do {
    const url = `${MEET_API}/${transcriptName}/entries?pageSize=1000` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error('meet_transcript_entries_error: ' + JSON.stringify(data).slice(0, 400));
    (data.transcriptEntries || []).forEach((e) => {
      const who = e.participant ? e.participant.split('/').pop() : '';
      lines.push((who ? who + ': ' : '') + (e.text || ''));
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return lines.join('\n');
}

/** Obtiene metadatos de un conferenceRecord (space, participantes) para resolver el user. */
async function getConferenceRecord(advisorEmail, conferenceRecordName) {
  const token = await getAccessToken(advisorEmail);
  const resp = await fetch(`${MEET_API}/${conferenceRecordName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('meet_conference_record_error: ' + JSON.stringify(data).slice(0, 300));
  return data; // { name, space, startTime, endTime }
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/**
 * Lista Google Docs de transcripción de Meet creados en el Drive del asesor
 * desde `sinceIso`. Meet nombra estos docs con "Transcript"/"Transcripción".
 * @returns {Promise<Array<{id,name,createdTime}>>}
 */
async function driveListTranscriptDocs(advisorEmail, sinceIso) {
  const token = await getAccessToken(advisorEmail);
  const clauses = [
    "mimeType='application/vnd.google-apps.document'",
    "trashed=false",
    "(name contains 'Transcript' or name contains 'Transcripci')",
  ];
  if (sinceIso) clauses.push(`createdTime > '${sinceIso}'`);
  const q = clauses.join(' and ');
  const url = `${DRIVE_API}/files?corpora=user&spaces=drive`
    + `&q=${encodeURIComponent(q)}`
    + `&orderBy=createdTime desc&pageSize=50`
    + `&fields=${encodeURIComponent('files(id,name,createdTime,mimeType)')}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('drive_list_error: ' + JSON.stringify(data).slice(0, 300));
  return data.files || [];
}

/** Exporta el texto plano de un Google Doc. */
async function driveExportText(advisorEmail, fileId) {
  const token = await getAccessToken(advisorEmail);
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('drive_export_error: ' + t.slice(0, 200));
  }
  return await resp.text();
}

module.exports = {
  isConfigured,
  getAccessToken,
  freeBusy,
  listEvents,
  createMeetEvent,
  deleteCalendarEvent,
  listTranscriptEntries,
  getConferenceRecord,
  driveListTranscriptDocs,
  driveExportText,
};
