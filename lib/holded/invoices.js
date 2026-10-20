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
 *   - HOLDED_TAX_EXEMPT (opcional; key del impuesto de venta exento configurado
 *                       en Holded. Si falta, se descubre mediante GET /taxes).
 *
 * Reglas de negocio:
 *   - Contacto: tipo PERSONA, a nombre del cliente/tutor legal del contrato, con su
 *     NIF/DNI y dirección. Se crea UNA vez por usuario (users.holded_contact_id).
 *   - Fecha: día actual. Vencimiento: +7 días.
 *   - Concepto: describe la cuota y el hito del servicio; mentoría y pagos no
 *     contemplados conservan el concepto fiscal genérico.
 *   - Impuestos: IVA 21% por defecto; 0% si el cliente es de fuera de la UE;
 *     los extras marcados como exentos usan el impuesto exento de Holded.
 *   - Total: importe abonado (Holded desglosa base + IVA a partir del precio neto).
 *   - Cuenta contable según tipo de cliente (ver ACCOUNT_BY_TIPO).
 */

const { FISCAL } = require('../../shared/financial-config.cjs');
const { IELTS_EXEMPTION_NOTE } = require('../extra-payments');
const { holdedFetch, norm } = require('./client');
const CONCEPTO = FISCAL.concepto;
let cachedExemptTaxKey = null;

const PRIMARY_INSTALLMENT_CONCEPTS = Object.freeze({
  1: 'Servicio de acompañamiento universitario – Cuota 1/3 – Asesoramiento inicial',
  2: 'Servicio de acompañamiento universitario – Cuota 2/3 – Gestión de postulaciones',
  3: 'Servicio de acompañamiento universitario – Cuota 3/3 – Admisión confirmada y preparación de llegada',
});

const ARRIVAL_INSTALLMENT_CONCEPTS = Object.freeze({
  1: 'Pack Llegada – Cuota 1/2 – Inicio del servicio',
  2: 'Pack Llegada – Cuota 2/2 – Alojamiento reservado',
});

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

