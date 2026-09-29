/**
 * /api/admin/drive-sync
 * (Re)genera la estructura de Google Drive y sube DNI/contrato de clientes.
 * Solo admin. Best-effort igual que el flujo de pago, pero lanzado a mano.
 *
 * Dos formas de invocarlo:
 *   POST  { "lead_id": "1896" }  |  { "all": true, "limit": 50 }
 *   GET   ?lead_id=1896          |  ?all=1&limit=50   (comodo: se abre en el navegador)
 *
 * Respuesta:
 *   { ok, count, processed:[{lead_id, ok, folders?, skipped?, reason?, error?}] }
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { syncDriveForUser } = require('../../lib/onboarding-fulfill');

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'POST' && method !== 'GET') return methodNotAllowed(['GET', 'POST']);
  // En POST validamos Origin (llamadas desde la app). En GET (URL directa) no aplica.
  if (method === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });

  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: admin, error: e1 } = await sb
      .from('users')
      .select('id, email, username, role')
      .eq('id', session.uid)
      .single();
    if (e1 || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // Parametros desde body (POST) o query string (GET).
    const body = method === 'POST' ? (parseJsonBody(event) || {}) : {};
    const q = event.queryStringParameters || {};
    const wantAll = body.all === true || q.all === '1' || q.all === 'true';
    const leadId = body.lead_id != null ? body.lead_id : (q.lead_id != null ? q.lead_id : null);
    const limitRaw = body.limit != null ? body.limit : q.limit;

    let targets = [];
    if (wantAll) {
      const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 200);
      const { data: rows, error: e2 } = await sb
        .from('users')
        .select('id, lead_id')
        .eq('pago_completed', true)
        .is('gdrive_folders', null)
        .limit(limit);
      if (e2) throw e2;
      targets = rows || [];
    } else if (leadId != null) {
      const { data: u, error: e3 } = await sb
        .from('users')
        .select('id, lead_id')
        .eq('lead_id', String(leadId))
        .single();
      if (e3 || !u) return json({ error: 'user_not_found', detail: 'lead_id ' + leadId }, { statusCode: 404 });
      targets = [u];
    } else {
      return json({ error: 'missing_target', detail: 'Envia lead_id o all (all=1)' }, { statusCode: 400 });
    }

    const processed = [];
    for (const t of targets) {
      try {
        const res = await syncDriveForUser(sb, t.id);
        processed.push({
          lead_id: t.lead_id,
          ok: !res || !res.skipped,
          folders: res && res.folders,
          skipped: res && res.skipped,
          reason: res && res.reason,
        });
      } catch (err) {
        processed.push({ lead_id: t.lead_id, ok: false, error: err && err.message });
      }
    }

    return json({ ok: true, count: processed.length, processed });
  } catch (e) {
    console.error('drive-sync error', e);
    return serverError(e);
  }
};
