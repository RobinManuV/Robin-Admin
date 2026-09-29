const { getSupabase } = require('./supabase');
const { readSessionFromEvent } = require('./auth');
const { isApplicationAdmin } = require('./authorization');

async function readSubscriptionsAdmin(event) {
  const session = readSessionFromEvent(event);
  if (!session) return null;
  const sb = getSupabase();
  const { data, error } = await sb.from('users').select('id,email,username,role,nombre,apellidos').eq('id', session.uid).single();
  if (error || !data || !isApplicationAdmin(data)) return null;
  return { ...session, email: data.email, username: data.username || session.username, nombre: data.nombre, apellidos: data.apellidos };
}

module.exports = { readSubscriptionsAdmin };
