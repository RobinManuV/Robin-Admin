/**
 * GET /api/documents                            cliente: SUS documentos
 * GET /api/admin/documents?user_id=...          admin: documentos de ese cliente
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: u } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!u) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(u);

    let target_uid = u.id;
    const qUserId = event.queryStringParameters && event.queryStringParameters.user_id;
    if (qUserId) {
      if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
      target_uid = qUserId;
    }

    const { data: docs, error } = await sb
      .from('documents')
      .select([
        'id', 'user_id', 'name', 'required', 'status', 'uploaded_at', 'validated_at',
        'rejection_reason', 'source', 'created_at', 'career_template_id', 'file_path',
        'template_path', 'file_filename', 'file_mime', 'template_filename', 'template_mime',
        'uploaded_by', 'validated_by',
      ].join(', '))
      .eq('user_id', target_uid)
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Las listas no devuelven binarios ni URLs; sólo flags de existencia.
    const minimal = (docs || []).map((d) => {
      const { file_path, template_path, ...rest } = d;
      return {
        ...rest,
        has_file: !!file_path,
        has_template: !!template_path,
      };
    });
    return json({ documents: minimal });
  } catch (e) {
    return serverError(e);
  }
};
