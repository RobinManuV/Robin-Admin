/**
 * POST /api/documents/upload-ticket
 * Crea una URL firmada de uso temporal para subir directamente al bucket privado.
 * El binario nunca atraviesa Netlify; esta función sólo autoriza destino y metadatos.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, ownsRecord } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const storage = require('../../lib/storage');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: caller } = await sb.from('users')
      .select('id, email, username, role').eq('id', session.uid).single();
    if (!caller) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(caller);
    let keyPrefix;

    if (body.purpose === 'document') {
      const { data: document } = await sb.from('documents')
        .select('id, user_id').eq('id', body.document_id).single();
      if (!document) return json({ error: 'not_found' }, { statusCode: 404 });
      if (!isAdmin && !ownsRecord(caller, document)) {
        return json({ error: 'forbidden' }, { statusCode: 403 });
      }
      keyPrefix = `${document.user_id}/${document.id}`;
    } else if (body.purpose === 'document_template') {
      if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
      if (!body.user_id) return json({ error: 'missing_user_id' }, { statusCode: 400 });
      const { data: target } = await sb.from('users').select('id').eq('id', body.user_id).single();
      if (!target) return json({ error: 'user_not_found' }, { statusCode: 404 });
      keyPrefix = `${target.id}/templates/${caller.id}`;
    } else if (body.purpose === 'career_template') {
      if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
      keyPrefix = `career-templates/${caller.id}`;
    } else {
      return json({ error: 'invalid_purpose' }, { statusCode: 400 });
    }

    if (body.action === 'cancel') {
      if (!storage.pathInsidePrefix(body.file_path, keyPrefix)) {
        return json({ error: 'invalid_storage_path' }, { statusCode: 400 });
      }
      await storage.removeObject(sb, body.file_path);
      return json({ ok: true });
    }

    const descriptor = storage.uploadDescriptor({
      filename: body.file_filename,
      contentType: body.file_mime,
      size: body.file_size,
    });
    if (!descriptor.ok) return json({ error: descriptor.error }, { statusCode: 400 });

    const upload = await storage.createSignedUpload(sb, {
      keyPrefix,
      filename: descriptor.filename,
      contentType: descriptor.contentType,
      size: descriptor.size,
    });
    return json({
      upload: {
        path: upload.path,
        signed_url: upload.signedUrl,
        expires_in: upload.expiresIn,
      },
    });
  } catch (error) {
    return serverError(error, 'documents.upload_ticket');
  }
};
