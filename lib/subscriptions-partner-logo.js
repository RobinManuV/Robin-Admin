const crypto = require('node:crypto');

const BUCKET = 'partner-logos';
const MAX_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function parseImageDataUrl(value) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  const validSignature =
    (match[1] === 'image/png' && buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (match[1] === 'image/jpeg' && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (match[1] === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
  if (!validSignature) return null;
  return { buffer, contentType: match[1], extension: MIME_EXTENSIONS[match[1]] };
}

function safeSegment(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean || crypto.randomUUID();
}

async function uploadPartnerLogo(sb, image, partnerId) {
  const owner = safeSegment(partnerId);
  const path = `${owner}/logo-${Date.now()}.${image.extension}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, image.buffer, {
    contentType: image.contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw new Error('logo_public_url_missing');
  return { logoUrl: data.publicUrl, path };
}

module.exports = { BUCKET, MAX_BYTES, parseImageDataUrl, safeSegment, uploadPartnerLogo };
