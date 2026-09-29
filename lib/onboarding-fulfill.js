/**
 * Lógica de "cumplimiento" tras pagar la primera cuota (onboarding):
 *  - marca users.pago_completed (idempotente)
 *  - crea estructura en Google Drive y sube DNI/Pasaporte + contrato (best-effort)
 *
 * Compartido por la verificación de Checkout y el webhook de Stripe.
 */
const { BUCKET } = require('./supabase');
const drive = require('./google-drive');
const { buildContractPdf } = require('./contract-pdf');
const storage = require('./storage');

function fmtFecha(iso) {
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
      .format(new Date(iso));
  } catch (_) { return String(iso); }
}

function safeName(s) {
  return String(s || '').replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80) || 'archivo';
}

async function syncDriveForUser(sb, userId) {
  if (!drive.isConfigured()) {
    console.log('[drive] not configured, skipping');
    return { skipped: true, reason: 'not_configured' };
  }
  const { data: u, error: e } = await sb
    .from('users')
    .select('id, lead_id, nombre, apellidos, dni_anverso_path, dni_reverso_path, dni_numero, contract_data, tipo, origin, application_level, has_eu_id, num_carreras, gdrive_folders')
    .eq('id', userId)
    .single();
  if (e || !u) throw new Error('user_not_found');

  const folders = await drive.ensureClientFolders(sb, u);
  if (!folders) return { skipped: true, reason: 'no_folders' };
  const token = await drive.getAccessToken();
  const out = { folders, uploads: [] };

  const esOtros = (u.origin || '') === 'otros';
  const esPasaporte = esOtros && u.has_eu_id === false;
  const nameBase = safeName([u.nombre, u.apellidos].filter(Boolean).join(' ') || 'cliente');

  try {
    if (u.dni_anverso_path) {
      const dl = await sb.storage.from(BUCKET).download(u.dni_anverso_path);
      if (dl && dl.data) {
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const ext = (u.dni_anverso_path.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
        const mime = ext === '.png' ? 'image/png'
                   : ext === '.webp' ? 'image/webp'
                   : ext === '.gif'  ? 'image/gif'
                   : 'image/jpeg';
        const fname = esPasaporte
          ? (nameBase + ' - Pasaporte' + ext)
          : (nameBase + ' - DNI anverso' + ext);
        const r = await drive.uploadFile({ name: fname, mimeType: mime, buffer: buf }, folders.dni, token);
        out.uploads.push({ kind: 'dni_anverso', id: r.id });
      }
    }
    if (!esPasaporte && u.dni_reverso_path) {
      const dl = await sb.storage.from(BUCKET).download(u.dni_reverso_path);
      if (dl && dl.data) {
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const ext = (u.dni_reverso_path.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
        const mime = ext === '.png' ? 'image/png'
                   : ext === '.webp' ? 'image/webp'
                   : ext === '.gif'  ? 'image/gif'
                   : 'image/jpeg';
        const fname = nameBase + ' - DNI reverso' + ext;
        const r = await drive.uploadFile({ name: fname, mimeType: mime, buffer: buf }, folders.dni, token);
        out.uploads.push({ kind: 'dni_reverso', id: r.id });
      }
    }
  } catch (errDni) {
    console.error('[drive] DNI upload error:', errDni && errDni.message);
  }

  try {
    const cd = u.contract_data || {};
    if (cd.signature_path) {
      const esMaestria = esOtros && (u.application_level || '') === 'maestria';
      const fechaStr = fmtFecha(cd.fecha_firma || new Date().toISOString());
      const signature = await storage.downloadObject(sb, cd.signature_path);
      const signatureDataUrl = `data:${cd.signature_mime || 'image/png'};base64,${signature.toString('base64')}`;
      const pdf = await buildContractPdf({
        tipo: (u.tipo || cd.tipo || 'general').toLowerCase(),
        esOtros,
        esMaestria,
        esPasaporte,
        alumno: cd.alumno || { nombre: u.nombre, apellidos: u.apellidos, dni_numero: u.dni_numero },
        cliente: cd.cliente || {},
        numCarreras: u.num_carreras || null,
        fechaStr,
        signatureDataUrl,
      });
      const fname = 'Contrato Robin - ' + nameBase + '.pdf';
      const r = await drive.uploadFile(
        { name: fname, mimeType: 'application/pdf', buffer: pdf },
        folders.contrato,
        token
      );
      out.uploads.push({ kind: 'contrato', id: r.id });
    }
  } catch (errContract) {
    console.error('[drive] Contract upload error:', errContract && errContract.message);
  }

  try {
    const uploadCount = out.uploads.length;
    await sb.from('webhook_log').insert({
      source: 'gdrive_sync',
      payload: { user_id: userId, count: uploadCount },
      result: 'ok',
      message: 'onboarding drive sync',
    });
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }

  return out;
}

/**
 * Marca el onboarding como pagado (idempotente) y dispara la sync de Drive.
 * pagoData: objeto que se guarda en users.pago_data.
 */
async function markOnboardingPaid(sb, userId, pagoData) {
  if (!userId) return { ok: false, reason: 'no_user_id' };
  const { data: u, error } = await sb
    .from('users')
    .select('id, pago_completed, contract_signed')
    .eq('id', userId)
    .single();
  if (error || !u) return { ok: false, reason: 'user_not_found' };

  let justCompleted = false;
  if (!u.pago_completed) {
    const nowIso = (pagoData && pagoData.at) || new Date().toISOString();
    // Transición atómica false->true: solo un llamante (verify vs webhook) la gana,
    // de modo que el correo de bienvenida se envía una única vez.
    const { data: flipped, error: e2 } = await sb
      .from('users')
      .update({
        pago_completed: true,
        pago_completed_at: nowIso,
        pago_data: pagoData || null,
        requires_onboarding: false,
      })
      .eq('id', userId)
      .eq('pago_completed', false)
      .select('id');
    if (e2) throw e2;
    justCompleted = !!(flipped && flipped.length);
  }

  let gdrive = null;
  try {
    gdrive = await syncDriveForUser(sb, userId);
  } catch (driveErr) {
    console.error('[drive] sync error:', driveErr && driveErr.message);
    gdrive = { skipped: true, reason: 'error', detail: driveErr && driveErr.message };
  }

  // Factura de Holded para la 1.ª cuota (best-effort, idempotente).
  try {
    const { ensurePayments } = require('./payments');
    const { data: ufull } = await sb.from('users').select('*').eq('id', userId).single();
    if (ufull) {
      const rows = await ensurePayments(sb, ufull);
      const first = (rows || []).find((r) => r.installment === 1);
      if (first) await require('./integration-sync').syncHoldedInvoice(sb, first.id);
    }
  } catch (holdedErr) {
    console.error('[holded] onboarding invoice error:', holdedErr && holdedErr.message);
  }

  // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
  await require('./integration-sync').syncGoogleSheets(sb, userId);

  // Correo de bienvenida con los recursos (best-effort, solo en la transición a completado).
  if (justCompleted) {
    try { await require('./onboarding-welcome').sendWelcomeEmail(sb, userId); }
    catch (welcomeErr) { console.error('[welcome] error:', welcomeErr && welcomeErr.message); }
  }

  return { ok: true, gdrive };
}

module.exports = { syncDriveForUser, markOnboardingPaid, fmtFecha, safeName };
