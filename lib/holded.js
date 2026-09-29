/**
 * Integración con Holded (facturación) — API v2 (Bearer PAT).
 * Genera, por cada pago cobrado, una factura real en Holded y deja disponible
 * su PDF en el portal del cliente.
 *
 * Migrado de la API v1 (header `key`) a la v2 (header `Authorization: Bearer`).
 * Motivo: la API v1 IGNORA la cuenta contable en la factura (siempre aplicaba la
 * cuenta de venta por defecto "Ventas de mercaderías"). La v2 SÍ respeta la cuenta
 * enviada en cada línea (`items[].account`), por lo que la categorización por tipo
 * de cliente (Delft/Mentoría/Llegada/General) ahora funciona.
 *
 * Env vars:
 *   - HOLDED_API_PAT   (obligatoria; token v2 tipo `pat_...`. Sin ella
 *                       isConfigured()=false y todo degrada con gracia: el pago
 *                       NO se aborta, sólo se omite la factura).
 *   - HOLDED_ACCOUNT_GENERAL/_DELFT/_MENTORIA/_LLEGADA (IDs internos de las cuentas
 *                       del plan contable; la v2 los acepta directamente).
 *
 * Reglas de negocio (sin cambios respecto a v1):
 *   - Contacto: tipo PERSONA, a nombre del cliente/tutor legal del contrato, con su
 *     NIF/DNI y dirección. Se crea UNA vez por usuario (users.holded_contact_id).
 *   - Fecha: día actual. Vencimiento: +7 días.
 *   - Concepto (fijo): "Asesoramiento para estudiar en el extranjero".
 *   - Impuestos: IVA 21% por defecto; 0% si el cliente es de fuera de la UE.
 *   - Total: importe abonado (Holded desglosa base + IVA a partir del precio neto).
 *   - Cuenta contable según tipo de cliente (ver ACCOUNT_BY_TIPO).
 */

const HOLDED_BASE = 'https://api.holded.com/api/v2';

const { FISCAL } = require('../shared/financial-config.cjs');
const { errorCode } = require('./observability');
const CONCEPTO = FISCAL.concepto;

// Cuenta contable (Categorización · Cuenta Contable) según el tipo de servicio.
// Valor = ID interno de la cuenta del plan contable de Holded (la v2 lo exige y lo
// respeta). Los números del PGC quedan como fallback documental.
const ACCOUNT_BY_TIPO = {
  general:  process.env.HOLDED_ACCOUNT_GENERAL  || '70500001', // Asesoramiento completo
  delft:    process.env.HOLDED_ACCOUNT_DELFT    || '70500002', // Cliente Delft
  mentoria: process.env.HOLDED_ACCOUNT_MENTORIA || '70500003', // Cliente de mentoría
  llegada:  process.env.HOLDED_ACCOUNT_LLEGADA  || '70500004', // Cliente Pack Llegada
};

// Países de la Unión Europea (normalizados): nombre ES, nombre EN e ISO-2.
// Si el país del cliente está aquí -> IVA 21%; en caso contrario -> 0%.
const EU_SET = new Set([
  'alemania','germany','de',
  'austria','at',
  'belgica','belgium','be',
  'bulgaria','bg',
  'chipre','cyprus','cy',
  'croacia','croatia','hr',
  'dinamarca','denmark','dk',
  'eslovaquia','slovakia','sk',
  'eslovenia','slovenia','si',
  'espana','spain','es',
  'estonia','ee',
  'finlandia','finland','fi',
  'francia','france','fr',
  'grecia','greece','gr',
  'hungria','hungary','hu',
  'irlanda','ireland','ie',
  'italia','italy','it',
  'letonia','latvia','lv',
  'lituania','lithuania','lt',
  'luxemburgo','luxembourg','lu',
  'malta','mt',
  'paises bajos','holanda','netherlands','nl',
  'polonia','poland','pl',
  'portugal','pt',
  'republica checa','chequia','czech republic','czechia','cz',
  'rumania','rumanía','romania','ro',
  'suecia','sweden','se',
]);

function pat() {
  return String(process.env.HOLDED_API_PAT || '').trim();
}

function isConfigured() {
  return !!pat();
}

function analyticsKey() {
  return String(process.env.HOLDED_API_KEY || '').trim();
}

