// Declarative onboarding questionnaire content. Kept separate from the UI
// so wording and form structure can be reviewed without traversing app.jsx.

const Q_SUBJECTS = [
  { label: "Matemáticas", value: "matematicas" },
  { label: "Física", value: "fisica" },
  { label: "Química", value: "quimica" },
  { label: "Biología", value: "biologia" },
  { label: "Informática / Programación", value: "informatica" },
  { label: "Economía", value: "economia" },
  { label: "Lengua y Literatura", value: "lengua" },
  { label: "Historia", value: "historia" },
  { label: "Geografía", value: "geografia" },
  { label: "Filosofía", value: "filosofia" },
  { label: "Idiomas", value: "idiomas" },
  { label: "Arte y Dibujo", value: "arte" },
  { label: "Música", value: "musica" },
  { label: "Tecnología", value: "tecnologia" },
  { label: "Educación Física", value: "efisica" },
];
const Q_TRAITS = [
  { label: "Analítico/a", value: "analitico" },
  { label: "Creativo/a", value: "creativo" },
  { label: "Líder", value: "lider" },
  { label: "Introvertido/a", value: "introvertido" },
  { label: "Extrovertido/a", value: "extrovertido" },
  { label: "Organizado/a", value: "organizado" },
  { label: "Independiente", value: "independiente" },
  { label: "Competitivo/a", value: "competitivo" },
  { label: "Empático/a", value: "empatico" },
  { label: "Curioso/a", value: "curioso" },
];
const Q_VALORA = [
  { label: "Salidas profesionales", value: "salidas" },
  { label: "Pasión por la materia", value: "pasion" },
  { label: "Prestigio académico", value: "prestigio" },
  { label: "Ambiente internacional", value: "internacional" },
  { label: "Innovación", value: "innovacion" },
  { label: "Impacto social", value: "impacto_social" },
  { label: "Emprender / crear algo propio", value: "emprender" },
  { label: "Equilibrio vida-estudios", value: "equilibrio" },
];

const Q_GENERAL = {
  key: "general",
  title: "Bloque 1 · Información general",
  questions: [
    { id: "g_ciudad", type: "text", q: "Ciudad y país donde resides actualmente" },
    { id: "g_colegio", type: "text", q: "Nombre de tu colegio actual" },
    { id: "g_sistema", type: "single", q: "¿Qué sistema educativo estás cursando?", options: ["Bachillerato español", "Bachillerato Internacional (IB)", "A-Levels (británico)", "Sistema americano", "Bac francés", "Otro"] },
    { id: "g_nota", type: "slider", q: "¿Cuál es tu nota media del año pasado?", min: 0, max: 10, step: 0.5, def: 7, left: "0", right: "10" },
    { id: "g_fav", type: "multi", q: "¿Qué asignaturas te gustan MÁS?", options: Q_SUBJECTS },
    { id: "g_menos", type: "multi", q: "¿Qué asignaturas disfrutas MENOS?", options: Q_SUBJECTS },
    { id: "g_estilo", type: "slider", q: "¿Cómo prefieres aprender?", min: 0, max: 10, step: 1, def: 5, left: "Práctica", right: "Teoría" },
    { id: "g_valora", type: "multi", q: "¿Qué valoras MÁS en una carrera universitaria?", options: Q_VALORA, max: 3 },
    { id: "g_ingles", type: "single", q: "¿Qué nivel de inglés tienes?", options: ["A2 o inferior", "B1", "B2", "C1", "C2 / Nativo"] },
    { id: "g_fuera", type: "single", q: "¿Has vivido o estudiado fuera de tu país?", options: ["Sí", "No"] },
    { id: "g_rasgos", type: "multi", q: "¿Cómo te describirías? Elige los rasgos que más te representan", options: Q_TRAITS },
    { id: "g_descripcion", type: "textarea", q: "Cuéntanos algo más sobre cómo eres", optional: true },
    { id: "g_ciudad_tipo", type: "single", q: "¿Qué tipo de ciudad te gustaría para estudiar?", options: ["Grande", "Mediana", "Pequeña", "Indiferente"] },
    { id: "g_social", type: "single", q: "¿Qué importancia tiene para ti la vida social universitaria?", options: ["Mucha", "Media", "Baja"] },
    { id: "g_independencia", type: "slider", q: "¿Qué tan independiente te consideras?", min: 0, max: 10, step: 1, def: 5, left: "Poco", right: "Mucho" },
    { id: "g_futuro", type: "textarea", q: "¿Qué idea tienes ahora mismo sobre tu futuro?" },
    { id: "g_presupuesto", type: "slider", q: "¿Qué presupuesto contempláis al mes para estudiar fuera?", min: 0, max: 2000, step: 50, def: 800, left: "0 €", right: "2000 €", suffix: " €" },
    { id: "g_algo", type: "textarea", q: "¿Hay algo importante que deberíamos saber sobre ti?", optional: true },
  ],
};

