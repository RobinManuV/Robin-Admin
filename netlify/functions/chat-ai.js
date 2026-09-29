/**
 * /api/chat  ·  Chat del ALUMNO con la IA (portal de aplicación).
 *
 *   GET   -> { messages[], ai_paused }   (mensajes de los últimos 7 días)
 *   POST { content } -> guarda el mensaje del alumno y, si la IA no está en
 *                       pausa, genera la respuesta de la IA y la guarda.
 *                       Devuelve { messages[], ai_paused, replied }.
 *
 * La IA responde con base en el FAQ (lib/faq-knowledge.js) + datos del propio
 * alumno (fase, carreras, cuestionario, documentos — NUNCA datos de pago).
 * Si un asesor ha intervenido (ai_chat_state.ai_paused = true), la IA calla y
 * el mensaje queda guardado para que lo atienda la persona.
 *
 * Nota: el borrado semanal (rolling >7 días) lo hace chat-cleanup.js.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { chatCompletion } = require('../../lib/anthropic-chat');
const { formatFaqKnowledge, toPublicMessages } = require('../../lib/faq-citations');

const WINDOW_DAYS = 7;
const HISTORY_MAX = 24;      // nº máx. de mensajes previos que se pasan a la IA
const MAX_LEN = 4000;        // longitud máx. de un mensaje del alumno

const PHASE_LABELS = {
  1: 'Presentación de carreras', 2: 'Elección de carreras', 3: 'Upload de documentos',
  4: 'Esperando resultados', 5: 'Selección del destino', 6: 'Buscando alojamiento',
  7: 'Entrega de EBAU + pago de matrícula', 8: 'Trámites finales', 9: 'Llegada al destino',
};

function cutoffISO() {
  return new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
}

/** Texto compacto con el contexto del alumno para personalizar (sin datos de pago). */
async function buildStudentContext(sb, user) {
  const lines = [];
  const name = `${user.nombre || ''} ${user.apellidos || ''}`.trim();
  lines.push(`Nombre del alumno: ${name || '(desconocido)'}`);
  if (user.origin) lines.push(`Origen: ${user.origin}`);
  if (user.application_level) lines.push(`Nivel de aplicación: ${user.application_level}`);
  const ph = user.application_phase;
  if (ph) lines.push(`Fase actual del proceso: ${ph} · ${PHASE_LABELS[ph] || ''}`);

  const intereses = Array.isArray(user.intereses) ? user.intereses : [];
  if (intereses.length) lines.push(`Áreas de interés: ${intereses.join(', ')}`);

  // Cuestionario (signals + preguntas de texto libre relevantes)
  const q = user.questionnaire || {};
  const sig = q.signals || {};
  const sigParts = [];
  if (sig.nota_media != null) sigParts.push(`nota media ${sig.nota_media}`);
  if (sig.nivel_ingles) sigParts.push(`inglés ${sig.nivel_ingles}`);
  if (Array.isArray(sig.asignaturas_fav) && sig.asignaturas_fav.length) sigParts.push(`favoritas: ${sig.asignaturas_fav.join(', ')}`);
  if (Array.isArray(sig.asignaturas_menos) && sig.asignaturas_menos.length) sigParts.push(`menos: ${sig.asignaturas_menos.join(', ')}`);
  if (Array.isArray(sig.rasgos) && sig.rasgos.length) sigParts.push(`rasgos: ${sig.rasgos.join(', ')}`);
  if (Array.isArray(sig.valora) && sig.valora.length) sigParts.push(`valora: ${sig.valora.join(', ')}`);
  if (sigParts.length) lines.push(`Perfil del cuestionario: ${sigParts.join('; ')}`);

  // Carreras sugeridas por la IA (top 5)
  const cs = user.career_suggestions;
  if (cs && Array.isArray(cs.items) && cs.items.length) {
    const top = cs.items.slice(0, 5).map((it) => `${it.career_name} (${it.university}${it.compatibility != null ? `, ${it.compatibility}%` : ''})`);
    lines.push(`Carreras sugeridas: ${top.join(' · ')}`);
  }

  // Estado de documentos (conteos + pendientes)
  try {
    const { data: docs } = await sb
      .from('documents')
      .select('name, required, status')
      .eq('user_id', user.id);
    if (Array.isArray(docs) && docs.length) {
      const pend = docs.filter((d) => d.status === 'required').map((d) => d.name);
      const review = docs.filter((d) => d.status === 'pending_review').length;
      const ok = docs.filter((d) => d.status === 'validated').length;
      lines.push(`Documentos: ${ok} validados, ${review} en revisión, ${pend.length} pendientes${pend.length ? ` (${pend.slice(0, 6).join(', ')})` : ''}`);
    }
  } catch (_) { /* documentos son opcionales para el contexto */ }

  return lines.join('\n');
}

