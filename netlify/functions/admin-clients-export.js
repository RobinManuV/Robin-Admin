/**
 * GET /api/admin/clients/export
 * Exporta la base operativa de clientes del Portal del Alumno como CSV.
 * Nunca incluye contraseñas, tokens, rutas de documentos ni datos internos de pago.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

const PAGE_SIZE = 1000;
const CLIENT_FIELDS = [
  'id',
  'lead_id',
  'username',
  'email',
  'role',
  'nombre',
  'apellidos',
  'telefono_alumno',
  'fecha_nacimiento',
  'dni_numero',
  'direccion',
  'pais',
  'tipo',
  'origin',
  'application_level',
  'has_eu_id',
  'num_carreras',
  'assigned_to',
  'application_phase',
  'requires_onboarding',
  'dni_completed',
  'profile_completed',
  'contract_signed',
  'contract_signed_at',
  'pago_completed',
  'pago_completed_at',
  'intereses',
  'lived_abroad',
  'lived_abroad_country',
  'lived_abroad_other',
  'created_at',
  'updated_at',
].join(',');

const COLUMNS = [
  ['ID cliente', 'id'],
  ['ID lead', 'lead_id'],
  ['Usuario', 'username'],
  ['Nombre', 'nombre'],
  ['Apellidos', 'apellidos'],
  ['Email', 'email'],
  ['Teléfono', 'telefono_alumno'],
  ['Fecha de nacimiento', 'fecha_nacimiento'],
  ['DNI o pasaporte', 'dni_numero'],
  ['Dirección', 'direccion'],
  ['País', 'pais'],
  ['Tipo de servicio', 'tipo'],
  ['Origen', 'origin'],
  ['Nivel de aplicación', 'application_level'],
  ['Identificación UE', 'has_eu_id'],
  ['Número de carreras', 'num_carreras'],
  ['Asesor asignado', 'assigned_to'],
  ['Fase de aplicación', 'application_phase'],
  ['Requiere onboarding', 'requires_onboarding'],
  ['DNI completado', 'dni_completed'],
  ['Perfil completado', 'profile_completed'],
  ['Contrato firmado', 'contract_signed'],
  ['Fecha de firma', 'contract_signed_at'],
  ['Primer pago completado', 'pago_completed'],
  ['Fecha del primer pago', 'pago_completed_at'],
  ['Intereses', 'intereses'],
  ['Ha vivido fuera', 'lived_abroad'],
  ['País donde vivió', 'lived_abroad_country'],
  ['Otro país', 'lived_abroad_other'],
  ['Fecha de alta', 'created_at'],
  ['Última actualización', 'updated_at'],
];

function printable(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvCell(value) {
  let text = printable(value);
  // Evita que Excel ejecute como fórmula un valor controlado por un usuario.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  const lines = [COLUMNS.map(([label]) => csvCell(label)).join(';')];
  for (const row of rows) {
    lines.push(COLUMNS.map(([, key]) => csvCell(row[key])).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

async function loadAllClients(sb) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('users')
      .select(CLIENT_FIELDS)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page.filter((row) => !isApplicationAdmin(row)));
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: actor, error: actorError } = await sb
      .from('users')
      .select('id,email,username,role')
      .eq('id', session.uid)
      .single();
    if (actorError || !actor) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!isApplicationAdmin(actor)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const clients = await loadAllClients(sb);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `base-datos-clientes-robin-${date}.csv`;
    console.info(JSON.stringify({ level: 'info', operation: 'admin.clients_export', result: 'ok', rows: clients.length, actor_id: actor.id }));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
      body: buildCsv(clients),
    };
  } catch (error) {
    return serverError(error, 'admin.clients_export');
  }
};

exports._test = { buildCsv, csvCell, printable };
