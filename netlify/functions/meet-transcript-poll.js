/**
 * meet-transcript-poll  ·  Función PROGRAMADA (Netlify schedule).
 *
 * Vía Drive (sin Pub/Sub): revisa el Drive de cada asesor, recoge las
 * transcripciones nuevas de Meet (Google Docs), las resume con Claude y las
 * compila en users.historial. Resuelve el cliente por la reserva más cercana
 * en el tiempo a la creación de la transcripción.
 *
 * Programada en netlify.toml ([functions."meet-transcript-poll"].schedule).
 * Evita reprocesar con la tabla processed_meet_docs (file_id pk).
 */
const { getSupabase } = require('../../lib/supabase');
const { json } = require('../../lib/http');
const { chatCompletion } = require('../../lib/anthropic-chat');
const { errorCode } = require('../../lib/observability');
const { minimizeLogPayload } = require('../../lib/privacy');
const { ADVISORS, canonicalAdvisorEmail } = require('../../lib/admins');
const { hasApplicationAdminRole } = require('../../lib/authorization');
const gcal = require('../../lib/google-calendar');

const LOOKBACK_HOURS = parseInt(process.env.MEET_POLL_LOOKBACK_HOURS || '48', 10);

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

TRANSCRIPCIÓN:
"""
${rawNotes}
"""

