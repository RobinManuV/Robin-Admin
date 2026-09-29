/**
 * POST /api/onboarding/contract
 * Body: {
 *   nombre_cliente, dni_cliente, extras,
 *   signature_content (data:image/png;base64,...)
 * }
 * Guarda la firma en Storage, persiste únicamente su ruta y marca el contrato firmado.
 * Además genera un PDF del contrato completo (con los datos rellenos + firma) y
 * lo envía por email a hello@project-robin.com y al correo del cliente.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { sendEmail } = require('../../lib/email');
const { buildContractPdf } = require('../../lib/contract-pdf');
const { DELFT_PRICE_VERSION } = require('../../shared/financial-config.cjs');
const storage = require('../../lib/storage');
const { variantKey } = require('../../shared/contract-content.cjs');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtFecha(iso) {
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
      .format(new Date(iso));
  } catch (_) { return String(iso); }
}

/** HTML breve del correo (cuerpo); el contrato completo va como PDF adjunto. */
function buildCoverHtml({ clienteNombre, alumnoNombre, fechaStr, leadId, tipoTitulo }) {
  return '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">' +
  '<div style="max-width:600px;margin:0 auto;padding:24px;">' +
    '<div style="background:#1B2F6E;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">' +
      '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.7;">Project Robin</div>' +
      '<div style="font-size:18px;font-weight:bold;margin-top:4px;">' + esc(tipoTitulo) + '</div>' +
    '</div>' +
    '<div style="background:#fff;padding:22px;border:1px solid #e2e8f0;border-top:0;font-size:14px;line-height:1.6;border-radius:0 0 12px 12px;">' +
      '<p>Hola,</p>' +
      '<p>Adjuntamos la <strong>copia firmada del contrato</strong> entre PROJECT ROBIN STUDENTS MOBILITY S.L. y <strong>' + esc(clienteNombre) + '</strong> en relación con <strong>' + esc(alumnoNombre) + '</strong>.</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">' +
        '<tr><td style="padding:6px 0;color:#64748b;width:140px;">Cliente:</td><td><strong>' + esc(clienteNombre) + '</strong></td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b;">Alumno:</td><td>' + esc(alumnoNombre) + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b;">ID cliente:</td><td>' + esc(leadId) + '</td></tr>' +
        '<tr><td style="padding:6px 0;color:#64748b;">Fecha de firma:</td><td>' + esc(fechaStr) + '</td></tr>' +
      '</table>' +
      '<p style="font-size:12px;color:#64748b;">El PDF adjunto contiene el contrato íntegro con los datos rellenos y la firma del cliente.</p>' +
    '</div>' +
  '</div></body></html>';
}

