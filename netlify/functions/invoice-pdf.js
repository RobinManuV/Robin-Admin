/**
 * GET /api/invoice-pdf?payment_id=...
 * Devuelve el PDF de la factura de Holded asociada a un pago del usuario
 * autenticado. Si el pago no tiene factura de Holded (pagos antiguos),
 * responde 404 y el frontend usa la factura imprimible del portal.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed } = require('../../lib/http');
const { ownsRecord } = require('../../lib/authorization');
const holded = require('../../lib/holded');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const paymentId = (event.queryStringParameters || {}).payment_id;
  if (!paymentId) return json({ error: 'missing_payment_id' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: p, error } = await sb
      .from('payments')
      .select('id, user_id, payment_data, invoice_number')
      .eq('id', paymentId)
      .single();
    if (error || !p || !ownsRecord({ id: session.uid }, p)) {
      return json({ error: 'not_found' }, { statusCode: 404 });
    }
    const invId = p.payment_data && p.payment_data.holded_invoice_id;
    if (!invId) return json({ error: 'no_holded_invoice' }, { statusCode: 404 });

    const b64 = await holded.getInvoicePdf(invId);
    if (!b64) return json({ error: 'pdf_unavailable' }, { statusCode: 502 });

    const num = (p.payment_data && p.payment_data.holded_invoice_num) || p.invoice_number || 'factura';
    const fname = 'Factura ' + String(num).replace(/[^a-zA-Z0-9._-]/g, '') + '.pdf';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="' + fname + '"',
        'Cache-Control': 'private, max-age=0, no-store',
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error('invoice-pdf error', e && e.message);
    return json({ error: 'server_error' }, { statusCode: 500 });
  }
};
