import type { Contact, CrmStage, LeadCategory, LostReason } from "@/types/domain";

function isLocalAdminPreview() {
  if (import.meta.env?.VITE_ENABLE_LOCAL_PREVIEW !== "1"
    || typeof window === "undefined"
    || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return false;
  const requestedRole = new URLSearchParams(window.location.search).get("preview");
  if (requestedRole === "admin") {
    try { window.sessionStorage.setItem("robin-local-preview-role", "admin"); } catch (_) {}
    return true;
  }
  try { return window.sessionStorage.getItem("robin-local-preview-role") !== "client"; } catch (_) { return true; }
}

export type EditableMetricRecord = { id: string; label: string; value: string; detail: string; group?: string };
export type CrmEmailDraft = { subject: string; body: string; recipientIds: string[]; campaignFilter: string };
export type CrmEmailTemplate = { id: string; name: string; subject: string; body: string; updatedAt?: string };
export type LeadTeamNote = { id: string; leadId: string; body: string; authorName: string; createdAt: string };
type LeadPatch = { owner?: string; source?: string; category?: LeadCategory | ""; stage?: CrmStage; heat?: number; notes?: string; lostAt?: string; lostReason?: LostReason | ""; lostReasonDetail?: string };

function statusFor(stage: CrmStage): Contact["status"] {
  if (stage === "Por contactar") return "Nuevo";
  if (stage === "Propuesta enviada") return "Propuesta";
  if (stage === "Llamada programada" || stage === "Llamada tenida") return "Reunión";
  if (stage === "Cliente") return "Cliente";
  return "Contactado";
}

function sourceFor(row: Record<string, any>): string {
  const source = String(row.source_payload?.source || "").trim().toLowerCase();
  if (source === "website") {
    const utmSource = String(row.source_payload?.utm_source || "").trim().toLowerCase();
    return /(^|\W)(meta|facebook|instagram|fb|ig)(\W|$)/.test(utmSource) ? "Meta Ads" : "Página web";
  }
  if (source === "meta") return "Meta Ads";
  if (["organic", "organico"].includes(source)) return "Orgánico";
  if (["organic_social", "organico_rrss", "rrss"].includes(source)) return "Orgánico RRSS";
  if (["referral", "referido", "referidos"].includes(source)) return "Referidos";
  if (["schools", "school", "colegio", "colegios"].includes(source)) return "Colegios";
  if (["manual", "other", "otro", "otros"].includes(source)) return "Otros";
  if (row.campaign_notion_urls?.length) return "Meta Ads";
  return "Sin origen";
}

function normalizedFields(row: Record<string, any>): Record<string, unknown> {
  const raw = row.source_payload?.field_data;
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  return Object.fromEntries(raw.map((field: any) => [field.name, Array.isArray(field.values) ? field.values[0] : field.values]));
}

function fieldValue(fields: Record<string, unknown>, ...patterns: RegExp[]) {
  for (const [key, value] of Object.entries(fields)) {
    const normalized = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (patterns.some((pattern) => pattern.test(normalized)) && value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function databaseFieldValues(row: Record<string, any>): Record<string, string> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? "" : Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)]));
}

