import { Briefcase, Dumbbell, FileText, Handshake, HeartHandshake, Home, PartyPopper, Plane, Users } from "lucide-react";

const CAMPUS_AREAS = [
  "Administración y Negocios",
  "Finanzas y Economía",
  "Tecnología e Informática",
  "Ingenierías",
  "Arquitectura",
  "Salud (otros)",
  "Medicina",
  "Educación",
  "Derecho",
  "Marketing y Comunicación",
  "Ciencias Sociales y Humanidades",
  "Ciencias e Investigación",
  "Arte, Diseño y Creatividad",
  "Política y relaciones internacionales",
  "Medio Ambiente y Sostenibilidad",
  "Turismo y Gastronomía",
];

export { CAMPUS_AREAS };

const COMMUNITY_TYPE_LABELS = {
  event: { label: "Evento", tone: "blue" },
  trip: { label: "Viaje", tone: "gold" },
  party: { label: "Fiesta", tone: "rose" },
  sports: { label: "Deporte", tone: "green" },
  group: { label: "Grupo", tone: "navy" },
  networking: { label: "Networking", tone: "slate" },
  announcement: { label: "Anuncio", tone: "amber" },
  association: { label: "Asociación", tone: "navy" },
  mentor: { label: "Mentor", tone: "gold" },
  mentor_slot: { label: "Disponibilidad", tone: "blue" },
};

export { COMMUNITY_TYPE_LABELS };

const PARTNER_CATEGORY_LABELS = {
  local_business: "Comercios locales",
  bank: "Bancos",
  health_insurance: "Seguro médico",
  gym: "Gimnasios",
  bike: "Bicicletas",
  professional_development: "Desarrollo profesional",
  academies: "Academias",
  nightlife: "Fiesta",
  social_events: "Eventos sociales",
  cultural_events: "Eventos culturales",
  legal_support: "Apoyo legal",
  jobs: "Trabajo",
  other: "Otros",
};

export { PARTNER_CATEGORY_LABELS };

const RESIDENCE_PARTNERS = [
  { id: "the_social_hub", name: "The Social Hub", featured: true, tagline: "Hoteles híbridos con comunidad, coworking y eventos para estudiantes y jóvenes.", city: "Países Bajos" },
  { id: "plaza_residences", name: "Plaza Residences", tagline: "Residencias de estudiantes con servicios e instalaciones todo incluido.", city: "Países Bajos" },
  { id: "the_student_experience", name: "The Student Experience", tagline: "Alojamiento pensado para estudiantes internacionales.", city: "Países Bajos" },
  { id: "xior", name: "Xior", tagline: "Residencias de estudiantes en múltiples ciudades europeas.", city: "Europa" },
];

export { RESIDENCE_PARTNERS };

const ROBIN_BENEFITS = [
  { group: "Instalación", items: [
    { key: "bureaucratic_support", label: "Trámites burocráticos", level: "nest" },
    { key: "arrival_support", label: "Soporte a la llegada", level: "nest" },
    { key: "residencias", label: "Residencias", level: "rocket" },
    { key: "pisos", label: "Pisos", level: "rocket" },
  ] },
  { group: "Wellness", items: [
    { key: "social_break", label: "Social Break", level: "fly" },
  ] },
  { group: "Carrera", items: [
    { key: "cv", label: "CV", level: "nest" },
    { key: "mentorias", label: "Mentorías", level: "nest" },
    { key: "networking", label: "Networking", level: "fly" },
    { key: "empleos_locales", label: "Empleos Locales", level: "fly" },
  ] },
  { group: "Comunidad", items: [
    { key: "groups", label: "Grupos Robin", level: "nest" },
    { key: "community_activities", label: "Actividades de comunidad", level: "nest" },
    { key: "events_networking", label: "Eventos / Networking", level: "fly" },
    { key: "sports", label: "Actividades deportivas", level: "fly" },
    { key: "parties", label: "Fiestas", level: "fly" },
    { key: "trips", label: "Viajes", level: "rocket" },
  ] },
];

export { ROBIN_BENEFITS };

const ROBIN_CITIES = [
  "Ámsterdam", "Rotterdam", "La Haya", "Utrecht", "Eindhoven", "Delft",
  "Groningen", "Leiden", "Maastricht", "Tilburg", "Nijmegen", "Breda",
  "Wageningen", "Enschede", "Haarlem",
];

export { ROBIN_CITIES };

const ROBIN_LEVELS = [
  { key: "nest", label: "Nest", emoji: "🪺", start: 0, next: 76 },
  { key: "fly", label: "Fly", emoji: "🕊️", start: 76, next: 182 },
  { key: "rocket", label: "Rocket", emoji: "🚀", start: 182, next: null },
];

export { ROBIN_LEVELS };

const ROBIN_LEVEL_ORDER = { nest: 0, fly: 1, rocket: 2 };

export { ROBIN_LEVEL_ORDER };

const STUDENTJOB_CITY_SLUG = {
  "Ámsterdam": "amsterdam", "Rotterdam": "rotterdam", "La Haya": "den-haag",
  "Utrecht": "utrecht", "Eindhoven": "eindhoven", "Groningen": "groningen",
  "Leiden": "leiden", "Tilburg": "tilburg", "Nijmegen": "nijmegen", "Breda": "breda",
};

