/**
 * lib/careers-recommender.js
 * Motor de recomendacion de carreras universitarias para Project Robin.
 *
 *  - Carga la base de 229 grados WO (research university) de NL en ingles
 *    (careers-data.json, empaquetada con la funcion: cero dependencia de Supabase).
 *  - Construye un perfil legible del estudiante a partir del cuestionario.
 *  - Pre-selecciona candidatos por area de interes y aporta un ranking
 *    determinista de respaldo (fallback) si la IA no esta disponible.
 *
 * La seleccion final de las 10 carreras la realiza la IA (ver
 * netlify/functions/admin-career-suggestions.js).
 */
const CAREERS = require('./careers-data.json');

// interes (valor del onboarding) -> nombre de area en careers-data.json
const AREA_MAP = {
  ciencias: 'Sciences',
  tecnologia_y_programacion: 'Technology & Computer Science',
  business: 'Business & Economics',
  ciencias_de_la_salud: 'Health Sciences',
  ingenierias: 'Engineering',
  ciencias_sociales: 'Social Sciences',
  artes: 'Arts & Liberal Arts',
};

const INTEREST_LABELS = {
  ciencias: 'Ciencias',
  tecnologia_y_programacion: 'Tecnologia y programacion',
  business: 'Business',
  ciencias_de_la_salud: 'Ciencias de la salud',
  ingenierias: 'Ingenierias',
  ciencias_sociales: 'Ciencias sociales',
  artes: 'Artes',
};

// asignatura favorita/menos (token ASCII del frontend) -> dimension academica
const SUBJECT_DIM = {
  matematicas: 'math_level',
  fisica: 'physics_level',
  quimica: 'chemistry_level',
  biologia: 'biology_level',
  informatica: 'programming_level',
  lengua: 'writing_level',
  economia: 'economics_level',
  arte: 'creativity_level',
};

// rasgo de personalidad (token ASCII) -> dimension "ideal_for_*"
const TRAIT_DIM = {
  analitico: 'ideal_for_analytical_profiles',
  creativo: 'ideal_for_creative_profiles',
  lider: 'ideal_for_leadership_profiles',
  introvertido: 'ideal_for_introverts',
  extrovertido: 'ideal_for_extroverts',
  organizado: 'ideal_for_structured_profiles',
  independiente: 'ideal_for_independent_profiles',
  competitivo: 'ideal_for_competitive_profiles',
  empatico: 'ideal_for_empathic_profiles',
  curioso: 'ideal_for_curious_profiles',
};

// que valora en una carrera (token ASCII) -> dimension de la carrera
const VALORA_DIM = {
  innovacion: 'innovation_focus',
  impacto_social: 'social_impact_focus',
  internacional: 'international_orientation',
  salidas: 'internship_focus',
  emprender: 'entrepreneurship_focus',
  prestigio: 'difficulty_level',
};

function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

/**
 * Puntuacion determinista 0-100 de una carrera frente a las "signals" del
 * cuestionario. Se usa para (a) pre-ordenar candidatos y (b) fallback si la IA
 * no responde.
 */
