const { ingestCrmLead } = require('../../lib/crm-lead-ingest');
const { json, methodNotAllowed, parseJsonBody, safeEqual, serverError } = require('../../lib/http');

function normalizeLeadType(value) {
  const key = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  if (key === 'mentoria') return 'Mentoría';
  if (key === 'erasmus') return 'Llegada';
  if (key === 'asesoramiento_completo' || key === 'asesoramiento') return 'General';
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  const configured = process.env.WEBSITE_LEAD_INGEST_SECRET || '';
  // Elementor's native Webhook action cannot attach custom headers. Accept the
  // same dedicated secret as a query parameter so WordPress can authenticate
  // its server-to-server request without exposing it in the public form HTML.
  const provided = event.headers['x-robin-lead-secret'] || event.headers['X-Robin-Lead-Secret'] || event.queryStringParameters?.token || '';
  if (!configured || !safeEqual(configured, provided)) return json({ error: 'unauthorized' }, { statusCode: 401 });
  let body = parseJsonBody(event);
  if (!body && event.body) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  if (!body || body.website) return json({ ok: true }); // honeypot
  const values = body.fields && typeof body.fields === 'object'
    ? Object.fromEntries(Object.entries(body.fields).map(([key, field]) => [key, field && typeof field === 'object' && 'value' in field ? field.value : field]))
    : body;
  const pick = (...keys) => keys.map((key) => values[key]).find((value) => value != null && String(value).trim() !== '');
  const name = pick('name', 'nombre', 'Nombre');
  const email = pick('email', 'correo', 'Correo electrónico', 'Correo Electronico');
  const phone = pick('phone', 'telefono', 'teléfono', 'Teléfono', 'field_8584413');
  const message = pick('message', 'mensaje', 'Mensaje', 'notes', 'notas', 'comentario', 'comentarios', 'consulta', 'interes', 'interés');
  const service = pick('leadType', 'tipo', 'Servicio', 'service', 'field_8b6c6a7');
  const rawFormName = pick('form-name', 'form_name', 'formName', 'formulario') || body.form_name || body.formName || body.form || body.meta?.form_name || '';
  const normalizedFormName = String(rawFormName).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const formName = /colegio|school/.test(normalizedFormName) ? 'colegios' : normalizedFormName || null;
  const leadType = normalizeLeadType(service);
  const remainingDetails = Object.entries(values)
    .filter(([key, value]) => value != null && String(value).trim() && !/(name|nombre|apellido|mail|correo|phone|telefono|movil|leadtype|tipo|servicio|service|website)/i.test(key))
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value).trim()}`)
    .join('\n');
  const formNotes = [message, remainingDetails].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join('\n');
  if (!email && !phone) return json({ error: 'email_or_phone_required' }, { statusCode: 400 });
  try {
    const result = await ingestCrmLead({
      source: 'website', externalId: body.submissionId || body.id || body.meta?.submission_id, name,
      email, phone, summary: body.summary,
      comment: formNotes, bodyText: formNotes, leadType,
      campaign: body.campaign || body.utm_campaign,
      payload: { form_name: formName, questionnaire: body.questionnaire || body.cuestionario || null, service: service || null, utm_source: body.utm_source || null, utm_medium: body.utm_medium || null, page_url: body.pageUrl || body.page_url || body.meta?.page_url || 'https://project-robin.com/contacto/' },
    });
    // Elementor treats every status other than exactly 200 as a failed form,
    // including the otherwise valid 201 Created response.
    return json({ ok: true, result: result.result, leadId: result.lead?.id || null });
  } catch (error) { return serverError(error, 'crm.website_lead'); }
};
