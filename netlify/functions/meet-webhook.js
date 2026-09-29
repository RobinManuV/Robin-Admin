/**
 * POST /api/meet/webhook?advisor=<email>&token=<secret>
 *
 * Receptor de notificaciones de Google Workspace Events (Meet) entregadas por
 * Pub/Sub push para el flujo de transcripción.
 *
 * Cada asesor tiene su propio canal de Workspace Events sobre su Meet;
 * su push endpoint incluye ?advisor=<su_email> para saber con qué credenciales
 * OAuth recuperar la transcripción.
 *
 * El body es un Pub/Sub push con `message.data` codificado en base64.
 * Evento relevante: google.workspace.meet.transcript.v2.fileGenerated.
 *
 * Auth: query ?token= o header X-Meet-Webhook-Secret == MEET_WEBHOOK_SECRET.
 *
 * Al recibir una transcripción lista:
 *   - recupera el texto (Meet REST API),
 *   - resuelve el cliente (booking del asesor más cercano en el tiempo),
 *   - resume con Claude y compila users.historial (conservando reuniones previas).
 * Todo se loguea en webhook_log (source='meet').
 */
const { getSupabase } = require('../../lib/supabase');
const { json, methodNotAllowed, serverError, verifyConfiguredSecret } = require('../../lib/http');
const { isAdminEmail, canonicalAdvisorEmail } = require('../../lib/admins');
const { createOperationLogger, errorCode } = require('../../lib/observability');
const { logMeetWebhook, processMeetTranscript } = require('../../lib/meet-transcript');

function header(event, name) {
  if (!event.headers) return '';
  const lower = name.toLowerCase();
  for (const k of Object.keys(event.headers)) {
    if (k.toLowerCase() === lower) return event.headers[k];
  }
  return '';
}

exports.handler = async (event) => {
  const log = createOperationLogger(event, {
    operation: 'webhook.meet',
    actor_role: 'provider',
    integration: 'google_meet',
  });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return methodNotAllowed(['POST']);
  }

  const q = event.queryStringParameters || {};
  // Auth por secreto compartido
  const expected = process.env.MEET_WEBHOOK_SECRET || '';
  const provided = q.token || header(event, 'x-meet-webhook-secret');
  const secret = verifyConfiguredSecret(expected, provided);
  if (!secret.ok && secret.statusCode === 500) {
    log.warn('degraded', { error_code: 'meet_webhook_secret_not_configured' });
    return json({ error: secret.error }, { statusCode: secret.statusCode });
  }

  const sb = getSupabase();
  if (!secret.ok) {
    await logMeetWebhook(sb, { q }, 'rejected', 'invalid_secret');
    log.warn('rejected', { error_code: 'invalid_secret' });
    return json({ error: secret.error }, { statusCode: secret.statusCode });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (error) {
    log.warn('rejected', { error_code: 'invalid_json' });
    return json({ error: 'invalid_json' }, { statusCode: 400 });
  }

  if (!body.message || typeof body.message.data !== 'string') {
    log.warn('rejected', { error_code: 'invalid_pubsub_message' });
    return json({ error: 'invalid_pubsub_message' }, { statusCode: 400 });
  }

  let inner = {};
  let ceType = header(event, 'ce-type') || '';
  try {
    const decoded = Buffer.from(body.message.data, 'base64').toString('utf8');
    inner = JSON.parse(decoded);
  } catch (_) {
    log.warn('rejected', { error_code: 'invalid_pubsub_message' });
    return json({ error: 'invalid_pubsub_message' }, { statusCode: 400 });
  }
  const attrs = body.message.attributes || {};
  ceType = attrs['ce-type'] || attrs.eventType || ceType;

  const advisorEmail = canonicalAdvisorEmail(String(q.advisor || ''));
  if (!advisorEmail || !isAdminEmail(advisorEmail)) {
    await logMeetWebhook(sb, { ce_type: ceType }, 'rejected', 'missing_or_unknown_advisor');
    log.warn('rejected', { error_code: 'unknown_advisor' });
    return json({ error: 'unknown_advisor' }, { statusCode: 400 });
  }

  // Serializamos para extraer nombres de recurso por regex (tolerante al esquema)
  const flat = JSON.stringify(inner || {});
  const transcriptName = (flat.match(/conferenceRecords\/[^"\\\/]+\/transcripts\/[^"\\\/]+/) || [])[0]
    || null;
  const conferenceRecord = (flat.match(/conferenceRecords\/[^"\\\/]+/) || [])[0]
    || null;

  // Filtro de evento: solo procesamos transcripciones listas.
  const isTranscriptEvent = /transcript/i.test(ceType) || !!transcriptName;
  if (!isTranscriptEvent) {
    await logMeetWebhook(sb, { ce_type: ceType, has_transcript: !!transcriptName }, 'ignored', 'event=' + ceType);
    log.result('ignored', { entity_type: 'meet_event' });
    return json({ ok: true, ignored: ceType || 'no_transcript' });
  }

  try {
    const result = await processMeetTranscript({
      sb, advisorEmail, transcriptName, conferenceRecord, log,
    });
    return json(result.payload, { statusCode: result.statusCode });
  } catch (error) {
    log.failure(error, { entity_type: 'meet_transcript', entity_id: transcriptName });
    await logMeetWebhook(sb, {
      transcript_name: transcriptName,
      conference_record: conferenceRecord,
    }, 'error', errorCode(error));
    return serverError(error);
  }
};
