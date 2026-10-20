// Admin feature module for feature shared; the feature registry connects it to the authenticated shell.
import { DeveloperRecordsTable } from "@/components/developer-leads-table";
import { useEffect, useState } from "react";
import { Check, Copy, Flame, MessageCircle, PhoneCall, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Contact, CrmStage, LeadCategory, LeadContactRole, LostReason } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import { adminDataClient } from "@/services/admin-data";
import { FutureAcademicYear, LeadCall, LeadTeamNote } from "@/services/admin-data";
import { PortalAdmin, PortalSnapshot } from "@/services/portal";

export type FeatureModuleProps = {
  path: string;
  notify: (message: string) => void;
  currentUser: string;
  admins: string[];
  contacts: Contact[];
  leadOwners: Record<string, string>;
  onAssignLead: (id: string, owner: string) => void;
  onSetLeadSource: (id: string, source: string) => void;
  onDeleteLead: (id: string) => Promise<void>;
  onDeleteLeads: (ids: string[]) => Promise<void>;
  onAddLead: (input: { name: string; email?: string; phone?: string; notes?: string; owner?: string; source?: string }) => Promise<void>;
  onAddLeads: (inputs: Array<{ name: string; email?: string; phone?: string; schoolName?: string; area?: string; leadType?: string; lifecycle?: string; taskStatus?: string; heat?: number; campaign?: string; notes?: string; owner?: string; groupName?: string }>) => Promise<void>;
  leadStages: Record<string, CrmStage>;
  onMoveLead: (id: string, stage: CrmStage, outcome?: { lostReason?: LostReason; lostReasonDetail?: string }) => void;
  onMoveLeadToFuture: (id: string, academicYear: FutureAcademicYear) => Promise<void>;
  onQualifyLead: (id: string, input: { contactRole: LeadContactRole; heat: number; durationMinutes: number; notes: string }) => Promise<void>;
  leadCategories: Record<string, LeadCategory | "">;
  onCategorizeLead: (id: string, category: LeadCategory | "") => void;
  leadHeat: Record<string, number>;
  onSetLeadHeat: (id: string, heat: number) => void;
  onSetLeadContactRole: (id: string, contactRole: LeadContactRole) => void;
  leadNotes: Record<string, string>;
  onSetLeadNotes: (id: string, notes: string) => void;
  leadLostDates: Record<string, string>;
  portalSnapshot: PortalSnapshot | null;
  portalAdmin: PortalAdmin;
  portalConnected: boolean;
  onPortalRefresh: () => Promise<void>;
  onAddAdmin: (name: string) => void;
  onRemoveAdmin: (name: string) => void;
  isProAdmin: boolean;
  isDeveloperAdmin: boolean;
};

export const lostReasonLabel = (reason?: LostReason) => lostReasonOptions.find((option) => option.value === reason)?.label || "—";

export const lostReasonOptions: Array<{ value: LostReason; label: string }> = [
  { value: "price", label: "Precio" },
  { value: "more_destinations", label: "Están buscando más destinos" },
  { value: "competition", label: "Competencia" },
  { value: "other", label: "Otros" },
];

export function Title({ name, sub, eyebrow = "ROBIN ADMIN PLATFORM", children }: { name: string; sub: string; eyebrow?: string; children?: React.ReactNode }) {
  return <div className="title"><div><span>{eyebrow}</span><h1>{name}</h1><p>{sub}</p></div><div>{children}</div></div>;
}

