/**
 * POST /api/admin/documents/review
 * Body: { id, decision: 'validate'|'reject', rejection_reason? }
 */
const { getSupabase } = require('../../lib/supabase');
const storage = require('../../lib/storage');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const id = body.id;
  const decision = body.decision;
  if (!id || (decision !== 'validate' && decision !== 'reject')) return json({ error: 'invalid_params' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    if (decision === 'validate') {
      const nowIso = new Date().toISOString();
      const { error } = await sb.from('documents').update({
        status: 'validated', validated_at: nowIso, validated_by: adminEmail, rejection_reason: null,
      }).eq('id', id);
      if (error) throw error;
    } else {
      // Al rechazar borramos el fichero subido de Storage.
      const { data: cur } = await sb.from('documents').select('file_path').eq('id', id).single();
      if (cur && cur.file_path) await storage.removeObject(sb, cur.file_path);
      const { error } = await sb.from('documents').update({
        status: 'required',
        rejection_reason: body.rejection_reason || 'No validado por el asesor',
        file_path: null, file_filename: null, file_mime: null,
        uploaded_at: null, uploaded_by: null, validated_at: null, validated_by: null,
      }).eq('id', id);
      if (error) throw error;
    }
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
};
