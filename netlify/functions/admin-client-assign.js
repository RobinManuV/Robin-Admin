/**
 * POST /api/admin/clients/assign  body: { user_id: string }
 * Asigna ese cliente al admin de la sesión (assigned_to = email_admin).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const userId = body.user_id;
  if (!userId) return json({ error: 'missing_user_id' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin, error: e1 } = await sb
      .from('users')
      .select('id, email, username, role')
      .eq('id', session.uid)
      .single();
    if (e1 || !admin) return json({ error: 'unauthorized' }, { statusCode: 401 });

    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // No permitir asignar a un admin a sí mismo
    const { data: target, error: e2 } = await sb
      .from('users')
      .select('id, role, email, username')
      .eq('id', userId)
      .single();
    if (e2 || !target) return json({ error: 'not_found' }, { statusCode: 404 });

    const targetIsAdmin = isApplicationAdmin(target);
    if (targetIsAdmin) return json({ error: 'cannot_assign_admin' }, { statusCode: 400 });

    const { error: e3 } = await sb
      .from('users')
      .update({ assigned_to: adminEmail })
      .eq('id', userId);
    if (e3) throw e3;

    // Reflejar el cliente en la hoja de control de pagos (best-effort, no bloquea).
    await require('../../lib/integration-sync').syncGoogleSheets(sb, userId);
    return json({ ok: true, user_id: userId, assigned_to: adminEmail });
  } catch (e) {
    console.error('admin-client-assign error', e);
    return serverError(e);
  }
};
