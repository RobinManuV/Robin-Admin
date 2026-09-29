const PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PREVIEW_SESSION_KEY = "robin-local-preview-role";

const previewClient = {
  id: "preview-client-1",
  username: "1842",
  lead_id: "1842",
  nombre: "Lucía",
  apellidos: "Martín",
  email: "lucia.preview@example.com",
  telefono_alumno: "+34 612 345 678",
  application_phase: 4,
  days_in_phase: 6,
  requires_onboarding: false,
  intereses: ["business", "ciencias_sociales"],
};

const previewClients = [
  previewClient,
  { ...previewClient, id: "preview-client-2", username: "1907", lead_id: "1907", nombre: "Carlos", apellidos: "Vega", email: "carlos.preview@example.com", application_phase: 2, days_in_phase: 3 },
  { ...previewClient, id: "preview-client-3", username: "1964", lead_id: "1964", nombre: "Sofía", apellidos: "Ruiz", email: "sofia.preview@example.com", application_phase: 6, days_in_phase: 9 },
];

const previewDocuments = [
  { id: "preview-doc-1", name: "Certificado académico", required: true, status: "required" },
  { id: "preview-doc-2", name: "Documento de identidad", required: true, status: "pending_review", uploaded_at: "2026-09-10T10:00:00Z" },
  { id: "preview-doc-3", name: "Carta de motivación", required: true, status: "validated", uploaded_at: "2026-09-08T10:00:00Z" },
];

const previewCareer = {
  id: "preview-career-1",
  name: "International Business",
  university: "Universidad de Ámsterdam",
  city: "Ámsterdam",
  required_docs: [
    { id: "req-transcript", type: "document", name: "Certificado académico", required: true, deadline: "2026-10-15" },
    { id: "req-motivation", type: "document", name: "Carta de motivación", required: true, deadline: "2026-11-01" },
    { id: "req-application", type: "event", name: "Cierre de la solicitud", required: false, deadline: "2027-01-15" },
  ],
};

const previewBookings = [
  { id: "preview-booking-1", title: "Seguimiento con tu asesor", start_at: "2026-09-22T15:00:00Z", status: "confirmed" },
];

function previewRole() {
  if (import.meta.env?.VITE_ENABLE_LOCAL_PREVIEW !== "1") return null;
  if (typeof window === "undefined" || !PREVIEW_HOSTS.has(window.location.hostname)) return null;
  const requestedRole = new URLSearchParams(window.location.search).get("preview");
  if (requestedRole === "admin" || requestedRole === "client") {
    try { window.sessionStorage.setItem(PREVIEW_SESSION_KEY, requestedRole); } catch (_) {}
    return requestedRole;
  }
  try {
    const storedRole = window.sessionStorage.getItem(PREVIEW_SESSION_KEY);
    return storedRole === "admin" || storedRole === "client" ? storedRole : "admin";
  } catch (_) {
    return "admin";
  }
}

export function isLocalAdminPreview() {
  return previewRole() === "admin";
}

function previewUser(role) {
  if (role === "admin") {
    return { id: "preview-admin", username: "preview-admin", nombre: "Manuel", apellidos: "Admin", email: "admin.preview@example.com", role: "admin", is_application_admin: true, requires_onboarding: false };
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboarding") === "dni") {
    return {
      ...previewClient,
      role: "client",
      requires_onboarding: true,
      origin: "espana",
      application_level: "grado",
      has_eu_id: true,
      dni_completed: false,
      contract_signed: false,
      profile_completed: false,
      pago_completed: false,
    };
  }
  if (params.get("onboarding") === "contract") {
    const requested = params.get("contract") || "general";
    const contracts = {
      general: { tipo: "general", origin: "espana", application_level: "grado", has_eu_id: true },
      general_noes: { tipo: "general", origin: "otros", application_level: "grado", has_eu_id: false },
      delft: { tipo: "delft", origin: "espana", application_level: "grado", has_eu_id: true },
      llegada: { tipo: "llegada", origin: "espana", application_level: "grado", has_eu_id: true },
      mentoria: { tipo: "mentoria", origin: "espana", application_level: "grado", has_eu_id: true },
    };
    const contract = contracts[requested] || contracts.general;
    return {
      ...previewClient,
      ...contract,
      role: "client",
      requires_onboarding: true,
      dni_completed: true,
      contract_signed: false,
      profile_completed: false,
      pago_completed: false,
      dni_numero: contract.has_eu_id === false ? "XK1234567" : "12345678Z",
      direccion: "Calle Ejemplo 10, 28010 Madrid",
      telefono_alumno: "+34 612 345 678",
      num_carreras: 3,
    };
  }
  return { ...previewClient, role: "client" };
}

