const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSubscriptionsSupabase() {
  if (client) return client;
  const url = process.env.ROBIN_PLAN_SUPABASE_URL;
  const key = process.env.ROBIN_PLAN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('ROBIN_PLAN_SUPABASE_URL o ROBIN_PLAN_SUPABASE_SERVICE_ROLE_KEY no configuradas');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

module.exports = { getSubscriptionsSupabase };
