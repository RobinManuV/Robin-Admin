const { getSupabase } = require('../../lib/supabase');
const {
  hashPassword,
  verifyPassword,
  readSessionFromEvent,
} = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { passwordPolicy } = require('../../shared/password-policy.cjs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
  const { current_password, new_password } = body;
  if (!current_password || !new_password) {
    return json({ error: 'invalid_fields' }, { statusCode: 400 });
  }
  if (!passwordPolicy(new_password).ok) return json({ error: 'weak_password' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: user, error } = await sb.from('users').select('*').eq('id', session.uid).single();
    if (error || !user) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!verifyPassword(current_password, user.password_hash)) {
      return json({ error: 'invalid_credentials' }, { statusCode: 401 });
    }
    const hash = hashPassword(new_password);
    const { error: e2 } = await sb.from('users').update({ password_hash: hash }).eq('id', user.id);
    if (e2) throw e2;
    return json({ ok: true });
  } catch (e) {
    console.error('change-password error', e);
    return serverError(e);
  }
};
