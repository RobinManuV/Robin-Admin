const { sendEmail } = require('./email');
const { chatCompletion } = require('./anthropic-chat');
const { errorCode } = require('./observability');

// Construye un briefing breve del cliente para el asesor (mismo contexto que el
// asistente IA del panel). Best-effort: si la IA o las consultas fallan, cae al
// historial guardado. Nunca lanza (no debe bloquear la reserva).
async function buildAdvisorBriefing(sb, user, advisorName, log) {
  const uid = user.id;
  let payments = [], documents = [], careers = [];
  try {
    const { data } = await sb.from('payments').select('installment, amount, status').eq('user_id', uid);
    payments = data || [];
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
  try {
    const { data } = await sb.from('documents').select('name, status').eq('user_id', uid);
    documents = data || [];
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
  try {
    const { data: cc } = await sb.from('client_careers').select('career_template_id').eq('user_id', uid);
    const ids = (cc || []).map((r) => r.career_template_id);
    if (ids.length) {
      const { data: ct } = await sb.from('career_templates').select('name, university, city').in('id', ids);
      careers = (ct || []).map((c) => `${c.name} · ${c.university}${c.city ? ' (' + c.city + ')' : ''}`);
    }
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const collected = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const ctx = {
    nombre: `${user.nombre || ''} ${user.apellidos || ''}`.trim(),
    lead_id: user.lead_id,
    tipo: user.tipo || 'general',
    fase: user.application_phase,
    num_carreras: user.num_carreras,
    pago_completado: !!user.pago_completed,
    intereses: user.intereses || null,
    pagos: { total: Math.round(total), cobrado: Math.round(collected), pendiente: Math.round(total - collected) },
    documentos: {
      validados: documents.filter((d) => d.status === 'validated').length,
      pendientes: documents.filter((d) => d.status === 'required').length,
      en_revision: documents.filter((d) => d.status === 'pending_review').length,
    },
    carreras: careers,
    historial: user.historial || '',
  };

  const fallback = user.historial
    ? String(user.historial).slice(0, 1500)
    : 'Sin historial de reuniones previo. Es la primera toma de contacto registrada.';

  try {
    const system = `Eres el asistente de Project Robin (consultoría académica que coloca estudiantes españoles en universidades de Holanda). Genera un BRIEFING BREVE para el asesor ${advisorName} antes de una llamada con su cliente. Usa SOLO los datos del JSON, no inventes. Español, conciso (máximo 5-6 frases o viñetas cortas): situación actual (fase, carreras, documentos, pagos) y qué conviene tratar en la llamada según el historial. Si no hay historial, indícalo.`;
    const { text } = await chatCompletion({
      system,
      messages: [{ role: 'user', content: `Datos del cliente:\n${JSON.stringify(ctx, null, 2)}\n\nEscribe el briefing para el asesor.` }],
      maxTokens: 600,
    });
    return (text && text.trim()) ? text.trim() : fallback;
  } catch (e) {
    if (log) log.warn('degraded', { integration: 'anthropic', error_code: errorCode(e, 'ai_briefing_failed') });
    return fallback;
  }
}

async function sendBookingNotifications({ sb, user, advisor, advisorEmail, joinUrl, startAt, durationMin, fullName, log }) {
  // 3) Emails
  const subject = `${fullName} tiene una llamada con ${advisor}`;
  const startLocal = new Date(startAt).toLocaleString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  });

  const textBody = `${advisor} te está esperando en: ${joinUrl}

Fecha: ${startLocal} (Europe/Madrid)
Duración: ${durationMin} min`;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0e1c45">
      <p>${advisor} te está esperando en:</p>
      <p><a href="${joinUrl}" style="display:inline-block;background:#1B2F6E;color:white;padding:10px 18px;border-radius:8px;text-decoration:none">Entrar a Google Meet</a></p>
      <p style="font-size:13px;color:#555">${joinUrl}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:18px 0">
      <p style="font-size:13px;color:#555">
        <b>Fecha:</b> ${startLocal} (Europe/Madrid)<br>
        <b>Duración:</b> ${durationMin} min
      </p>
    </div>`;

  const emailResults = [];

  // ----- Email al ASESOR (noel/maria/manuel@project-robin.com) con briefing IA + enlace -----
  const briefing = await buildAdvisorBriefing(sb, user, advisor, log);
  const briefingHtml = String(briefing)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const advisorSubject = `Nueva llamada con ${fullName} · ${startLocal}`;
  const advisorText = `${advisor}, tienes una nueva llamada agendada con ${fullName}${user.lead_id ? ' (' + user.lead_id + ')' : ''}.

Enlace Meet: ${joinUrl}
Fecha: ${startLocal} (Europe/Madrid)
Duración: ${durationMin} min

RESUMEN DEL CLIENTE (asistente IA):
${briefing}`;
  const advisorHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0e1c45;max-width:640px">
      <p><b>${advisor}</b>, tienes una nueva llamada agendada con <b>${fullName}</b>${user.lead_id ? ' · ' + user.lead_id : ''}.</p>
      <p><a href="${joinUrl}" style="display:inline-block;background:#1B2F6E;color:white;padding:10px 18px;border-radius:8px;text-decoration:none">Entrar a Google Meet</a></p>
      <p style="font-size:13px;color:#555">${joinUrl}</p>
      <p style="font-size:13px;color:#555"><b>Fecha:</b> ${startLocal} (Europe/Madrid) · <b>Duración:</b> ${durationMin} min</p>
      <hr style="border:none;border-top:1px solid #eee;margin:18px 0">
      <div style="background:#FAF8F0;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#1B2F6E;font-weight:700;margin-bottom:8px">Resumen del cliente · asistente IA</div>
        <div style="font-size:14px;color:#334155">${briefingHtml}</div>
      </div>
    </div>`;
  const advisorEmailRes = await sendEmail({ to: advisorEmail, subject: advisorSubject, text: advisorText, html: advisorHtml, tag: 'booking_advisor_notif' });
  emailResults.push({ to: advisorEmail, ...advisorEmailRes });
  try {
    await sb.from('webhook_log').insert({
      source: 'booking_email',
      payload: { recipient_type: 'advisor', tag: 'booking_advisor_notif' },
      result: advisorEmailRes.sent ? 'ok' : (advisorEmailRes.reason || 'unknown'),
      message: advisorEmailRes.sent ? 'sent' : (advisorEmailRes.reason || 'not_sent'),
    });
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }

  if (user.email) {
    const clientEmailRes = await sendEmail({ to: user.email, subject, text: textBody, html: htmlBody, tag: 'booking_client_notif' });
    emailResults.push({ to: user.email, ...clientEmailRes });
    try {
      await sb.from('webhook_log').insert({
        source: 'booking_email',
        payload: { recipient_type: 'client', tag: 'booking_client_notif' },
        result: clientEmailRes.sent ? 'ok' : (clientEmailRes.reason || 'unknown'),
        message: clientEmailRes.sent ? 'sent' : (clientEmailRes.reason || 'not_sent'),
      });
    } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }
  }
  return emailResults;
}

module.exports = { buildAdvisorBriefing, sendBookingNotifications };
