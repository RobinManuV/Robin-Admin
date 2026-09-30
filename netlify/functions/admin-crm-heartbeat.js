const { getSupabase } = require('../../lib/supabase');
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { syncCrmIdentity } = require('../../lib/crm-identity');
const { json, methodNotAllowed, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'forbidden_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const portal = getSupabase();
    const { data: admin, error: adminError } = await portal.from('users')
      .select('id,email,username,nombre,apellidos,role').eq('id', session.uid).single();
    if (adminError) throw adminError;
    if (!admin || !isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });

    const crm = getAdminSupabase();
    const identity = await syncCrmIdentity(crm, admin);
    if (!identity.available) return json({ ok: true, available: false });

    const now = new Date();
    const cutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: latest, error: latestError } = await crm.from('crm_user_sessions')
      .select('id,last_seen_at').eq('user_id', admin.id).order('last_seen_at', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;

    if (latest?.last_seen_at && latest.last_seen_at >= cutoff) {
      const { error } = await crm.from('crm_user_sessions').update({ last_seen_at: now.toISOString() }).eq('id', latest.id);
      if (error) throw error;
      return json({ ok: true, available: true, sessionId: latest.id, continued: true });
    }

    const { data: created, error } = await crm.from('crm_user_sessions')
      .insert({ user_id: admin.id, started_at: now.toISOString(), last_seen_at: now.toISOString() }).select('id').single();
    if (error) throw error;
    return json({ ok: true, available: true, sessionId: created.id, continued: false });
  } catch (error) {
    console.error('admin-crm-heartbeat error', error);
    return serverError(error, 'admin.crm_heartbeat');
  }
};
