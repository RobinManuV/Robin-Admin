const { getSupabase } = require('../../lib/supabase');
const { verifyPassword, signSession, buildSessionCookie } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { findIdentityCandidates, resolvePasswordCandidate } = require('../../lib/identity');
const { createOperationLogger } = require('../../lib/observability');

exports.handler = async (event) => {
  const log = createOperationLogger(event, { operation: 'auth.login', actor_role: 'anonymous' });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return methodNotAllowed(['POST']);
  }
  if (!verifyOrigin(event)) {
    log.warn('rejected', { error_code: 'bad_origin' });
    return json({ error: 'bad_origin' }, { statusCode: 403 });
  }
  const body = parseJsonBody(event);
  if (!body) {
    log.warn('rejected', { error_code: 'invalid_json' });
    return json({ error: 'invalid_json' }, { statusCode: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    log.warn('rejected', { error_code: 'missing_fields' });
    return json({ error: 'missing_fields' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const candidates = await findIdentityCandidates(sb, username);
    const resolved = resolvePasswordCandidate(candidates, password, verifyPassword);
    if (resolved.status === 'invalid') {
      log.warn('rejected', { error_code: 'invalid_credentials' });
      return json({ error: 'invalid_credentials' }, { statusCode: 401 });
    }
    if (resolved.status === 'ambiguous') {
      log.warn('rejected', { error_code: 'ambiguous_identity', count: candidates.length });
      return json({ error: 'ambiguous_identity' }, { statusCode: 409 });
    }
    const user = resolved.candidate.row;

    const token = signSession(user);
    const cookie = buildSessionCookie(token);

    let next_step = null;
    if (user.requires_onboarding) next_step = user.dni_completed ? 'profile' : 'dni';

    log.success({ actor_id: user.id, actor_role: user.role, entity_type: 'session' });
    return json(
      {
        ok: true,
        requires_onboarding: !!user.requires_onboarding,
        next_step,
        user: { id: user.id, username: user.username, role: user.role },
      },
      { cookies: [cookie] }
    );
  } catch (e) {
    log.failure(e);
    return serverError(e);
  }
};