function studentName(user) {
  const contractStudent = user && user.contract_data && user.contract_data.alumno;
  const firstName = (user && user.nombre) || (contractStudent && contractStudent.nombre);
  const lastName = (user && user.apellidos) || (contractStudent && contractStudent.apellidos);
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/** Concepto visible en la línea de factura de Holded. */
function invoiceConceptFor(user, payment) {
  const customConcept = String(payment && payment.concept || '').trim();
  if (customConcept) return customConcept;
  const installment = Number(payment && payment.installment);
  const tipo = norm(user && user.tipo) || 'general';
  let concept = null;

  if (tipo === 'llegada') {
    concept = ARRIVAL_INSTALLMENT_CONCEPTS[installment];
  } else if (tipo !== 'mentoria') {
    // General, Delft y clientes internacionales/Latam comparten tres hitos.
    concept = PRIMARY_INSTALLMENT_CONCEPTS[installment];
  }

  if (!concept) return CONCEPTO;
  const alumno = studentName(user);
  return alumno ? `${concept} – ${alumno}` : concept;
}

// Códigos de impuesto que espera la v2 en `items[].taxes` (array de strings).
// 21% -> ['s_iva_21']; 0% (fuera de la UE) -> [] (sin impuesto).
function taxCodesFor(rate) {
  return rate ? ['s_iva_' + rate] : [];
}

function invoiceTaxTreatmentFor(user, payment) {
  const pd = payment && payment.payment_data || {};
  const isExtra = Number(payment && payment.installment) >= 4;
  if (isExtra) {
    if (pd.vat_treatment === 'exempt') {
      return {
        kind: 'exempt',
        rate: 0,
        note: String(pd.exemption_note || IELTS_EXEMPTION_NOTE),
      };
    }
    // Los extras históricos sin metadatos conservan el valor por defecto del 21%.
    return { kind: 'standard_21', rate: 21, note: null };
  }
  const rate = taxRateFor(user);
  return { kind: rate ? 'standard_21' : 'zero', rate, note: null };
}

// Fecha en formato ISO YYYY-MM-DD que espera la v2 (a partir de epoch en segundos).
function ymd(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function countryName(user) {
  if (norm(user && user.origin) === 'otros' && user && user.pais) return String(user.pais);
  return 'España';
}

async function resolveExemptTaxKey() {
  const configured = String(process.env.HOLDED_TAX_EXEMPT || '').trim();
  if (configured) return configured;
  if (cachedExemptTaxKey) return cachedExemptTaxKey;

  const response = await holdedFetch('/taxes');
  const taxes = Array.isArray(response) ? response : (Array.isArray(response && response.items) ? response.items : []);
  const tax = taxes.find((candidate) => {
    const amount = Number(candidate && candidate.amount);
    const scope = norm(candidate && candidate.scope);
    const searchable = norm([
      candidate && candidate.name,
      candidate && candidate.key,
      candidate && candidate.group,
      candidate && candidate.type,
    ].filter(Boolean).join(' '));
    const active = candidate && candidate.status !== false;
    return active && amount === 0 && (!scope || scope === 'sales' || scope === 'venta' || scope === 'ventas')
      && /exent|art\.?\s*20/.test(searchable);
  });
  const key = tax && (tax.key || tax.id);
  if (!key) throw new Error('holded_exempt_tax_not_found');
  cachedExemptTaxKey = String(key);
  return cachedExemptTaxKey;
}

async function taxCodesForTreatment(treatment) {
  if (treatment.kind === 'exempt') return [await resolveExemptTaxKey()];
  return taxCodesFor(treatment.rate);
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
 * Devuelve { invoiceId, docNumber, taxRate, vatTreatment, taxKey }.
 */
async function createInvoiceForPayment(sb, user, payment) {
  const contactId = await ensureContact(sb, user);
  const treatment = invoiceTaxTreatmentFor(user, payment);
  const rate = treatment.rate;
  const taxes = await taxCodesForTreatment(treatment);
  const gross = Number(payment.amount || 0);
  // Holded espera el precio NETO unitario; desglosa la base y el IVA a partir de él.
  const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const now = Math.floor(Date.now() / 1000);
  const due = now + 7 * 24 * 3600;

  // La v2 acepta directamente el ID interno de la cuenta del plan contable.
  const acct = accountFor(user.tipo);

  const clientReference = 'Cliente Robin ' + (user.lead_id || user.id || '');
  const body = {
    contact_id: contactId,
    date: ymd(now),
    due_date: ymd(due),
    currency: String(payment.currency || 'eur').toLowerCase(),
    notes: treatment.note ? `${clientReference}\n${treatment.note}` : clientReference,
    ...(treatment.note ? { body: treatment.note } : {}),
    items: [{
      name: invoiceConceptFor(user, payment),
      desc: '',
      units: 1,
      price: net,
      taxes,
      account: acct,
      retention: 0,
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

  return {
    invoiceId,
    docNumber,
    taxRate: rate,
    vatTreatment: treatment.kind,
    taxKey: taxes[0] || null,
  };
}

function invoiceIsAnnulled(invoice) {
  const statusText = norm([
    invoice && invoice.status,
    invoice && invoice.state,
    invoice && invoice.status_name,
    invoice && invoice.statusName,
  ].filter(Boolean).join(' '));
  return Boolean(invoice && (
    invoice.cancelled || invoice.canceled || invoice.voided || invoice.is_cancelled
    || invoice.isCancelled || statusText === '3' || /anulad|cancel|void/.test(statusText)
  ));
}

/** Anula la factura sin borrarla de Holded. */
async function annulInvoice(invoiceId) {
  try {
    await holdedFetch('/invoices/' + encodeURIComponent(invoiceId) + '/cancel', { method: 'POST' });
    return { ok: true, already: false };
  } catch (error) {
    // Si Holded completó la operación pero se perdió la respuesta o falló la
    // persistencia local, el reintento debe ser idempotente.
    if (error && error.message === 'holded_http_422') {
      const invoice = await holdedFetch('/invoices/' + encodeURIComponent(invoiceId));
      if (invoiceIsAnnulled(invoice)) return { ok: true, already: true };
    }
    throw error;
  }
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

module.exports = {
  isEU,
  taxRateFor,
  accountFor,
  invoiceConceptFor,
  invoiceTaxTreatmentFor,
  resolveExemptTaxKey,
  ensureContact,
  createInvoiceForPayment,
  annulInvoice,
  invoiceIsAnnulled,
  getInvoicePdf,
  CONCEPTO,
  ACCOUNT_BY_TIPO,
};
