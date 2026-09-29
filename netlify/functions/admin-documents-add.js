/**
 * POST /api/admin/documents/add
 * Body: { user_id, name, required, template_path?, template_filename?, template_mime?, template_size? }
 * Crea una solicitud de documento custom para el alumno, opcionalmente con plantilla.
 */
const { getSupabase } = require('../../lib/supabase');
const storage = require('../../lib/storage');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
  const { user_id, name, required = true, template_path, template_filename, template_mime, template_size } = body;
  if (!user_id || !name) return json({ error: 'missing_fields' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
    const { data: target } = await sb.from('users').select('id').eq('id', user_id).single();
    if (!target) return json({ error: 'user_not_found' }, { statusCode: 404 });

    // La plantilla ya debe existir en Storage mediante una URL de subida firmada.
    if (template_path) {
      const descriptor = storage.uploadDescriptor({
        filename: template_filename,
        contentType: template_mime,
        size: template_size,
      });
      if (!descriptor.ok) return json({ error: descriptor.error }, { statusCode: 400 });
      try {
        await storage.verifyUploadedObject(sb, template_path, {
          keyPrefix: `${target.id}/templates/${admin.id}`,
          contentType: descriptor.contentType,
          size: descriptor.size,
        });
      } catch (verificationError) {
        if (storage.pathInsidePrefix(template_path, `${target.id}/templates/${admin.id}`)) {
          await storage.removeObject(sb, template_path);
        }
        return json({ error: verificationError.message || 'invalid_upload' }, { statusCode: 400 });
      }
    }

    const { data, error } = await sb.from('documents').insert({
      user_id: target.id, name: String(name).trim(), required: !!required,
      status: 'required', source: 'admin_custom',
      template_path,
      template_filename: template_filename || null,
      template_mime: template_mime || null,
    }).select().single();
    if (error) {
      await storage.removeObject(sb, template_path);
      throw error;
    }
    return json({ ok: true, document: data });
  } catch (e) {
    return serverError(e);
  }
};