export function ContactDrawer({ contact, admins = [], onClose, heat = contact.heat || 50, onHeatChange, onOwnerChange, onContactRoleChange, onDeleteLead, leadMode = false }: { contact: Contact; admins?: string[]; onClose: () => void; heat?: number; onHeatChange?: (value: number) => void; onOwnerChange?: (owner: string) => void; onContactRoleChange?: (value: LeadContactRole) => void; onDeleteLead?: (id: string) => Promise<void>; leadMode?: boolean }) {
  const [localHeat, setLocalHeat] = useState(heat);
  const [localContactRole, setLocalContactRole] = useState<LeadContactRole | "">(contact.contactRole || "");
  const [localOwner, setLocalOwner] = useState(contact.owner || "");
  const [teamNotes, setTeamNotes] = useState<LeadTeamNote[]>([]);
  const [teamNoteDraft, setTeamNoteDraft] = useState("");
  const [teamNotesLoading, setTeamNotesLoading] = useState(false);
  const [teamNoteSaving, setTeamNoteSaving] = useState(false);
  const [teamNotesError, setTeamNotesError] = useState("");
  const [leadCalls, setLeadCalls] = useState<LeadCall[]>([]);
  const [leadCallsLoading, setLeadCallsLoading] = useState(false);
  const [leadCallFormOpen, setLeadCallFormOpen] = useState(false);
  const [leadCallDuration, setLeadCallDuration] = useState("");
  const [leadCallNotes, setLeadCallNotes] = useState("");
  const [leadCallSaving, setLeadCallSaving] = useState(false);
  const [leadCallError, setLeadCallError] = useState("");
  const [phoneCopyStatus, setPhoneCopyStatus] = useState("");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => { setPhoneCopyStatus(""); setLocalContactRole(contact.contactRole || ""); setLocalOwner(contact.owner || ""); setLocalHeat(heat); }, [contact.id, contact.contactRole, contact.owner, heat]);
  useEffect(() => {
    if (!leadMode) return;
    let active = true;
    setTeamNotes([]);
    setTeamNoteDraft("");
    setTeamNotesError("");
    setTeamNotesLoading(true);
    adminDataClient.listLeadTeamNotes(contact.id)
      .then((items) => { if (active) setTeamNotes(items); })
      .catch((error) => { if (active) setTeamNotesError(error instanceof Error ? error.message : "No se pudieron cargar las notas del equipo"); })
      .finally(() => { if (active) setTeamNotesLoading(false); });
    return () => { active = false; };
  }, [contact.id, leadMode]);
  useEffect(() => {
    if (!leadMode) return;
    let active = true;
    setLeadCalls([]);
    setLeadCallError("");
    setLeadCallFormOpen(false);
    setLeadCallDuration("");
    setLeadCallNotes("");
    setLeadCallsLoading(true);
    adminDataClient.listLeadCalls(contact.id)
      .then((items) => { if (active) setLeadCalls(items); })
      .catch((error) => { if (active) setLeadCallError(error instanceof Error ? error.message : "No se pudieron cargar las llamadas"); })
      .finally(() => { if (active) setLeadCallsLoading(false); });
    return () => { active = false; };
  }, [contact.id, leadMode]);
  async function submitTeamNote(event: React.FormEvent) {
    event.preventDefault();
    const body = teamNoteDraft.trim();
    if (!body) return;
    setTeamNoteSaving(true);
    setTeamNotesError("");
    try {
      const note = await adminDataClient.addLeadTeamNote(contact.id, body);
      setTeamNotes((current) => [...current, note]);
      setTeamNoteDraft("");
    } catch (error) {
      setTeamNotesError(error instanceof Error ? error.message : "No se pudo guardar la nota del equipo");
    } finally { setTeamNoteSaving(false); }
  }
  async function submitLeadCall(event: React.FormEvent) {
    event.preventDefault();
    const durationMinutes = Number(leadCallDuration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setLeadCallError("Introduce una duración entre 1 y 1440 minutos");
      return;
    }
    setLeadCallSaving(true);
    setLeadCallError("");
    try {
      const call = await adminDataClient.addLeadCall(contact.id, durationMinutes, leadCallNotes);
      setLeadCalls((current) => [call, ...current]);
      setLeadCallDuration("");
      setLeadCallNotes("");
      setLeadCallFormOpen(false);
    } catch (error) {
      setLeadCallError(error instanceof Error ? error.message : "No se pudo registrar la llamada");
    } finally { setLeadCallSaving(false); }
  }
  async function deleteLead() {
    if (!onDeleteLead || !window.confirm(`¿Eliminar definitivamente a ${contact.name} del CRM?`)) return;
    setDeleting(true);
    setDeleteError("");
    try { await onDeleteLead(contact.id); onClose(); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "No se pudo eliminar el lead"); }
    finally { setDeleting(false); }
  }
  async function copyLeadPhone() {
    const phone = contact.phone?.trim();
    if (!phone) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API no disponible");
      await navigator.clipboard.writeText(phone);
      setPhoneCopyStatus("Copiado");
    } catch {
      const field = document.createElement("textarea");
      field.value = phone;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      field.remove();
      setPhoneCopyStatus(copied ? "Copiado" : "No se pudo copiar");
    }
  }
  async function sendMessage() {
    if (!message.trim()) return;
    setSending(true);
    setMessageStatus("");
    try {
      await integrationClient.sendWhatsApp(contact.phone, message.trim());
      setMessage("");
      setMessageStatus("Mensaje enviado");
    } catch (error) {
      setMessageStatus(error instanceof Error ? error.message : "No se pudo enviar el mensaje");
    } finally { setSending(false); }
  }
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>×</button>
        <span>{leadMode ? "FICHA DEL LEAD" : "PERFIL DEL ALUMNO"}</span><h2>{contact.name}</h2><p>{contact.email} · {contact.phone}</p>
        <div className="detail-kpis"><article><small>{leadMode ? "Tipo" : "Progreso"}</small><strong>{leadMode ? contact.category || "—" : `${contact.probability}%`}</strong></article><article><small>Responsable</small><strong>{localOwner || "Sin asignar"}</strong></article></div>
        {!leadMode && <section className="whatsapp-detail"><h3><MessageCircle /> WhatsApp</h3><p>{contact.phone}</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un mensaje…" /><Button variant="outline" onClick={sendMessage} disabled={sending || !message.trim()}>{sending ? "Enviando…" : "Enviar por WhatsApp"}</Button>{messageStatus && <small>{messageStatus}</small>}</section>}
        {leadMode && <section className="lead-information"><h3>Información del lead</h3><dl><div><dt>ID</dt><dd>{contact.displayId || "—"}</dd></div><div><dt>Correo electrónico</dt><dd>{contact.email || "—"}</dd></div><div><dt>Teléfono</dt><dd className="lead-phone-value"><span>{contact.phone || "—"}</span><Button type="button" size="sm" variant="outline" aria-label={`Copiar teléfono ${contact.phone || ""}`} title="Copiar teléfono" onClick={() => void copyLeadPhone()} disabled={!contact.phone}>{phoneCopyStatus === "Copiado" ? <Check /> : <Copy />}{phoneCopyStatus || "Copiar"}</Button></dd></div><div><dt>Contacto principal</dt><dd><select className="lead-contact-role" value={localContactRole} onChange={(event) => { const value = event.target.value as LeadContactRole; setLocalContactRole(value); if (value) onContactRoleChange?.(value); }}><option value="">Sin indicar</option>{contactRoleOptions.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></dd></div><div><dt>Origen</dt><dd>{contact.source || "—"}</dd></div><div><dt>Campaña</dt><dd>{contact.campaign && contact.campaign !== "Pendiente de identificar" ? contact.campaign : "Sin identificar"}</dd></div><div><dt>Curso</dt><dd>{contact.course || "—"}</dd></div><div><dt>Interés</dt><dd>{contact.interest || "—"}</dd></div><div><dt>Estado</dt><dd>{contact.stage || "Por contactar"}</dd></div>{contact.stage === "Lost" && <><div><dt>Motivo Lost</dt><dd>{lostReasonLabel(contact.lostReason)}</dd></div>{contact.lostReasonDetail && <div><dt>Detalle</dt><dd>{contact.lostReasonDetail}</dd></div>}</>}<div><dt>Agente de venta</dt><dd><select className="owner-select lead-owner-select" value={localOwner} onChange={(event) => { const owner = event.target.value; setLocalOwner(owner); if (owner) onOwnerChange?.(owner); }}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin} value={admin}>{admin}</option>)}</select></dd></div><div><dt>Fecha de alta</dt><dd>{contact.createdAt ? new Date(contact.createdAt).toLocaleDateString("es-ES") : "—"}</dd></div></dl></section>}
        <section className="heat-control"><h3><Flame /> Heat del lead <b>{localHeat}</b></h3><input type="range" min="0" max="100" value={localHeat} onChange={(event) => { const value = Number(event.target.value); setLocalHeat(value); onHeatChange?.(value); }} /><div><span>Frío</span><span>Caliente</span></div></section>
        {leadMode && <section className="lead-calls"><h3><PhoneCall /> Llamadas</h3>{leadCallsLoading && <small>Cargando llamadas…</small>}{!leadCallsLoading && leadCalls.length === 0 && <small>Aún no hay llamadas registradas.</small>}{leadCalls.length > 0 && <div className="lead-call-history">{leadCalls.map((call) => <article key={call.id}><div><strong>{call.durationMinutes} min</strong><time dateTime={call.occurredAt}>{new Date(call.occurredAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</time></div>{call.notes && <p>{call.notes}</p>}<footer>{call.authorName}</footer></article>)}</div>}{leadCallFormOpen && <form className="lead-call-form" onSubmit={submitLeadCall}><label>Duración (minutos)<input type="number" min="1" max="1440" step="1" required value={leadCallDuration} onChange={(event) => setLeadCallDuration(event.target.value)} placeholder="Ej. 20" /></label><label>Notas de la llamada<textarea maxLength={4000} value={leadCallNotes} onChange={(event) => setLeadCallNotes(event.target.value)} placeholder="Opcional" /></label><div><Button type="button" variant="outline" onClick={() => setLeadCallFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={leadCallSaving}>{leadCallSaving ? "Guardando…" : "Registrar"}</Button></div></form>}<Button type="button" variant="outline" className="lead-call-add" onClick={() => setLeadCallFormOpen((open) => !open)}><Plus />{leadCallFormOpen ? "Cerrar" : "Registrar llamada"}</Button>{leadCallError && <small className="team-note-error" role="alert">{leadCallError}</small>}</section>}
        {leadMode && <section className="lead-comment"><h3>Comentario</h3><p>{contact.comment || "Sin comentario"}</p></section>}
        {leadMode && <section className="lead-team-notes"><h3>Nota de equipo</h3>{teamNotesLoading && <small>Cargando notas…</small>}{teamNotes.length > 0 && <div className="lead-team-note-history">{teamNotes.map((note) => <article key={note.id}><p>{note.body}</p><footer><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString("es-ES")}</time><span>{note.authorName}</span></footer></article>)}</div>}<form onSubmit={submitTeamNote}><textarea maxLength={4000} value={teamNoteDraft} onChange={(event) => setTeamNoteDraft(event.target.value)} placeholder="Escribe una nueva nota…" /><Button type="submit" disabled={teamNoteSaving || !teamNoteDraft.trim()}>{teamNoteSaving ? "Enviando…" : "Enviar"}</Button></form>{teamNotesError && <small className="team-note-error" role="alert">{teamNotesError}</small>}</section>}
        {leadMode && onDeleteLead && <section className="lead-delete-section"><Button type="button" variant="outline" className="delete-lead" disabled={deleting} onClick={deleteLead}><Trash2 />{deleting ? "Eliminando…" : "Eliminar lead"}</Button>{deleteError && <small role="alert">{deleteError}</small>}</section>}
        {!leadMode && <><section><h3>Información académica</h3><dl><div><dt>Universidad</dt><dd>{contact.university}</dd></div><div><dt>Curso</dt><dd>{contact.course}</dd></div><div><dt>País</dt><dd>{contact.country}</dd></div></dl></section><section><h3>Próxima acción</h3><p>{contact.nextAction}</p></section></>}
      </aside>
    </div>
  );
}

export const contactRoleLabels: Record<LeadContactRole, string> = { madre: "Madre", padre: "Padre", hijo: "Hijo", hija: "Hija" };

export const contactRoleOptions = Object.keys(contactRoleLabels) as LeadContactRole[];

export function DeveloperDatabasePage() {
  const [kind, setKind] = useState<"leads" | "clients">("leads");
  return <div className="page">
    <Title name="Base de datos" sub="Consulta y edita todos los leads y clientes desde tu perfil de desarrollador." eyebrow="DESARROLLADOR" />
    <div className="developer-records-tabs" role="tablist" aria-label="Base de datos">
      <button type="button" role="tab" aria-selected={kind === "leads"} onClick={() => setKind("leads")}>Leads · crm_leads</button>
      <button type="button" role="tab" aria-selected={kind === "clients"} onClick={() => setKind("clients")}>Clientes · users</button>
    </div>
    <DeveloperRecordsTable key={kind} kind={kind} />
  </div>;
}
