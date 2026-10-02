/**
 * web-collect · PÚBLICA · recibe la medición de la web (project-robin.com).
 *
 * - Desde el navegador: solo llegan eventos de visitantes que aceptaron las cookies
 *   de analítica (lo decide la web antes de enviar nada).
 * - Desde el servidor de la web: avisos anónimos de formulario/reserva enviados, con la
 *   cabecera x-robin-analytics-secret = WEB_ANALYTICS_SERVER_SECRET.
 *
 * Nunca guarda nombres, emails ni teléfonos. La IP no se guarda (solo el país que
 * calcula Netlify). Variables: WEB_ANALYTICS_ORIGINS (CSV de orígenes permitidos),
 * WEB_ANALYTICS_SERVER_SECRET.
 */
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { safeEqual } = require('../../lib/http');

const DEFAULT_ORIGINS = 'https://project-robin.com,https://www.project-robin.com,https://robinwebv2.netlify.app';
const CLIENT_TYPES = new Set(['page_view', 'page_leave', 'click', 'form_start', 'form_submit', 'video_play', 'video_progress', 'js_error']);
const SERVER_TYPES = new Set(['lead', 'booking']);
const MAX_BODY = 64 * 1024;
const MAX_EVENTS = 60;
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit/i;

const origins = () => new Set((process.env.WEB_ANALYTICS_ORIGINS || DEFAULT_ORIGINS).split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean));
const header = (event, name) => {
  const lower = name.toLowerCase();
  const key = Object.keys(event.headers || {}).find((k) => k.toLowerCase() === lower);
  return key ? event.headers[key] : '';
};

function corsHeaders(origin) {
  return origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : {};
}
const reply = (statusCode, origin) => ({ statusCode, headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' }, body: '' });

const str = (v, max) => (v == null ? null : String(v).slice(0, max));
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const cleanPath = (p) => {
  const s = str(p, 300);
  if (!s || !s.startsWith('/')) return null;
  return s.split(/[?#]/)[0].replace(/\/{2,}/g, '/');
};
const cleanId = (v) => (/^[\w-]{8,64}$/.test(String(v || '')) ? String(v) : null);

// Solo se guardan los campos conocidos de cada tipo de evento, recortados
function cleanData(type, e) {
  const d = {};
  const put = (k, v) => {
    if (v !== undefined && v !== null && v !== '') d[k] = v;
  };
  switch (type) {
    case 'page_view':
      put('title', str(e.title, 160));
      put('ref', str(e.ref, 300));
      put('new_session', e.new_session === true || undefined);
      put('utm_source', str(e.utm_source, 80));
      put('utm_medium', str(e.utm_medium, 80));
      put('utm_campaign', str(e.utm_campaign, 120));
      put('vw', num(e.vw, 0, 10000));
      put('lang', str(e.lang, 20));
      put('is404', e.is404 === true || undefined);
      break;
    case 'page_leave':
      put('active_ms', num(e.active_ms, 0, 6 * 3600 * 1000));
      put('depth', num(e.depth, 0, 100));
      put('lcp', num(e.lcp, 0, 120000));
      put('cls', num(e.cls, 0, 50));
      put('inp', num(e.inp, 0, 60000));
      put('ttfb', num(e.ttfb, 0, 120000));
      break;
    case 'click':
      put('sel', str(e.sel, 300));
      put('rx', num(e.rx, 0, 1));
      put('ry', num(e.ry, 0, 1));
      put('x', num(e.x, 0, 20000));
      put('y', num(e.y, 0, 200000));
      put('pw', num(e.pw, 0, 20000));
      put('ph', num(e.ph, 0, 200000));
      put('label', str(e.label, 80));
      put('tag', str(e.tag, 20));
      put('href', str(e.href, 200));
      put('cta', e.cta === true || undefined);
      break;
    case 'form_start':
    case 'form_submit':
    case 'lead':
    case 'booking':
      put('form', str(e.form, 40));
      put('form_tag', str(e.form_tag, 80));
      break;
    case 'video_play':
      put('video', str(e.video, 20));
      put('title', str(e.title, 120));
      put('where', str(e.where, 120));
      break;
    case 'video_progress':
      put('video', str(e.video, 20));
      put('pct', [25, 50, 75, 100].includes(Number(e.pct)) ? Number(e.pct) : undefined);
      break;
    case 'js_error':
      put('msg', str(e.msg, 200));
      put('src', str(e.src, 200));
      put('line', num(e.line, 0, 1e7));
      break;
    default:
      break;
  }
  return d;
}

function country(event) {
  const direct = header(event, 'x-country');
  if (direct) return String(direct).slice(0, 2).toUpperCase();
  const geo = header(event, 'x-nf-geo');
  if (!geo) return null;
  try {
    return JSON.parse(Buffer.from(geo, 'base64').toString('utf8'))?.country?.code || null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const origin = String(header(event, 'origin') || '').replace(/\/$/, '');
  const isServer = !!header(event, 'x-robin-analytics-secret');
  const allowedOrigin = origins().has(origin) ? origin : '';

  if (event.httpMethod === 'OPTIONS') return reply(allowedOrigin ? 204 : 403, allowedOrigin);
  if (event.httpMethod !== 'POST') return reply(405, allowedOrigin);

  if (isServer) {
    const secret = process.env.WEB_ANALYTICS_SERVER_SECRET || '';
    if (!secret || !safeEqual(secret, header(event, 'x-robin-analytics-secret'))) return reply(401, '');
  } else {
    if (!allowedOrigin) return reply(403, '');
    if (BOT_UA.test(header(event, 'user-agent') || '')) return reply(204, allowedOrigin);
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (!raw || raw.length > MAX_BODY) return reply(413, allowedOrigin);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, allowedOrigin);
  }
  if (!body || body.v !== 1 || !Array.isArray(body.events)) return reply(400, allowedOrigin);

  const now = Date.now();
  const types = isServer ? SERVER_TYPES : CLIENT_TYPES;
  const path = cleanPath(body.path);
  const device = ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : null;
  const rows = body.events
    .slice(0, MAX_EVENTS)
    .filter((e) => e && types.has(e.type))
    .map((e) => {
      const t = Number(e.t);
      // Reloj del visitante: se acepta si está dentro de ±1 día; si no, hora de llegada
      const at = Number.isFinite(t) && Math.abs(t - now) < 86400000 ? new Date(t) : new Date(now);
      return {
        event_at: at.toISOString(),
        visitor_id: cleanId(body.vid),
        session_id: isServer ? null : cleanId(body.sid),
        type: e.type,
        path,
        device,
        country: isServer ? null : country(event),
        server: isServer,
        data: cleanData(e.type, e),
      };
    });
  if (!rows.length) return reply(204, allowedOrigin);

  try {
    const { error } = await getAdminSupabase().from('web_events').insert(rows);
    if (error) throw error;
    return reply(204, allowedOrigin);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', operation: 'web.collect', result: 'error', message: String(error?.message || error).slice(0, 200) }));
    return reply(500, allowedOrigin);
  }
};