const Q_VOCACIONAL = {
  key: "vocacional",
  title: "Bloque 3 · Perfil vocacional",
  questions: [
    { id: "v_carreras", type: "textarea", q: "¿Qué carreras universitarias te llaman más la atención actualmente?" },
    { id: "v_trabajo10", type: "textarea", q: "¿Qué tipo de trabajo te imaginas teniendo en 10 años?" },
    { id: "v_prioridad", type: "single", q: "¿Qué es lo más importante para ti?", options: ["Salario", "Pasión", "Impacto", "Estabilidad"] },
    { id: "v_paises", type: "multi", q: "¿Qué países te interesaría considerar para estudiar?", options: ["Países Bajos", "Reino Unido", "España", "Estados Unidos", "Alemania", "Francia", "Irlanda", "Italia", "Otro"] },
    { id: "v_expectativas", type: "textarea", q: "¿Qué expectativas tienes de tu experiencia universitaria internacional?", optional: true },
  ],
};

const Q_AREAS = {
  ciencias: {
    key: "ciencias", title: "Específicas · Ciencias",
    questions: [
      { id: "c_parte", type: "multi", q: "¿Qué parte de las ciencias te atrae más?", options: ["Física", "Química", "Biología", "Matemáticas", "Ciencias ambientales", "Astronomía y espacio", "Ciencia de datos", "Geociencias"] },
      { id: "c_lab", type: "single", q: "¿Te ves trabajando en laboratorio?", options: ["Sí, mucho", "A veces", "No realmente"] },
      { id: "c_enfoque", type: "single", q: "¿Qué te interesa más?", options: ["Investigación", "Análisis de datos", "Descubrimiento científico"] },
      { id: "c_inv_ind", type: "slider", q: "¿Te atrae más la investigación o la industria?", min: 0, max: 10, step: 1, def: 5, left: "Industria", right: "Investigación" },
      { id: "c_estadistica", type: "slider", q: "¿Cómo de cómodo/a te sientes con la estadística y el rigor científico?", min: 0, max: 10, step: 1, def: 5, left: "Poco", right: "Mucho" },
      { id: "c_inspira", type: "textarea", q: "¿Qué científicos, descubrimientos o temas científicos te inspiran?", optional: true },
    ],
  },
  tecnologia_y_programacion: {
    key: "tecnologia_y_programacion", title: "Específicas · Tecnología y programación",
    questions: [
      { id: "t_rama", type: "multi", q: "¿Qué te interesa más?", options: ["Programación / desarrollo", "Inteligencia artificial", "Datos / Data Science", "Ciberseguridad", "Sistemas y redes", "Diseño de producto digital"] },
      { id: "t_proyectos", type: "single", q: "¿Has creado proyectos tecnológicos por tu cuenta?", options: ["Sí, varios", "Alguno", "Todavía no"] },
      { id: "t_motiva", type: "single", q: "¿Qué te motiva más?", options: ["Crear productos", "Resolver problemas", "Ambas por igual"] },
      { id: "t_logica", type: "slider", q: "¿Te gusta la lógica matemática?", min: 0, max: 10, step: 1, def: 5, left: "Poco", right: "Mucho" },
      { id: "t_practica", type: "slider", q: "¿Prefieres una carrera práctica y basada en proyectos?", min: 0, max: 10, step: 1, def: 5, left: "Más teórica", right: "Muy práctica" },
      { id: "t_herramientas", type: "textarea", q: "¿Qué herramientas o lenguajes de programación conoces actualmente?", optional: true },
    ],
  },
  business: {
    key: "business", title: "Específicas · Business",
    questions: [
      { id: "b_rama", type: "multi", q: "¿Qué te atrae más?", options: ["Marketing", "Finanzas", "Emprendimiento", "Estrategia", "Recursos humanos", "Consultoría"] },
      { id: "b_lider", type: "single", q: "¿Te ves liderando equipos o creando empresas?", options: ["Liderar equipos", "Crear mi propia empresa", "Aún no lo sé"] },
      { id: "b_negocios", type: "textarea", q: "¿Qué tipo de negocios o sectores te interesan más?", optional: true },
      { id: "b_perfil", type: "slider", q: "¿Te consideras más persuasivo/a o más analítico/a?", min: 0, max: 10, step: 1, def: 5, left: "Persuasivo/a", right: "Analítico/a" },
      { id: "b_salario", type: "slider", q: "¿Qué importancia tiene para ti el salario futuro?", min: 0, max: 10, step: 1, def: 5, left: "Poca", right: "Mucha" },
      { id: "b_internacional", type: "single", q: "¿Te gustaría trabajar internacionalmente?", options: ["Sí, claramente", "Quizás", "Prefiero quedarme cerca"] },
    ],
  },
  ciencias_de_la_salud: {
    key: "ciencias_de_la_salud", title: "Específicas · Ciencias de la salud",
    questions: [
      { id: "s_motiva", type: "slider", q: "¿Qué te motiva más?", min: 0, max: 10, step: 1, def: 5, left: "Trato con personas", right: "La parte científica" },
      { id: "s_hospital", type: "single", q: "¿Te ves trabajando en hospitales o clínicas?", options: ["Sí", "Prefiero investigación o laboratorio", "No estoy seguro/a"] },
      { id: "s_medicina", type: "single", q: "¿Te interesa una carrera larga y exigente como Medicina?", options: ["Sí", "Tal vez", "No"] },
      { id: "s_presion", type: "single", q: "¿Cómo reaccionas ante situaciones de presión?", options: ["Muy bien", "Bien", "Regular", "Me cuesta"] },
      { id: "s_ayudar", type: "slider", q: "¿Qué importancia tiene para ti ayudar a otras personas?", min: 0, max: 10, step: 1, def: 5, left: "Poca", right: "Mucha" },
      { id: "s_area", type: "multi", q: "¿Qué área de la salud te llama más la atención?", options: ["Medicina", "Enfermería", "Psicología", "Farmacia", "Nutrición", "Fisioterapia", "Biomedicina", "Salud pública", "Odontología"] },
    ],
  },
  ingenierias: {
    key: "ingenierias", title: "Específicas · Ingenierías",
    questions: [
      { id: "i_problemas", type: "textarea", q: "¿Qué tipo de problemas disfrutas resolver?", optional: true },
      { id: "i_rama", type: "multi", q: "¿Cuáles de estas ingenierías se acercan más a los temas que te interesan?", options: ["Mecánica", "Civil", "Eléctrica", "Aeroespacial", "Industrial", "Química", "Biomédica", "Software", "Ambiental", "Robótica"] },
      { id: "i_construir", type: "single", q: "¿Qué disfrutas más?", options: ["Construir", "Diseñar", "Optimizar sistemas"] },
      { id: "i_matefis", type: "slider", q: "¿Te atraen las matemáticas y la física?", min: 0, max: 10, step: 1, def: 5, left: "Poco", right: "Mucho" },
      { id: "i_tecnico", type: "slider", q: "¿Prefieres trabajo técnico o liderazgo de proyectos?", min: 0, max: 10, step: 1, def: 5, left: "Técnico", right: "Liderazgo" },
    ],
  },
  ciencias_sociales: {
    key: "ciencias_sociales", title: "Específicas · Ciencias sociales",
    questions: [
      { id: "so_rama", type: "multi", q: "¿Qué te interesa más?", options: ["Psicología", "Política", "Comunicación", "Sociología", "Relaciones internacionales", "Derecho", "Antropología", "Educación"] },
      { id: "so_debate", type: "slider", q: "¿Te gusta debatir y analizar temas sociales?", min: 0, max: 10, step: 1, def: 5, left: "Poco", right: "Mucho" },
      { id: "so_personas", type: "single", q: "¿Te ves trabajando con personas constantemente?", options: ["Sí", "A veces", "Prefiero trabajo más analítico"] },
      { id: "so_problemas", type: "textarea", q: "¿Qué problemas sociales te gustaría ayudar a resolver?", optional: true },
      { id: "so_internacional", type: "single", q: "¿Te interesa el mundo internacional y político?", options: ["Sí, mucho", "Algo", "No especialmente"] },
      { id: "so_enfoque", type: "single", q: "¿Qué prefieres?", options: ["Investigación", "Comunicación", "Intervención social"] },
    ],
  },
  artes: {
    key: "artes", title: "Específicas · Artes",
    questions: [
      { id: "a_creatividad", type: "single", q: "¿Qué tipo de creatividad te representa más?", options: ["Visual", "Digital", "Audiovisual", "Conceptual", "Escrita", "Espacial / arquitectónica"] },
      { id: "a_portfolio", type: "single", q: "¿Tienes portfolio o proyectos artísticos?", options: ["Sí", "En proceso", "Todavía no"] },
      { id: "a_disciplina", type: "multi", q: "¿Qué disciplinas creativas te interesan más?", options: ["Diseño gráfico", "Arquitectura", "Bellas artes", "Cine y audiovisual", "Diseño de producto", "Animación", "Fotografía", "Diseño UX/UI", "Moda"] },
      { id: "a_medio", type: "single", q: "¿Prefieres diseño digital, físico o audiovisual?", options: ["Digital", "Físico", "Audiovisual", "Mixto"] },
      { id: "a_trabajo", type: "single", q: "¿Te gustaría trabajar freelance o en empresa?", options: ["Freelance", "En empresa", "No lo sé aún"] },
      { id: "a_inspira", type: "textarea", q: "¿Qué artistas o marcas creativas te inspiran?", optional: true },
    ],
  },
};