function systemPrompt(studentContext) {
  return (
    'Eres el asistente virtual de Project Robin, una consultora que ayuda a estudiantes ' +
    'españoles a estudiar un grado universitario en el extranjero (principalmente Países Bajos). ' +
    'Hablas con un ALUMNO cliente dentro de su portal. Tu trabajo es resolver sus dudas de forma ' +
    'cercana, clara y honesta.\n\n' +
    'REGLAS:\n' +
    '- Responde SIEMPRE en español, con tono amable y cercano (tuteo).\n' +
    '- Basa tus respuestas en la sección PREGUNTAS FRECUENTES de abajo. Es tu fuente principal.\n' +
    '- Cuando uses información de una FAQ, debes citarla al final de la frase o del párrafo con su ' +
    'identificador exacto, por ejemplo [[FAQ:12]]. Usa como máximo tres citas relevantes. No inventes ' +
    'identificadores ni cites una FAQ que no respalde realmente lo que afirmas.\n' +
    '- Puedes personalizar usando los DATOS DEL ALUMNO (su fase, carreras, cuestionario, documentos).\n' +
    '- Si la pregunta trata de su caso concreto (su expediente, plazos personales, decisiones sobre ' +
    'su candidatura, pagos o algo que no puedes saber), dile con naturalidad que lo verá mejor con ' +
    'su asesor/a de Robin y que puede escribirlo aquí mismo: un asesor lee estas conversaciones.\n' +
    '- No inventes datos, precios, fechas ni plazos que no aparezcan en el FAQ o en los datos del alumno. ' +
    'Si no lo sabes, admítelo y deriva al asesor.\n' +
    '- Nunca compartas ni comentes información de pagos o facturación.\n' +
    '- Sé conciso: respuestas breves y útiles, sin relleno.\n\n' +
    '=== DATOS DEL ALUMNO ===\n' + (studentContext || '(sin datos)') + '\n\n' +
    '=== PREGUNTAS FRECUENTES (base de conocimiento) ===\n' + formatFaqKnowledge()
  );
}

/** Normaliza filas de BD a mensajes para la API (roles alternos, sin vacíos). */
function toApiMessages(rows) {
  const mapped = rows.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    const prefix = m.role === 'advisor' ? '(Mensaje de tu asesor humano) ' : '';
    return { role: 'assistant', content: prefix + m.content };
  });
  // Fusiona mensajes consecutivos del mismo rol (la API exige alternancia).
  const merged = [];
  for (const msg of mapped) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) last.content += '\n\n' + msg.content;
    else merged.push({ ...msg });
  }
  // La conversación debe empezar por 'user'.
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  if (method === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });

  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const uid = session.uid;

  try {
    const sb = getSupabase();

    // Estado (pausa IA) del alumno
    const { data: state } = await sb
      .from('ai_chat_state')
      .select('ai_paused')
      .eq('user_id', uid)
      .maybeSingle();
    const aiPaused = !!(state && state.ai_paused);

    async function loadMessages() {
      const { data } = await sb
        .from('ai_chat_messages')
        .select('id, role, content, author_admin_id, created_at')
        .eq('user_id', uid)
        .gte('created_at', cutoffISO())
        .order('created_at', { ascending: true });
      return data || [];
    }

    if (method === 'GET') {
      const messages = await loadMessages();
      return json({ ok: true, messages: toPublicMessages(messages), ai_paused: aiPaused });
    }

    // POST
    const body = parseJsonBody(event) || {};
    const content = String(body.content || '').trim().slice(0, MAX_LEN);
    if (!content) return json({ error: 'empty_message' }, { statusCode: 400 });

    // 1) Guarda el mensaje del alumno
    const { error: eIns } = await sb
      .from('ai_chat_messages')
      .insert({ user_id: uid, role: 'user', content });
    if (eIns) throw eIns;

    // 2) Si la IA está en pausa (asesor al mando), no responde la IA.
    if (aiPaused) {
      const messages = await loadMessages();
      return json({ ok: true, messages: toPublicMessages(messages), ai_paused: true, replied: false });
    }

    // 3) Genera respuesta de la IA
    let replied = false;
    try {
      const { data: user } = await sb
        .from('users')
        .select('id, nombre, apellidos, origin, application_level, application_phase, intereses, questionnaire, career_suggestions')
        .eq('id', uid)
        .single();

      const ctx = user ? await buildStudentContext(sb, user) : '';
      const history = await loadMessages();
      const apiMessages = toApiMessages(history.slice(-HISTORY_MAX));
      if (apiMessages.length) {
        const { text } = await chatCompletion({
          system: systemPrompt(ctx),
          messages: apiMessages,
          maxTokens: 700,
        });
        const reply = (text || '').trim();
        if (reply) {
          await sb.from('ai_chat_messages').insert({ user_id: uid, role: 'assistant', content: reply });
          replied = true;
        }
      }
    } catch (e) {
      console.error('chat-ai IA error', e.message);
      // No rompemos: el mensaje del alumno ya está guardado; devolvemos sin respuesta.
    }

    const messages = await loadMessages();
    return json({ ok: true, messages: toPublicMessages(messages), ai_paused: false, replied });
  } catch (e) {
    return serverError(e, 'chat-ai');
  }
};
