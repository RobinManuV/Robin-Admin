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
  const id = body && body.id;
  if (!id) return json({ error: 'missing_id' }, { statusCode: 400 });
  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
    // Recuperamos las rutas para limpiar Storage tras borrar la fila.
    const { data: cur } = await sb.from('documents').select('file_path, template_path').eq('id', id).single();
    const { error } = await sb.from('documents').delete().eq('id', id);
    if (error) throw error;
    if (cur) {
      await storage.removeObject(sb, cur.file_path);
      await storage.removeObject(sb, cur.template_path);
    }
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
};
