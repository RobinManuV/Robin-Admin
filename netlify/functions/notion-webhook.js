const { getSupabase } = require('../../lib/supabase');
const { hashPassword } = require('../../lib/auth');
const crypto = require('crypto');
const { json, methodNotAllowed, parseJsonBody, safeEqual, serverError } = require('../../lib/http');
const { identityExists } = require('../../lib/identity');
const { passwordPolicy } = require('../../shared/password-policy.cjs');
const { createOperationLogger, errorCode } = require('../../lib/observability');
const { sendAccountAccessEmail } = require('../../lib/account-access-email');
const { TRIGGER_STATUS, ensureDriveFolder, logEvent, mapResponsableToAdminEmail, normalizeTipo, parsePayload } = require('../../lib/notion');

exports.handler = async (event) => {
  const log = createOperationLogger(event, {
    operation: 'webhook.notion',
    actor_role: 'provider',
    integration: 'notion',
  });
  log.start();
  if (event.httpMethod !== 'POST') {
    log.warn('rejected', { error_code: 'method_not_allowed' });
    return methodNotAllowed(['POST']);
  }

  // Auth: firma HMAC de Notion (opcional, si NOTION_VERIFICATION_TOKEN está configurado)
  // o secreto compartido (X-Robin-Secret / ?secret=). Comparaciones en tiempo constante.
  const hmacToken = process.env.NOTION_VERIFICATION_TOKEN;
  const sharedSecrets = [process.env.NOTION_WEBHOOK_SECRET, process.env.ROBIN_ADMIN_SYNC_SECRET].filter(Boolean);
  if (!hmacToken && !sharedSecrets.length) {
    log.warn('degraded', { error_code: 'missing_secret_configuration' });
    return json({ error: 'missing_secret_configuration' }, { statusCode: 500 });
  }
  let authed = false;

  if (hmacToken) {
    const sig = (event.headers && (event.headers['x-notion-signature'] || event.headers['X-Notion-Signature'])) || '';
    if (sig) {
      const raw = event.body || '';
      const buf = event.isBase64Encoded ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8');
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', hmacToken).update(buf).digest('hex');
      authed = safeEqual(sig, expectedSig);
    }
  }
  if (!authed) {
    const provided =
      (event.headers && (event.headers['x-robin-secret'] || event.headers['X-Robin-Secret'])) ||
      (event.queryStringParameters && event.queryStringParameters.secret);
    authed = !!provided && sharedSecrets.some((secret) => safeEqual(provided, secret));
  }
  if (!authed) {
    await logEvent(null, {}, 'error', 'invalid_secret');
    log.warn('rejected', { error_code: 'invalid_secret' });
    return json({ error: 'invalid_secret' }, { statusCode: 401 });
  }

  const body = parseJsonBody(event);
  if (!body) {
    log.warn('rejected', { error_code: 'invalid_json' });
    return json({ error: 'invalid_json' }, { statusCode: 400 });
  }

  let lead_id, notion_page_id, status, name, email, responsable, tipo, primer_pago_pagado;
  try {
    ({ lead_id, notion_page_id, status, name, email, responsable, tipo, primer_pago_pagado } = parsePayload(body));
  } catch (e) {
    await logEvent(body, {}, 'error', 'parse_error');
    log.warn('rejected', { error_code: errorCode(e, 'parse_error') });
    return json({ error: 'parse_error', detail: e.message }, { statusCode: 400 });
  }

  if (!lead_id) {
    await logEvent(body, {}, 'error', 'missing_lead_id');
    log.warn('rejected', { error_code: 'missing_lead_id' });
    return json({ error: 'missing_lead_id' }, { statusCode: 400 });
  }

  const normalized = (status || '').toString().trim().toUpperCase();
  if (!TRIGGER_STATUS.includes(normalized)) {
    await logEvent(body, { status: normalized }, 'ignored', 'status_ignored');
    log.result('ignored', { entity_type: 'lead', entity_id: lead_id });
    return json({ ok: true, result: 'ignored', reason: 'status_not_INSIDE' });
  }

  const assignedEmail = mapResponsableToAdminEmail(responsable);
  const normalizedTipo = normalizeTipo(tipo);

  try {
    const sb = getSupabase();

    // Idempotencia: si ya existe el cliente, actualiza assigned_to y notion_page_id si vienen.
    const { data: existing } = await sb
      .from('users')
      .select('id, username, assigned_to, pago_completed')
      .eq('lead_id', String(lead_id))
      .maybeSingle();
    if (existing) {
      const patch = {};
      if (assignedEmail && existing.assigned_to !== assignedEmail) patch.assigned_to = assignedEmail;
      if (notion_page_id) patch.notion_page_id = notion_page_id;
      if (tipo) patch.tipo = normalizedTipo;
      // 1er pago marcado como pagado (p.ej. por transferencia) desde Notion:
      // se salda la primera cuota y se salta el paso de pago del onboarding.
      if (primer_pago_pagado && !existing.pago_completed) {
        const nowIso = new Date().toISOString();
        patch.pago_completed = true;
        patch.pago_completed_at = nowIso;
        patch.pago_data = { method: 'transferencia', source: 'notion', at: nowIso };
      }
      if (Object.keys(patch).length) {
        await sb.from('users').update(patch).eq('id', existing.id);
      }
      // Si el cliente existente aún no tiene carpeta en Drive, se la creamos.
      await ensureDriveFolder(sb, existing.id, log);

      await logEvent(
        body, { user_id: existing.id, status: normalized }, 'exists',
        'notion_existing_user'
      );
      log.result('already_exists', { entity_type: 'user', entity_id: existing.id });
      return json({ ok: true, result: 'exists', user_id: existing.id, assigned_to: assignedEmail || existing.assigned_to || null, responsable });
    }

    const username = String(lead_id);
    if (await identityExists(sb, [username, email])) {
      await logEvent(body, {}, 'rejected', 'identity_collision');
      log.warn('rejected', { entity_type: 'lead', entity_id: lead_id, error_code: 'identity_collision' });
      return json({ error: 'identity_collision' }, { statusCode: 409 });
    }
    const bootstrapPassword = String(process.env.NOTION_BOOTSTRAP_PASSWORD || '');
    if (!bootstrapPassword) {
      await logEvent(body, {}, 'rejected', 'missing_NOTION_BOOTSTRAP_PASSWORD');
      log.warn('degraded', { error_code: 'missing_bootstrap_password_configuration' });
      return json({ error: 'missing_bootstrap_password_configuration' }, { statusCode: 500 });
    }
    if (!passwordPolicy(bootstrapPassword).ok) {
      await logEvent(body, {}, 'rejected', 'weak_NOTION_BOOTSTRAP_PASSWORD');
      log.warn('degraded', { error_code: 'weak_bootstrap_password_configuration' });
      return json({ error: 'weak_bootstrap_password_configuration' }, { statusCode: 500 });
    }
    const password_hash = hashPassword(bootstrapPassword);

    const newUser = {
      lead_id: username,
      notion_page_id: notion_page_id || null,
      username,
      email: email || null,
      password_hash,
      requires_onboarding: true,
      dni_completed: false,
      profile_completed: false,
      nombre: name || null,
      assigned_to: assignedEmail || null,
      tipo: normalizedTipo,
    };
    // Si Notion marca el 1er pago como pagado (transferencia), se crea con la
    // primera cuota saldada: el cliente no tendrá que pagarla en el portal.
    if (primer_pago_pagado) {
      const nowIso = new Date().toISOString();
      newUser.pago_completed = true;
      newUser.pago_completed_at = nowIso;
      newUser.pago_data = { method: 'transferencia', source: 'notion', at: nowIso };
    }

    const { data: inserted, error } = await sb
      .from('users')
      .insert(newUser)
      .select()
      .single();
    if (error) throw error;

    // Cliente nuevo -> crear su carpeta en Google Drive (best-effort, con log).
    await ensureDriveFolder(sb, inserted.id, log);

    // Alta desde Notion o desde el nuevo CRM: enviar credenciales una sola vez.
    const accessEmail = await sendAccountAccessEmail({
      email,
      name,
      username,
      password: bootstrapPassword,
    });

    await logEvent(
      body, { user_id: inserted.id, status: normalized }, 'created',
      'notion_user_created'
    );
    log.success({ entity_type: 'user', entity_id: inserted.id });
    return json({
      ok: true,
      result: 'created',
      user_id: inserted.id,
      username,
      assigned_to: assignedEmail || null,
      responsable: responsable || null,
      login_url: '/portal/',
      email_sent: !!accessEmail.sent,
      email_reason: accessEmail.sent ? null : accessEmail.reason || 'not_sent',
    });
  } catch (e) {
    log.failure(e, { entity_type: 'lead', entity_id: lead_id });
    await logEvent(body, {}, 'error', errorCode(e));
    return serverError(e);
  }
};
