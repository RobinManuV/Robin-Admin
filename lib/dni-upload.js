const { BUCKET } = require('./supabase');
const storage = require('./storage');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_DNI_IMAGE_BYTES = 10 * 1024 * 1024;
const SIDES = new Set(['anverso', 'reverso']);

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function normalizeDocType(value) {
  const docType = String(value || 'dni').toLowerCase();
  if (docType !== 'dni' && docType !== 'passport') throw invalid('invalid_doc_type');
  return docType;
}

function validateSide(docType, value) {
  const side = String(value || '').toLowerCase();
  if (!SIDES.has(side) || (docType === 'passport' && side !== 'anverso')) {
    throw invalid('invalid_document_side');
  }
  return side;
}

function validateImageDescriptor(input) {
  const descriptor = storage.uploadDescriptor({
    filename: input && input.filename,
    contentType: input && input.mime,
    size: input && input.size,
  }, { maxBytes: MAX_DNI_IMAGE_BYTES });
  if (!descriptor.ok) throw invalid(descriptor.error);
  if (!ALLOWED_MIME.has(descriptor.contentType)) throw invalid('invalid_file_type');
  return descriptor;
}

function keyPrefix(userId, side) {
  return `${userId}/${side}`;
}

async function createDniUploadTicket(sb, userId, input) {
  const docType = normalizeDocType(input && input.doc_type);
  const side = validateSide(docType, input && input.side);
  const descriptor = validateImageDescriptor({
    filename: input && input.file_filename,
    mime: input && input.file_mime,
    size: input && input.file_size,
  });
  return storage.createSignedUpload(sb, {
    keyPrefix: keyPrefix(userId, side),
    filename: descriptor.filename,
    contentType: descriptor.contentType,
    size: descriptor.size,
    bucket: BUCKET,
  });
}

async function cancelDniUpload(sb, userId, input) {
  const docType = normalizeDocType(input && input.doc_type);
  const side = validateSide(docType, input && input.side);
  const filePath = String(input && input.file_path || '');
  if (!storage.pathInsidePrefix(filePath, keyPrefix(userId, side))) {
    throw invalid('invalid_storage_path');
  }
  await storage.removeObject(sb, filePath, { bucket: BUCKET });
}

async function loadDniImage(sb, userId, side, input) {
  if (!input || typeof input !== 'object') throw invalid('missing_files');
  const filePath = String(input.path || '');
  const descriptor = validateImageDescriptor({
    filename: input.filename || filePath.split('/').pop(),
    mime: input.mime,
    size: input.size,
  });
  try {
    await storage.verifyUploadedObject(sb, filePath, {
      keyPrefix: keyPrefix(userId, side),
      contentType: descriptor.contentType,
      size: descriptor.size,
      maxBytes: MAX_DNI_IMAGE_BYTES,
      bucket: BUCKET,
    });
  } catch (error) {
    if (/^(invalid_|missing_)/.test(String(error && error.message))) {
      throw invalid(error.message);
    }
    throw error;
  }
  const content = await storage.downloadObject(sb, filePath, { bucket: BUCKET });
  return {
    path: filePath,
    base64: content.toString('base64'),
    mimetype: descriptor.contentType,
  };
}

async function loadDniImages(sb, userId, input) {
  const docType = normalizeDocType(input && input.doc_type);
  const anverso = await loadDniImage(sb, userId, 'anverso', input && input.anverso);
  const reverso = docType === 'passport'
    ? null
    : await loadDniImage(sb, userId, 'reverso', input && input.reverso);
  return { docType, anverso, reverso };
}

module.exports = {
  ALLOWED_MIME,
  MAX_DNI_IMAGE_BYTES,
  cancelDniUpload,
  createDniUploadTicket,
  loadDniImages,
  normalizeDocType,
  validateImageDescriptor,
  validateSide,
};
