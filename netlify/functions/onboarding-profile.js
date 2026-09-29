const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { email: normalizeEmail } = require('../../lib/validation');

const VALID_INTERESTS = [
  'ciencias',
  'tecnologia_y_programacion',
  'business',
  'ciencias_de_la_salud',
  'ingenierias',
  'ciencias_sociales',
  'artes',
];

/**
 * Saneamiento defensivo del cuestionario de onboarding.
 * Estructura esperada (la construye el frontend):
 *   { version, blocks: [{ title, items:[{q,a}] }], signals: {...} }
 * Devuelve null si no es valido.
 */
function sanitizeQuestionnaire(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
  if (!Array.isArray(q.blocks) || q.blocks.length === 0) return null;
  const blocks = q.blocks
    .filter((b) => b && typeof b === 'object' && Array.isArray(b.items))
    .map((b) => ({
      title: String(b.title || '').slice(0, 200),
      items: b.items
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          q: String(it.q || '').slice(0, 400),
          a: Array.isArray(it.a)
            ? it.a.map((x) => String(x).slice(0, 300)).slice(0, 40)
            : (typeof it.a === 'number' ? it.a : String(it.a == null ? '' : it.a).slice(0, 4000)),
        })),
    }));
  if (!blocks.length) return null;
  const signals =
    q.signals && typeof q.signals === 'object' && !Array.isArray(q.signals)
      ? q.signals
      : {};
  return {
    version: Number(q.version) || 1,
    blocks,
    signals,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const { intereses, questionnaire } = body;
  const email = normalizeEmail(body.email);
  if (!email) {
    return json({ error: 'invalid_email' }, { statusCode: 400 });
  }
  if (!Array.isArray(intereses) || intereses.length === 0) {
    return json({ error: 'missing_intereses' }, { statusCode: 400 });
  }
  const cleaned = intereses
    .map((i) => String(i).trim().toLowerCase())
    .filter((i) => VALID_INTERESTS.includes(i));
  if (cleaned.length === 0) {
    return json({ error: 'invalid_intereses' }, { statusCode: 400 });
  }

  // El cuestionario es obligatorio para completar el perfil.
  const cleanQuestionnaire = sanitizeQuestionnaire(questionnaire);
  if (!cleanQuestionnaire) {
    return json({ error: 'missing_questionnaire' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();

    // Email o username duplicado por otro usuario?
    const { data: dups } = await sb
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${email}`)
      .neq('id', session.uid);
    if (dups && dups.length) return json({ error: 'email_in_use' }, { statusCode: 409 });

    // El email pasa a ser el username
    const update = {
      email,
      intereses: cleaned,
      username: email,
      profile_completed: true,
      questionnaire: cleanQuestionnaire,
      questionnaire_completed_at: new Date().toISOString(),
      // se invalidan sugerencias previas: se regeneran cuando el admin abra el perfil
      career_suggestions: null,
      career_suggestions_at: null,
    };

    const { error } = await sb.from('users').update(update).eq('id', session.uid);
    // Violación de unicidad (email/username ya en uso) -> 409 legible
    if (error && /users_username_key|users_email_key|duplicate key|unique constraint/i.test(error.message || '')) {
      return json({ error: 'email_in_use' }, { statusCode: 409 });
    }
    if (error) throw error;

    // Si el pago ya está saldado (p.ej. 1er pago por transferencia marcado desde
    // Notion), el perfil es el último paso pendiente: cerramos el onboarding.
    try {
      const { data: u2 } = await sb
        .from('users')
        .select('pago_completed, requires_onboarding')
        .eq('id', session.uid)
        .single();
      if (u2 && u2.pago_completed && u2.requires_onboarding) {
        await sb.from('users').update({ requires_onboarding: false }).eq('id', session.uid);
      }
    } catch (_) { /* best-effort: no bloquea el guardado del perfil */ }

    return json({ ok: true });
  } catch (e) {
    console.error('profile error', e);
    return serverError(e);
  }
};
