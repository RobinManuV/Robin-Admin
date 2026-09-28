import type { Contact, CrmStage, LeadCategory } from "@/types/domain";
import { supabase } from "@/services/supabase";
import { contacts as previewContacts } from "@/data/mock-data";

export type EditableMetricRecord = { id: string; label: string; value: string; detail: string; group?: string };
type LeadPatch = { owner?: string; category?: LeadCategory | ""; stage?: CrmStage; heat?: number; notes?: string; lostAt?: string };

function statusFor(stage: CrmStage): Contact["status"] {
  if (stage === "Por contactar") return "Nuevo";
  if (stage === "Propuesta enviada") return "Propuesta";
  if (stage === "Llamada programada" || stage === "Llamada tenida") return "Reunión";
  if (stage === "Cliente") return "Cliente";
  return "Contactado";
}

function toContact(row: Record<string, any>): Contact {
  const name = row.name || "Sin nombre";
  const stage = (row.crm_stage || "Por contactar") as CrmStage;
  const category = row.lead_type === "Delft" ? "delft" : row.lead_type;
  return { id: row.id, name, initials: name.split(/\s+/).slice(0, 2).map((part: string) => part[0] || "").join("").toUpperCase(), email: row.email || "", phone: row.phone || "", country: "", university: row.school_name || "", course: "", product: "Aplicación", status: statusFor(stage), source: row.campaign_notion_urls?.length ? "Meta Ads" : "Sin origen", campaign: "—", owner: row.owner_names?.[0] || "", probability: Number(row.heat || 0), nextAction: "", lastContact: row.contact_at || "—", value: 0, tags: [], category: category as LeadCategory | undefined, heat: Number(row.heat ?? 50), notes: row.comment || "", stage, lostAt: row.lost_at || undefined, createdAt: row.created_at || undefined };
}

export const adminDataClient = {
  async listLeads(): Promise<Contact[]> {
    if (!supabase) return previewContacts;
    const { data, error } = await supabase.from("crm_leads").select("*").order("notion_numeric_id", { ascending: false });
    if (error) throw error;
    return (data || []).map(toContact);
  },
  async updateLead(id: string, patch: LeadPatch) {
    if (!supabase) return { ok: true };
    const update: Record<string, unknown> = {};
    if (patch.owner !== undefined) update.owner_names = patch.owner ? [patch.owner] : [];
    if (patch.category !== undefined) update.lead_type = patch.category === "delft" ? "Delft" : patch.category || null;
    if (patch.stage !== undefined) update.crm_stage = patch.stage;
    if (patch.heat !== undefined) update.heat = patch.heat;
    if (patch.notes !== undefined) update.comment = patch.notes;
    if (patch.lostAt !== undefined) update.lost_at = patch.lostAt || null;
    const { error } = await supabase.from("crm_leads").update(update).eq("id", id);
    if (error) throw error;
    return { ok: true };
  },
  subscribe(onChange: () => void) {
    if (!supabase) return () => undefined;
    const channel = supabase.channel("crm-leads-live").on("postgres_changes", { event: "*", schema: "public", table: "crm_leads" }, onChange).subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
  listMetrics: async (): Promise<EditableMetricRecord[]> => [],
  replaceMetrics: async () => ({ ok: true }),
};
