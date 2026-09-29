const APPLICATION_TOTALS = Object.freeze({
  general: Object.freeze({ 1: 1700, 2: 2000, 3: 2100 }),
  delft: 2999,
  llegada: 1700,
  mentoria: 450,
  international: 2700,
});

const FISCAL = Object.freeze({
  razon_social: "PROJECT ROBIN STUDENTS MOBILITY S.L.",
  cif: "B75355057",
  direccion: "Calle Covarrubias 9, 28010, Madrid, Comunidad de Madrid, España",
  iva: 21,
  concepto: "Asesoramiento para estudiar en el extranjero",
});

function splitEqual(total, count) {
  const each = Math.round((Number(total) / count) * 100) / 100;
  let accumulated = 0;
  return Array.from({ length: count }, (_, index) => {
    const installment = index + 1;
    const amount = installment === count ? Math.round((Number(total) - accumulated) * 100) / 100 : each;
    if (installment !== count) accumulated = Math.round((accumulated + amount) * 100) / 100;
    return { installment, amount };
  });
}

function applicationPlan(tipo, numCarreras, origin, hasEuId) {
  if (String(origin || "").toLowerCase() === "otros" && hasEuId !== true) return splitEqual(APPLICATION_TOTALS.international, 3);
  const key = String(tipo || "general").toLowerCase();
  const careers = Number(numCarreras) || 1;
  if (key === "general") {
    const total = APPLICATION_TOTALS.general[careers] || APPLICATION_TOTALS.general[1];
    const first = Math.round((APPLICATION_TOTALS.general[1] / 3) * 100) / 100;
    const second = Math.round(((total - first) / 2) * 100) / 100;
    return [{ installment: 1, amount: first }, { installment: 2, amount: second }, { installment: 3, amount: Math.round((total - first - second) * 100) / 100 }];
  }
  if (key === "delft") return [{ installment: 1, amount: 999 }, { installment: 2, amount: 1000 }, { installment: 3, amount: 1000 }];
  if (key === "llegada") return splitEqual(APPLICATION_TOTALS.llegada, 2);
  if (key === "mentoria") return splitEqual(APPLICATION_TOTALS.mentoria, 1);
  return applicationPlan("general", careers);
}

function applicationPlanForUser(user = {}) {
  const key = String(user.tipo || "general").toLowerCase();
  let pricingVersion = null;
  try { pricingVersion = typeof user.contract_data === "string" ? JSON.parse(user.contract_data).pricing_version : user.contract_data?.pricing_version; } catch { pricingVersion = null; }
  if (key === "delft" && user.contract_signed && pricingVersion !== "delft-2999-v1") {
    return [{ installment: 1, amount: 933 }, { installment: 2, amount: 933 }, { installment: 3, amount: 933 }];
  }
  return applicationPlan(user.tipo, user.num_carreras, user.origin, user.has_eu_id);
}

export default { APPLICATION_TOTALS, CURRENCY: "EUR", DELFT_PRICE_VERSION: "delft-2999-v1", FISCAL, applicationPlan, applicationPlanForUser, splitEqual };