export { STUDENTJOB_CITY_SLUG };

const SUBSCRIBER_SERVICES = [
  { key: "bureaucratic_support", title: "Trámites burocráticos", desc: "Te acompañamos con NIE/BSN, empadronamiento, citas y papeleo administrativo.", icon: FileText, category: "Instalación", section: "personal" },
  { key: "arrival_support", title: "Soporte a la llegada", desc: "Checklist y acompañamiento durante tus primeros días en destino.", icon: Plane, category: "Instalación", section: "personal" },
  { key: "residencias", title: "Residencias", desc: "Partners de residencias verificados y enlazados.", icon: Home, category: "Instalación", section: "personal" },
  { key: "pisos", title: "Pisos", desc: "Buscador de pisos con IA (próximamente) y revisión de contratos.", icon: Home, category: "Instalación", section: "personal" },
  { key: "social_break", title: "Social Break", desc: "Comunidad y recursos de bienestar social.", icon: HeartHandshake, category: "Wellness", section: "personal", link: "https://www.mysocialbreak.com/" },
  { key: "empleos_locales", title: "Empleos Locales", desc: "Ofertas de empleo local compatibles con tus estudios.", icon: Briefcase, category: "Carrera", section: "profesional" },
  { key: "cv", title: "CV", desc: "Crea y revisa tu CV con ayuda de IA (próximamente).", icon: FileText, category: "Carrera", section: "profesional" },
  { key: "mentorias", title: "Mentorías", desc: "Elige un área y te asignamos un mentor según disponibilidad.", icon: Users, category: "Carrera", section: "profesional" },
  { key: "networking", title: "Networking", desc: "Eventos y conexiones profesionales con la comunidad Robin.", icon: Handshake, category: "Carrera", section: "profesional" },
  { key: "community_activities", title: "Actividades de comunidad", desc: "Planes y actividades organizadas con otros miembros Robin.", icon: Users, category: "Comunidad", section: "comunidad" },
  { key: "trips", title: "Viajes", desc: "Escapadas y viajes organizados con el grupo Robin.", icon: Plane, category: "Comunidad", section: "comunidad" },
  { key: "groups", title: "Grupos Robin", desc: "Grupos por ciudad, idioma o intereses para conectar con otros miembros.", icon: Users, category: "Comunidad", section: "comunidad" },
  { key: "parties", title: "Fiestas", desc: "Eventos sociales exclusivos para miembros.", icon: PartyPopper, category: "Comunidad", section: "comunidad" },
  { key: "events_networking", title: "Eventos / networking", desc: "Encuentros de networking con profesionales y otros estudiantes.", icon: Handshake, category: "Comunidad", section: "comunidad" },
  { key: "sports", title: "Actividades deportivas", desc: "Ligas y quedadas deportivas organizadas por Robin.", icon: Dumbbell, category: "Comunidad", section: "comunidad" },
];

export { SUBSCRIBER_SERVICES };

const SUB_STATUS_LABELS = {
  none: { label: "Sin suscripción", tone: "slate" },
  active: { label: "Activa", tone: "green" },
  trialing: { label: "Prueba", tone: "blue" },
  past_due: { label: "Pago pendiente", tone: "amber" },
  canceled: { label: "Cancelada", tone: "rose" },
  paused: { label: "Pausada", tone: "amber" },
};

export { SUB_STATUS_LABELS };

const TERMS_SECTIONS = [
  { h: "Identificación del titular y prestador del servicio", ps: [
    "Los presentes Términos y Condiciones regulan el acceso, contratación y utilización del portal, servicios y suscripciones ofrecidos bajo la denominación comercial Robin.",
    "El titular y prestador del Servicio es:",
    "Razón social: PROJECT ROBIN STUDENTS MOBILITY S.L.",
    "Nombre comercial: Robin",
    "CIF: B75355057",
    "Domicilio social: Calle Covarrubias 9, 28010 Madrid, Comunidad de Madrid, España.",
    "En adelante, “Robin”, la “Plataforma”, el “Servicio” o la “Sociedad”, según corresponda.",
    "La contratación de los servicios ofrecidos por Robin se realiza con PROJECT ROBIN STUDENTS MOBILITY S.L.",
    "Al registrarse, contratar una suscripción o utilizar los servicios de Robin, el usuario declara haber leído y aceptado los presentes Términos y Condiciones, sin perjuicio de los derechos irrenunciables que le correspondan conforme a la legislación aplicable.",
  ] },
  { h: "Legislación aplicable", ps: [
    "Los presentes Términos y Condiciones se regirán e interpretarán conforme a la legislación española y, cuando resulte aplicable, conforme a la normativa de la Unión Europea.",
    "En particular, la contratación electrónica y las relaciones con usuarios y consumidores estarán sujetas a la normativa española que resulte aplicable en materia de servicios de la sociedad de la información, contratación electrónica y defensa de consumidores y usuarios.",
    "Cuando el usuario tenga la consideración legal de consumidor, ninguna disposición de estos Términos limitará los derechos imperativos que le reconozca la legislación aplicable.",
    "En caso de controversia, serán competentes los juzgados y tribunales que correspondan conforme a la legislación aplicable. Cuando el usuario sea consumidor, se respetarán en todo caso las normas imperativas de competencia territorial que resulten aplicables.",
  ] },
];

export { TERMS_SECTIONS };
