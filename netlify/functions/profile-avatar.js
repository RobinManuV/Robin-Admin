const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const storage = require('../../lib/storage');

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function avatarPrefix(userId) {
  return `${userId}/profile/avatar`;
}

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function avatarDescriptor(body) {
  const descriptor = storage.uploadDescriptor({
    filename: body && body.file_filename,
    contentType: body && body.file_mime,
    size: body && body.file_size,
  }, { maxBytes: MAX_AVATAR_BYTES });
  if (!descriptor.ok) throw invalid(descriptor.error);
  if (!AVATAR_MIME_TYPES.has(descriptor.contentType)) throw invalid('invalid_file_type');
  return descriptor;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: user, error: userError } = await sb.from('users')
      .select('id, avatar_path').eq('id', session.uid).single();
    if (userError || !user) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const prefix = avatarPrefix(user.id);
    const action = String(body.action || '');

    if (action === 'upload_ticket') {
      const descriptor = avatarDescriptor(body);
      const upload = await storage.createSignedUpload(sb, {
        keyPrefix: prefix,
        filename: descriptor.filename,
        contentType: descriptor.contentType,
        size: descriptor.size,
      });
      return json({ upload: { path: upload.path, signed_url: upload.signedUrl, expires_in: upload.expiresIn } });
    }

    if (action === 'cancel') {
      if (!storage.pathInsidePrefix(body.file_path, prefix)) throw invalid('invalid_storage_path');
      await storage.removeObject(sb, body.file_path);
      return json({ ok: true });
    }

    if (action !== 'commit') throw invalid('invalid_action');
    const descriptor = avatarDescriptor(body);
    if (!storage.pathInsidePrefix(body.file_path, prefix)) throw invalid('invalid_storage_path');
    await storage.verifyUploadedObject(sb, body.file_path, {
      keyPrefix: prefix,
      contentType: descriptor.contentType,
      size: descriptor.size,
      maxBytes: MAX_AVATAR_BYTES,
    });
    const { error: updateError } = await sb.from('users')
      .update({ avatar_path: body.file_path }).eq('id', user.id);
    if (updateError) throw updateError;

    const avatarUrl = await storage.signedUrl(sb, body.file_path, { expiresIn: 3600 });
    if (user.avatar_path && user.avatar_path !== body.file_path) {
      await storage.removeObject(sb, user.avatar_path);
    }
    return json({ ok: true, avatar_url: avatarUrl });
  } catch (error) {
    if (error && error.statusCode === 400) {
      return json({ error: error.code || error.message || 'invalid_avatar' }, { statusCode: 400 });
    }
    return serverError(error, 'profile.avatar');
  }
};

module.exports.avatarDescriptor = avatarDescriptor;
module.exports.avatarPrefix = avatarPrefix;
module.exports.MAX_AVATAR_BYTES = MAX_AVATAR_BYTES;
