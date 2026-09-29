/**
 * GET /api/sub-admin/data · Panel de administración de The Robin Plan.
 * Devuelve TODO lo que el panel necesita en una sola llamada:
 *   - users:     suscriptores + agregados (solicitudes, rsvps, suscripción, ciudad)
 *   - events:    community_events completos (eventos, grupos, ofertas, viajes)
 *   - partners:  directorio de partners
 *   - requests:  solicitudes de servicio recientes (con nombre del usuario)
 * Gate: sólo sesión con role='subscriber_admin'.
 */
const { getSubscriptionsSupabase } = require('../../lib/subscriptions-supabase');
const { readSubscriptionsAdmin } = require('../../lib/subscriptions-admin-auth');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = await readSubscriptionsAdmin(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSubscriptionsSupabase();

    const [uRes, eRes, pRes, rRes, rsvpRes, dcRes] = await Promise.all([
      sb.from('subscribers')
        .select('id, role, lead_id, nombre, apellidos, email, username, ciudad, subscription_status, subscription_plan, current_period_end, created_at, subscription_started_at, robin_level_override')
        .or('is_subscriber.eq.true,role.eq.subscriber')
        .order('created_at', { ascending: false }),
      sb.from('community_events').select('*').order('sort_order', { ascending: true }).order('starts_at', { ascending: true }),
      sb.from('partners').select('*').order('sort_order', { ascending: true }),
      sb.from('service_requests').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('event_rsvps').select('user_id, event_id, status'),
      sb.from('discount_codes').select('*').order('created_at', { ascending: false }),
    ]);

    for (const r of [uRes, eRes, pRes, rRes, rsvpRes]) { if (r.error) throw r.error; }
    const discount_codes = dcRes.error ? [] : (dcRes.data || []);

    const users = (uRes.data || []).filter((u) => u.role !== 'subscriber_admin'); // los admin no aparecen como usuarios
    const requests = rRes.data || [];
    const rsvps = rsvpRes.data || [];

    // Agregados por usuario
    const reqByUser = {};
    const openByUser = {};
    requests.forEach((r) => {
      reqByUser[r.user_id] = (reqByUser[r.user_id] || 0) + 1;
      if (r.status === 'open' || r.status === 'in_progress') openByUser[r.user_id] = (openByUser[r.user_id] || 0) + 1;
    });
    const rsvpByUser = {};
    rsvps.forEach((r) => { if (r.status !== 'cancelled') rsvpByUser[r.user_id] = (rsvpByUser[r.user_id] || 0) + 1; });

    const nameById = {};
    const usersOut = users.map((u) => {
      const name = `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || u.username;
      nameById[u.id] = name;
      return {
        ...u,
        name,
        requests_total: reqByUser[u.id] || 0,
        requests_open: openByUser[u.id] || 0,
        rsvps_count: rsvpByUser[u.id] || 0,
      };
    });

    const requestsOut = requests.map((r) => ({ ...r, user_name: nameById[r.user_id] || null }));

    // --- Notificaciones enviadas por este panel (created_by = admin) ---
    let notificationsOut = [];
    try {
      const adminKey = session.username || '';
      const { data: notifs } = await sb.from('notifications')
        .select('id, title, content, type, created_by, created_at')
        .eq('created_by', adminKey)
        .order('created_at', { ascending: false }).limit(100);
      const nIds = (notifs || []).map((n) => n.id);
      let recs = [];
      if (nIds.length) {
        const { data: rr } = await sb.from('notification_recipients')
          .select('notification_id, user_id, status, seen_at').in('notification_id', nIds);
        recs = rr || [];
      }
      notificationsOut = (notifs || []).map((n) => {
        const rs = recs.filter((r) => r.notification_id === n.id);
        const total = rs.length;
        const seen = rs.filter((r) => r.status === 'seen' || r.status === 'accepted').length;
        return { ...n, total, seen };
      });
    } catch (_) { notificationsOut = []; }

    // --- Retos + entregas ---
    let challengesOut = [], submissionsOut = [];
    try {
      const { data: chs } = await sb.from('challenges').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      challengesOut = chs || [];
      const { data: subms } = await sb.from('challenge_submissions').select('*').order('created_at', { ascending: false }).limit(500);
      const chTitle = {}; challengesOut.forEach((c) => { chTitle[c.id] = c.title; });
      submissionsOut = (subms || []).map((sm) => ({ ...sm, challenge_title: chTitle[sm.challenge_id] || '—', user_name: nameById[sm.user_id] || null }));
    } catch (_) { challengesOut = []; submissionsOut = []; }

    return json({
      users: usersOut,
      events: eRes.data || [],
      partners: pRes.data || [],
      requests: requestsOut,
      discount_codes,
      notifications: notificationsOut,
      challenges: challengesOut,
      submissions: submissionsOut,
      counts: { users: usersOut.length, events: (eRes.data || []).length, partners: (pRes.data || []).length, requests: requests.length },
    });
  } catch (e) {
    console.error('sub-admin-data error', e);
    return serverError(e);
  }
};
