/**
 * GET /api/bookings
 * Lista las reservas del cliente autenticado (o las de un user_id si es admin).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const { data: u } = await sb
      .from('users')
      .select('id, email, username, role')
      .eq('id', session.uid)
      .single();
    if (!u) return json({ error: 'unauthorized' }, { statusCode: 401 });

    const isAdmin = isApplicationAdmin(u);

    const wantUserId = (event.queryStringParameters && event.queryStringParameters.user_id) || null;
    const targetUserId = isAdmin && wantUserId ? wantUserId : u.id;

    const { data, error } = await sb
      .from('bookings')
      .select('id, user_id, admin_email, topic, start_at, duration_min, meet_join_url, meet_code, calendar_event_id, status, created_at, cancelled_at')
      .eq('user_id', targetUserId)
      .order('start_at', { ascending: true });

    if (error) throw error;
    return json({ bookings: data || [] });
  } catch (e) {
    console.error('bookings-list error', e);
    return serverError(e);
  }
};