// Cuestionario adaptado para clientes de máster (origin 'otros' + nivel 'maestria').
const Q_MASTER_FORMACION = {
  key: "m_formacion",
  title: "Bloque 1 · Formación universitaria",
  questions: [
    { id: "m_grado", type: "text", q: "¿Qué grado universitario has cursado (o estás cursando)?" },
    { id: "m_universidad", type: "text", q: "Universidad en la que cursaste tu grado" },
    { id: "m_pais_grado", type: "text", q: "País donde cursaste tu grado" },
    { id: "m_estado_grado", type: "single", q: "¿Has finalizado tu grado?", options: ["Sí, finalizado", "En curso · último año", "En curso · me faltan 2 años o más"] },
    { id: "m_nota", type: "slider", q: "Nota media de tu expediente del grado (sobre 10)", min: 0, max: 10, step: 0.5, def: 7, left: "0", right: "10" },
    { id: "m_asignaturas_fav", type: "textarea", q: "¿Qué asignaturas o áreas de tu grado has disfrutado más?" },
    { id: "m_asignaturas_fuertes", type: "textarea", q: "¿En qué asignaturas o materias has obtenido tus mejores resultados?", optional: true },
    { id: "m_tfg", type: "textarea", q: "Tema de tu Trabajo de Fin de Grado (TFG) o proyecto final, si aplica", optional: true },
    { id: "m_ingles", type: "single", q: "¿Qué nivel de inglés tienes?", options: ["B1", "B2", "C1", "C2 / Nativo"] },
  ],
};

