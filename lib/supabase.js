/**
 * Cliente Supabase usado por las Netlify Functions (server-side).
 * Usa la SERVICE ROLE KEY para bypassar RLS — esta key SOLO debe vivir
 * en variables de entorno del servidor, nunca en el frontend.
 */
const { createClient } = require('@supabase/supabase-js');

let _client = null;
function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no estan configuradas');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

const BUCKET = process.env.SUPABASE_BUCKET || 'dni-uploads';

module.exports = { getSupabase, BUCKET };
