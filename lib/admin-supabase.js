const { createClient } = require('@supabase/supabase-js');

let client = null;

function getAdminSupabase() {
  if (client) return client;
  const url = process.env.ADMIN_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('ADMIN_SUPABASE_URL o ADMIN_SUPABASE_SERVICE_ROLE_KEY no estan configuradas');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

module.exports = { getAdminSupabase };