const TITULO_POR_VARIANTE = {
  general: 'Contrato — Consultoría académica',
  general_noes: 'Contrato — Consultoría académica (Internacional)',
  delft: 'Contrato — TU Delft',
  llegada: 'Contrato — Pack Llegada',
  mentoria: 'Contrato — Pack Mentoría',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const { nombre_cliente, dni_cliente, extras, signature_content } = body;
  if (!nombre_cliente || !String(nombre_cliente).trim()) return json({ error: 'missing_nombre_cliente' }, { statusCode: 400 });
  if (!dni_cliente || !String(dni_cliente).trim()) return json({ error: 'missing_dni_cliente' }, { statusCode: 400 });
  if (!signature_content || !/^data:image\//.test(String(signature_content))) {
    return json({ error: 'missing_signature' }, { statusCode: 400 });
  }
  const allowedExtras = new Set(['revision_candidaturas', 'housing_piso']);
  const extrasList = Array.isArray(extras) ? extras.filter((x) => allowedExtras.has(x)) : [];

  try {
    const sb = getSupabase();
    const { data: u, error: e1 } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, dni_numero, direccion, dni_completed, tipo, origin, application_level, has_eu_id, num_carreras, contract_data')
      .eq('id', session.uid)
      .single();
    if (e1 || !u) return json({ error: 'unauthorized' }, { statusCode: 401 });
    if (!u.dni_completed) return json({ error: 'dni_not_completed' }, { statusCode: 409 });

    const nowIso = new Date().toISOString();
    const fechaStr = fmtFecha(nowIso);
    const tipo = (u.tipo || 'general').toLowerCase();
    const esOtros = (u.origin || '') === 'otros';
    const esMaestria = esOtros && (u.application_level || '') === 'maestria';
    const esPasaporte = esOtros && u.has_eu_id === false;
    const signatureMime = (/^data:([^;,]+)/.exec(String(signature_content)) || [])[1] || 'image/png';
    const uploadedSignature = await storage.uploadDataUrl(sb, signature_content, {
      keyPrefix: `${u.id}/contracts`,
      filename: `signature-${nowIso.slice(0, 10)}.png`,
      contentType: signatureMime,
    });

    const contract_data = {
      version_template: 'contratos-2027-revision-integrada',
      pricing_version: tipo === 'delft' ? DELFT_PRICE_VERSION : null,
      tipo,
      variant: variantKey(tipo, esOtros),
      fecha_firma: nowIso,
      alumno: {
        nombre: u.nombre || null,
        apellidos: u.apellidos || null,
        dni_numero: u.dni_numero || null,
        direccion: u.direccion || null,
      },
      cliente: {
        nombre: String(nombre_cliente).trim(),
        dni: String(dni_cliente).trim().toUpperCase(),
      },
      extras: extrasList,
      signature_path: uploadedSignature.path,
      signature_mime: signatureMime,
    };

    const { error: e2 } = await sb
      .from('users')
      .update({
        contract_signed: true,
        contract_signed_at: nowIso,
        contract_data,
      })
      .eq('id', session.uid);
    if (e2) {
      await storage.removeObject(sb, uploadedSignature.path);
      throw e2;
    }
    const previousSignaturePath = u.contract_data && u.contract_data.signature_path;
    if (previousSignaturePath && previousSignaturePath !== uploadedSignature.path) {
      await storage.removeObject(sb, previousSignaturePath);
    }

    // Best-effort: generar PDF y enviar por email — no bloquea la respuesta.
    try {
      const pdfBuffer = await buildContractPdf({
        tipo,
        esOtros,
        esMaestria,
        esPasaporte,
        alumno: contract_data.alumno,
        cliente: contract_data.cliente,
        numCarreras: u.num_carreras || null,
        fechaStr,
        signatureDataUrl: signature_content,
      });

      const clienteNombre = contract_data.cliente.nombre || 'Cliente';
      const alumnoNombre = `${u.nombre || ''} ${u.apellidos || ''}`.trim() || '—';
      const leadId = u.lead_id || u.id || '';
      const variant = variantKey(tipo, esOtros);
      const tipoTitulo = TITULO_POR_VARIANTE[variant] || TITULO_POR_VARIANTE.general;
      const subject = 'CONTRATO ROBIN "' + clienteNombre + ', ' + leadId + '"';
      const filename = 'Contrato Robin - ' + clienteNombre.replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80) + '.pdf';
      const html = buildCoverHtml({ clienteNombre, alumnoNombre, fechaStr, leadId, tipoTitulo });

      const attachments = [{
        filename,
        content: pdfBuffer.toString('base64'),
        content_type: 'application/pdf',
      }];

      // 1) Copia interna — siempre llega
      await sendEmail({ to: 'hello@project-robin.com', subject, html, attachments, tag: 'contrato' });
      // 2) Copia al cliente — llega cuando el dominio Resend está verificado
      if (u.email) {
        await sendEmail({ to: u.email, subject, html, attachments, tag: 'contrato' });
      }
    } catch (mailErr) {
      console.error('contract email/pdf error', mailErr && mailErr.message);
    }

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, session.uid);
    return json({ ok: true, contract_signed_at: nowIso });
  } catch (e) {
    console.error('onboarding-contract error', e);
    return serverError(e);
  }
};
