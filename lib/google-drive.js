/**
 * Google Drive helper — sube archivos al Drive de hello@project-robin.com.
 *
 * Autenticación: OAuth 2.0 con refresh token. Env vars obligatorias:
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - GOOGLE_REFRESH_TOKEN          (generado una sola vez con hello@project-robin.com)
 *   - GOOGLE_DRIVE_PARENT_FOLDER_ID (ID de la carpeta "clientes 2027" en ese Drive)
 *
 * No usa el paquete googleapis: usa fetch nativo de Node 18+ para mantener
 * las funciones ligeras.
 *
 * Diseño "best-effort": si Drive falla, los flujos de onboarding/upload no rompen.
 * El estado se persiste en users.gdrive_folders jsonb:
 *   {
 *     root: 'fileId',
 *     dni: 'fileId',
 *     contrato: 'fileId',
 *     documentos: 'fileId',
 *     carreras: { <career_template_id>: 'fileId' }
 *   }
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let _cachedToken = null;
let _cachedTokenExp = 0;

function isConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID
  );
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('google_drive_not_configured');
  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExp - 60000) return _cachedToken;

  const body = new URLSearchParams({
    client_id: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
    client_secret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    refresh_token: String(process.env.GOOGLE_REFRESH_TOKEN || '').trim(),
    grant_type: 'refresh_token',
  });
  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error('google_oauth_failed: ' + (data.error_description || data.error || resp.status));
  }
  _cachedToken = data.access_token;
  _cachedTokenExp = now + ((data.expires_in || 3600) * 1000);
  return _cachedToken;
}

function escapeQueryString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolderByName(name, parentId, token) {
  const q = "name = '" + escapeQueryString(name) + "' and '" + parentId + "' in parents " +
            "and mimeType = '" + FOLDER_MIME + "' and trashed = false";
  const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true';
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('drive_find_failed: ' + ((data.error && data.error.message) || resp.status));
  const f = (data.files || [])[0];
  return f ? f.id : null;
}

async function createFolder(name, parentId, token) {
  const resp = await fetch(DRIVE_API + '/files?fields=id,name&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('drive_create_folder_failed: ' + ((data.error && data.error.message) || resp.status));
  return data.id;
}

async function findOrCreateFolder(name, parentId, token) {
  const found = await findFolderByName(name, parentId, token);
  if (found) return found;
  return createFolder(name, parentId, token);
}

/**
 * Subida multipart a Drive con metadata + contenido binario.
 * file: { name, mimeType, buffer | base64 | dataUrl }
 */
