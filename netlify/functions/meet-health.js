/**
 * GET /api/meet/health?token=<MEET_WEBHOOK_SECRET>
 *
 * Diagnóstico de solo lectura de toda la integración Meet/Calendar/Drive.
 * No crea reuniones ni escribe nada. Comprueba, por asesor:
 *   - refresh token presente
 *   - OAuth (getAccessToken) funciona
 *   - Calendar freeBusy funciona (reservas + disponibilidad)
 *   - Drive lectura funciona (recogida de transcripciones)
 * Y a nivel global: envs obligatorias y tablas accesibles.
 *
 * Devuelve un semáforo (ok/fail) por cada punto para verificar sin llamadas reales.
 */
const { getSupabase } = require('../../lib/supabase');
const { json, methodNotAllowed, verifyConfiguredSecret } = require('../../lib/http');
const { ADVISORS } = require('../../lib/admins');
const gcal = require('../../lib/google-calendar');

async function step(fn) {
  try { const detail = await fn(); return { ok: true, detail }; }
  catch (e) { return { ok: false, error: (e && e.message ? e.message : String(e)).slice(0, 200) }; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
  const q = event.queryStringParameters || {};
  const expected = process.env.MEET_WEBHOOK_SECRET || '';
  const secret = verifyConfiguredSecret(expected, q.token);
  if (!secret.ok) return json({ error: secret.error }, { statusCode: secret.statusCode });

  const sb = getSupabase();
  const now = new Date();
  const in1d = new Date(now.getTime() + 24 * 3600 * 1000);
  const since1h = new Date(now.getTime() - 3600 * 1000).toISOString();

  // ---- Env globales ----
  const env = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    MEET_WEBHOOK_SECRET: !!process.env.MEET_WEBHOOK_SECRET,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  };

  // ---- Tablas ----
  const tables = {};
  for (const t of ['bookings', 'processed_meet_docs', 'users', 'webhook_log']) {
    const r = await step(async () => {
      const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return 'accesible';
    });
    tables[t] = r;
  }

  // ---- Por asesor ----
  const advisors = [];
  for (const a of ADVISORS) {
    const row = { email: a.email, name: a.name, refresh_env: a.refreshEnv };
    row.token_present = !!process.env[a.refreshEnv];
    if (!row.token_present) {
      row.oauth = { ok: false, error: 'falta ' + a.refreshEnv };
      row.calendar_freebusy = { ok: false, error: 'sin token' };
      row.drive_read = { ok: false, error: 'sin token' };
      advisors.push(row);
      continue;
    }
    row.oauth = await step(async () => { await gcal.getAccessToken(a.email); return 'token OK'; });
    row.calendar_freebusy = await step(async () => {
      const busy = await gcal.freeBusy(a.email, now.toISOString(), in1d.toISOString());
      return `ocupado próx. 24h: ${busy.length} intervalos`;
    });
    row.drive_read = await step(async () => {
      const docs = await gcal.driveListTranscriptDocs(a.email, since1h);
      return `docs transcripción (última hora): ${docs.length}`;
    });
    advisors.push(row);
  }

  const allAdvisorsOk = advisors.every((a) => a.oauth.ok && a.calendar_freebusy.ok && a.drive_read.ok);
  const envOk = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ANTHROPIC_API_KEY;
  const tablesOk = Object.values(tables).every((t) => t.ok);

  return json({
    overall: (allAdvisorsOk && envOk && tablesOk) ? 'ok' : 'revisar',
    checked_at: now.toISOString(),
    env,
    tables,
    advisors,
    hint: 'Todo verde = listo. Si un asesor falla en drive_read pero oauth OK, revisa que el scope drive.readonly esté en su refresh token.',
  });
};
