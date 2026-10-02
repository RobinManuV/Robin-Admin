/**
 * /api/admin/web/blog — puente con la máquina de blogs de la web pública.
 *   GET                       → estado de la semana y de las últimas 8
 *   POST {accion}             → 'investigar' | 'forzar' | 'redactar'
 * Variables: WEB_BLOG_API_URL (p. ej. https://project-robin.com/api/blog-estado)
 *            WEB_BLOG_SECRET  (el mismo valor que BLOG_SECRET en la web)
 */
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { requireWebAdmin } = require('../../lib/web-analytics-auth');

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return methodNotAllowed(['GET', 'POST']);
  try {
    const auth = await requireWebAdmin(event);
    if (auth.error) return auth.error;
    const url = process.env.WEB_BLOG_API_URL;
    const secret = process.env.WEB_BLOG_SECRET;
    if (!url || !secret) return json({ available: false, reason: 'Faltan WEB_BLOG_API_URL o WEB_BLOG_SECRET' });

    const init = { headers: { 'x-robin-blog-secret': secret, 'Content-Type': 'application/json' } };
    if (event.httpMethod === 'POST') {
      if (!verifyOrigin(event)) return json({ error: 'forbidden' }, { statusCode: 403 });
      const body = parseJsonBody(event) || {};
      if (!['investigar', 'forzar', 'redactar'].includes(body.accion)) return json({ error: 'accion_no_valida' }, { statusCode: 400 });
      Object.assign(init, { method: 'POST', body: JSON.stringify({ accion: body.accion }) });
    }
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ available: false, reason: data.error || `La web respondió ${res.status}` }, { statusCode: res.status === 401 ? 502 : res.status });
    return json({ available: true, ...data });
  } catch (error) {
    return serverError(error, 'admin.web_blog');
  }
};
