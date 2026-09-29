const CURRENCY = 'EUR';
const DELFT_PRICE_VERSION = 'delft-2999-v1';

const APPLICATION_TOTALS = Object.freeze({
  general: Object.freeze({ 1: 1700, 2: 2000, 3: 2100 }),
  delft: 2999,
  llegada: 1700,
  mentoria: 450,
  international: 2700,
});

const FISCAL = Object.freeze({
  razon_social: 'PROJECT ROBIN STUDENTS MOBILITY S.L.',
  cif: 'B75355057',
  direccion: 'Calle Covarrubias 9, 28010, Madrid, Comunidad de Madrid, España',
  iva: 21,
  concepto: 'Asesoramiento para estudiar en el extranjero',
});

function splitEqual(total, count) {
  const each = Math.round((Number(total) / count) * 100) / 100;
  const installments = [];
  let accumulated = 0;
  for (let installment = 1; installment <= count; installment++) {
    const amount = installment === count
      ? Math.round((Number(total) - accumulated) * 100) / 100
      : each;
    if (installment !== count) accumulated = Math.round((accumulated + amount) * 100) / 100;
    installments.push({ installment, amount });
  }
  return installments;
}

function applicationPlan(tipo, numCarreras, origin, hasEuId) {
  if (String(origin || '').toLowerCase() === 'otros' && hasEuId !== true) {
    return splitEqual(APPLICATION_TOTALS.international, 3);
  }
  const key = String(tipo || 'general').toLowerCase();
  const careers = Number(numCarreras) || 1;
  if (key === 'general') {
    const total = APPLICATION_TOTALS.general[careers] || APPLICATION_TOTALS.general[1];
    const first = Math.round((APPLICATION_TOTALS.general[1] / 3) * 100) / 100;
    const remainder = Math.round((total - first) * 100) / 100;
    const second = Math.round((remainder / 2) * 100) / 100;
    return [
      { installment: 1, amount: first },
      { installment: 2, amount: second },
      { installment: 3, amount: Math.round((remainder - second) * 100) / 100 },
    ];
  }
  if (key === 'delft') {
    return [
      { installment: 1, amount: 999 },
      { installment: 2, amount: 1000 },
      { installment: 3, amount: 1000 },
    ];
  }
  if (key === 'llegada') return splitEqual(APPLICATION_TOTALS.llegada, 2);
  if (key === 'mentoria') return splitEqual(APPLICATION_TOTALS.mentoria, 1);
  return applicationPlan('general', careers);
}

function contractPricingVersion(contractData) {
  if (!contractData) return null;
  if (typeof contractData === 'string') {
    try { return JSON.parse(contractData).pricing_version || null; }
    catch (_) { return null; }
  }
  return contractData.pricing_version || null;
}

/**
 * Conserva el plan histórico de Delft en contratos ya firmados antes del
 * cambio a 2.999 €. Los clientes sin contrato firmado usan siempre el precio
 * vigente, y los contratos nuevos quedan marcados con DELFT_PRICE_VERSION.
 */
function applicationPlanForUser(user) {
  const source = user || {};
  const key = String(source.tipo || 'general').toLowerCase();
  if (key === 'delft' && source.contract_signed && contractPricingVersion(source.contract_data) !== DELFT_PRICE_VERSION) {
    return [
      { installment: 1, amount: 933 },
      { installment: 2, amount: 933 },
      { installment: 3, amount: 933 },
    ];
  }
  return applicationPlan(source.tipo, source.num_carreras, source.origin, source.has_eu_id);
}

module.exports = {
  APPLICATION_TOTALS,
  CURRENCY,
  DELFT_PRICE_VERSION,
  FISCAL,
  applicationPlan,
  applicationPlanForUser,
  splitEqual,
};
