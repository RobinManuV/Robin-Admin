/**
 * Helpers de almacenamiento privado en Supabase Storage.
 *
 * Los binarios viven en Storage y la BD sólo guarda la ruta
 * (`file_path` / `template_path`).
 *
 * El bucket por defecto es `documents` (configurable con SUPABASE_DOCS_BUCKET). Los
 * flujos especializados, como DNI, pueden pasar explícitamente su bucket privado.
 * Todos deben existir antes del despliegue.
 */
const DOCS_BUCKET = process.env.SUPABASE_DOCS_BUCKET || 'documents';
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

// Parsea un dataURL "data:<mime>;base64,<datos>" -> { mime, buffer }.
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]*)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const isB64 = !!m[2];
  const raw = m[3] || '';
  const buffer = isB64
    ? Buffer.from(raw, 'base64')
    : Buffer.from(decodeURIComponent(raw), 'utf8');
  return { mime, buffer };
}

function sanitize(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
}

function uploadDescriptor({ filename, contentType, size }, { maxBytes = MAX_DOCUMENT_BYTES } = {}) {
  const safeFilename = String(filename || '').trim();
  const safeContentType = String(contentType || 'application/octet-stream').trim().toLowerCase();
  const numericSize = Number(size);
  if (!safeFilename || safeFilename.length > 255) return { ok: false, error: 'invalid_filename' };
  if (!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(safeContentType) || safeContentType.length > 120) {
    return { ok: false, error: 'invalid_mime' };
  }
  if (!Number.isSafeInteger(numericSize) || numericSize <= 0) return { ok: false, error: 'invalid_file_size' };
  if (numericSize > maxBytes) return { ok: false, error: 'file_too_large' };
  return { ok: true, filename: safeFilename, contentType: safeContentType, size: numericSize };
}

function pathInsidePrefix(path, keyPrefix) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const normalizedPrefix = String(keyPrefix || '').replace(/^\/+|\/+$/g, '');
  return !!normalizedPrefix && normalizedPath.startsWith(normalizedPrefix + '/');
}

async function createSignedUpload(sb, { keyPrefix, filename, contentType, size, bucket = DOCS_BUCKET }) {
  const descriptor = uploadDescriptor({ filename, contentType, size });
  if (!descriptor.ok) throw new Error(descriptor.error);
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 10);
  const path = `${String(keyPrefix || 'misc').replace(/^\/+|\/+$/g, '')}/${ts}_${rnd}_${sanitize(descriptor.filename)}`;
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  if (!data || !data.signedUrl) throw new Error('storage_signed_upload_missing');
  return { path, signedUrl: data.signedUrl, expiresIn: 7200 };
}

async function verifyUploadedObject(sb, path, {
  keyPrefix,
  contentType,
  size,
  maxBytes = MAX_DOCUMENT_BYTES,
  bucket = DOCS_BUCKET,
} = {}) {
  if (!pathInsidePrefix(path, keyPrefix)) throw new Error('invalid_storage_path');
  const descriptor = uploadDescriptor({ filename: String(path).split('/').pop(), contentType, size }, { maxBytes });
  if (!descriptor.ok) throw new Error(descriptor.error);
  const { data, error } = await sb.storage.from(bucket).info(path);
  if (error) throw error;
  if (!data) throw new Error('storage_object_missing');
  const actualSize = Number(data.size);
  const actualType = String(data.contentType || '').toLowerCase();
  if (!Number.isSafeInteger(actualSize) || actualSize !== descriptor.size || actualSize > maxBytes) {
    throw new Error('invalid_uploaded_size');
  }
  if (actualType && actualType !== descriptor.contentType) throw new Error('invalid_uploaded_mime');
  return { size: actualSize, contentType: actualType || descriptor.contentType };
}

// Sube un dataURL al bucket. Devuelve { path, mime, size }.
async function uploadDataUrl(sb, dataUrl, { keyPrefix, filename, contentType } = {}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('invalid_data_url');
  const mime = contentType || parsed.mime;
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const path = `${keyPrefix || 'misc'}/${ts}_${rnd}_${sanitize(filename)}`;
  const up = await sb.storage.from(DOCS_BUCKET).upload(path, parsed.buffer, {
    contentType: mime,
    upsert: true,
  });
  if (up.error) throw up.error;
  return { path, mime, size: parsed.buffer.length };
}

async function copyObject(sb, sourcePath, { keyPrefix, filename } = {}) {
  if (!sourcePath) throw new Error('missing_storage_source');
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const path = `${keyPrefix || 'misc'}/${ts}_${rnd}_${sanitize(filename)}`;
  const { error } = await sb.storage.from(DOCS_BUCKET).copy(sourcePath, path);
  if (error) throw error;
  return { path };
}

async function downloadObject(sb, path, { bucket = DOCS_BUCKET } = {}) {
  if (!path) throw new Error('missing_storage_path');
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error) throw error;
  if (!data) throw new Error('storage_download_missing');
  return Buffer.from(await data.arrayBuffer());
}

// URL firmada temporal (default 5 min). `download` (filename) fuerza Content-Disposition.
async function signedUrl(sb, path, { expiresIn = 300, download } = {}) {
  if (!path) return null;
  const opts = {};
  if (download) opts.download = download;
  const { data, error } = await sb.storage.from(DOCS_BUCKET).createSignedUrl(path, expiresIn, opts);
  if (error) throw error;
  if (!data || !data.signedUrl) throw new Error('storage_signed_url_missing');
  return data.signedUrl;
}

// Borra un objeto (best-effort; nunca lanza).
async function removeObject(sb, path, { bucket = DOCS_BUCKET } = {}) {
  if (!path) return;
  try { await sb.storage.from(bucket).remove([path]); } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
}

module.exports = {
  DOCS_BUCKET,
  MAX_DOCUMENT_BYTES,
  copyObject,
  createSignedUpload,
  downloadObject,
  pathInsidePrefix,
  parseDataUrl,
  uploadDescriptor,
  uploadDataUrl,
  signedUrl,
  removeObject,
  verifyUploadedObject,
};
