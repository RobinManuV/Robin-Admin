/**
 * /api/admin/drive-rename
 * Renombra las carpetas de Google Drive de clientes que YA completaron el DNI
 * al formato "<Nombre DNI> - PR<lead_id>". Solo admin. Best-effort.
 *
 * Solo actua sobre clientes con dni_completed = true (los que aun no lo han
 * completado conservan su nombre de Notion). Nunca renombra la raiz si no existe.
 *
 * Dos formas de invocarlo:
 *   POST  { "lead_id": "1935" }  |  { "all": true, "limit": 100 }
 *   GET   ?lead_id=1935          |  ?all=1&limit=100   (comodo: se abre en el navegador)
 *
 * Respuesta:
 *   { ok, count, processed:[{lead_id, ok, name?, skipped?, reason?, error?}] }
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const drive = require('../../lib/google-drive');

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'POST' && method !== 'GET') return methodNotAllowed(['GET', 'POST']);
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

    const body = method === 'POST' ? (parseJsonBody(event) || {}) : {};
    const q = event.queryStringParameters || {};
    const wantAll = body.all === true || q.all === '1' || q.all === 'true';
    const leadId = body.lead_id != null ? body.lead_id : (q.lead_id != null ? q.lead_id : null);
    const limitRaw = body.limit != null ? body.limit : q.limit;

    const cols = 'id, lead_id, nombre, apellidos, dni_completed, gdrive_folders';
    let targets = [];
    if (wantAll) {
      const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);
      const { data: rows, error: e2 } = await sb
        .from('users')
        .select(cols)
        .eq('dni_completed', true)
        .not('gdrive_folders', 'is', null)
        .limit(limit);
      if (e2) throw e2;
      targets = rows || [];
    } else if (leadId != null) {
      const { data: u, error: e3 } = await sb
        .from('users')
        .select(cols)
        .eq('lead_id', String(leadId))
        .single();
      if (e3 || !u) return json({ error: 'user_not_found', detail: 'lead_id ' + leadId }, { statusCode: 404 });
      targets = [u];
    } else {
      return json({ error: 'missing_target', detail: 'Envia lead_id o all (all=1)' }, { statusCode: 400 });
    }

    const processed = [];
    for (const u of targets) {
      if (!u.dni_completed) {
        processed.push({ lead_id: u.lead_id, ok: false, skipped: true, reason: 'dni_not_completed' });
        continue;
      }
      const folders = u.gdrive_folders || {};
      if (!folders.root) {
        processed.push({ lead_id: u.lead_id, ok: false, skipped: true, reason: 'no_root' });
        continue;
      }
      try {
        const res = await drive.renameClientFolder(sb, u);
        processed.push({
          lead_id: u.lead_id,
          ok: !!(res && res.ok),
          name: res && res.name,
          skipped: res && res.skipped,
          reason: res && res.reason,
          error: res && res.error,
        });
      } catch (err) {
        processed.push({ lead_id: u.lead_id, ok: false, error: err && err.message });
      }
    }

    return json({ ok: true, count: processed.length, processed });
  } catch (e) {
    console.error('drive-rename error', e);
    return serverError(e);
  }
};
