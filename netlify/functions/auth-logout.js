// Netlify handler for /api/auth/logout; it owns the HTTP boundary and hands reusable work to server modules.
const { buildSessionCookie } = require('../../lib/auth');
const { json, methodNotAllowed, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const cookie = buildSessionCookie('', { clear: true });
  return json({ ok: true }, { cookies: [cookie] });
};
