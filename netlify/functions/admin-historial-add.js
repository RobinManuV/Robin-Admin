/**
 * POST /api/admin/historial/add
 * Body: { user_id, raw_notes, meeting_date?, meeting_title? }
 *
 * Recibe notas en bruto de una reunión desde cualquier proveedor o notetaker.
 * Llama a Claude para:
 *   1) Resumir las notas en temas/decisiones/acciones.
 *   2) Compilar con el historial previo en un texto coherente y actualizado.
 *   3) Guardar el resultado en users.historial.
 *
 * Devuelve el historial actualizado.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const {
  hasApplicationAdminRole,
  isApplicationAdmin,
  normalizeEmail,
} = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { chatCompletion } = require('../../lib/anthropic-chat');

async function summarizeAndCompile({ priorHistorial, rawNotes, meeting }) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `Eres asistente de Project Robin. Tu trabajo es procesar notas de reuniones o transcripciones entre un asesor y un estudiante candidato a universidad en Holanda.

DEBES devolver un único TEXTO en español con esta estructura (sin código markdown extra, sin JSON):

HISTORIAL DE REUNIONES — actualizado ${today}

[Para cada reunión cronológica más reciente arriba]
## YYYY-MM-DD · Título / contexto
- Temas tratados: ...
- Decisiones: ...
- Acciones a seguir: ...
- Estado emocional / motivación: ...
- Datos nuevos relevantes (carreras, ciudades, dudas, fechas): ...

REGLAS:
- Conserva TODO el historial previo, no elimines reuniones pasadas.
- Si los datos previos están en otro formato, normalízalos a esta estructura.
- Añade la nueva reunión al inicio (más reciente arriba).
- Si una decisión nueva contradice una previa, anótalo explícitamente.
- Sé conciso pero no pierdas matices clínicos/de orientación.
- Si no hay historial previo, escribe solo la reunión nueva con esa estructura.`;

  const user = `HISTORIAL PREVIO:
${priorHistorial ? priorHistorial : '(vacío — primera reunión)'}

NUEVA REUNIÓN:
Fecha: ${meeting.meeting_date || new Date().toISOString().slice(0, 10)}
Título: ${meeting.meeting_title || 'Reunión'}

NOTAS EN BRUTO:
"""
${rawNotes}
"""

Devuelve el HISTORIAL COMPLETO ACTUALIZADO con la estructura indicada.`;

  const { text } = await chatCompletion({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 3000,
  });
  return text;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event) || {};
  const userId = body.user_id;
  const rawNotes = (body.raw_notes || '').trim();
  if (!userId) return json({ error: 'missing_user_id' }, { statusCode: 400 });
  if (!rawNotes) return json({ error: 'missing_raw_notes' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    const { data: u, error: eu } = await sb
      .from('users')
      .select('id, assigned_to, historial')
      .eq('id', userId)
      .single();
    if (eu || !u) return json({ error: 'user_not_found' }, { statusCode: 404 });

    // Seguridad: solo el advisor asignado o un admin/supervisor puede tocar el historial.
    if ((u.assigned_to || '').toLowerCase() !== adminEmail && !hasApplicationAdminRole(admin)) {
      return json({ error: 'forbidden_not_assigned' }, { statusCode: 403 });
    }

    const updated = await summarizeAndCompile({
      priorHistorial: u.historial || '',
      rawNotes,
      meeting: { meeting_date: body.meeting_date, meeting_title: body.meeting_title },
    });

    const patch = { historial: updated, historial_updated_at: new Date().toISOString() };
    const { error: ep } = await sb.from('users').update(patch).eq('id', userId);
    if (ep) throw ep;

    return json({ ok: true, historial: updated });
  } catch (e) {
    console.error('admin-historial-add error', e);
    return serverError(e);
  }
};
