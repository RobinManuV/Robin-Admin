const { chatCompletion } = require('./anthropic-chat');
const { canonicalAdvisorEmail } = require('./admins');
const { errorCode } = require('./observability');
const { minimizeLogPayload } = require('./privacy');
const gcal = require('./google-calendar');

async function logMeetWebhook(sb, payload, result, message) {
  try { await sb.from('webhook_log').insert({ source: 'meet', payload: minimizeLogPayload(payload), result, message }); } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
}

async function summarizeAndCompile({ priorHistorial, rawNotes, meeting }) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `Eres asistente de Project Robin. Procesa la transcripción de una reunión de Google Meet entre asesor y candidato a universidad en Holanda. Devuelve el HISTORIAL COMPLETO ACTUALIZADO en texto plano con esta estructura:

HISTORIAL DE REUNIONES — actualizado ${today}

## YYYY-MM-DD · Título
- Temas: …
- Decisiones: …
- Acciones a seguir: …
- Estado/Motivación: …
- Datos nuevos: …

Conserva todas las reuniones previas. Más reciente arriba. Conciso, en español.`;

  const user = `HISTORIAL PREVIO:
${priorHistorial ? priorHistorial : '(vacío)'}

NUEVA REUNIÓN:
Fecha: ${meeting.meeting_date || today}
Título: ${meeting.meeting_title || 'Reunión Meet'}

TRANSCRIPCIÓN / NOTAS:
"""
${rawNotes}
"""

Devuelve el HISTORIAL completo actualizado.`;
  const { text } = await chatCompletion({ system, messages: [{ role: 'user', content: user }], maxTokens: 3000 });
  return text;
}

// Resuelve el cliente por el booking del asesor más cercano al inicio de la conferencia.
async function resolveUserByBooking(sb, advisorEmail, refIso) {
  const ref = refIso ? new Date(refIso).getTime() : Date.now();
  const windowMs = 6 * 3600 * 1000; // ±6h
  const { data } = await sb
    .from('bookings')
    .select('id, user_id, start_at, topic, admin_email')
    .gte('start_at', new Date(ref - windowMs).toISOString())
    .lte('start_at', new Date(ref + windowMs).toISOString());
  const mine = (data || []).filter((bk) => canonicalAdvisorEmail(bk.admin_email) === advisorEmail);
  if (!mine.length) return null;
  mine.sort((a, b) => Math.abs(new Date(a.start_at) - ref) - Math.abs(new Date(b.start_at) - ref));
  const b = mine[0];
  const { data: u } = await sb
    .from('users').select('id, email, lead_id, historial').eq('id', b.user_id).single();
  return u ? { user: u, booking: b } : null;
}

async function processMeetTranscript({ sb, advisorEmail, transcriptName, conferenceRecord, log }) {
  // 1) Obtener el texto de la transcripción
  let rawNotes = '';
  let refTime = null;
  let meetingTitle = 'Reunión Meet';

  if (!rawNotes && transcriptName) {
    rawNotes = await gcal.listTranscriptEntries(advisorEmail, transcriptName);
  }
  if (conferenceRecord) {
    try {
      const rec = await gcal.getConferenceRecord(advisorEmail, conferenceRecord);
      refTime = rec.startTime || refTime;
    } catch (e) { /* best-effort */ }
  }
  if (!rawNotes) {
    await logMeetWebhook(sb, {
      transcript_name: transcriptName,
      conference_record: conferenceRecord,
    }, 'rejected', 'empty_transcript');
    log.warn('rejected', { entity_type: 'meet_transcript', entity_id: transcriptName, error_code: 'empty_transcript' });
    return { statusCode: 400, payload: { error: 'empty_transcript' } };
  }

  // 2) Resolver el cliente por booking cercano en el tiempo
  const resolved = await resolveUserByBooking(sb, advisorEmail, refTime);
  if (!resolved) {
    await logMeetWebhook(sb, {
      transcript_name: transcriptName,
      conference_record: conferenceRecord,
    }, 'no_user', 'no_matching_booking_save_for_manual_link');
    log.warn('manual_link_required', {
      entity_type: 'meet_transcript',
      entity_id: transcriptName,
      error_code: 'no_matching_booking',
    });
    return { statusCode: 200, payload: { ok: false, queued_for_manual_link: true } };
  }
  const { user, booking } = resolved;
  meetingTitle = booking.topic || meetingTitle;

  // 3) Resumir + compilar historial
  const updated = await summarizeAndCompile({
    priorHistorial: user.historial || '',
    rawNotes,
    meeting: { meeting_date: (refTime || new Date().toISOString()).slice(0, 10), meeting_title: meetingTitle },
  });

  const patch = { historial: updated, historial_updated_at: new Date().toISOString() };
  const { error: ep } = await sb.from('users').update(patch).eq('id', user.id);
  if (ep) throw ep;

  // Guarda la transcripción en la carpeta "transcripts" del cliente (best-effort).
  try {
    const gdrive = require('./google-drive');
    if (gdrive.isConfigured()) {
      const { data: ufull } = await sb
        .from('users')
        .select('id, nombre, apellidos, lead_id, gdrive_folders')
        .eq('id', user.id)
        .single();
      if (ufull) {
        await gdrive.saveClientTranscript(sb, ufull, {
          title: (booking && booking.topic) || meetingTitle || 'Reunion Meet',
          dateStr: new Date().toISOString().slice(0, 10),
          text: rawNotes,
        });
      }
    }
  } catch (driveErr) {
    log.warn('degraded', { integration: 'google_drive', error_code: errorCode(driveErr, 'drive_transcript_failed') });
  }

  await logMeetWebhook(sb, {
    transcript_name: transcriptName,
    conference_record: conferenceRecord,
    booking_id: booking.id,
    user_id: user.id,
  }, 'ok', 'user_history_updated');
  log.success({ entity_type: 'user_history', entity_id: user.id });
  return { statusCode: 200, payload: { ok: true, user_id: user.id, historial_chars: updated.length } };
}

module.exports = { logMeetWebhook, processMeetTranscript, resolveUserByBooking, summarizeAndCompile };
