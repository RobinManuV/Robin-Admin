const crypto = require('crypto');
const { ingestCrmLead } = require('../../lib/crm-lead-ingest');
const { json, methodNotAllowed, parseJsonBody, safeEqual, serverError } = require('../../lib/http');

function fieldMap(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.name, Array.isArray(field.values) ? field.values.filter(Boolean).join(', ') : field.values]));
}

function fieldValue(fields, ...patterns) {
  for (const [key, value] of Object.entries(fields || {})) {
    const normalized = String(key).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (patterns.some((pattern) => pattern.test(normalized)) && value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

async function campaignNameFor(adId, version) {
  if (!adId || !process.env.META_ACCESS_TOKEN) return '';
  try {
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(adId)}`);
    url.searchParams.set('fields', 'campaign{name}');
    url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
    const response = await fetch(url);
    if (!response.ok) return '';
    const ad = await response.json();
    return String(ad?.campaign?.name || '').trim();
  } catch (_) {
    return '';
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    if (q['hub.mode'] === 'subscribe' && safeEqual(q['hub.verify_token'], process.env.META_WEBHOOK_VERIFY_TOKEN || '')) {
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: q['hub.challenge'] || '' };
    }
    return json({ error: 'verification_failed' }, { statusCode: 403 });
  }
  if (event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
    const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(raw).digest('hex');
    if (!process.env.META_APP_SECRET || !safeEqual(signature, expected)) return json({ error: 'invalid_signature' }, { statusCode: 401 });
    const body = parseJsonBody(event);
    const changes = (body?.entry || []).flatMap((entry) => (entry.changes || []).map((change) => ({ entry, change })));
    const leadEvents = changes.filter(({ change }) => change.field === 'leadgen' && change.value?.leadgen_id);
    const version = process.env.META_API_VERSION || 'v26.0';
    for (const { change } of leadEvents) {
      const id = change.value.leadgen_id;
      // Meta's webhook console uses all-4 placeholder IDs. Acknowledge that
      // transport test without trying to fetch or persist a fictitious lead.
      if (/^4+$/.test(String(id)) && /^4+$/.test(String(change.value.page_id || ''))) continue;
      const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(id)}`);
      url.searchParams.set('fields', 'id,created_time,field_data,form_id,ad_id');
      url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN || '');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`meta_lead_fetch_${response.status}`);
      const lead = await response.json();
      const fields = fieldMap(lead.field_data);
      const fullName = fieldValue(fields, /^(full_?name|nombre_?(completo|y_?apellidos?)|name|nombre)$/);
      const firstName = fieldValue(fields, /^(first_?name|nombre|nombres)$/);
      const lastName = fieldValue(fields, /^(last_?name|apellido|apellidos)$/);
      const details = fieldValue(fields, /(message|mensaje|notes?|notas?|comentario|comments?|details?|detalles?|respuesta|response|consulta|interes)/);
      const remainingDetails = Object.entries(fields).filter(([key, value]) => value && !/(name|nombre|apellido|mail|correo|phone|telefono|movil)/i.test(key)).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`).join('\n');
      const comment = [details, remainingDetails].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join('\n');
      const email = fieldValue(fields, /(^|_)e?mail($|_)/, /^correo/);
      const phone = fieldValue(fields, /phone/, /telefono/, /movil/);
      const adId = lead.ad_id || change.value.ad_id;
      const campaignName = String(lead.campaign_name || '').trim() || await campaignNameFor(adId, version);
      const name = fullName || [firstName, lastName].filter(Boolean).join(' ') || email || phone;
      await ingestCrmLead({ source: 'meta', externalId: lead.id, name, email, phone, comment, bodyText: comment, createdAt: lead.created_time, campaign: campaignName || null, payload: { form_id: lead.form_id || change.value.form_id, ad_id: adId, campaign_name: campaignName, field_data: fields } });
    }
    return json({ ok: true, received: leadEvents.length });
  } catch (error) { return serverError(error, 'crm.meta_webhook'); }
};
