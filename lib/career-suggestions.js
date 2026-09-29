const { chatCompletion } = require('./anthropic-chat');
const rec = require('./careers-recommender');

/** Extrae el primer array JSON de un texto (la IA puede envolverlo en prosa). */
function extractJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function prepareCandidates(intereses, signals, feedback, limit = 35) {
  const decisions = new Map((feedback || []).map((entry) => [entry.program_code, entry.decision]));
  const approved = (feedback || [])
    .filter((entry) => entry.decision === 'approved')
    .map((entry) => rec.findCareer(entry.program_code))
    .filter(Boolean);
  const base = rec.getCandidates(intereses, signals, limit);
  const unique = new Map();
  [...approved, ...base].forEach((career) => {
    if (!career || decisions.get(career.program_code) === 'rejected' || unique.has(career.program_code)) return;
    unique.set(career.program_code, career);
  });
  return [...unique.values()].slice(0, limit);
}

function formatAdvisorFeedback(feedback) {
  if (!Array.isArray(feedback) || !feedback.length) return '(sin decisiones previas del asesor)';
  return feedback.map((entry) => {
    const career = rec.findCareer(entry.program_code);
    const label = career ? `${career.career_name} · ${career.university}` : entry.program_code;
    return `- ${entry.decision === 'approved' ? 'APROBADA' : 'DESCARTADA'}: ${label} (${entry.program_code})`;
  }).join('\n');
}

/** Genera las 10 carreras sugeridas para un cliente. */
async function generateSuggestions(user, feedback = []) {
  const intereses = Array.isArray(user.intereses) ? user.intereses : [];
  const questionnaire = user.questionnaire || {};
  const signals = questionnaire.signals || {};

  const candidates = prepareCandidates(intereses, signals, feedback, 35);
  const fallback = rec.fallbackRanking(candidates);

  let items = null;
  let model = null;
  let aiOk = false;

  try {
    const profile = rec.formatStudentProfile(questionnaire, intereses);
    const catalog = candidates.map(rec.compactCareer);

    const system =
      'Eres un orientador academico experto en grados universitarios de ' +
      'investigacion (WO) en los Paises Bajos impartidos en ingles. Tu tarea ' +
      'es seleccionar, de un catalogo dado, las 10 carreras de MAXIMA ' +
      'compatibilidad con el perfil de un estudiante.\n\n' +
      'Reglas:\n' +
      '- Usa SOLO carreras del catalogo (campo program_code exacto).\n' +
      '- Prioriza las areas de interes que el estudiante ha elegido, pero ' +
      'valora tambien el encaje real de aptitudes, personalidad y estilo de ' +
      'aprendizaje (campos scores, ideal_for, difficulty).\n' +
      '- Usa las decisiones previas del asesor como una señal fuerte y específica ' +
      'para este estudiante. Favorece patrones similares a las aprobadas y evita ' +
      'los patrones de las descartadas. Nunca vuelvas a recomendar un program_code descartado.\n' +
      '- Devuelve EXACTAMENTE 10 carreras, ordenadas de mayor a menor ' +
      'compatibilidad.\n' +
      '- "compatibility" es un entero 0-100 realista (no todas 95+).\n' +
      '- "reason": UNA frase breve en espanol. "strengths": 2-4 palabras clave.\n' +
      '- Responde UNICAMENTE con un array JSON valido, sin texto adicional.\n' +
      'Formato de cada elemento: {"program_code":"...","compatibility":NN,' +
      '"reason":"una frase breve","strengths":"2-4 palabras clave"}';

    const userMsg =
      'PERFIL DEL ESTUDIANTE (cuestionario de onboarding):\n' +
      profile +
      '\n\n=== DECISIONES PREVIAS DEL ASESOR ===\n' +
      formatAdvisorFeedback(feedback) +
      '\n\n=== CATALOGO DE CARRERAS CANDIDATAS (' + catalog.length + ') ===\n' +
      JSON.stringify(catalog) +
      '\n\nDevuelve el array JSON con las 10 mejores.';

    const { text, raw } = await chatCompletion({
      system,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 2600,
    });
    model = (raw && raw.model) || null;

    const parsed = extractJsonArray(text);
    if (Array.isArray(parsed) && parsed.length) {
      const built = [];
      const permittedCodes = new Set(candidates.map((candidate) => candidate.program_code));
      parsed.forEach((p) => {
        if (!p || !p.program_code) return;
        if (!permittedCodes.has(p.program_code)) return;
        const c = rec.findCareer(p.program_code);
        if (!c) return;
        let comp = parseInt(p.compatibility, 10);
        if (isNaN(comp)) comp = 70;
        comp = Math.max(0, Math.min(100, comp));
        built.push({
          program_code: c.program_code,
          career_name: c.career_name,
          university: c.university,
          university_code: c.university_code,
          city: c.city,
          area: c.area,
          subarea: c.subarea,
          degree_type: c.degree_type,
          duration_years: c.duration_years,
          numerus_fixus: !!c.numerus_fixus,
          numerus_fixus_seats: c.numerus_fixus_seats || null,
          website_url: c.website_url || null,
          compatibility: comp,
          reason: String(p.reason || '').trim() ||
            'Buen encaje con el perfil del estudiante.',
          strengths: Array.isArray(p.strengths)
            ? p.strengths.join(', ')
            : String(p.strengths || '').trim(),
        });
      });
      if (built.length) {
        built.sort((a, b) => b.compatibility - a.compatibility);
        items = built.slice(0, 10);
        aiOk = true;
      }
    }
  } catch (e) {
    console.error('career-suggestions AI error', e.message);
  }

  if (!items || !items.length) items = fallback;

  return {
    generated_at: new Date().toISOString(),
    source: aiOk ? 'ai' : 'fallback',
    model: model,
    count: items.length,
    items: items,
  };
}

module.exports = { extractJsonArray, prepareCandidates, formatAdvisorFeedback, generateSuggestions };
