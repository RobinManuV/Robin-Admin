/**
 * /api/admin/career-suggestions
 *
 *  GET  ?user_id=<uuid>      -> devuelve el cuestionario + las 10 carreras
 *                              sugeridas por IA del cliente. Si aun no hay
 *                              sugerencias pero si cuestionario, las genera
 *                              en el momento (lazy generation) y las guarda.
 *  POST { user_id, action:'regenerate' } -> fuerza una nueva generacion.
 *  POST { user_id, action:'feedback', program_code, decision } -> guarda
 *       la aprobacion o descarte del asesor para ese alumno.
 *
 * La generacion: pre-selecciona candidatos por area de interes
 * (lib/careers-recommender) y pide a la IA las 10 carreras de maxima
 * compatibilidad. Si la IA falla, usa el ranking determinista de respaldo.
 * El resultado se guarda en users.career_suggestions (jsonb).
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { generateSuggestions } = require('../../lib/career-suggestions');

async function requireAdmin(sb, session) {
  const { data: admin } = await sb
    .from('users')
    .select('id, email, username, role')
    .eq('id', session.uid)
    .single();
  if (!admin) return null;
  const email = normalizeEmail(admin);
  const isAdmin = isApplicationAdmin(admin);
  return isAdmin ? admin : null;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') return methodNotAllowed(['GET', 'POST']);
  if (method === 'POST' && !verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });

  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  try {
    const sb = getSupabase();
    const admin = await requireAdmin(sb, session);
    if (!admin) return json({ error: 'forbidden' }, { statusCode: 403 });

    let userId = null;
    let force = false;
    let feedbackInput = null;
    if (method === 'GET') {
      userId = (event.queryStringParameters || {}).user_id || null;
    } else {
      const body = parseJsonBody(event) || {};
      userId = body.user_id || null;
      force = body.action === 'regenerate';
      if (body.action === 'feedback') feedbackInput = { programCode: body.program_code, decision: body.decision };
    }
    if (!userId) return json({ error: 'missing_user_id' }, { statusCode: 400 });

    const { data: user, error: e1 } = await sb
      .from('users')
      .select('id, nombre, apellidos, intereses, origin, application_level, questionnaire, questionnaire_completed_at, career_suggestions, career_suggestions_at')
      .eq('id', userId)
      .single();
    if (e1 || !user) return json({ error: 'client_not_found' }, { statusCode: 404 });

    if (feedbackInput) {
      if (!feedbackInput.programCode || !['approved', 'rejected'].includes(feedbackInput.decision)) {
        return json({ error: 'invalid_feedback' }, { statusCode: 400 });
      }
      const { findCareer } = require('../../lib/careers-recommender');
      if (!findCareer(feedbackInput.programCode)) return json({ error: 'career_not_found' }, { statusCode: 404 });
      const now = new Date().toISOString();
      const { error: feedbackError } = await sb
        .from('career_recommendation_feedback')
        .upsert({
          user_id: userId,
          program_code: feedbackInput.programCode,
          decision: feedbackInput.decision,
          decided_by: admin.id,
          decided_by_email: normalizeEmail(admin),
          updated_at: now,
        }, { onConflict: 'user_id,program_code' });
      if (feedbackError) throw feedbackError;
    }

    const { data: feedback, error: feedbackLoadError } = await sb
      .from('career_recommendation_feedback')
      .select('program_code, decision, decided_by_email, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (feedbackLoadError) throw feedbackLoadError;

    const hasQuestionnaire =
      !!user.questionnaire &&
      Array.isArray(user.questionnaire.blocks) &&
      user.questionnaire.blocks.length > 0;

    // Clientes internacionales ('otros'): la recomendación por IA está desactivada.
    if (String(user.origin || '').toLowerCase() === 'otros') {
      return json({
        ok: true,
        ai_disabled: true,
        has_questionnaire: hasQuestionnaire,
        questionnaire: hasQuestionnaire ? user.questionnaire : null,
        questionnaire_completed_at: user.questionnaire_completed_at || null,
        suggestions: null,
        feedback: feedback || [],
      });
    }

    if (!hasQuestionnaire) {
      return json({
        ok: true,
        has_questionnaire: false,
        questionnaire: null,
        questionnaire_completed_at: user.questionnaire_completed_at || null,
        suggestions: null,
        feedback: feedback || [],
      });
    }

    let suggestions = user.career_suggestions || null;

    // Generacion perezosa: si no hay sugerencias o se fuerza, generar ahora.
    if (force || !suggestions || !Array.isArray(suggestions.items) || !suggestions.items.length) {
      suggestions = await generateSuggestions(user, feedback || []);
      const { error: e2 } = await sb
        .from('users')
        .update({
          career_suggestions: suggestions,
          career_suggestions_at: suggestions.generated_at,
        })
        .eq('id', userId);
      if (e2) console.error('career-suggestions save error', e2.message);
    }

    return json({
      ok: true,
      has_questionnaire: true,
      questionnaire: user.questionnaire,
      questionnaire_completed_at: user.questionnaire_completed_at || null,
      suggestions: suggestions,
      feedback: feedback || [],
    });
  } catch (e) {
    console.error('admin-career-suggestions error', e);
    return serverError(e);
  }
};
