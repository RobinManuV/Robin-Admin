/**
 * GET /api/notifications
 * Devuelve las notificaciones PENDIENTES del cliente autenticado (para el pop-up).
 * Sólo status='pending' → una vez vista/aceptada no vuelve a salir.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: recs, error } = await sb
      .from('notification_recipients')
      .select('notification_id, status')
      .eq('user_id', session.uid)
      .eq('status', 'pending');
    if (error) {
      // Tabla aún no creada → sin notificaciones
      return json({ notifications: [] });
    }
    const ids = (recs || []).map((r) => r.notification_id);
    if (!ids.length) return json({ notifications: [] });

    const { data: notifs, error: e2 } = await sb
      .from('notifications')
      .select('id, title, content, type, created_at')
      .in('id', ids)
      .order('created_at', { ascending: true });
    if (e2) return json({ notifications: [] });

    return json({ notifications: notifs || [] });
  } catch (e) {
    console.error('notifications-list error', e);
    return serverError(e);
  }
};
