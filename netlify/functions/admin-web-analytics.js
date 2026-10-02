/**
 * GET /api/admin/web/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD[&refresh=1]
 * Pestaña "Web" del gestor: junta en una respuesta
 *   - own:  medición propia de la web (tabla web_events, función SQL web_stats)
 *   - ga4:  Google Analytics 4 (tráfico, canales, páginas de entrada, dispositivos, países)
 *   - gsc:  Search Console (búsquedas de Google, posiciones, páginas)
 * Caché en memoria de 10 minutos por rango (?refresh=1 la salta).
 */
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { requireWebAdmin, readRange, rangeBounds } = require('../../lib/web-analytics-auth');
const { ga4Report, searchConsoleReport } = require('../../lib/google-web-analytics');

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

async function ownStats(range) {
  const { fromTs, toTs } = rangeBounds(range);
  const { data, error } = await getAdminSupabase().rpc('web_stats', { p_from: fromTs, p_to: toTs });
  if (error) return { available: false, reason: error.message };
  return { available: true, ...data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    const auth = await requireWebAdmin(event);
    if (auth.error) return auth.error;
    const range = readRange(event);
    const key = `${range.from}_${range.to}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS && event.queryStringParameters?.refresh !== '1') return json(hit.data);

    const [own, ga4, gsc] = await Promise.all([ownStats(range), ga4Report(range), searchConsoleReport(range)]);
    const data = { range, own, ga4, gsc, generatedAt: new Date().toISOString() };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 30) cache.delete(cache.keys().next().value);
    return json(data);
  } catch (error) {
    return serverError(error, 'admin.web_analytics');
  }
};
