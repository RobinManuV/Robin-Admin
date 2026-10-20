const { errorCode } = require('../observability');
const { holdedFetch, isConfigured } = require('./client');
const { createInvoiceForPayment } = require('./invoices');

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
    const { data: payment, error } = await sb.from('payments').select('*').eq('id', paymentId).single();
    if (error || !payment) return { ok: false, reason: 'payment_not_found' };
    const paymentData = payment.payment_data || {};
    if (paymentData.annulled_at) return { skipped: true, reason: 'payment_annulled' };
    if (paymentData.holded_invoice_id) return { ok: true, already: true, invoice_id: paymentData.holded_invoice_id };

    const { data: user, error: userError } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, dni_numero, direccion, tipo, origin, pais, has_eu_id, holded_contact_id, contract_data')
      .eq('id', payment.user_id)
      .single();
    if (userError || !user) return { ok: false, reason: 'user_not_found' };

    const invoice = await createInvoiceForPayment(sb, user, payment);
    const updatedPaymentData = {
      ...paymentData,
      holded_invoice_id: invoice.invoiceId,
      holded_invoice_num: invoice.docNumber,
      holded_tax_rate: invoice.taxRate,
      holded_vat_treatment: invoice.vatTreatment,
      holded_tax_key: invoice.taxKey,
      holded_at: new Date().toISOString(),
    };
    await sb.from('payments').update({ payment_data: updatedPaymentData }).eq('id', payment.id);
    try {
      await sb.from('webhook_log').insert({
        source: 'holded',
        payload: { payment_id: payment.id, user_id: user.id, installment: payment.installment },
        result: 'ok',
        message: 'invoice_created',
      });
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
    return { ok: true, invoice_id: invoice.invoiceId, invoice_num: invoice.docNumber };
  } catch (error) {
    try {
      await sb.from('webhook_log').insert({
        source: 'holded',
        payload: { payment_id: paymentId },
        result: 'error',
        message: errorCode(error, 'holded_error'),
      });
    } catch (logError) { console.warn("[optional_operation_failed]", logError && logError.message); }
    console.error('[holded] invoice error:', errorCode(error, 'holded_error'));
    return { ok: false, reason: 'holded_error', error: errorCode(error, 'holded_error') };
  }
}

module.exports = { generateInvoiceForPaymentRow };