export async function getLocalPreviewResponse(method, url) {
  const role = previewRole();
  if (!role) return null;

  if (method !== "GET") {
    const error = new Error("Esta acción está desactivada en el preview seguro.");
    error.status = 403;
    throw error;
  }

  const path = url.split("?")[0];
  if (path === "/api/me") return { active: true, data: previewUser(role) };
  if (path === "/api/admin/integration-snapshot") return { active: true, data: {
    admin: previewUser("admin"),
    clients: previewClients,
    payments: [],
    connections: { stripe: false, holded: false, email: false },
    portalUrl: "#",
  } };
  if (path === "/api/admin/users") return { active: true, data: { users: [previewUser("admin")] } };
  if (path === "/api/robin-plan/admin/data") return { active: true, data: {
    users: [], events: [], partners: [], requests: [], discount_codes: [], notifications: [], challenges: [], submissions: [],
  } };
  if (path === "/api/robin-plan/admin/faqs") return { active: true, data: { faqs: [] } };
  if (path === "/api/admin/clients" || path === "/api/admin/clients/all") return { active: true, data: { clients: previewClients } };
  if (path === "/api/admin/dashboard") return { active: true, data: { clients: previewClients, payments: [], documents: previewDocuments, bookings: previewBookings, activity: [], tasks: [], team: [] } };
  if (path === "/api/documents") return { active: true, data: { documents: previewDocuments } };
  if (path === "/api/careers" && url.includes("all=1")) return { active: true, data: { templates: [previewCareer], assigned_template_ids: [previewCareer.id] } };
  if (path === "/api/careers") return { active: true, data: { careers: [previewCareer] } };
  if (path === "/api/payments") return { active: true, data: { user: previewUser("client"), payments: [] } };
  if (path === "/api/bookings") return { active: true, data: { bookings: previewBookings } };
  if (path === "/api/bookings/availability") return { active: true, data: { days: [], advisor: "Equipo Robin", calendar_connected: true, slot_min: 30 } };
  if (path === "/api/faqs") {
    const { default: faqItems } = await import("../../shared/portal-faqs.json");
    return { active: true, data: { faqs: faqItems.map((faq, index) => ({ ...faq, id: `builtin-${index + 1}`, published: true, builtin: true })) } };
  }
  if (path === "/api/notifications" || path === "/api/admin/notifications") return { active: true, data: { notifications: [] } };
  if (path === "/api/chat") {
    const { default: faqItems } = await import("../../shared/portal-faqs.json");
    const citation = faqItems[22];
    return { active: true, data: { ai_paused: false, messages: [
      { id: "preview-chat-user", role: "user", content: "¿Cuánto cuesta la matrícula en Países Bajos?", created_at: "2026-09-14T10:00:00Z" },
      { id: "preview-chat-ai", role: "assistant", content: "Para estudiantes de la Unión Europea se aplica la tasa estatutaria, cuya cifra exacta puede cambiar cada curso.", created_at: "2026-09-14T10:00:05Z", faq_citations: [{ number: 23, question: citation.question, category: citation.category }] },
    ] } };
  }
  if (path === "/api/admin/chat") return { active: true, data: { messages: [] } };
  return { active: true, data: {} };
}
