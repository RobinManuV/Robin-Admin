/**
 * web-retention · Función PROGRAMADA (diaria). Borra la medición de la web con más de
 * 14 meses (función SQL web_events_purge). Programada en netlify.toml.
 */
const { getAdminSupabase } = require('../../lib/admin-supabase');
const { json } = require('../../lib/http');

exports.handler = async () => {
  try {
    const { data, error } = await getAdminSupabase().rpc('web_events_purge');
    if (error) throw error;
    console.log(JSON.stringify({ level: 'info', operation: 'web.retention', result: 'ok', removed: data }));
    return json({ ok: true, removed: data });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', operation: 'web.retention', result: 'error', message: String(error?.message || error).slice(0, 200) }));
    return json({ ok: false }, { statusCode: 500 });
  }
};
