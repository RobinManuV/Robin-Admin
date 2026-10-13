const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IELTS_EXEMPTION_NOTE,
  prepareExtraPayment,
} = require('../lib/extra-payments');
const { effectivePaymentStatus, isPaymentAnnulled } = require('../lib/payments');

const user = { nombre: 'Lucía', apellidos: 'García' };

test('creates an exempt IELTS evaluation at 33 euros per unit', () => {
  const payment = prepareExtraPayment(user, { preset: 'ielts_evaluation', units: 3 });
  assert.equal(payment.concept, 'Evaluación inicial de inglés/IELTS – Lucía García');
  assert.equal(payment.amount, 99);
  assert.deepEqual(payment.paymentData, {
    extra_payment: true,
    preset: 'ielts_evaluation',
    units: 3,
    unit_price: 33,
    vat_treatment: 'exempt',
    vat_rate: 0,
    exemption_note: IELTS_EXEMPTION_NOTE,
  });
});

test('calculates all IELTS class combinations', () => {
  const expected = {
    individual: { 4: 132, 6: 198, 8: 264, 12: 396 },
    group: { 4: 66, 6: 99, 8: 132, 12: 198 },
  };
  for (const [mode, prices] of Object.entries(expected)) {
    for (const [hours, amount] of Object.entries(prices)) {
      const payment = prepareExtraPayment(user, {
        preset: 'ielts_class',
        class_mode: mode,
        hours: Number(hours),
      });
      const label = mode === 'individual' ? 'Individual' : 'Grupo';
      assert.equal(payment.concept, `Clase de preparación de inglés/IELTS – ${label} – ${hours} horas – Lucía García`);
      assert.equal(payment.amount, amount);
      assert.equal(payment.paymentData.vat_treatment, 'exempt');
      assert.equal(payment.paymentData.exemption_note, IELTS_EXEMPTION_NOTE);
    }
  }
});

test('keeps the custom gross amount and validates the selected VAT treatment', () => {
  const standard = prepareExtraPayment(user, {
    preset: 'custom', concept: 'Servicio adicional', amount: '121,00'.replace(',', '.'), vat_treatment: 'standard_21',
  });
  assert.equal(standard.amount, 121);
  assert.equal(standard.paymentData.vat_rate, 21);
  assert.equal(standard.paymentData.exemption_note, undefined);

  const exempt = prepareExtraPayment(user, {
    preset: 'custom', concept: 'Servicio exento', amount: 80, vat_treatment: 'exempt',
  });
  assert.equal(exempt.amount, 80);
  assert.equal(exempt.paymentData.vat_rate, 0);
  assert.equal(exempt.paymentData.exemption_note, IELTS_EXEMPTION_NOTE);
});

test('rejects invalid preset parameters', () => {
  assert.throws(() => prepareExtraPayment(user, { preset: 'ielts_evaluation', units: 0 }), /invalid_units/);
  assert.throws(() => prepareExtraPayment(user, { preset: 'ielts_class', class_mode: 'pair', hours: 4 }), /invalid_class_mode/);
  assert.throws(() => prepareExtraPayment(user, { preset: 'ielts_class', class_mode: 'group', hours: 5 }), /invalid_hours/);
  assert.throws(() => prepareExtraPayment(user, { preset: 'custom', concept: 'x', amount: 10, vat_treatment: 'ten' }), /invalid_vat_treatment/);
});

test('keeps an annulled payment for audit while exposing its effective status', () => {
  const payment = { status: 'paid', payment_data: { annulled_at: '2026-10-13T10:00:00.000Z' } };
  assert.equal(isPaymentAnnulled(payment), true);
  assert.equal(effectivePaymentStatus(payment), 'annulled');
  assert.equal(effectivePaymentStatus({ status: 'paid', payment_data: {} }), 'paid');
});
