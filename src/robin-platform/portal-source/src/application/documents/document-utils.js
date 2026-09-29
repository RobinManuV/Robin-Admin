export const APP_PHASE_LABELS = [
  { key: 1, label: 'Presentación de carreras', desc: 'Te presentamos las opciones que mejor encajan contigo' },
  { key: 2, label: 'Elección de carreras', desc: 'Elegís juntos las universidades y programas a solicitar' },
  { key: 3, label: 'Entrega de documentos', desc: 'Reúnes y subes toda la documentación necesaria' },
  { key: 4, label: 'Esperando resultados', desc: 'Las universidades estudian tu solicitud' },
  { key: 5, label: 'Selección del destino', desc: 'Eliges entre las admisiones recibidas tu universidad' },
  { key: 6, label: 'Buscando alojamiento', desc: 'Buscamos y aseguramos tu alojamiento en destino' },
  { key: 7, label: 'Entrega de EBAU + pago de matrícula', desc: 'Envías tus notas de EBAU y formalizas la matrícula' },
  { key: 8, label: 'Trámites finales', desc: 'Completamos los últimos trámites antes de tu salida' },
  { key: 9, label: 'Llegada al destino', desc: '¡Llegas a tu nuevo destino y comienza la aventura!' },
];

export const DEFAULT_REQUIRED_DOCS = [
  'Notas de 4º de la ESO',
  'Notas de 1º de bachillerato',
  'Notas de 2º de bachillerato',
  'CV',
];

export const DEFAULT_REQUIRED_DOCS_MASTER = [
  { name: 'CV', required: true },
  { name: 'Grado universitario', required: true },
  { name: 'Transcript del grado universitario', required: true },
  { name: 'Examen (si aplica)', required: false },
  { name: 'Carta de motivación', required: true },
];

export function buildDefaultDocs(level) {
  const list = level === 'maestria' ? DEFAULT_REQUIRED_DOCS_MASTER : DEFAULT_REQUIRED_DOCS;
  return list.map((entry) => {
    const document = typeof entry === 'string' ? { name: entry, required: true } : entry;
    return {
      id: '',
      type: 'document',
      name: document.name,
      deadline: '',
      required: document.required !== false,
      template_file: null,
      template_path: null,
      template_filename: null,
      template_mime: null,
    };
  });
}

export function statusLabel(status) {
  if (status === 'validated') return { tone: 'green', label: 'Validado' };
  if (status === 'pending_review') return { tone: 'amber', label: 'Pendiente revisión' };
  if (status === 'rejected') return { tone: 'rose', label: 'Rechazado' };
  return { tone: 'slate', label: 'Pendiente subir' };
}

export function newCareerRequirement(type = 'document') {
  return {
    id: '',
    type,
    name: '',
    deadline: '',
    required: type === 'document',
    template_file: null,
    template_path: null,
    template_filename: null,
    template_mime: null,
  };
}

export function normalizeCareerRequirement(requirement = {}) {
  const type = requirement.type === 'event' ? 'event' : 'document';
  return {
    ...newCareerRequirement(type),
    ...requirement,
    type,
    deadline: requirement.deadline || '',
    required: type === 'document' ? requirement.required !== false : false,
  };
}
