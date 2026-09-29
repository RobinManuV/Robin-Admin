/**
 * GET /api/admin/drive-health
 * Diagnostico del fulfillment de Google Drive. Solo admin.
 *
 * Devuelve:
 *  - configured: boolean  (estan las 4 env vars)
 *  - missing_env: string[]  (cuales faltan)
 *  - oauth: { ok, error }  (intenta obtener un access token real)
 *  - parent_folder_ok: boolean  (la carpeta padre existe y es accesible)
 *  - pending_backfill: number  (clientes pagados SIN carpeta de Drive)
 *
 * Con esto sabes en 10s por que no se crean carpetas:
 *  - missing_env no vacio        -> falta configurar una variable en Netlify
 *  - oauth.error 'invalid_grant' -> el refresh token caduco/fue revocado (regenerar)
 *  - parent_folder_ok false      -> el GOOGLE_DRIVE_PARENT_FOLDER_ID es incorrecto o sin permiso
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const drive = require('../../lib/google-drive');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
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

    // 1) Config
    const missing_env = [];
    if (!process.env.GOOGLE_CLIENT_ID) missing_env.push('GOOGLE_CLIENT_ID');
    if (!process.env.GOOGLE_CLIENT_SECRET) missing_env.push('GOOGLE_CLIENT_SECRET');
    if (!process.env.GOOGLE_REFRESH_TOKEN) missing_env.push('GOOGLE_REFRESH_TOKEN');
    if (!process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) missing_env.push('GOOGLE_DRIVE_PARENT_FOLDER_ID');
    const configured = missing_env.length === 0;

    // 2) OAuth: intenta obtener token real
    let oauth = { ok: false, error: null };
    let token = null;
    if (configured) {
      try {
        token = await drive.getAccessToken();
        oauth = { ok: true, error: null };
      } catch (err) {
        oauth = { ok: false, error: err && err.message };
      }
    } else {
      oauth = { ok: false, error: 'not_configured' };
    }

    // 3) Carpeta padre accesible
    let parent_folder_ok = null;
    if (oauth.ok) {
      const pid = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
      try {
        const r = await fetch(
          'https://www.googleapis.com/drive/v3/files/' + pid +
            '?fields=id,name&supportsAllDrives=true',
          { headers: { Authorization: 'Bearer ' + token } }
        );
        parent_folder_ok = r.ok;
      } catch (_) {
        parent_folder_ok = false;
      }
    }

    // 4) Cuantos clientes pagados no tienen carpeta
    let pending_backfill = null;
    try {
      const { count } = await sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('pago_completed', true)
        .is('gdrive_folders', null);
      pending_backfill = count == null ? null : count;
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }

    return json({
      configured,
      missing_env,
      oauth,
      parent_folder_ok,
      pending_backfill,
    });
  } catch (e) {
    console.error('drive-health error', e);
    return serverError(e);
  }
};