function deterministicScore(c, sig, areaNames) {
  sig = sig || {};
  let score = 0;

  // area de interes: peso dominante
  if (areaNames && areaNames.length && areaNames.indexOf(c.area) !== -1) score += 35;
  else score += 6;

  // rasgos de personalidad <-> ideal_for_*
  const traits = Array.isArray(sig.rasgos) ? sig.rasgos : [];
  const tv = traits.map((t) => c[TRAIT_DIM[t]]).filter((v) => typeof v === 'number');
  if (tv.length) score += (avg(tv) / 10) * 25;

  // asignaturas favoritas <-> nivel academico
  const fav = Array.isArray(sig.asignaturas_fav) ? sig.asignaturas_fav : [];
  const fv = fav.map((s) => c[SUBJECT_DIM[s]]).filter((v) => typeof v === 'number');
  if (fv.length) score += (avg(fv) / 10) * 20;

  // asignaturas que disfruta menos <-> penalizacion
  const menos = Array.isArray(sig.asignaturas_menos) ? sig.asignaturas_menos : [];
  const mv = menos.map((s) => c[SUBJECT_DIM[s]]).filter((v) => typeof v === 'number');
  if (mv.length) score -= (avg(mv) / 10) * 10;

  // estilo de aprendizaje 0 (practica) .. 10 (teoria)
  const est = typeof sig.estilo_aprendizaje === 'number' ? sig.estilo_aprendizaje : 5;
  if (est <= 4) score += ((c.practical_intensity || 5) / 10) * 8;
  else if (est >= 6) score += ((c.theoretical_intensity || 5) / 10) * 8;
  else score += (((c.practical_intensity || 5) + (c.theoretical_intensity || 5)) / 20) * 8;

  // que valora en la carrera
  const valora = Array.isArray(sig.valora) ? sig.valora : [];
  valora.forEach((v) => {
    const d = VALORA_DIM[v];
    if (d && typeof c[d] === 'number') score += (c[d] / 10) * 3;
  });

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Texto legible del perfil del estudiante a partir del cuestionario.
 * `questionnaire.blocks` es [{ title, items:[{q,a}] }] ya con etiquetas
 * humanas (las pone el frontend). Sirve tanto para el prompt de IA como
 * para depuracion.
 */
function formatStudentProfile(questionnaire, intereses) {
  const lines = [];
  const areas = (intereses || []).map((i) => INTEREST_LABELS[i] || i);
  lines.push('AREAS DE INTERES ELEGIDAS: ' + (areas.join(', ') || '(ninguna)'));
  const blocks = (questionnaire && Array.isArray(questionnaire.blocks)) ? questionnaire.blocks : [];
  blocks.forEach((b) => {
    if (!b || !Array.isArray(b.items)) return;
    lines.push('');
    lines.push('## ' + (b.title || 'Bloque'));
    b.items.forEach((it) => {
      if (!it) return;
      let a = it.a;
      if (Array.isArray(a)) a = a.join(', ');
      a = (a === 0 || a) ? String(a) : '';
      if (a.trim()) lines.push('- ' + (it.q || '') + ' -> ' + a.trim());
    });
  });
  return lines.join('\n');
}

/**
 * Candidatos para la IA: carreras de las areas de interes elegidas,
 * pre-ordenadas por afinidad determinista y limitadas a `limit`.
 */
function getCandidates(intereses, signals, limit) {
  limit = limit || 45;
  const areaNames = (intereses || []).map((i) => AREA_MAP[i]).filter(Boolean);
  let pool = CAREERS.filter((c) => areaNames.indexOf(c.area) !== -1);
  if (!pool.length) pool = CAREERS.slice();
  const scored = pool
    .map((c) => Object.assign({}, c, { _det: deterministicScore(c, signals, areaNames) }))
    .sort((a, b) => b._det - a._det);
  return scored.slice(0, limit);
}

/** Ranking de respaldo (sin IA): top 10 por puntuacion determinista. */
function fallbackRanking(candidates) {
  return candidates.slice(0, 10).map((c) => ({
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
    compatibility: Math.max(45, Math.min(96, c._det)),
    reason:
      'Encaja con tu area de interes (' + c.area + ') y con el perfil academico ' +
      'detectado en el cuestionario. Afinidad estimada automaticamente.',
    strengths: (c.career_keywords || []).slice(0, 3).join(', '),
  }));
}

/** Representacion compacta de una carrera para el prompt de IA. */
function compactCareer(c) {
  return {
    program_code: c.program_code,
    career_name: c.career_name,
    university: c.university,
    city: c.city,
    area: c.area,
    subarea: c.subarea,
    degree_type: c.degree_type,
    duration_years: c.duration_years,
    numerus_fixus: !!c.numerus_fixus,
    difficulty: c.difficulty_level,
    scores: {
      math: c.math_level, physics: c.physics_level, chemistry: c.chemistry_level,
      biology: c.biology_level, programming: c.programming_level, writing: c.writing_level,
      economics: c.economics_level, creativity: c.creativity_level,
      research: c.research_intensity, theoretical: c.theoretical_intensity,
      practical: c.practical_intensity, group_work: c.group_work_level,
      independence: c.independence_required, international: c.international_orientation,
      innovation: c.innovation_focus, entrepreneurship: c.entrepreneurship_focus,
      social_impact: c.social_impact_focus,
    },
    ideal_for: {
      analytical: c.ideal_for_analytical_profiles, creative: c.ideal_for_creative_profiles,
      leadership: c.ideal_for_leadership_profiles, introvert: c.ideal_for_introverts,
      extrovert: c.ideal_for_extroverts, structured: c.ideal_for_structured_profiles,
      independent: c.ideal_for_independent_profiles, competitive: c.ideal_for_competitive_profiles,
      empathic: c.ideal_for_empathic_profiles, curious: c.ideal_for_curious_profiles,
    },
    recommended_subjects: c.recommended_subjects || [],
    career_outcomes: (c.career_outcomes || []).slice(0, 5),
  };
}

/** Devuelve el registro completo de la carrera por program_code. */
function findCareer(code) {
  return CAREERS.find((c) => c.program_code === code) || null;
}

module.exports = {
  CAREERS,
  AREA_MAP,
  INTEREST_LABELS,
  deterministicScore,
  formatStudentProfile,
  getCandidates,
  fallbackRanking,
  compactCareer,
  findCareer,
};
