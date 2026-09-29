/**
 * chat-cleanup  ·  Función PROGRAMADA (Netlify schedule) + trigger manual.
 *
 * Borra de la base de datos (Supabase) los mensajes del chat con IA con más de
 * 7 días de antigüedad. Es un borrado ROLLING: cada día desaparece lo que ya
 * cumple una semana, de modo que el asesor siempre conserva ~7 días de historial
 * y no acumulamos datos indefinidamente.
 *
 * Programada en netlify.toml ([functions."chat-cleanup"].schedule, diaria).
 * También se puede invocar a mano (GET/POST) para forzar una limpieza.
 */
const { getSupabase } = require('../../lib/supabase');
const { json } = require('../../lib/http');

const WINDOW_DAYS = 7;

exports.handler = async () => {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  try {
    const sb = getSupabase();

    // 1) Borra los mensajes con más de 7 días y cuenta cuántos.
    const { data: deleted, error } = await sb
      .from('ai_chat_messages')
      .delete()
      .lt('created_at', cutoff)
      .select('id');
    if (error) throw error;
    const removed = (deleted || []).length;

    // 2) Limpia estados de pausa antiguos (>7 días sin cambios): evita dejar la IA
    //    en pausa para siempre si un asesor intervino y no la reactivó. No es crítico,
    //    así que su fallo no aborta la limpieza principal.
    try {
      await sb.from('ai_chat_state').delete().lt('updated_at', cutoff);
    } catch (e2) {
      console.error('chat-cleanup state warn', e2 && (e2.message || e2));
    }

    console.log(`chat-cleanup: ${removed} mensajes borrados (anteriores a ${cutoff}).`);
    return json({ ok: true, removed });
  } catch (e) {
    console.error('chat-cleanup error', e && (e.message || e));
    return json({ ok: false, error: 'cleanup_failed' }, { statusCode: 500 });
  }
};
