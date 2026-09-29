const { getSupabase } = require('./supabase');
const drive = require('./google-drive');
const { errorCode } = require('./observability');
const { minimizeLogPayload } = require('./privacy');

const TRIGGER_STATUS = ['INSIDE'];

// Mapa Responsable (Notion) → email admin (portal).
// Se puede sobreescribir con la env var NOTION_RESPONSABLE_MAP en formato JSON:
//   { "noel": "noel@project-robin.com", "maria": "maria@project-robin.com", ... }
const DEFAULT_RESPONSABLE_MAP = {
  noel: 'noel@project-robin.com',
  maria: 'maria@project-robin.com',
  manuel: 'manuel@project-robin.com',
};

function loadResponsableMap() {
  try {
    if (process.env.NOTION_RESPONSABLE_MAP) {
      const parsed = JSON.parse(process.env.NOTION_RESPONSABLE_MAP);
      const out = {};
      for (const k of Object.keys(parsed)) out[normalizeKey(k)] = parsed[k];
      return out;
    }
  } catch (e) {
    console.warn('NOTION_RESPONSABLE_MAP inválido:', e.message);
  }
  return DEFAULT_RESPONSABLE_MAP;
}

function parseBool(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return ['si', 'yes', 'true', '1', 'x', 'pagado', 'ok', 'done', 'checked', '\u2713'].includes(s);
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita acentos
    .trim();
}


function normalizeTipo(raw) {
  if (!raw) return 'general';
  const k = String(raw).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (k.includes('llegada')) return 'llegada';
  if (k.includes('delft')) return 'delft';
  if (k.includes('mentor')) return 'mentoria';
  if (k.includes('general')) return 'general';
  return 'general';
}

function mapResponsableToAdminEmail(responsable) {
  if (!responsable) return null;
  const map = loadResponsableMap();
  const key = normalizeKey(responsable).split(/\s|@/)[0]; // "Noel García" → "noel", "noel@..." → "noel"
  return map[key] || null;
}

async function ensureDriveFolder(sb, userId, log) {
  try {
    if (!drive.isConfigured()) {
      await driveLog(sb, userId, 'skipped', 'google_drive_not_configured');
      return;
    }
    const { data: u } = await sb
      .from('users')
      .select('id, lead_id, nombre, apellidos, gdrive_folders')
      .eq('id', userId)
      .single();
    if (!u) return;
    if (u.gdrive_folders && u.gdrive_folders.root) {
      await driveLog(sb, userId, 'exists', 'drive_folder_exists');
      return;
    }
    const folders = await drive.ensureClientFolders(sb, u);
    await driveLog(sb, userId, folders ? 'created' : 'skipped',
      folders ? 'drive_folder_created' : 'drive_folder_unavailable');
  } catch (e) {
    await driveLog(sb, userId, 'error', errorCode(e, 'drive_folder_failed'));
    if (log) log.warn('degraded', {
      entity_type: 'user',
      entity_id: userId,
      integration: 'google_drive',
      error_code: errorCode(e, 'drive_folder_failed'),
    });
  }
}

async function driveLog(sb, userId, result, message) {
  try {
    await sb.from('webhook_log').insert({
      source: 'gdrive_sync',
      payload: { user_id: userId, origin: 'notion-webhook' },
      result,
      message: message || null,
    });
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
}

async function logEvent(_unused, payload, result, message) {
  try {
    const sb = getSupabase();
    const parsed = typeof payload === 'string' ? safeJson(payload) : payload || {};
    await sb.from('webhook_log').insert({
      source: 'notion',
      payload: minimizeLogPayload(parsed),
      result,
      message: message || null,
    });
  } catch (e) {
    console.error('[webhook_log_insert_failed]', errorCode(e));
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return { raw: String(s).slice(0, 2000) }; }
}

function parsePayload(body) {
  if (!body || typeof body !== 'object') throw new Error('empty_body');
  if (body.lead_id || body.leadId) {
    return {
      lead_id: String(body.lead_id || body.leadId),
      notion_page_id: body.notion_page_id || body.pageId || body.page_id || null,
      status: body.status || body.in || body['IN?'] || null,
      name: body.name || body.nombre || null,
      email: body.email || null,
      responsable: body.responsable || body.assigned_to || body.owner || null,
      tipo: body.tipo || body.TIPO || body.Tipo || null,
      primer_pago_pagado: parseBool(
        body.primer_pago_pagado != null ? body.primer_pago_pagado
        : body.primer_pago != null ? body.primer_pago
        : body.first_payment_paid != null ? body.first_payment_paid
        : body.pago_transferencia
      ),
    };
  }
  const props = (body.data && body.data.properties) || body.properties || null;
  if (props) {
    const lead_id =
      readNotionProp(props['ID']) ||
      readNotionProp(props['Lead ID']) ||
      readNotionProp(props['lead_id']);
    const status = readNotionProp(props['IN?']) || readNotionProp(props['Status']);
    const name = readNotionProp(props['Nombre']) || readNotionProp(props['Name']);
    const email = readNotionProp(props['Email']);
    const responsable =
      readNotionProp(props['Responsable']) ||
      readNotionProp(props['Asesor']) ||
      readNotionProp(props['Owner']) ||
      readNotionProp(props['Asignado a']) ||
      null;
    const tipo =
      readNotionProp(props['TIPO']) ||
      readNotionProp(props['Tipo']) ||
      readNotionProp(props['tipo']) ||
      null;
    const primerPagoRaw =
      readNotionProp(props['1er pago pagado']) ??
      readNotionProp(props['Primer pago pagado']) ??
      readNotionProp(props['1er pago']) ??
      readNotionProp(props['Primer pago']) ??
      readNotionProp(props['Pago inicial']) ??
      readNotionProp(props['Pago transferencia']) ??
      null;
    return {
      lead_id: lead_id != null ? String(lead_id) : null,
      notion_page_id: body.id || (body.data && body.data.id) || null,
      status,
      name,
      email,
      responsable,
      tipo,
      primer_pago_pagado: parseBool(primerPagoRaw),
    };
  }
  throw new Error('unsupported_payload_shape');
}

function readNotionProp(p) {
  if (!p) return null;
  if (typeof p === 'string' || typeof p === 'number') return p;
  if (p.unique_id) return p.unique_id.number;
  if (p.number != null) return p.number;
  if (p.status) return p.status.name;
  if (p.select) return p.select.name;
  if (p.email) return p.email;
  if (typeof p.checkbox === 'boolean') return p.checkbox;
  // Multi-select: usa el primer valor
  if (Array.isArray(p.multi_select) && p.multi_select.length) {
    return p.multi_select[0].name || null;
  }
  // People (Notion users): usa el nombre del primer usuario asignado
  if (Array.isArray(p.people) && p.people.length) {
    const u = p.people[0];
    return (u.name || (u.person && u.person.email) || null);
  }
  if (Array.isArray(p.title))
    return p.title.map((t) => t.plain_text || '').join('').trim() || null;
  if (Array.isArray(p.rich_text))
    return p.rich_text.map((t) => t.plain_text || '').join('').trim() || null;
  return null;
}

module.exports = {
  TRIGGER_STATUS,
  ensureDriveFolder,
  logEvent,
  mapResponsableToAdminEmail,
  normalizeTipo,
  parsePayload,
};
