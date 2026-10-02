/**
 * Google Analytics 4 (Data API) y Search Console para la pestaña "Web".
 *
 * Autenticación: OAuth 2.0 con refresh token (igual que Drive/Sheets).
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (ya existen)
 *   - GOOGLE_ANALYTICS_REFRESH_TOKEN  → refresh token de una cuenta con acceso de lectura a
 *     GA4 y Search Console, con los scopes:
 *       https://www.googleapis.com/auth/analytics.readonly
 *       https://www.googleapis.com/auth/webmasters.readonly
 *     Si no se define, se prueba con GOOGLE_REFRESH_TOKEN (tendría que tener esos scopes).
 *   - GA4_PROPERTY_ID   → número de la propiedad de GA4 (Administrar › Detalles de la propiedad)
 *   - GSC_SITE_URL      → propiedad de Search Console, p. ej. "sc-domain:project-robin.com"
 *                         o "https://project-robin.com/"
 *
 * Todo es "best-effort": si algo no está configurado, esa parte devuelve
 * { available: false, reason } y el resto del panel sigue funcionando.
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
let token = null;
let tokenExp = 0;

const env = (k) => String(process.env[k] || '').trim();
const refreshToken = () => env('GOOGLE_ANALYTICS_REFRESH_TOKEN') || env('GOOGLE_REFRESH_TOKEN');

async function accessToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  if (!env('GOOGLE_CLIENT_ID') || !env('GOOGLE_CLIENT_SECRET') || !refreshToken()) throw Object.assign(new Error('google_oauth_not_configured'), { reason: 'Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_ANALYTICS_REFRESH_TOKEN' });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: refreshToken(), grant_type: 'refresh_token' }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) throw Object.assign(new Error(`google_oauth_${res.status}`), { reason: out.error_description || out.error || `Google OAuth ${res.status}` });
  token = out.access_token;
  tokenExp = Date.now() + (out.expires_in || 3600) * 1000;
  return token;
}

async function google(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = out?.error?.message || `HTTP ${res.status}`;
    const reason = /insufficient|scope/i.test(msg)
      ? 'El refresh token no tiene permiso de lectura (añade los scopes analytics.readonly / webmasters.readonly)'
      : /permission|does not have/i.test(msg)
        ? 'La cuenta de Google no tiene acceso a esta propiedad'
        : msg;
    throw Object.assign(new Error(msg), { reason });
  }
  return out;
}

// ---------- Google Analytics 4 ----------
function rows(report, dims, mets) {
  return (report.rows || []).map((r) => {
    const o = {};
    dims.forEach((d, i) => (o[d] = r.dimensionValues?.[i]?.value ?? ''));
    mets.forEach((m, i) => (o[m] = Number(r.metricValues?.[i]?.value ?? 0)));
    return o;
  });
}

const GA_REPORTS = [
  { key: 'daily', dims: ['date'], mets: ['sessions', 'totalUsers', 'newUsers', 'screenPageViews', 'engagementRate', 'averageSessionDuration', 'keyEvents'], order: 'date', limit: 400 },
  { key: 'channels', dims: ['sessionDefaultChannelGroup'], mets: ['sessions', 'totalUsers', 'engagementRate', 'keyEvents'], limit: 20 },
  { key: 'sourceMedium', dims: ['sessionSourceMedium'], mets: ['sessions', 'totalUsers', 'engagementRate', 'keyEvents'], limit: 25 },
  { key: 'campaigns', dims: ['sessionCampaignName'], mets: ['sessions', 'totalUsers', 'keyEvents'], limit: 25 },
  { key: 'landingPages', dims: ['landingPage'], mets: ['sessions', 'engagementRate', 'averageSessionDuration', 'keyEvents'], limit: 30 },
  { key: 'pages', dims: ['pagePath'], mets: ['screenPageViews', 'activeUsers', 'userEngagementDuration'], limit: 40 },
  { key: 'devices', dims: ['deviceCategory'], mets: ['sessions', 'totalUsers'], limit: 10 },
  { key: 'countries', dims: ['country'], mets: ['sessions', 'totalUsers'], limit: 15 },
  { key: 'cities', dims: ['city'], mets: ['sessions'], limit: 15 },
  { key: 'newVsReturning', dims: ['newVsReturning'], mets: ['sessions', 'totalUsers'], limit: 5 },
  // Totales del periodo sin dimensiones (las personas únicas no se pueden sumar día a día)
  { key: 'summary', dims: [], mets: ['sessions', 'totalUsers', 'newUsers', 'screenPageViews', 'engagementRate', 'averageSessionDuration', 'keyEvents'], limit: 1 },
];

async function ga4Report({ from, to }) {
  const property = env('GA4_PROPERTY_ID');
  if (!property) return { available: false, reason: 'Falta GA4_PROPERTY_ID' };
  try {
    const out = { available: true };
    // batchRunReports admite 5 informes por llamada
    for (let i = 0; i < GA_REPORTS.length; i += 5) {
      const chunk = GA_REPORTS.slice(i, i + 5);
      const res = await google(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`, {
        requests: chunk.map((r) => ({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: r.dims.map((name) => ({ name })),
          metrics: r.mets.map((name) => ({ name })),
          limit: r.limit,
          ...(r.order
            ? { orderBys: [{ dimension: { dimensionName: r.order } }] }
            : r.dims.length
              ? { orderBys: [{ metric: { metricName: r.mets[0] }, desc: true }] }
              : {}),
        })),
      });
      chunk.forEach((r, j) => (out[r.key] = rows(res.reports?.[j] || {}, r.dims, r.mets)));
    }
    out.daily = out.daily.map((d) => ({ ...d, date: `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}` }));
    const t = out.summary?.[0] || {};
    out.totals = {
      sessions: t.sessions || 0,
      users: t.totalUsers || 0,
      newUsers: t.newUsers || 0,
      pageViews: t.screenPageViews || 0,
      keyEvents: t.keyEvents || 0,
      engagementRate: t.engagementRate || 0,
      avgSessionDuration: t.averageSessionDuration || 0,
    };
    return out;
  } catch (error) {
    return { available: false, reason: error.reason || error.message };
  }
}

// ---------- Search Console ----------
async function gscQuery(site, body) {
  const res = await google(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
  return (res.rows || []).map((r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

async function searchConsoleReport({ from, to }) {
  const site = env('GSC_SITE_URL');
  if (!site) return { available: false, reason: 'Falta GSC_SITE_URL' };
  try {
    const base = { startDate: from, endDate: to, dataState: 'all' };
    const [daily, queries, pages, pageQueries] = await Promise.all([
      gscQuery(site, { ...base, dimensions: ['date'], rowLimit: 400 }),
      gscQuery(site, { ...base, dimensions: ['query'], rowLimit: 100 }),
      gscQuery(site, { ...base, dimensions: ['page'], rowLimit: 100 }),
      gscQuery(site, { ...base, dimensions: ['page', 'query'], rowLimit: 500 }),
    ]);
    const clicks = daily.reduce((a, r) => a + r.clicks, 0);
    const impressions = daily.reduce((a, r) => a + r.impressions, 0);
    return {
      available: true,
      totals: {
        clicks,
        impressions,
        ctr: impressions ? clicks / impressions : 0,
        position: impressions ? daily.reduce((a, r) => a + r.position * r.impressions, 0) / impressions : 0,
      },
      daily: daily.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      queries: queries.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      pages: pages.map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      pageQueries: pageQueries.map((r) => ({ page: r.keys[0], query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position })),
    };
  } catch (error) {
    return { available: false, reason: error.reason || error.message };
  }
}

module.exports = { ga4Report, searchConsoleReport };