const Q_MASTER_EXPERIENCIA = {
  key: "m_experiencia",
  title: "Bloque 2 · Experiencia profesional",
  questions: [
    { id: "m_exp_tiene", type: "single", q: "¿Tienes experiencia profesional?", options: ["Sí, a tiempo completo", "Sí, prácticas o a tiempo parcial", "No, todavía no"] },
    { id: "m_exp_anios", type: "slider", q: "¿Cuántos años de experiencia profesional acumulas?", min: 0, max: 15, step: 0.5, def: 0, left: "0", right: "15+", suffix: " años" },
    { id: "m_exp_sector", type: "text", q: "Sector(es) en los que has trabajado", optional: true },
    { id: "m_exp_desc", type: "textarea", q: "Describe brevemente tu experiencia profesional: puestos, responsabilidades y logros", optional: true },
    { id: "m_exp_otros", type: "textarea", q: "Prácticas, voluntariado, investigación u otros proyectos relevantes", optional: true },
  ],
};

const Q_MASTER_OBJETIVO = {
  key: "m_objetivo",
  title: "Bloque 3 · Tu máster objetivo",
  questions: [
    { id: "m_master_interes", type: "textarea", q: "¿Qué máster(es) o áreas de especialización te interesan?" },
    { id: "m_motivacion", type: "textarea", q: "¿Por qué quieres cursar un máster ahora y qué esperas conseguir?" },
    { id: "m_objetivo_pro", type: "textarea", q: "¿Qué objetivo profesional persigues a medio plazo?" },
    { id: "m_prioridad", type: "single", q: "¿Qué es lo más importante para ti al elegir el máster?", options: ["Prestigio / ranking", "Empleabilidad", "Especialización académica", "Networking", "Coste"] },
    { id: "m_modalidad", type: "single", q: "Modalidad preferida", options: ["Presencial", "Híbrida", "Indiferente"] },
    { id: "m_inicio", type: "single", q: "¿Cuándo te gustaría comenzar el máster?", options: ["Curso 2026-2027", "Curso 2027-2028", "Aún por decidir"] },
    { id: "m_algo", type: "textarea", q: "¿Hay algo más que debamos saber sobre tu perfil?", optional: true },
  ],
};

const Q_MASTER_BLOCKS = [Q_MASTER_FORMACION, Q_MASTER_EXPERIENCIA, Q_MASTER_OBJETIVO];

export { Q_AREAS, Q_GENERAL, Q_MASTER_BLOCKS, Q_VOCACIONAL };
