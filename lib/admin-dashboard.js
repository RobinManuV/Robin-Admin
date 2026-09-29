const { ADMIN_EMAILS } = require('./admins');
const { hasApplicationAdminRole } = require('./authorization');
const { attachStudentPhones } = require('./student-phone');

function daysBetween(a, b) {
  if (!a) return null;
  const t1 = new Date(a).getTime();
  const t2 = (b ? new Date(b) : new Date()).getTime();
  if (Number.isNaN(t1)) return null;
  return Math.floor((t2 - t1) / 86400000);
}

async function loadAdminDashboard(sb, admin, adminEmail) {
  // --- 2) Clientes asignados ---
  const baseSelect =
    'id, lead_id, username, email, role, requires_onboarding, dni_completed, profile_completed, pago_completed, nombre, apellidos, questionnaire, intereses, assigned_to, application_phase, phase_changed_at, tipo, num_carreras, created_at, updated_at';

  const { data: clientRows, error: clientsError } = await sb
    .from('users')
    .select(baseSelect)
    .eq('assigned_to', adminEmail)
    .order('created_at', { ascending: false });
  if (clientsError) throw clientsError;
  let clients = clientRows || [];

  clients = clients.filter((client) => !hasApplicationAdminRole(client));

  // Añadir métricas derivadas: días en fase
  const clientsWithPhones = await attachStudentPhones(sb, clients);
  const clientsEnriched = clientsWithPhones.map((c) => {
    const phaseStart = c.phase_changed_at || c.updated_at || c.created_at;
    return {
      ...c,
      days_in_phase: daysBetween(phaseStart),
      days_since_created: daysBetween(c.created_at),
      days_since_update: daysBetween(c.updated_at),
    };
  });

  const clientIds = clientsEnriched.map((c) => c.id);

  // --- 3) Payments de esos clientes ---
  let payments = [];
  if (clientIds.length > 0) {
    const { data: p, error: ep } = await sb
      .from('payments')
      .select('id, user_id, installment, amount, currency, status, unlocked_at, paid_at, invoice_number, created_at')
      .in('user_id', clientIds);
    if (ep) console.error('admin-dashboard payments error', ep);
    payments = p || [];
  }

  // --- 4) Documentos: sólo metadata, sin binarios ---
  let documents = [];
  if (clientIds.length > 0) {
    const { data: d, error: ed } = await sb
      .from('documents')
      .select('id, user_id, name, required, status, uploaded_at, validated_at, rejection_reason, source, created_at, career_template_id')
      .in('user_id', clientIds);
    if (ed) console.error('admin-dashboard documents error', ed);
    documents = d || [];
  }

  // --- Reservas Meet ---
  let bookings = [];
  if (clientIds.length > 0) {
    try {
      const { data: bk } = await sb
        .from('bookings')
        .select('id, user_id, admin_email, topic, start_at, duration_min, meet_join_url, meet_code, calendar_event_id, status, created_at, cancelled_at')
        .in('user_id', clientIds)
        .order('start_at', { ascending: true });
      bookings = bk || [];
    } catch (_) { bookings = []; }
  }

  // --- 5) Activity feed (sintetizado a partir de tablas existentes) ---
  // Mezclamos: uploads, validaciones, rechazos, payment unlocks, payment paid, cambios de fase recientes.
  const activity = [];

  documents.forEach((d) => {
    if (d.uploaded_at) {
      activity.push({
        at: d.uploaded_at,
        type: 'document_upload',
        user_id: d.user_id,
        title: 'Documento subido',
        detail: d.name,
      });
    }
    if (d.validated_at && d.status === 'validated') {
      activity.push({
        at: d.validated_at,
        type: 'document_validate',
        user_id: d.user_id,
        title: 'Documento validado',
        detail: d.name,
      });
    }
    if (d.validated_at && d.status === 'rejected') {
      activity.push({
        at: d.validated_at,
        type: 'document_reject',
        user_id: d.user_id,
        title: 'Documento rechazado',
        detail: d.name + (d.rejection_reason ? ' · ' + d.rejection_reason : ''),
      });
    }
  });

  payments.forEach((p) => {
    if (p.paid_at) {
      activity.push({
        at: p.paid_at,
        type: 'payment_paid',
        user_id: p.user_id,
        title: 'Pago recibido',
        detail: `Cuota ${p.installment} · ${Number(p.amount).toFixed(2)} ${p.currency || 'EUR'}`,
      });
    }
    if (p.unlocked_at && p.status === 'unlocked') {
      activity.push({
        at: p.unlocked_at,
        type: 'payment_unlock',
        user_id: p.user_id,
        title: 'Cuota desbloqueada',
        detail: `Cuota ${p.installment} · ${Number(p.amount).toFixed(2)} ${p.currency || 'EUR'}`,
      });
    }
  });

  // Cambios de fase
  clientsEnriched.forEach((c) => {
    if (c.phase_changed_at) {
      activity.push({
        at: c.phase_changed_at,
        type: 'phase_change',
        user_id: c.id,
        title: 'Cambio de fase',
        detail: `Fase ${c.application_phase}`,
      });
    }
  });

  // --- 6) Tasks ---
  const { data: taskRows, error: tasksError } = await sb
    .from('admin_tasks')
    .select('id, admin_email, user_id, title, description, due_at, status, created_at, done_at')
    .eq('admin_email', adminEmail)
    .order('created_at', { ascending: false });
  if (tasksError) throw tasksError;
  const tasks = taskRows || [];

  // --- 7) Team (carga de clientes por admin) ---
  let team = [];
  try {
    const adminEmailsList = Array.from(ADMIN_EMAILS);
    const { data: counts, error: ec } = await sb
      .from('users')
      .select('assigned_to')
      .in('assigned_to', adminEmailsList);
    if (!ec && counts) {
      const map = {};
      counts.forEach((r) => {
        const k = (r.assigned_to || '').toLowerCase();
        if (!k) return;
        map[k] = (map[k] || 0) + 1;
      });
      team = adminEmailsList.map((e) => ({
        email: e,
        clientCount: map[e] || 0,
      }));
    }
  } catch (error) { console.warn("[optional_operation_failed]", error && error.message); }

  // Bookings → eventos en activity feed
  bookings.forEach((b) => {
    if (b.created_at) {
      activity.push({
        at: b.created_at,
        type: 'booking_created',
        user_id: b.user_id,
        title: 'Llamada Meet reservada',
        detail: `${new Date(b.start_at).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })} · ${b.duration_min}min`,
      });
    }
  });

  // Sort activity desc
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      nombre: admin.nombre,
      apellidos: admin.apellidos,
    },
    clients: clientsEnriched,
    payments,
    documents,
    activity: activity.slice(0, 40),
    tasks,
    team,
    bookings,
    meta: {
      generated_at: new Date().toISOString(),
    },
  };
}

module.exports = { daysBetween, loadAdminDashboard };
