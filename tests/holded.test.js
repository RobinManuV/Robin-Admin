const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONCEPTO,
  annulInvoice,
  createInvoiceForPayment,
  invoiceConceptFor,
  invoiceIsAnnulled,
  invoiceTaxTreatmentFor,
} = require('../lib/holded');
const { IELTS_EXEMPTION_NOTE } = require('../lib/extra-payments');

const alumno = { nombre: 'Lucía', apellidos: 'García' };

test('uses the service milestone for the three main installments', () => {
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'general' }, { installment: 1 }),
    'Servicio de acompañamiento universitario – Cuota 1/3 – Asesoramiento inicial – Lucía García'
  );
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'delft' }, { installment: 2 }),
    'Servicio de acompañamiento universitario – Cuota 2/3 – Gestión de postulaciones – Lucía García'
  );
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'general', origin: 'otros' }, { installment: 3 }),
    'Servicio de acompañamiento universitario – Cuota 3/3 – Admisión confirmada y preparación de llegada – Lucía García'
  );
});

test('uses the Pack Llegada milestones', () => {
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'llegada' }, { installment: 1 }),
    'Pack Llegada – Cuota 1/2 – Inicio del servicio – Lucía García'
  );
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'llegada' }, { installment: 2 }),
    'Pack Llegada – Cuota 2/2 – Alojamiento reservado – Lucía García'
  );
});

test('keeps the generic concept for mentoring and historical extras without a concept', () => {
  assert.equal(invoiceConceptFor({ ...alumno, tipo: 'mentoria' }, { installment: 1 }), CONCEPTO);
  assert.equal(invoiceConceptFor({ ...alumno, tipo: 'general' }, { installment: 4 }), CONCEPTO);
});

test('uses the exact portal concept for extra payments', () => {
  assert.equal(
    invoiceConceptFor({ ...alumno, tipo: 'general' }, { installment: 4, concept: 'Clase IELTS – Grupo' }),
    'Clase IELTS – Grupo'
  );
});

test('falls back to the contract student name', () => {
  const user = {
    tipo: 'general',
    contract_data: { alumno: { nombre: 'Mario', apellidos: 'López' } },
  };
  assert.equal(
    invoiceConceptFor(user, { installment: 1 }),
    'Servicio de acompañamiento universitario – Cuota 1/3 – Asesoramiento inicial – Mario López'
  );
});

test('selects 21 percent or exempt VAT for extra payments', () => {
  assert.deepEqual(
    invoiceTaxTreatmentFor(alumno, { installment: 4, concept: 'Extra', payment_data: { vat_treatment: 'standard_21' } }),
    { kind: 'standard_21', rate: 21, note: null }
  );
  assert.deepEqual(
    invoiceTaxTreatmentFor(alumno, { installment: 4, concept: 'IELTS', payment_data: { vat_treatment: 'exempt' } }),
    { kind: 'exempt', rate: 0, note: IELTS_EXEMPTION_NOTE }
  );
});

test('recognizes annulled Holded invoices', () => {
  assert.equal(invoiceIsAnnulled({ status: 'cancelled' }), true);
  assert.equal(invoiceIsAnnulled({ status_name: 'Anulada' }), true);
  assert.equal(invoiceIsAnnulled({ status: 'draft' }), false);
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

test('creates an exempt invoice without adding VAT and prints the legal note', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalPat = process.env.HOLDED_API_PAT;
  const originalExempt = process.env.HOLDED_TAX_EXEMPT;
  const calls = [];
  process.env.HOLDED_API_PAT = 'pat_test';
  process.env.HOLDED_TAX_EXEMPT = 's_iva_exempt';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') return jsonResponse({ id: 'invoice-exempt' });
    return jsonResponse({ id: 'invoice-exempt', document_number: 'R-42' });
  };
  try {
    const result = await createInvoiceForPayment({}, {
      id: 'user-1', tipo: 'general', holded_contact_id: 'contact-1',
    }, {
      installment: 4,
      amount: 132,
      currency: 'EUR',
      concept: 'Clase de preparación de inglés/IELTS – Individual – 4 horas – Lucía García',
      payment_data: { vat_treatment: 'exempt', exemption_note: IELTS_EXEMPTION_NOTE },
    });
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.items[0].price, 132);
    assert.deepEqual(payload.items[0].taxes, ['s_iva_exempt']);
    assert.equal(payload.items[0].retention, 0);
    assert.equal(payload.body, IELTS_EXEMPTION_NOTE);
    assert.match(payload.notes, /artículo 20\.Uno\.9/);
    assert.equal(result.taxRate, 0);
    assert.equal(result.vatTreatment, 'exempt');
  } finally {
    global.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.HOLDED_API_PAT; else process.env.HOLDED_API_PAT = originalPat;
    if (originalExempt === undefined) delete process.env.HOLDED_TAX_EXEMPT; else process.env.HOLDED_TAX_EXEMPT = originalExempt;
  }
});

test('treats an entered amount as gross when VAT is 21 percent', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalPat = process.env.HOLDED_API_PAT;
  const calls = [];
  process.env.HOLDED_API_PAT = 'pat_test';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') return jsonResponse({ id: 'invoice-standard' });
    return jsonResponse({ id: 'invoice-standard' });
  };
  try {
    await createInvoiceForPayment({}, { id: 'user-1', tipo: 'general', holded_contact_id: 'contact-1' }, {
      installment: 4, amount: 121, currency: 'EUR', concept: 'Extra', payment_data: { vat_treatment: 'standard_21' },
    });
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.items[0].price, 100);
    assert.deepEqual(payload.items[0].taxes, ['s_iva_21']);
  } finally {
    global.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.HOLDED_API_PAT; else process.env.HOLDED_API_PAT = originalPat;
  }
});

test('annuls an invoice through Holded cancel and never deletes it', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalPat = process.env.HOLDED_API_PAT;
  let request;
  process.env.HOLDED_API_PAT = 'pat_test';
  global.fetch = async (url, options = {}) => {
    request = { url: String(url), options };
    return jsonResponse({ status: 'cancelled' });
  };
  try {
    await annulInvoice('invoice-7');
    assert.match(request.url, /\/invoices\/invoice-7\/cancel$/);
    assert.equal(request.options.method, 'POST');
  } finally {
    global.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.HOLDED_API_PAT; else process.env.HOLDED_API_PAT = originalPat;
  }
});

test('treats an already annulled Holded invoice as an idempotent success', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalPat = process.env.HOLDED_API_PAT;
  const calls = [];
  process.env.HOLDED_API_PAT = 'pat_test';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') return jsonResponse({ error: 'not cancellable' }, 422);
    return jsonResponse({ status: 'voided' });
  };
  try {
    const result = await annulInvoice('invoice-8');
    assert.deepEqual(result, { ok: true, already: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.method, 'GET');
  } finally {
    global.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.HOLDED_API_PAT; else process.env.HOLDED_API_PAT = originalPat;
  }
});
