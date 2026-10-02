/**
 * GET /api/admin/web/heatmap?pages=1&from&to              → páginas con clics (selector)
 * GET /api/admin/web/heatmap?path=/destinos/&device=mobile&from&to → clics y scroll de esa página
 * El panel abre la página real (WEB_PUBLIC_URL + path + ?robin_heatmap=1) en un iframe y le
 * pasa estos datos; la web pinta el mapa encima de sí misma.
 */
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { requireWebAdmin, readRange, rangeBounds } = require('../../lib/web-analytics-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    const auth = await requireWebAdmin(event);
    if (auth.error) return auth.error;
    const q = event.queryStringParameters || {};
    const range = readRange(event);
    const { fromTs, toTs } = rangeBounds(range);
    const sb = getAdminSupabase();
    const siteUrl = (process.env.WEB_PUBLIC_URL || 'https://project-robin.com').replace(/\/+$/, '');

    if (q.pages === '1') {
      const { data, error } = await sb.rpc('web_heatmap_pages', { p_from: fromTs, p_to: toTs });
      if (error) throw error;
      return json({ range, siteUrl, pages: data || [] });
    }
    const path = String(q.path || '/').slice(0, 300);
    if (!path.startsWith('/')) return json({ error: 'path_invalido' }, { statusCode: 400 });
    const device = ['mobile', 'tablet', 'desktop'].includes(q.device) ? q.device : 'desktop';
    const { data, error } = await sb.rpc('web_heatmap', { p_path: path, p_device: device, p_from: fromTs, p_to: toTs });
    if (error) throw error;
    return json({ range, siteUrl, ...data });
  } catch (error) {
    return serverError(error, 'admin.web_heatmap');
  }
};
