const { round, amount } = require("./utils");
const { applicationPlanForUser } = require("../../shared/financial-config.cjs");

const CONTRACTED_EXCLUDED_CLIENT_IDS = new Set([
  '561bcb03-ce90-4908-bb83-7402ecca02d1', // Santiago Martin Miguel
  '1aa03c5e-f616-4f16-9abf-740f85ade79a', // Daniel Hollingsworth
]);
const CONTRACTED_AMOUNT_OVERRIDES = new Map([
  ['57985b08-3665-4ae2-b1b4-bc5b2bc49048', 2799], // Brais Barreira Valiña
  ['07a59e65-45bf-46e2-b7f4-6bbaede492ac', 2199], // Mateo Roetti Gomez
]);
function sumPlanForUser(user, payments) {
  const override = CONTRACTED_AMOUNT_OVERRIDES.get(String(user.id));
  if (override !== undefined) return round(override);
  const plan = applicationPlanForUser(user);
  const byInstallment = new Map(payments.map((payment) => [Number(payment.installment), payment]));
  return round(plan.reduce((total, planned) => total + amount(byInstallment.get(planned.installment)?.amount ?? planned.amount), 0));
}
function contractedAmountForUser(user, payments = []) {
  if (!isContractedUserIncluded(user)) return 0;
  return sumPlanForUser(user, payments);
}
function isContractedUserIncluded(user) {
  return Boolean(user && !CONTRACTED_EXCLUDED_CLIENT_IDS.has(String(user.id)));
}

module.exports = { CONTRACTED_EXCLUDED_CLIENT_IDS, CONTRACTED_AMOUNT_OVERRIDES, sumPlanForUser, contractedAmountForUser, isContractedUserIncluded };
