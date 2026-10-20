// Admin feature module for lead shared; the feature registry connects it to the authenticated shell.
import type { Contact } from "@/types/domain";

export type LeadGroupRow = { name: string; email: string; phone: string; schoolName: string; area: string; leadType: string; lifecycle: string; taskStatus: string; heat: string; source: string; campaign: string; notes: string; owner: string };

export const emptyLeadGroupRow = (): LeadGroupRow => ({ name: "", email: "", phone: "", schoolName: "", area: "", leadType: "", lifecycle: "", taskStatus: "", heat: "50", source: "", campaign: "", notes: "", owner: "" });

export function leadEntryTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function leadDaysWithoutContact(contact: Contact, assigned = true, now = Date.now()) {
  const enteredAt = leadEntryTimestamp(contact.createdAt);
  if (!enteredAt) return null;
  const contactedAt = assigned ? leadEntryTimestamp(contact.contactAt) : 0;
  const end = contactedAt || now;
  return Math.max(0, Math.floor((end - enteredAt) / 86400000));
}

export function formatLeadEntry(value?: string) {
  const timestamp = leadEntryTimestamp(value);
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  }).format(new Date(timestamp)).replace(",", " ·");
}

export function campaignOrOrigin(contact: Contact) {
  if (contact.source === "Meta Ads") {
    return contact.campaign && contact.campaign !== "Pendiente de identificar" ? contact.campaign : "Campaña pendiente";
  }
  if (contact.source === "Página web") return webFormLabel(contact.formName);
  return contact.source || "—";
}

export function webFormLabel(formName?: string) {
  const normalized = String(formName || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    contacto: "Formulario de contacto",
    colegios: "Formulario de colegios",
    newsletter: "Newsletter",
    reserva: "Reserva de consulta",
  };
  if (labels[normalized]) return labels[normalized];
  if (!normalized) return "Formulario web";
  return normalized.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