function toContact(row: Record<string, any>): Contact {
  const fields = normalizedFields(row);
  const fullName = fieldValue(fields, /^(full_?name|nombre_?(completo|y_?apellidos?)|name|nombre)$/);
  const firstName = fieldValue(fields, /^(first_?name|nombre|nombres)$/);
  const lastName = fieldValue(fields, /^(last_?name|apellido|apellidos)$/);
  const recoveredName = fullName || [firstName, lastName].filter(Boolean).join(" ");
  const storedName = String(row.name || "").trim();
  const placeholderName = !storedName || /^(lead\s+)?sin\s+nombre$/i.test(storedName);
  const name = placeholderName ? recoveredName || row.email || row.phone || "Sin nombre" : storedName;
  const stage = (row.crm_stage || "Por contactar") as CrmStage;
  const category = row.lead_type === "Delft" ? "delft" : row.lead_type;
  const formName = String(row.source_payload?.form_name || row.source_payload?.form || (String(row.comment || "").match(/Formulario:\s*([^\n·]+)/i)?.[1] ?? "")).trim().toLowerCase();
  const formNotes = fieldValue(fields, /(message|mensaje|notes?|notas?|comentario|comments?|details?|detalles?|respuesta|response|consulta)/);
  const payloadValue = (...keys: string[]) => keys.map((key) => row.source_payload?.[key]).find((value) => value != null && String(value).trim());
  const course = String(payloadValue("course", "curso", "academic_course", "school_year", "year_of_study", "grado") || fieldValue(fields, /^(course|curso|academic_?course|school_?year|year_?of_?study|grado)$/) || "").trim();
  const interestValue = payloadValue("interest", "interes", "interests", "intereses", "interested_in") || fieldValue(fields, /^(interest|interes|interests|intereses|interested_?in)$/);
  const interest = Array.isArray(interestValue) ? interestValue.filter(Boolean).join(", ") : String(interestValue || "").trim();
  const remainingFormDetails = Object.entries(fields)
    .filter(([key, value]) => value != null && String(value).trim() && !/(name|nombre|apellido|mail|correo|phone|telefono|movil|course|curso|grado|interest|interes)/i.test(key))
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value).trim()}`)
    .join("\n");
  const storedCampaign = String(row.campaign_notion_urls?.[0] || "").trim();
  const payloadCampaign = String(row.source_payload?.campaign_name || "").trim();
  const isNotionUrl = (value: string) => /^https?:\/\/(?:www\.)?notion\.(?:so|site|com)\//i.test(value);
  const campaign = [payloadCampaign, storedCampaign].find((value) => value && !value.startsWith("meta-ad:") && !isNotionUrl(value)) || "Pendiente de identificar";
  const comment = row.comment || row.body_text || row.summary || formNotes || remainingFormDetails || "";
  return { id: row.id, name, initials: name.split(/\s+/).slice(0, 2).map((part: string) => part[0] || "").join("").toUpperCase(), email: row.email || fieldValue(fields, /^e?mail$/, /^correo/) || "", phone: row.phone || fieldValue(fields, /phone/, /telefono/, /movil/) || "", country: "", university: row.school_name || "", course, interest, comment, contactAt: row.contact_at || undefined, product: "Aplicación", status: statusFor(stage), source: sourceFor(row), campaign, owner: row.owner_names?.[0] || "", probability: Number(row.heat || 0), nextAction: "", lastContact: row.contact_at || "—", value: 0, tags: [], databaseFields: databaseFieldValues(row), formName, category: category as LeadCategory | undefined, heat: Number(row.heat ?? 50), notes: comment, stage, lostAt: row.lost_at || undefined, lostReason: row.source_payload?.lost_reason || undefined, lostReasonDetail: row.source_payload?.lost_reason_detail || undefined, createdAt: row.source_created_at || row.created_at || undefined, clientAt: row.inside_at || undefined };
}

export const adminDataClient = {
  async listLeadTeamNotes(leadId: string): Promise<LeadTeamNote[]> {
    if (isLocalAdminPreview()) return [];
    const response = await fetch(`/api/admin/crm/lead-notes?leadId=${encodeURIComponent(leadId)}`, { credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "No se pudieron cargar las notas del equipo");
    return payload.notes || [];
  },
  async addLeadTeamNote(leadId: string, body: string): Promise<LeadTeamNote> {
    if (isLocalAdminPreview()) return { id: `preview-${Date.now()}`, leadId, body, authorName: "Vista previa", createdAt: new Date().toISOString() };
    const response = await fetch("/api/admin/crm/lead-notes", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId, body }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "No se pudo guardar la nota del equipo");
    return payload.note;
  },
  async listLeads(): Promise<Contact[]> {
    if (isLocalAdminPreview()) return [];
    const response = await fetch("/api/admin/crm/leads", { credentials: "include" });
    if (!response.ok) throw new Error(response.status === 503 ? "Falta configurar la base de datos del CRM" : "No se pudieron cargar los leads");
    const payload = await response.json();
    return (payload.leads || []).map(toContact);
  },
  async updateLead(id: string, patch: LeadPatch) {
    const update: Record<string, unknown> = {};
    if (patch.owner !== undefined) update.owner_names = patch.owner ? [patch.owner] : [];
    if (patch.source !== undefined) update.source = patch.source;
    if (patch.category !== undefined) update.lead_type = patch.category === "delft" ? "Delft" : patch.category || null;
    if (patch.stage !== undefined) update.crm_stage = patch.stage;
    if (patch.heat !== undefined) update.heat = patch.heat;
    if (patch.notes !== undefined) update.comment = patch.notes;
    if (patch.lostAt !== undefined) update.lost_at = patch.lostAt || null;
    if (patch.lostReason !== undefined) update.lost_reason = patch.lostReason || null;
    if (patch.lostReasonDetail !== undefined) update.lost_reason_detail = patch.lostReasonDetail.trim() || null;
    const response = await fetch("/api/admin/crm/leads", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, patch: update }) });
    if (!response.ok) throw new Error("No se pudo actualizar el lead");
    return { ok: true };
  },
  async deleteLead(id: string) {
    const response = await fetch("/api/admin/crm/leads", { method: "DELETE", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error("No se pudo eliminar el lead");
    return { ok: true };
  },
  async deleteLeads(ids: string[]) {
    const response = await fetch("/api/admin/crm/leads", { method: "DELETE", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    if (!response.ok) throw new Error("No se pudieron eliminar los leads seleccionados");
    return { ok: true };
  },
  async createLead(input: { name: string; email?: string; phone?: string; notes?: string; owner?: string; source?: string }): Promise<Contact> {
    const response = await fetch("/api/admin/crm/leads", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === "name_required" ? "El nombre es obligatorio" : "No se pudo crear el lead");
    return toContact(payload.lead);
  },
  async createLeads(inputs: Array<{ name: string; email?: string; phone?: string; schoolName?: string; area?: string; leadType?: string; lifecycle?: string; taskStatus?: string; heat?: number; campaign?: string; notes?: string; owner?: string; groupName?: string }>): Promise<Contact[]> {
    const response = await fetch("/api/admin/crm/leads", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ leads: inputs }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === "name_required" ? "Todas las filas completadas necesitan un nombre" : "No se pudo guardar el grupo de leads");
    return (payload.leads || []).map(toContact);
  },
  async getCrmEmailWorkspace(): Promise<{ draft: CrmEmailDraft | null; templates: CrmEmailTemplate[] }> {
    const response = await fetch("/api/admin/crm/email", { credentials: "include" });
    if (!response.ok) throw new Error("No se pudieron cargar borradores y plantillas de correo");
    return response.json();
  },
  async getCrmGmailStatus(): Promise<{ ready: boolean; reason?: string; sender?: string }> {
    const response = await fetch("/api/admin/crm/email?action=gmail-status", { credentials: "include" });
    if (!response.ok) throw new Error("No se pudo comprobar la conexión con Gmail");
    return response.json();
  },
  async sendCrmEmail(input: { recipientIds: string[]; subject: string; body: string }): Promise<{ sent: Array<{ id: string; email: string; messageId: string }>; skipped: Array<{ id: string; reason: string }>; failed: Array<{ id: string; email: string; reason: string }> }> {
    const response = await fetch("/api/admin/crm/email?action=send", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo enviar el correo");
    return payload;
  },
  async saveCrmEmailDraft(draft: CrmEmailDraft): Promise<void> {
    const response = await fetch("/api/admin/crm/email", { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    if (!response.ok) throw new Error("No se pudo guardar el borrador en la base de datos");
  },
  async saveCrmEmailTemplate(template: Partial<CrmEmailTemplate> & Pick<CrmEmailTemplate, "name" | "subject" | "body">): Promise<CrmEmailTemplate> {
    const response = await fetch("/api/admin/crm/email", { method: template.id ? "PATCH" : "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(template) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar la plantilla");
    return payload.template;
  },
  async deleteCrmEmailTemplate(id: string): Promise<void> {
    const response = await fetch("/api/admin/crm/email", { method: "DELETE", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error("No se pudo eliminar la plantilla");
  },
  subscribe(onChange: () => void) {
    const timer = window.setInterval(onChange, 30_000);
    return () => window.clearInterval(timer);
  },
  listMetrics: async (): Promise<EditableMetricRecord[]> => [],
  replaceMetrics: async () => ({ ok: true }),
};
