/**
 * POST /api/admin/assistant
 * Body: { messages: [{role: 'user'|'assistant', content: string}], focus_user_id?: uuid }
 * Returns: { reply: string, model: string, used_context: { client_count, focus? } }
 *
 * Carga los clientes del admin (assigned_to = email_admin) + payments/docs/careers/historial
 * y los pasa como contexto al system prompt. Filtrado por admin SIEMPRE.
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { chatCompletion } = require('../../lib/anthropic-chat');

const PHASES = {
  1: 'Presentación de carreras',
  2: 'Decisión de carreras',
  3: 'Upload de documentos',
  4: 'Waiting decision',
  5: 'Taking decision',
};

function daysAgo(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function safeStr(s, max = 600) {
  if (!s) return '';
  s = String(s);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event) || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const focusUserId = body.focus_user_id || null;
  if (messages.length === 0) return json({ error: 'missing_messages' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb
      .from('users')
      .select('id, email, username, role, nombre, apellidos')
      .eq('id', session.uid)
      .single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    // 1) Clientes del admin
    const { data: clients, error: ec } = await sb
      .from('users')
      .select('id, lead_id, email, nombre, apellidos, application_phase, phase_changed_at, tipo, num_carreras, pago_completed, created_at, updated_at, historial, intereses')
      .eq('assigned_to', adminEmail)
      .order('created_at', { ascending: false });
    if (ec) throw ec;
    const clientIds = (clients || []).map((c) => c.id);

    // 2) Payments
    let payments = [];
    if (clientIds.length) {
      const { data } = await sb
        .from('payments')
        .select('user_id, installment, amount, currency, status, unlocked_at, paid_at')
        .in('user_id', clientIds);
      payments = data || [];
    }

    // 3) Documentos: sólo metadata
    let documents = [];
    if (clientIds.length) {
      const { data } = await sb
        .from('documents')
        .select('user_id, name, required, status, uploaded_at, validated_at')
        .in('user_id', clientIds);
      documents = data || [];
    }

    // 4) Client careers
    let careersRows = [];
    if (clientIds.length) {
      const { data } = await sb
        .from('client_careers')
        .select('user_id, career_template_id')
        .in('user_id', clientIds);
      careersRows = data || [];
    }
    let careerTemplates = [];
    if (careersRows.length) {
      const ids = Array.from(new Set(careersRows.map((r) => r.career_template_id)));
      const { data } = await sb
        .from('career_templates')
        .select('id, name, university, city')
        .in('id', ids);
      careerTemplates = data || [];
    }
    const careerById = Object.fromEntries(careerTemplates.map((c) => [c.id, c]));
    const careersByUser = {};
    careersRows.forEach((r) => {
      const c = careerById[r.career_template_id];
      if (!c) return;
      (careersByUser[r.user_id] = careersByUser[r.user_id] || []).push(c);
    });

    // 5) Construir contexto condensado
    const summarized = (clients || []).map((c) => {
      const myPay = payments.filter((p) => p.user_id === c.id);
      const myDocs = documents.filter((d) => d.user_id === c.id);
      const myCareers = careersByUser[c.id] || [];
      const total = myPay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const collected = myPay.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
      const pending = total - collected;
      const docsValidated = myDocs.filter((d) => d.status === 'validated').length;
      const docsPending = myDocs.filter((d) => d.status === 'required').length;
      const docsReview = myDocs.filter((d) => d.status === 'pending_review').length;
      return {
        id: c.id,
        lead_id: c.lead_id,
        nombre: c.nombre,
        apellidos: c.apellidos,
        email: c.email,
        tipo: c.tipo,
        phase: c.application_phase,
        phase_label: PHASES[c.application_phase] || '—',
        days_in_phase: daysAgo(c.phase_changed_at || c.updated_at || c.created_at),
        days_since_created: daysAgo(c.created_at),
        pago_completed: !!c.pago_completed,
        total: Math.round(total),
        collected: Math.round(collected),
        pending: Math.round(pending),
        installments: myPay.map((p) => ({ n: p.installment, status: p.status, amount: Number(p.amount) })),
        docs: { validated: docsValidated, required: docsPending, in_review: docsReview, total: myDocs.length },
        careers: myCareers.map((cc) => `${cc.name} · ${cc.university}${cc.city ? ' (' + cc.city + ')' : ''}`),
        historial: safeStr(c.historial, 1200),
      };
    });

    let focusBlock = '';
    const focus = focusUserId ? summarized.find((c) => c.id === focusUserId) : null;
    if (focus) {
      focusBlock = `\nCLIENTE EN FOCO (el admin está mirando este alumno ahora mismo):\n${JSON.stringify(focus, null, 2)}\n`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const system = `Eres el asistente del panel admin de Project Robin, una consultoría académica que coloca estudiantes españoles en universidades de Holanda. Hoy es ${today}.

ROL:
- Ayudas al admin "${admin.nombre || admin.email}" a consultar información sobre SUS clientes asignados.
- Respondes con datos concretos del JSON de contexto, sin inventar.
- Si te preguntan algo que NO está en el contexto (por ejemplo, fechas de admisión generales, requisitos de una uni concreta, cursos), respondes con tu conocimiento general indicando claramente "Conocimiento general (no específico de este cliente)".
- Cuando referencies un cliente, usa "Nombre Apellido" (no IDs).
- Respuestas concisas, en español, formato natural. Listas cortas si ayuda.
- Si el admin pregunta por un alumno que NO está en su lista, dilo claramente y NO inventes.

FASES (5 INMUTABLES):
1 Presentación de carreras · 2 Decisión de carreras · 3 Upload de documentos · 4 Waiting decision · 5 Taking decision

CONTEXTO — tus ${summarized.length} clientes asignados (resumido):
${JSON.stringify(summarized, null, 2)}
${focusBlock}`;

    // Truncar mensajes si fueran muy largos (max 12 últimos)
    const trimmed = messages.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000),
    }));

    const { text, raw } = await chatCompletion({
      system,
      messages: trimmed,
      maxTokens: 1024,
    });

    return json({
      reply: text || 'No tengo una respuesta.',
      model: (raw && raw.model) || null,
      used_context: { client_count: summarized.length, focus: focus ? focus.id : null },
    });
  } catch (e) {
    console.error('admin-assistant error', e);
    return serverError(e);
  }
};