function isAnalyticsConfigured() {
  return !!analyticsKey();
}

async function listSalesInvoices({ start, end } = {}) {
  if (!isAnalyticsConfigured()) throw new Error('holded_analytics_not_configured');
  const url = new URL('https://api.holded.com/api/invoicing/v1/documents/invoice');
  if (start) url.searchParams.set('starttmp', String(start));
  if (end) url.searchParams.set('endtmp', String(end));
  url.searchParams.set('sort', 'created-desc');
  const res = await fetch(url, { headers: { key: analyticsKey(), Accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('holded_analytics_http_' + res.status);
    err.detail = data;
    throw err;
  }
  return Array.isArray(data) ? data : (Array.isArray(data && data.data) ? data.data : []);
}

function norm(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** ¿El cliente tributa en la UE? (España = sí; 'otros' según su país). */
function isEU(user) {
  if (norm(user && user.origin) !== 'otros') return true; // España / proceso estándar
  return EU_SET.has(norm(user && user.pais));
}

function taxRateFor(user) {
  return isEU(user) ? FISCAL.iva : 0;
}

function accountFor(tipo) {
  return ACCOUNT_BY_TIPO[norm(tipo) || 'general'] || ACCOUNT_BY_TIPO.general;
}

// Códigos de impuesto que espera la v2 en `items[].taxes` (array de strings).
// 21% -> ['s_iva_21']; 0% (fuera de la UE) -> [] (sin impuesto).
function taxCodesFor(rate) {
  return rate ? ['s_iva_' + rate] : [];
}

// Fecha en formato ISO YYYY-MM-DD que espera la v2 (a partir de epoch en segundos).
function ymd(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function countryName(user) {
  if (norm(user && user.origin) === 'otros' && user && user.pais) return String(user.pais);
  return 'España';
}

async function holdedFetch(path, { method = 'GET', body, raw = false } = {}) {
  if (!isConfigured()) throw new Error('holded_not_configured');
  const res = await fetch(HOLDED_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + pat(),
      Accept: raw ? 'application/pdf, application/json' : 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    if (!res.ok) {
      const t = await res.text();
      const err = new Error('holded_http_' + res.status);
      try { err.detail = JSON.parse(t); } catch (_) { err.detail = t; }
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error('holded_http_' + res.status);
    err.detail = data;
    throw err;
  }
  return data;
}

/**
 * Garantiza un contacto (tipo persona) en Holded para el usuario.
 * Reutiliza users.holded_contact_id si ya existe.
 */
async function ensureContact(sb, user) {
  if (user.holded_contact_id) return user.holded_contact_id;

  const cd = user.contract_data || {};
  const cliente = cd.cliente || {};
  const name = (cliente.nombre
    || [user.nombre, user.apellidos].filter(Boolean).join(' ')
    || 'Cliente').trim();
  const code = String(cliente.dni || user.dni_numero || '').trim().toUpperCase();
  const address = ((cd.alumno && cd.alumno.direccion) || user.direccion || '').trim();

  const payload = {
    name,
    code,                 // NIF / DNI
    email: user.email || '',
    type: 'client',
    is_person: true,      // contacto tipo PERSONA (v2: snake_case)
    bill_address: {
      address,
      country: countryName(user),
    },
  };

  const r = await holdedFetch('/contacts', { method: 'POST', body: payload });
  const id = r && (r.id || (r.contact && r.contact.id));
  if (!id) { const e = new Error('holded_contact_no_id'); e.detail = r; throw e; }

  await sb.from('users').update({ holded_contact_id: id }).eq('id', user.id);
  return id;
}

/**
 * Crea en Holded la factura correspondiente a un pago.
 * Devuelve { invoiceId, docNumber, taxRate }.
 */
async function createInvoiceForPayment(sb, user, payment) {
  const contactId = await ensureContact(sb, user);
  const rate = taxRateFor(user);
  const gross = Number(payment.amount || 0);
  // Holded espera el precio NETO unitario; desglosa la base y el IVA a partir de él.
  const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const now = Math.floor(Date.now() / 1000);
  const due = now + 7 * 24 * 3600;

  // La v2 acepta directamente el ID interno de la cuenta del plan contable.
  const acct = accountFor(user.tipo);

  const body = {
    contact_id: contactId,
    date: ymd(now),
    due_date: ymd(due),
    currency: String(payment.currency || 'eur').toLowerCase(),
    notes: 'Cliente Robin ' + (user.lead_id || user.id || ''),
    items: [{
      name: CONCEPTO,
      desc: '',
      units: 1,
      price: net,
      taxes: taxCodesFor(rate),
      account: acct,
    }],
  };

  const r = await holdedFetch('/invoices', { method: 'POST', body });
  const invoiceId = r && (r.id || r.invoice_id || (r.invoice && r.invoice.id));
  if (!invoiceId) { const e = new Error('holded_invoice_no_id'); e.detail = r; throw e; }

  // La v2 al crear devuelve sólo el id; leemos el documento para el nº (null si borrador).
  let docNumber = null;
  try {
    const doc = await holdedFetch('/invoices/' + encodeURIComponent(invoiceId));
    docNumber = (doc && (doc.document_number || doc.docNumber)) || null;
  } catch (_) { /* no crítico */ }

  return { invoiceId, docNumber, taxRate: rate };
}

/** Descarga el PDF de una factura de Holded (devuelve base64 o null). */
async function getInvoicePdf(invoiceId) {
  try {
    const buf = await holdedFetch('/invoices/' + encodeURIComponent(invoiceId) + '/pdf', { raw: true });
    return buf && buf.length ? buf.toString('base64') : null;
  } catch (_) {
    return null;
  }
}

/**
 * Genera (idempotente, best-effort) la factura de Holded para una fila de payments.
 * Guarda holded_invoice_id / holded_invoice_num dentro de payments.payment_data.
 * Nunca lanza: cualquier fallo se registra en webhook_log y se devuelve {ok:false}.
 */
async function generateInvoiceForPaymentRow(sb, paymentId) {
  if (!isConfigured()) {
    try {
      await sb.from('webhook_log').insert({
        source: 'holded',
        payload: { payment_id: paymentId },
        result: 'skipped',
        message: 'not_configured: falta HOLDED_API_PAT en el entorno',
      });
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
    console.warn('[holded] skipped: HOLDED_API_PAT no configurada');
    return { skipped: true, reason: 'not_configured' };
  }
  try {
    const { data: p, error } = await sb.from('payments').select('*').eq('id', paymentId).single();
    if (error || !p) return { ok: false, reason: 'payment_not_found' };
    const pd = p.payment_data || {};
    if (pd.holded_invoice_id) return { ok: true, already: true, invoice_id: pd.holded_invoice_id };

    const { data: u, error: e2 } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, dni_numero, direccion, tipo, origin, pais, has_eu_id, holded_contact_id, contract_data')
      .eq('id', p.user_id)
      .single();
    if (e2 || !u) return { ok: false, reason: 'user_not_found' };

    const inv = await createInvoiceForPayment(sb, u, p);
    const newPd = {
      ...pd,
      holded_invoice_id: inv.invoiceId,
      holded_invoice_num: inv.docNumber,
      holded_tax_rate: inv.taxRate,
      holded_at: new Date().toISOString(),
    };
    await sb.from('payments').update({ payment_data: newPd }).eq('id', p.id);
    try {
      await sb.from('webhook_log').insert({
        source: 'holded',
        payload: { payment_id: p.id, user_id: u.id, installment: p.installment },
        result: 'ok',
        message: 'invoice_created',
      });
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
    return { ok: true, invoice_id: inv.invoiceId, invoice_num: inv.docNumber };
  } catch (e) {
    try {
      await sb.from('webhook_log').insert({
        source: 'holded',
        payload: { payment_id: paymentId },
        result: 'error',
        message: errorCode(e, 'holded_error'),
      });
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
    console.error('[holded] invoice error:', errorCode(e, 'holded_error'));
    return { ok: false, reason: 'holded_error', error: errorCode(e, 'holded_error') };
  }
}

module.exports = {
  isConfigured,
  isAnalyticsConfigured,
  listSalesInvoices,
  isEU,
  taxRateFor,
  accountFor,
  ensureContact,
  createInvoiceForPayment,
  getInvoicePdf,
  generateInvoiceForPaymentRow,
  CONCEPTO,
  ACCOUNT_BY_TIPO,
};
