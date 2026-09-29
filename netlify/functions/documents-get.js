/**
 * GET /api/documents/get?id=... devuelve URLs firmadas temporales del documento.
 * - cliente sólo puede pedir uno suyo
 * - admin puede pedir cualquiera
 */
const { getSupabase } = require('../../lib/supabase');
const storage = require('../../lib/storage');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, ownsRecord } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) return json({ error: 'missing_id' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: u } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!u) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(u);

    const fields = [
      'id', 'user_id', 'name', 'required', 'status', 'uploaded_at', 'validated_at',
      'rejection_reason', 'source', 'created_at', 'career_template_id', 'file_path',
      'template_path', 'file_filename', 'file_mime', 'template_filename', 'template_mime',
      'uploaded_by', 'validated_by',
    ].join(', ');
    const { data: d, error } = await sb.from('documents').select(fields).eq('id', id).single();
    if (error || !d) return json({ error: 'not_found' }, { statusCode: 404 });
    if (!isAdmin && !ownsRecord(u, d)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { file_path, template_path, ...out } = d;
    if (d.file_path) {
      out.file_url = await storage.signedUrl(sb, d.file_path, { download: d.file_filename || undefined });
    }
    if (d.template_path) {
      out.template_url = await storage.signedUrl(sb, d.template_path, { download: d.template_filename || undefined });
    }
    return json({ document: out });
  } catch (e) {
    return serverError(e);
  }
};