async function uploadFile(file, parentId, token) {
  let buf;
  if (file.buffer) {
    buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  } else if (file.base64) {
    buf = Buffer.from(file.base64, 'base64');
  } else if (file.dataUrl) {
    const m = String(file.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error('drive_upload_bad_dataurl');
    buf = Buffer.from(m[2], 'base64');
    if (!file.mimeType) file.mimeType = m[1];
  } else {
    throw new Error('drive_upload_missing_content');
  }
  const mimeType = file.mimeType || 'application/octet-stream';
  const name = file.name || 'archivo.bin';
  const metadata = { name, parents: [parentId] };
  if (file.targetMimeType) metadata.mimeType = file.targetMimeType;

  const boundary = '----robin-drive-' + Math.random().toString(36).slice(2);
  const closing = '\r\n--' + boundary + '--\r\n';
  const metaPart =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + mimeType + '\r\n' +
    'Content-Transfer-Encoding: binary\r\n\r\n';
  const body = Buffer.concat([
    Buffer.from(metaPart, 'utf8'),
    buf,
    Buffer.from(closing, 'utf8'),
  ]);

  const resp = await fetch(DRIVE_UPLOAD + '/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary,
      'Content-Length': String(body.length),
    },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('drive_upload_failed: ' + ((data.error && data.error.message) || resp.status));
  return data; // { id, name, webViewLink }
}

/**
 * Asegura el set de carpetas del cliente.
 * - Si users.gdrive_folders ya tiene root/dni/contrato/documentos válidos → devuelve eso.
 * - Si faltan, los crea (idempotente vía findOrCreateFolder) y persiste en Supabase.
 *
 * folderName por defecto: "Nombre Apellidos - lead_id"
 */
/**
 * Nombre canonico de la carpeta raiz del cliente: "<Nombre> <Apellidos> - PR<lead_id>".
 * Tras el DNI, users.nombre/apellidos ya contienen el nombre del DNI.
 */
function clientFolderName(user) {
  const nombre = (user.nombre || '').trim();
  const apellidos = (user.apellidos || '').trim();
  const leadId = user.lead_id || user.id;
  const baseName = [nombre, apellidos].filter(Boolean).join(' ') || 'Cliente';
  return baseName + ' - PR' + leadId;
}

async function ensureClientFolders(sb, user, opts = {}) {
  if (!isConfigured()) return null;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  const nombre = (user.nombre || '').trim();
  const apellidos = (user.apellidos || '').trim();
  const leadId = user.lead_id || user.id;
  const baseName = [nombre, apellidos].filter(Boolean).join(' ') || 'Cliente';
  const folderName = opts.folderName || clientFolderName(user);

  const existing = user.gdrive_folders || {};
  const token = await getAccessToken();

  const root = existing.root || await findOrCreateFolder(folderName, parentId, token);
  const dni = existing.dni || await findOrCreateFolder('DNI', root, token);
  const contrato = existing.contrato || await findOrCreateFolder('Contrato', root, token);
  const documentos = existing.documentos || await findOrCreateFolder('documentos', root, token);
  const transcripts = existing.transcripts || await findOrCreateFolder('transcripts', root, token);

  const gdrive_folders = {
    root,
    dni,
    contrato,
    documentos,
    transcripts,
    carreras: existing.carreras || {},
  };
  const changed = !existing.root || !existing.dni || !existing.contrato || !existing.documentos || !existing.transcripts;
  if (changed) {
    try {
      await sb.from('users').update({ gdrive_folders }).eq('id', user.id);
    } catch (e) {
      console.error('ensureClientFolders persist warn:', e && e.message);
    }
  }
  return gdrive_folders;
}

/**
 * Devuelve (o crea) la subcarpeta de una carrera dentro de "documentos".
 * Persiste el ID en users.gdrive_folders.carreras[careerTemplateId].
 */
async function ensureCareerFolder(sb, user, careerTemplateId, careerName) {
  if (!isConfigured()) return null;
  const folders = await ensureClientFolders(sb, user);
  if (!folders) return null;
  const existing = (folders.carreras || {})[careerTemplateId];
  if (existing) return { folderId: existing, folders };
  const token = await getAccessToken();
  const safeName = (careerName || ('Carrera ' + careerTemplateId)).replace(/[\\/]/g, '-').trim();
  const folderId = await findOrCreateFolder(safeName, folders.documentos, token);
  const carreras = Object.assign({}, folders.carreras || {}, { [careerTemplateId]: folderId });
  const next = Object.assign({}, folders, { carreras });
  try {
    await sb.from('users').update({ gdrive_folders: next }).eq('id', user.id);
  } catch (e) {
    console.error('ensureCareerFolder persist warn:', e && e.message);
  }
  return { folderId, folders: next };
}

/**
 * Devuelve (o crea) la subcarpeta "transcripts" del cliente (dentro de su raíz).
 * Persiste el ID en users.gdrive_folders.transcripts.
 */
async function ensureTranscriptsFolder(sb, user) {
  if (!isConfigured()) return null;
  const folders = await ensureClientFolders(sb, user);
  if (!folders) return null;
  if (folders.transcripts) return { folderId: folders.transcripts, folders };
  const token = await getAccessToken();
  const folderId = await findOrCreateFolder('transcripts', folders.root, token);
  const next = Object.assign({}, folders, { transcripts: folderId });
  try {
    await sb.from('users').update({ gdrive_folders: next }).eq('id', user.id);
  } catch (e) {
    console.error('ensureTranscriptsFolder persist warn:', e && e.message);
  }
  return { folderId, folders: next };
}

/**
 * Guarda el texto de una transcripción como Google Doc dentro de la carpeta
 * "transcripts" del cliente. Best-effort: nunca lanza.
 * @param {{title?:string, dateStr?:string, text:string}} meta
 * @returns {Promise<{ok?:boolean, file_id?:string, link?:string, skipped?:boolean, reason?:string}>}
 */
async function saveClientTranscript(sb, user, meta) {
  try {
    if (!isConfigured()) return { skipped: true, reason: 'not_configured' };
    const text = meta && meta.text ? String(meta.text) : '';
    if (!text.trim()) return { skipped: true, reason: 'empty' };
    const tf = await ensureTranscriptsFolder(sb, user);
    if (!tf || !tf.folderId) return { skipped: true, reason: 'no_folder' };
    const token = await getAccessToken();
    const safeTitle = String((meta && meta.title) || 'Reunion').replace(/[\\/]/g, '-').slice(0, 120).trim();
    const name = [meta && meta.dateStr, safeTitle].filter(Boolean).join(' - ') || safeTitle;
    const file = await uploadFile({
      name,
      mimeType: 'text/plain',
      targetMimeType: 'application/vnd.google-apps.document',
      buffer: Buffer.from(text, 'utf8'),
    }, tf.folderId, token);
    return { ok: true, file_id: file.id, name: file.name, link: file.webViewLink };
  } catch (e) {
    console.error('saveClientTranscript error:', e && e.message);
    return { skipped: true, reason: 'error', detail: e && e.message };
  }
}

/**
 * Renombra una carpeta en Drive (soporta unidades compartidas).
 */
async function renameFolder(fileId, name, token) {
  const resp = await fetch(DRIVE_API + '/files/' + fileId + '?fields=id,name&supportsAllDrives=true', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('drive_rename_failed: ' + ((data.error && data.error.message) || resp.status));
  return data;
}

/**
 * Renombra la carpeta raiz del cliente al formato "<Nombre DNI> - PR<lead_id>".
 * Best-effort: solo actua si ya existe la raiz. Nunca lanza.
 */
async function renameClientFolder(sb, user) {
  try {
    if (!isConfigured()) return { skipped: true, reason: 'not_configured' };
    const folders = user.gdrive_folders || {};
    if (!folders.root) return { skipped: true, reason: 'no_root' };
    const desired = clientFolderName(user);
    const token = await getAccessToken();
    const info = await renameFolder(folders.root, desired, token);
    return { ok: true, id: folders.root, name: info.name };
  } catch (e) {
    console.error('renameClientFolder error:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

module.exports = {
  isConfigured,
  getAccessToken,
  findOrCreateFolder,
  createFolder,
  uploadFile,
  ensureClientFolders,
  ensureCareerFolder,
  ensureTranscriptsFolder,
  saveClientTranscript,
  clientFolderName,
  renameFolder,
  renameClientFolder,
};
