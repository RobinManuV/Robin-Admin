/**
 * OCR de documento de identidad con Claude vision.
 * Soporta DOS tipos de documento:
 *   - 'dni'      -> DNI español (anverso + reverso)
 *   - 'passport' -> Pasaporte (página de datos, una sola imagen)
 * Recibe base64 directamente — encaja con el multipart parser de Netlify.
 */
const Anthropic = require('@anthropic-ai/sdk');

function imageBlock({ base64, mimetype }) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mimetype || 'image/jpeg', data: base64 },
  };
}

const SYSTEM_PROMPT = `Eres un asistente que extrae datos de un DNI espanol a partir de fotos del anverso y reverso.
Devuelves SIEMPRE un objeto JSON con exactamente estas claves:

{
  "nombre": string,
  "apellidos": string,
  "direccion": string,
  "fecha_nacimiento": "YYYY-MM-DD",
  "dni_numero": string,
  "confidence": number entre 0 y 1
}

Reglas:
- Si un campo no se puede leer, devuelve cadena vacia y baja la confidence.
- "fecha_nacimiento" SIEMPRE en formato ISO YYYY-MM-DD.
- "dni_numero" sin espacios, en mayusculas.
- "direccion" tomada del reverso del DNI, en una sola linea.
- No incluyas comentarios ni texto fuera del JSON.`;

const PASSPORT_PROMPT = `Eres un asistente que extrae datos de un PASAPORTE a partir de la foto de la pagina de datos.
Devuelves SIEMPRE un objeto JSON con exactamente estas claves:

{
  "nombre": string,
  "apellidos": string,
  "direccion": "",
  "fecha_nacimiento": "YYYY-MM-DD",
  "dni_numero": string,
  "confidence": number entre 0 y 1
}

Reglas:
- "dni_numero" es el NUMERO DE PASAPORTE (passport number), sin espacios, en mayusculas.
- Un pasaporte NO contiene direccion: devuelve "direccion" SIEMPRE como cadena vacia "".
- "fecha_nacimiento" SIEMPRE en formato ISO YYYY-MM-DD.
- Si los campos impresos no se ven bien, usa la zona MRZ (las dos lineas de codigo al pie de la pagina).
- "nombre" = nombres de pila; "apellidos" = apellidos / surname.
- Si un campo no se puede leer, devuelve cadena vacia y baja la confidence.
- No incluyas comentarios ni texto fuera del JSON.`;

async function extractDniFields({ anverso, reverso, docType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');
  const client = new Anthropic({ apiKey });

  const isPassport = String(docType || '').toLowerCase() === 'passport';

  const messages = isPassport
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Pagina de datos del pasaporte:' },
            imageBlock(anverso),
            { type: 'text', text: 'Extrae los campos y devuelve unicamente el JSON. Nada mas.' },
          ],
        },
      ]
    : [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Anverso del DNI:' },
            imageBlock(anverso),
            { type: 'text', text: 'Reverso del DNI:' },
            imageBlock(reverso),
            { type: 'text', text: 'Extrae los campos y devuelve unicamente el JSON. Nada mas.' },
          ],
        },
      ];

  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: isPassport ? PASSPORT_PROMPT : SYSTEM_PROMPT,
    messages,
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('No se pudo parsear la respuesta del OCR: ' + text.slice(0, 200));
  }

  return {
    nombre: String(parsed.nombre || '').trim(),
    apellidos: String(parsed.apellidos || '').trim(),
    direccion: String(parsed.direccion || '').trim(),
    fecha_nacimiento: String(parsed.fecha_nacimiento || '').trim(),
    dni_numero: String(parsed.dni_numero || '').trim().toUpperCase(),
    confidence: Number(parsed.confidence != null ? parsed.confidence : 0),
  };
}

module.exports = { extractDniFields };