Devuelve el HISTORIAL completo actualizado.`;
  const { text } = await chatCompletion({ system, messages: [{ role: 'user', content: user }], maxTokens: 3000 });
  return text;
}

async function alreadyProcessed(sb, fileId) {
  const { data } = await sb.from('processed_meet_docs').select('file_id').eq('file_id', fileId).limit(1);
  return !!(data && data.length);
}
async function markProcessed(sb, fileId, userId) {
  try { await sb.from('processed_meet_docs').insert({ file_id: fileId, user_id: userId || null }); } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
}
async function logWebhook(sb, payload, result, message) {
  try { await sb.from('webhook_log').insert({ source: 'meet', payload: minimizeLogPayload(payload), result, message }); } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
}

// Normaliza para comparar texto (minúsculas, sin acentos).
function normText(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Cliente por la reserva del asesor más cercana al instante de la transcripción.
// Compara admin_email con la configuración canónica de asesores.
async function resolveUserByBooking(sb, advisorEmail, refIso) {
  const ref = refIso ? new Date(refIso).getTime() : Date.now();
  const windowMs = 6 * 3600 * 1000;
  const { data } = await sb
    .from('bookings')
    .select('id, user_id, start_at, topic, admin_email')
    .gte('start_at', new Date(ref - windowMs).toISOString())
    .lte('start_at', new Date(ref + windowMs).toISOString());
  const mine = (data || []).filter((b) => canonicalAdvisorEmail(b.admin_email) === advisorEmail);
  if (!mine.length) return null;
  mine.sort((a, b) => Math.abs(new Date(a.start_at) - ref) - Math.abs(new Date(b.start_at) - ref));
  const b = mine[0];
  const { data: u } = await sb.from('users').select('id, email, lead_id, historial').eq('id', b.user_id).single();
  return u ? { user: u, booking: b } : null;
}

// Fallback: resuelve el cliente por el NOMBRE o lead_id que aparece en el título
// de la transcripción, entre los clientes asignados a ese asesor. Útil cuando la
// reunión no se reservó por el portal (no hay booking) o el título no cuadra por hora.
async function resolveUserByName(sb, advisorEmail, docName) {
  const nameN = normText(docName);
  if (!nameN) return null;
  const { data: users } = await sb
    .from('users')
    .select('id, email, lead_id, nombre, apellidos, assigned_to, role, historial')
    .not('assigned_to', 'is', null);
  const mine = (users || []).filter(
    (u) => !hasApplicationAdminRole(u) && canonicalAdvisorEmail(u.assigned_to) === advisorEmail
  );
  // 1) lead_id explícito en el título
  for (const u of mine) {
    if (u.lead_id && nameN.includes(String(u.lead_id).toLowerCase())) {
      return { user: u, booking: { topic: docName } };
    }
  }
  // 2) nombre + apellidos completos
  for (const u of mine) {
    const full = normText(`${u.nombre || ''} ${u.apellidos || ''}`).trim();
    if (full && nameN.includes(full)) return { user: u, booking: { topic: docName } };
  }
  // 3) sólo el nombre de pila, si es inequívoco entre sus clientes
  const byFirst = mine.filter((u) => u.nombre && nameN.includes(normText(u.nombre)));
  if (byFirst.length === 1) return { user: byFirst[0], booking: { topic: docName } };
  return null;
}

async function pollAdvisor(sb, advisor) {
  const out = { advisor: advisor.email, found: 0, processed: 0, no_user: 0, errors: 0 };
  if (!process.env[advisor.refreshEnv]) { out.skipped = 'no_refresh_token'; return out; }
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();

  let docs = [];
  try {
    docs = await gcal.driveListTranscriptDocs(advisor.email, sinceIso);
  } catch (e) {
    out.errors++; out.error = e.message; return out;
  }
  out.found = docs.length;

  for (const doc of docs) {
    try {
      if (await alreadyProcessed(sb, doc.id)) continue;

      const text = await gcal.driveExportText(advisor.email, doc.id);
      if (!text || text.trim().length < 20) { await markProcessed(sb, doc.id, null); continue; }

      let resolved = await resolveUserByBooking(sb, advisor.email, doc.createdTime);
      if (!resolved) resolved = await resolveUserByName(sb, advisor.email, doc.name);
      if (!resolved) {
        out.no_user++;
        await logWebhook(sb, {
          file_id: doc.id,
        }, 'no_user', 'transcript_no_matching_booking');
        await markProcessed(sb, doc.id, null); // no reintentar en bucle
        continue;
      }
      const { user, booking } = resolved;
      const updated = await summarizeAndCompile({
        priorHistorial: user.historial || '',
        rawNotes: text,
        meeting: { meeting_date: (doc.createdTime || '').slice(0, 10), meeting_title: booking.topic || doc.name },
      });
      const patch = { historial: updated, historial_updated_at: new Date().toISOString() };
      const { error: ep } = await sb.from('users').update(patch).eq('id', user.id);
      if (ep) throw ep;

      await markProcessed(sb, doc.id, user.id);

      // Guarda la transcripción en la carpeta "transcripts" del cliente (best-effort).
      try {
        const gdrive = require('../../lib/google-drive');
        if (gdrive.isConfigured()) {
          const { data: ufull } = await sb
            .from('users')
            .select('id, nombre, apellidos, lead_id, gdrive_folders')
            .eq('id', user.id)
            .single();
          if (ufull) {
            await gdrive.saveClientTranscript(sb, ufull, {
              title: booking.topic || doc.name || 'Reunion Meet',
              dateStr: (doc.createdTime || '').slice(0, 10),
              text,
            });
          }
        }
      } catch (driveErr) {
        console.error('[drive_transcript_warn]', errorCode(driveErr, 'drive_transcript_failed'));
      }

      await logWebhook(sb, { file_id: doc.id, booking_id: booking.id, user_id: user.id },
        'ok', 'user_history_updated');
      out.processed++;
    } catch (e) {
      out.errors++;
      await logWebhook(sb, { file_id: doc.id }, 'error', errorCode(e));
    }
  }
  return out;
}

exports.handler = async (event) => {
  if (event && event.httpMethod) return json({ error: 'not_found' }, { statusCode: 404 });

  const sb = getSupabase();
  const results = [];
  for (const advisor of ADVISORS) {
    results.push(await pollAdvisor(sb, advisor));
  }
  const summary = { ok: true, ran_at: new Date().toISOString(), results };
  console.log('meet-transcript-poll', JSON.stringify(summary));
  return json(summary);
};
