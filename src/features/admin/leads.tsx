import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Database, Download, Filter, Flame, GraduationCap, LayoutGrid, List, Mail, PhoneCall, Plus, Search, UserCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage, LeadCategory, LeadContactRole, LostReason } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import { adminDataClient } from "@/services/admin-data";
import type { CrmEmailTemplate, FutureAcademicYear } from "@/services/admin-data";
import { portalClient } from "@/services/portal";
import type { FeatureModuleProps } from './feature-shared';
import { lostReasonLabel, Title, ContactDrawer, contactRoleOptions, contactRoleLabels, lostReasonOptions } from './feature-shared';

export function LeadInbox({ admins, contacts, leadOwners, leadStages, onAssignLead, onDeleteLead, onAddLead, onAddLeads, onSetLeadHeat, onSetLeadContactRole, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [addingLead, setAddingLead] = useState(false);
  const [manualLead, setManualLead] = useState({ name: "", email: "", phone: "", notes: "", owner: "", source: "organic" });
  const [savingLead, setSavingLead] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupRows, setGroupRows] = useState<LeadGroupRow[]>(() => Array.from({ length: 6 }, emptyLeadGroupRow));
  const [savingGroup, setSavingGroup] = useState(false);
  const list = useMemo(() => contacts.filter((contact) => {
    const stage = leadStages[contact.id] || contact.stage || "Por contactar";
    if (stage !== "Por contactar") return false;
    // La bandeja es exclusivamente de entrada: al asignar un responsable, el
    // lead pasa al CRM personal y deja de mostrarse aquí inmediatamente.
    if (leadOwners[contact.id]) return false;
    if (!`${contact.name} ${contact.email} ${contact.phone} ${contact.source} ${contact.campaign} ${contact.formName || ""} ${contact.course || ""} ${contact.country || ""} ${contact.comment || ""}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (sourceFilter !== "all" && contact.source !== sourceFilter) return false;
    if (campaignFilter !== "all" && contact.campaign !== campaignFilter) return false;
    if (courseFilter !== "all" && contact.course !== courseFilter) return false;
    return countryFilter === "all" || (contact.country || "Otros") === countryFilter;
  }).sort((a, b) => leadEntryTimestamp(b.createdAt) - leadEntryTimestamp(a.createdAt) || b.id.localeCompare(a.id)), [contacts, leadOwners, leadStages, query, sourceFilter, campaignFilter, courseFilter, countryFilter]);
  const sources = useMemo(() => [...new Set(contacts.map((contact) => contact.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const campaigns = useMemo(() => [...new Set(contacts.map((contact) => contact.campaign).filter((campaign) => campaign && campaign !== "Pendiente de identificar"))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const courses = useMemo(() => [...new Set(contacts.map((contact) => contact.course?.trim()).filter((course): course is string => Boolean(course)))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })), [contacts]);
  const activeFilters = [sourceFilter, campaignFilter, courseFilter, countryFilter].filter((value) => value !== "all").length;
  async function saveLeadGroup(event: React.FormEvent) {
    event.preventDefault();
    const populated = groupRows.filter((row) => Object.entries(row).some(([key, value]) => key !== "heat" && key !== "taskStatus" && String(value).trim()));
    if (!populated.length) { notify("Añade al menos un lead antes de guardar el grupo"); return; }
    const missingName = populated.find((row) => !row.name.trim());
    if (missingName) { notify(`Completa el nombre del lead en la fila ${groupRows.indexOf(missingName) + 1}`); return; }
    setSavingGroup(true);
    try {
      await onAddLeads(populated.map((row) => ({ name: row.name, email: row.email, phone: row.phone, schoolName: row.schoolName, area: row.area, leadType: row.leadType, lifecycle: row.lifecycle, taskStatus: row.taskStatus, heat: Number.isFinite(Number(row.heat)) ? Number(row.heat) : 50, campaign: row.campaign, notes: row.notes, owner: row.owner, source: row.source || (row.schoolName ? "schools" : "other"), groupName: groupName.trim() })));
      notify(`Grupo guardado: ${populated.length} leads añadidos a la bandeja`);
      setAddingGroup(false); setGroupName(""); setGroupRows(Array.from({ length: 6 }, emptyLeadGroupRow));
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar el grupo de leads"); }
    finally { setSavingGroup(false); }
  }
  function exportLeads() {
    const rows = contacts.filter((contact) => !leadOwners[contact.id] && (leadStages[contact.id] || contact.stage || "Por contactar") !== "Cliente");
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["Nombre", "Email", "Teléfono", "Origen", "Campaña", "Curso", "País", "Interés", "Responsable", "Días sin contactar", "Heat", "Motivo Lost", "Detalle Lost", "Comentario", "Fecha de alta"];
    const body = rows.map((contact) => [contact.name, contact.email, contact.phone, contact.source, contact.campaign, contact.course || "", contact.country || "Otros", contact.interest || "", leadOwners[contact.id] || "Sin asignar", leadDaysWithoutContact(contact, Boolean(leadOwners[contact.id])) ?? "", contact.heat ?? "", lostReasonLabel(contact.lostReason), contact.lostReasonDetail || "", contact.comment || "", contact.createdAt || ""].map(csvCell).join(","));
    const blob = new Blob([`\uFEFF${headers.map(csvCell).join(",")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `leads-robin-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
    notify(`${rows.length} leads exportados a CSV`);
  }
  return (
    <div className="page">
      <Title name="Bandeja de entrada de leads" sub="Asigna cada nuevo lead al administrador que lo gestionará." eyebrow="INICIO · VISTA GLOBAL">
        <Badge variant="outline">{list.length} LEADS</Badge>
      </Title>
      <div className="module-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, email o canal…" /></label>
        <Button variant="outline" onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}</Button>
        <Button variant="outline" onClick={exportLeads}><Download />Exportar CSV</Button>
        <Button variant="outline" onClick={() => setAddingGroup(true)}><Plus />Añadir grupo</Button>
        <Button onClick={() => setAddingLead(true)}><Plus />Añadir lead</Button>
      </div>
      {filtersOpen && <section className="lead-filters panel"><label>Origen<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todos los orígenes</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><label>Curso<select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="all">Todos los cursos</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label><label>País<select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="all">Todos los países</option><option value="España">España</option><option value="Portugal">Portugal</option><option value="Otros">Otros</option></select></label><button type="button" onClick={() => { setSourceFilter("all"); setCampaignFilter("all"); setCourseFilter("all"); setCountryFilter("all"); }}>Limpiar filtros</button></section>}
      <section className="panel inbox-panel">
        <div className="data-table">
          <table>
            <thead><tr><th>Lead</th><th>Entrada</th><th>Campaña / origen</th><th>Curso</th><th>País</th><th>Interés</th><th>Asignar a</th><th>Días sin contactar</th></tr></thead>
            <tbody>
              {list.map((contact) => (
                <tr key={contact.id} className="unassigned-lead" onClick={() => setSelected(contact)}>
                  <td><button type="button" className="lead-name-button" onClick={() => setSelected(contact)}>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<b className={contact.formName === "colegios" ? "school-lead-name" : ""}>{contact.name}</b><small>{contact.email}</small></button></td>
                  <td><time className="lead-entry-time" dateTime={contact.createdAt}>{formatLeadEntry(contact.createdAt)}</time></td>
                  <td><span className="lead-source-readonly">{campaignOrOrigin(contact)}</span>{["Meta Ads", "Página web"].includes(contact.source) && <small className="lead-source-kind">{contact.source}</small>}</td>
                  <td>{contact.course || ""}</td>
                  <td>{contact.country || "Otros"}</td>
                  <td>{contact.interest || ""}</td>
                  <td>
                    <select
                      className="owner-select"
                      value={leadOwners[contact.id] || ""}
                      onChange={(event) => {
                        event.stopPropagation();
                        onAssignLead(contact.id, event.target.value);
                        notify(`${contact.name} asignado a ${event.target.value}`);
                      }}
                    >
                      <option value="">Sin asignar</option>
                      {admins.map((admin) => <option key={admin}>{admin}</option>)}
                    </select>
                  </td>
                  <td><span className="days-without-contact">{leadDaysWithoutContact(contact, Boolean(leadOwners[contact.id])) ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="assignment-note"><UserCheck /> Al asignar un lead, aparecerá inmediatamente en el CRM personal del usuario seleccionado.</p>
      {addingLead && <div className="drawer-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddingLead(false); }}><form className="manual-lead-card" onSubmit={async (event) => { event.preventDefault(); setSavingLead(true); try { await onAddLead(manualLead); notify(`${manualLead.name} añadido correctamente`); setManualLead({ name: "", email: "", phone: "", notes: "", owner: "", source: "organic" }); setAddingLead(false); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el lead"); } finally { setSavingLead(false); } }}><button className="drawer-close" type="button" onClick={() => setAddingLead(false)}>×</button><span>NUEVO LEAD</span><h2>Añadir manualmente</h2><p>El lead quedará en Por contactar.</p><label>Nombre<input required value={manualLead.name} onChange={(event) => setManualLead((lead) => ({ ...lead, name: event.target.value }))} /></label><div className="manual-lead-row"><label>Email<input type="email" value={manualLead.email} onChange={(event) => setManualLead((lead) => ({ ...lead, email: event.target.value }))} /></label><label>Teléfono<input value={manualLead.phone} onChange={(event) => setManualLead((lead) => ({ ...lead, phone: event.target.value }))} /></label></div><label>Origen<select value={manualLead.source} onChange={(event) => setManualLead((lead) => ({ ...lead, source: event.target.value }))}><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="schools">Colegios</option><option value="google_ads">Google Ads</option><option value="tiktok_ads">TikTok Ads</option><option value="email">Email</option><option value="events">Eventos</option><option value="other">Otros</option></select></label><label>Asignar a<select value={manualLead.owner} onChange={(event) => setManualLead((lead) => ({ ...lead, owner: event.target.value }))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></label><label>Notas<textarea value={manualLead.notes} onChange={(event) => setManualLead((lead) => ({ ...lead, notes: event.target.value }))} /></label><div className="manual-lead-actions"><Button type="button" variant="outline" onClick={() => setAddingLead(false)}>Cancelar</Button><Button type="submit" disabled={savingLead}>{savingLead ? "Guardando…" : "Crear lead"}</Button></div></form></div>}
      {addingGroup && <div className="lead-sheet-backdrop"><form className="lead-sheet" onSubmit={saveLeadGroup}>
        <header><div><span>CAPTURA EN GRUPO</span><h2>Añadir grupo de leads</h2><p>Rellena una fila por persona. Los campos corresponden a la ficha CRM de Supabase; las filas vacías se ignoran.</p></div><button type="button" className="drawer-close" aria-label="Cerrar" onClick={() => setAddingGroup(false)}>×</button></header>
        <label className="lead-sheet-group">Nombre del grupo<input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ej. Visita Colegio San José · Madrid" /></label>
        <div className="lead-sheet-scroll"><table><thead><tr><th>Nombre *</th><th>Correo electrónico</th><th>Teléfono</th><th>Centro educativo</th><th>Área</th><th>Tipo</th><th>Ciclo de vida</th><th>Estado de tarea</th><th>Heat</th><th>Origen</th><th>Campaña</th><th>Notas / comentario</th><th>Responsable</th><th></th></tr></thead><tbody>
          {groupRows.map((row, index) => <tr key={index}>
            <td><input aria-label={`Nombre, fila ${index + 1}`} required={Object.entries(row).some(([key, value]) => key !== "heat" && key !== "taskStatus" && String(value).trim())} value={row.name} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder="Nombre del lead" /></td>
            <td><input aria-label="Correo electrónico" type="email" value={row.email} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></td>
            <td><input aria-label="Teléfono" value={row.phone} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} /></td>
            <td><input aria-label="Centro educativo" value={row.schoolName} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, schoolName: event.target.value } : item))} /></td>
            <td><select aria-label="Área" value={row.area} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, area: event.target.value } : item))}><option value="">—</option>{["Concreto", "Psycology", "Engineering", "Health", "International studies", "Business", "chemistry"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Tipo de lead" value={row.leadType} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, leadType: event.target.value } : item))}><option value="">—</option>{["General", "Delft", "Llegada", "Mentoría", "LATAM", "ESPECIAL"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Ciclo de vida" value={row.lifecycle} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, lifecycle: event.target.value } : item))}><option value="">—</option>{["LOST 25-26", "LOST", "26-27", "INSIDE", "28-29", "27-28", "año que viene", "25-26"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Estado de tarea" value={row.taskStatus} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, taskStatus: event.target.value } : item))}><option value="">—</option>{["Sin empezar", "En progreso", "Listo"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><input aria-label="Heat" type="number" min="0" max="100" value={row.heat} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, heat: event.target.value } : item))} /></td>
            <td><select aria-label="Origen" value={row.source} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, source: event.target.value } : item))}><option value="">Auto</option><option value="schools">Colegios</option><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="website">Página web</option><option value="meta">Meta Ads</option><option value="google_ads">Google Ads</option><option value="tiktok_ads">TikTok Ads</option><option value="email">Email</option><option value="events">Eventos</option><option value="other">Otros</option></select></td>
            <td><input aria-label="Campaña" value={row.campaign} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, campaign: event.target.value } : item))} /></td>
            <td><textarea aria-label="Notas o comentario" value={row.notes} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, notes: event.target.value } : item))} /></td>
            <td><select aria-label="Responsable" value={row.owner} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, owner: event.target.value } : item))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></td>
            <td><button className="lead-sheet-remove" type="button" aria-label={`Quitar fila ${index + 1}`} onClick={() => setGroupRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyLeadGroupRow()])}><X /></button></td>
          </tr>)}
        </tbody></table></div>
        <footer><Button type="button" variant="outline" onClick={() => setGroupRows((rows) => [...rows, emptyLeadGroupRow()])}><Plus />Añadir fila</Button><span>{groupRows.filter((row) => row.name.trim()).length} leads listos</span><div><Button type="button" variant="outline" onClick={() => setAddingGroup(false)}>Cancelar</Button><Button type="submit" disabled={savingGroup}>{savingGroup ? "Guardando…" : "Guardar grupo"}</Button></div></footer>
      </form></div>}
      {selected && <ContactDrawer contact={{ ...selected, owner: leadOwners[selected.id] || "Sin asignar", stage: leadStages[selected.id] }} admins={admins} heat={selected.heat || 50} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onOwnerChange={(owner) => { onAssignLead(selected.id, owner); notify(`${selected.name} asignado a ${owner}`); }} onContactRoleChange={(value) => onSetLeadContactRole(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} leadMode />}
    </div>
  );
}

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

export function Crm({ path, currentUser, admins, contacts, leadOwners, onAssignLead, leadStages, onMoveLead, onMoveLeadToFuture, onQualifyLead, onDeleteLead, leadCategories: categories, onCategorizeLead, leadHeat, onSetLeadHeat, onSetLeadContactRole, leadNotes, onSetLeadNotes, leadLostDates, portalSnapshot, portalConnected, onPortalRefresh, notify, isDeveloperAdmin }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [leadView, setLeadView] = useState<"cards" | "table">("cards");
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [exportingClients, setExportingClients] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [lostCategory, setLostCategory] = useState("");
  const [lostHeat, setLostHeat] = useState("0");
  const [lostFrom, setLostFrom] = useState("");
  const [lostTo, setLostTo] = useState("");
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState("");
  const [pendingLostId, setPendingLostId] = useState<string | null>(null);
  const [lostDestination, setLostDestination] = useState<"lost" | "future">("lost");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [futureAcademicYear, setFutureAcademicYear] = useState<FutureAcademicYear | "">("");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");
  const [pendingQualificationId, setPendingQualificationId] = useState<string | null>(null);
  const [qualificationContactRole, setQualificationContactRole] = useState<LeadContactRole | "">("");
  const [qualificationHeat, setQualificationHeat] = useState(50);
  const [qualificationInitialHeat, setQualificationInitialHeat] = useState(50);
  const [qualificationDuration, setQualificationDuration] = useState("");
  const [qualificationNotes, setQualificationNotes] = useState("");
  const [qualifying, setQualifying] = useState(false);
  const [qualificationError, setQualificationError] = useState("");
  const [stageReminderOpen, setStageReminderOpen] = useState(false);
  const [stageReminderClosable, setStageReminderClosable] = useState(false);
  const [stageReminderVersion, setStageReminderVersion] = useState(0);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const owned = useMemo(() => contacts.filter((contact) => (isDeveloperAdmin || leadOwners[contact.id] === currentUser) && `${contact.name} ${contact.email} ${contact.source}`.toLowerCase().includes(query.toLowerCase())), [contacts, currentUser, isDeveloperAdmin, leadOwners, query]);
  const campaigns = useMemo(() => Array.from(new Set(contacts
    .filter((contact) => (isDeveloperAdmin || leadOwners[contact.id] === currentUser) && (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar")
    .map((contact) => leadCampaignLabel(contact.campaign))))
    .sort((a, b) => a.localeCompare(b, "es")), [contacts, currentUser, isDeveloperAdmin, leadOwners, leadStages]);
  const porContactarLeads = owned.filter((contact) => {
    if ((leadStages[contact.id] || contact.stage || "Por contactar") !== "Por contactar") return false;
    if (categoryFilter !== "all" && categories[contact.id] !== categoryFilter) return false;
    const campaign = leadCampaignLabel(contact.campaign);
    return campaignFilter === "all" || campaign === campaignFilter;
  });
  const activeCrmFilters = Number(categoryFilter !== "all") + Number(campaignFilter !== "all");

  useEffect(() => {
    if (!stageReminderOpen) return;
    setStageReminderClosable(false);
    const timer = window.setTimeout(() => setStageReminderClosable(true), 5000);
    return () => window.clearTimeout(timer);
  }, [stageReminderOpen, stageReminderVersion]);

  function actualLeadOwner(id: string) {
    return leadOwners[id] || contacts.find((contact) => contact.id === id)?.owner || (isDeveloperAdmin ? "" : currentUser);
  }

  function openContact(contact: Contact) {
    setSelected({ ...contact, owner: actualLeadOwner(contact.id), category: categories[contact.id] || undefined, heat: leadHeat[contact.id], notes: leadNotes[contact.id] });
  }

  function showStageReminder() {
    setStageReminderOpen(true);
    setStageReminderVersion((version) => version + 1);
  }

  function beginQualification(contact: Contact) {
    const currentHeat = leadHeat[contact.id] ?? contact.heat ?? 50;
    setPendingQualificationId(contact.id);
    setQualificationContactRole(contact.contactRole || "");
    setQualificationHeat(currentHeat);
    setQualificationInitialHeat(currentHeat);
    setQualificationDuration("");
    setQualificationNotes("");
    setQualificationError("");
  }

  async function confirmQualification() {
    const leadId = pendingQualificationId;
    const durationMinutes = Number(qualificationDuration);
    if (!leadId || !qualificationContactRole) return;
    if (qualificationHeat === qualificationInitialHeat) { setQualificationError("Ajusta el heat antes de continuar."); return; }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) { setQualificationError("Introduce la duración de la llamada en minutos."); return; }
    setQualifying(true);
    setQualificationError("");
    try {
      await onQualifyLead(leadId, { contactRole: qualificationContactRole, heat: qualificationHeat, durationMinutes, notes: qualificationNotes.trim() });
      const contact = contacts.find((item) => item.id === leadId);
      setPendingQualificationId(null);
      notify(`${contact?.name || "El lead"} ha pasado a Contactado`);
      showStageReminder();
    } catch (error) {
      setQualificationError(error instanceof Error ? error.message : "No se pudo completar el cambio a Contactado");
    } finally { setQualifying(false); }
  }

  async function exportClientDatabase() {
    setExportingClients(true);
    try {
      const { blob, filename } = await portalClient.downloadClientDatabase();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Base de datos de clientes descargada");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo descargar la base de datos de clientes");
    } finally {
      setExportingClients(false);
    }
  }

  function dropLead(stage: CrmStage) {
    const leadId = draggingId;
    if (!leadId) return;
    setDraggingId(null);
    const contact = contacts.find((item) => item.id === leadId);
    const currentStage = leadStages[leadId] || contact?.stage || "Por contactar";
    if (stage === currentStage) return;
    if (currentStage === "Por contactar" && stage === "Contactado") {
      if (!contact || !categories[leadId]) {
        notify("Selecciona antes el tipo de contrato del lead");
        return;
      }
      beginQualification(contact);
      return;
    }
    if (stage === "Lost") {
      setLostDestination("lost");
      setLostReason("");
      setLostReasonDetail("");
      setFutureAcademicYear("");
      setOutcomeError("");
      setPendingLostId(leadId);
      return;
    }
    if (stage !== "Cliente") {
      onMoveLead(leadId, stage);
      notify(`Lead movido a ${stage}`);
      showStageReminder();
      return;
    }
    const clientType = categories[leadId];
    if (!contact?.email || !clientType) {
      notify("No se puede crear el cliente sin email y tipo de contrato");
      return;
    }
    setSelectedAdvisor("");
    setPendingClientId(leadId);
  }

  async function confirmClientConversion() {
    const leadId = pendingClientId;
    const contact = contacts.find((item) => item.id === leadId);
    const clientType = leadId ? categories[leadId] : "";
    if (!leadId || !contact || !clientType || !selectedAdvisor) return;
    setConvertingId(leadId);
    notify(`Creando la cuenta de ${contact.name} en el portal…`);
    try {
      const result = await integrationClient.convertLead({ leadId, name: contact.name, email: contact.email, advisor: selectedAdvisor, clientType });
      onMoveLead(leadId, "Cliente");
      await onPortalRefresh();
      setPendingClientId(null);
      if (result.result === "exists") notify(`${contact.name} ya existía; ahora su asesor es ${selectedAdvisor}`);
      else if (result.emailSent) notify(`Cuenta creada, asignada a ${selectedAdvisor} y correo de acceso enviado`);
      else notify(`Cuenta creada y asignada a ${selectedAdvisor}; el correo queda pendiente`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo crear la cuenta en el portal");
    } finally { setConvertingId(null); }
  }

  async function confirmLost() {
    const leadId = pendingLostId;
    if (!leadId) return;
    if (lostDestination === "future") {
      if (!futureAcademicYear) return;
      setSavingOutcome(true);
      setOutcomeError("");
      try {
        await onMoveLeadToFuture(leadId, futureAcademicYear);
        setPendingLostId(null);
        notify(`Lead enviado a próximos cursos · ${futureAcademicYear}`);
      } catch (error) {
        setOutcomeError(error instanceof Error ? error.message : "No se pudo mover el lead");
      } finally { setSavingOutcome(false); }
      return;
    }
    if (!lostReason || (lostReason === "other" && !lostReasonDetail.trim())) return;
    onMoveLead(leadId, "Lost", { lostReason, lostReasonDetail: lostReason === "other" ? lostReasonDetail.trim() : "" });
    setPendingLostId(null);
    notify("Lead marcado como perdido con motivo registrado");
  }

  function startDragging(leadId: string) {
    setDraggingId(leadId);
    window.requestAnimationFrame(() => boardWrapRef.current?.scrollTo({ left: boardWrapRef.current.scrollWidth, behavior: "smooth" }));
  }

  const title = path === "/crm/contactados" ? "Pipeline de contactados" : path === "/crm/clientes" ? "Clientes" : path === "/crm/lost" ? "Lost" : "Por contactar";
  return (
    <div className="page">
      <Title name={title} sub={isDeveloperAdmin ? "Acceso global de desarrollo · todos los leads." : `Cartera comercial de ${currentUser}.`} eyebrow="CRM PERSONAL"><Badge variant="outline">{owned.length} REGISTROS</Badge></Title>
      <div className="module-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en mi cartera…" /></label>{path === "/crm" && <><Button variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{activeCrmFilters > 0 && <span className="filter-count">{activeCrmFilters}</span>}</Button><Button variant="outline" aria-pressed={leadView === "table"} onClick={() => setLeadView((view) => view === "cards" ? "table" : "cards")}>{leadView === "cards" ? <List /> : <LayoutGrid />}{leadView === "cards" ? "Vista tabla" : "Vista tarjetas"}</Button><Button className="crm-email-button" variant="outline" onClick={() => setEmailComposerOpen(true)}><Mail />Correo electrónico</Button></>}{isDeveloperAdmin && <a className="ui-button outline" href={`${window.location.pathname.startsWith("/admin") ? "/admin" : ""}/base-datos`}><Database />Base de datos</a>}{path === "/crm/clientes" && <Button variant="outline" disabled={exportingClients} onClick={() => void exportClientDatabase()}><Download />{exportingClients ? "Preparando…" : "Descargar base de datos"}</Button>}</div>

      {path === "/crm" && (
        <>
        {filtersOpen && <section className="lead-filters panel crm-lead-filters"><label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as LeadCategory | "all")}><option value="all">Todas las categorías</option>{leadCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Limpiar filtros</button></section>}
        {leadView === "cards" ? <div className="qualification-grid">
          {porContactarLeads.map((contact) => (
            <article className={`qualification-card ${contact.formName === "colegios" ? "school-lead" : ""}`} key={contact.id}>
              <span className={`lead-age-dot ${leadContactAgeTone(leadDaysWithoutContact(contact))}`} title={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} aria-label={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} />
              <button className="card-main" onClick={() => openContact(contact)}><small className={contact.formName === "colegios" ? "school-lead-label" : ""}>{contact.formName === "colegios" ? "COLEGIOS" : contact.source}</small><h3>{contact.name}</h3><p>{contact.email}</p><span><Flame /> Heat {leadHeat[contact.id]}</span></button>
              <label>Categoría obligatoria<CategoryPicker value={categories[contact.id] || ""} onChange={(category) => onCategorizeLead(contact.id, category)} /></label>
              <Button disabled={!categories[contact.id]} onClick={() => beginQualification(contact)}>Pasar a contactado<ArrowRight /></Button>
            </article>
          ))}
          {porContactarLeads.length === 0 && <div className="empty compact"><UserCheck /><h2>{owned.some((contact) => (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar") ? "No hay resultados con esos filtros" : "No hay leads por contactar"}</h2><p>{activeCrmFilters ? <button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Quitar filtros</button> : `Los nuevos leads asignados a ${currentUser} aparecerán aquí.`}</p></div>}
        </div> : <section className="panel inbox-panel crm-lead-table">
          <div className="data-table">
            <table>
              <thead><tr><th>Lead</th><th>Entrada</th><th>Campaña / origen</th><th>Curso</th><th>Interés</th><th>Días sin contactar</th><th className="crm-age-column">Estado</th></tr></thead>
              <tbody>
                {porContactarLeads.map((contact) => {
                  const daysWithoutContact = leadDaysWithoutContact(contact);
                  return <tr key={contact.id} onClick={() => openContact(contact)}>
                    <td><button type="button" className="lead-name-button" onClick={() => openContact(contact)}>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<b className={contact.formName === "colegios" ? "school-lead-name" : ""}>{contact.name}</b><small>{contact.email}</small></button></td>
                    <td><time className="lead-entry-time" dateTime={contact.createdAt}>{formatLeadEntry(contact.createdAt)}</time></td>
                    <td><span className="lead-source-readonly">{campaignOrOrigin(contact)}</span>{["Meta Ads", "Página web"].includes(contact.source) && <small className="lead-source-kind">{contact.source}</small>}</td>
                    <td>{contact.course || ""}</td>
                    <td>{contact.interest || ""}</td>
                    <td><span className="days-without-contact">{daysWithoutContact ?? "—"}</span></td>
                    <td className="crm-age-column"><span className={`crm-age-dot ${leadContactAgeTone(daysWithoutContact)}`} title={`${daysWithoutContact ?? 0} días sin contactar`} aria-label={`${daysWithoutContact ?? 0} días sin contactar`} /></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {porContactarLeads.length === 0 && <div className="empty compact"><UserCheck /><h2>{owned.some((contact) => (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar") ? "No hay resultados con esos filtros" : "No hay leads por contactar"}</h2><p>{activeCrmFilters ? <button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Quitar filtros</button> : `Los nuevos leads asignados a ${currentUser} aparecerán aquí.`}</p></div>}
        </section>}
        </>
      )}

      {path === "/crm/contactados" && (
        <div className="crm-board-wrap" ref={boardWrapRef}>
          <div className="crm-board show-outcomes">
            {salesStages.map((stage) => (
              <section key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead(stage)}>
                <header><strong>{stage}</strong><span>{owned.filter((contact) => leadStages[contact.id] === stage).length}</span></header>
                {owned.filter((contact) => leadStages[contact.id] === stage).map((contact) => (
                  <button draggable={!convertingId} disabled={convertingId === contact.id} className="pipeline-card" key={contact.id} onDragStart={() => startDragging(contact.id)} onDragEnd={() => setDraggingId(null)} onClick={() => openContact(contact)}>
                    <div><Badge variant="outline">{categories[contact.id] || "Sin categoría"}</Badge>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<span className={`heat-pill heat-${Math.ceil((leadHeat[contact.id] || 0) / 25)}`}><Flame />{leadHeat[contact.id]}</span></div>
                    <h3>{contact.name}</h3><p>{contact.source} · {contact.email}</p><small>{contact.lastContact}</small>
                  </button>
                ))}
              </section>
            ))}
            <aside className={`outcome-dropzones ${draggingId ? "active" : "inactive"}`}><div className="in-zone" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead("Cliente")}><strong>IN</strong><span>{draggingId ? "Suelta para crear el cliente" : "Arrastra aquí para convertir"}</span></div><div className="lost-zone" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead("Lost")}><strong>LOST</strong><span>{draggingId ? "Suelta para marcar la pérdida" : "Arrastra aquí para descartar"}</span></div></aside>
          </div>
          <p className="drag-hint">Arrastra las tarjetas entre columnas o hasta las zonas IN y LOST situadas después de En espera.</p>
        </div>
      )}

      {path === "/crm/clientes" && <div className="personal-leads">{portalConnected && !portalSnapshot ? <div className="empty compact"><GraduationCap /><h2>Cargando clientes…</h2></div> : portalSnapshot ? portalSnapshot.clients.filter((client) => isDeveloperAdmin || client.assigned_to === portalSnapshot.admin.email).map((client) => <a className="lead-card" key={client.id} href={`${portalSnapshot.portalUrl}/portal/`} target="_blank" rel="noreferrer"><small>{client.tipo || "general"}</small><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email}</p><div><span>Fase {client.application_phase || 1}</span><strong>{client.pago_completed ? "Al corriente" : "Onboarding"}</strong></div><small className="client-assignee">Asignado a: {client.assigned_to?.trim() || "Sin asignar"}</small><footer>Abrir portal<ChevronRight /></footer></a>) : owned.filter((contact) => leadStages[contact.id] === "Cliente").map((contact) => <button className="lead-card" key={contact.id} onClick={() => openContact(contact)}><small>{categories[contact.id]}</small><h3>{contact.name}</h3><p>{contact.email}</p><div><span>Agente de venta: {leadOwners[contact.id] || contact.owner || "Sin asignar"}</span><strong>{contact.value.toLocaleString("es-ES")} €</strong></div><footer>Ver portal del cliente<ChevronRight /></footer></button>)}</div>}

      {path === "/crm/lost" && <><div className="lost-filters"><label>Desde<input type="date" value={lostFrom} onChange={(event) => setLostFrom(event.target.value)} /></label><label>Hasta<input type="date" value={lostTo} onChange={(event) => setLostTo(event.target.value)} /></label><label>Categoría<select value={lostCategory} onChange={(event) => setLostCategory(event.target.value)}><option value="">Todas</option>{leadCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Heat mínimo<input type="number" min="0" max="100" value={lostHeat} onChange={(event) => setLostHeat(event.target.value)} /></label></div><div className="data-table panel"><table><thead><tr><th>Lead</th><th>Categoría</th><th>Heat final</th><th>Origen</th><th>Motivo</th><th>Fecha Lost</th></tr></thead><tbody>{owned.filter((contact) => { const lostDate = (leadLostDates[contact.id] || "").slice(0, 10); return leadStages[contact.id] === "Lost" && (!lostCategory || categories[contact.id] === lostCategory) && leadHeat[contact.id] >= Number(lostHeat || 0) && (!lostFrom || lostDate >= lostFrom) && (!lostTo || lostDate <= lostTo); }).map((contact) => <tr key={contact.id} onClick={() => openContact(contact)}><td><b>{contact.name}</b><small>{contact.email}</small></td><td>{categories[contact.id]}</td><td>{leadHeat[contact.id]}</td><td>{contact.source}</td><td>{lostReasonLabel(contact.lostReason)}{contact.lostReasonDetail && <small>{contact.lostReasonDetail}</small>}</td><td>{leadLostDates[contact.id]?.slice(0, 10) || "—"}</td></tr>)}</tbody></table></div></>}

      {selected && <ContactDrawer contact={selected} admins={admins} leadMode heat={leadHeat[selected.id]} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onOwnerChange={(owner) => { onAssignLead(selected.id, owner); notify(`${selected.name} asignado a ${owner}`); }} onContactRoleChange={(value) => onSetLeadContactRole(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} />}
      {emailComposerOpen && path === "/crm" && <EmailComposer contacts={porContactarLeads} notify={notify} onClose={() => setEmailComposerOpen(false)} />}
      {pendingQualificationId && <div className="drawer-wrap outcome-dialog-wrap"><form className="manual-lead-card crm-outcome-card qualification-dialog" onSubmit={(event) => { event.preventDefault(); void confirmQualification(); }}><button className="drawer-close" type="button" disabled={qualifying} onClick={() => setPendingQualificationId(null)}>×</button><span>PASAR A CONTACTADO</span><h2>Completa el primer contacto</h2><p>Antes de continuar debes identificar a la persona, ajustar el heat y registrar la primera llamada.</p><label>Contacto principal<select required autoFocus value={qualificationContactRole} onChange={(event) => setQualificationContactRole(event.target.value as LeadContactRole | "")}><option value="">Seleccionar…</option>{contactRoleOptions.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label><label>Nuevo heat <strong className="qualification-heat-value">{qualificationHeat}</strong><input type="range" min="0" max="100" value={qualificationHeat} onChange={(event) => setQualificationHeat(Number(event.target.value))} /></label><small className={qualificationHeat === qualificationInitialHeat ? "qualification-pending" : "qualification-complete"}>{qualificationHeat === qualificationInitialHeat ? `Debes cambiar el valor actual (${qualificationInitialHeat}).` : `Heat ajustado de ${qualificationInitialHeat} a ${qualificationHeat}.`}</small><label>Duración de la llamada (minutos)<input type="number" min="1" max="1440" step="1" required value={qualificationDuration} onChange={(event) => setQualificationDuration(event.target.value)} placeholder="Ej. 20" /></label><label>Notas de la llamada<textarea maxLength={4000} value={qualificationNotes} onChange={(event) => setQualificationNotes(event.target.value)} placeholder="Opcional" /></label>{qualificationError && <small className="team-note-error" role="alert">{qualificationError}</small>}<div className="manual-lead-actions"><Button type="button" variant="outline" disabled={qualifying} onClick={() => setPendingQualificationId(null)}>Cancelar</Button><Button type="submit" disabled={qualifying || !qualificationContactRole || qualificationHeat === qualificationInitialHeat || !qualificationDuration}>{qualifying ? "Guardando…" : "Guardar y pasar a Contactado"}</Button></div></form></div>}
      {pendingClientId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget && !convertingId) setPendingClientId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); void confirmClientConversion(); }}><button className="drawer-close" type="button" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>×</button><span>PASAR A IN</span><h2>Asignar asesor del cliente</h2><p>El agente de venta será <b>{actualLeadOwner(pendingClientId) || "Sin asignar"}</b>. El asesor elegido será quien reciba al alumno en el Portal del Alumno.</p><label>Asesor<select required autoFocus value={selectedAdvisor} onChange={(event) => setSelectedAdvisor(event.target.value)}><option value="">Seleccionar asesor…</option>{admins.map((admin) => <option key={admin} value={admin}>{admin}</option>)}</select></label><div className="outcome-role-summary"><span>Agente de venta<strong>{actualLeadOwner(pendingClientId) || "Sin asignar"}</strong></span><span>Asesor del cliente<strong>{selectedAdvisor || "Pendiente"}</strong></span></div><div className="manual-lead-actions"><Button type="button" variant="outline" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>Cancelar</Button><Button type="submit" disabled={!selectedAdvisor || !!convertingId}>{convertingId ? "Creando cliente…" : "Crear cliente"}</Button></div></form></div>}
      {pendingLostId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingOutcome) setPendingLostId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); void confirmLost(); }}><button className="drawer-close" type="button" disabled={savingOutcome} onClick={() => setPendingLostId(null)}>×</button><span>RETIRAR DEL PIPELINE</span><h2>{lostDestination === "future" ? "Lead de próximo curso" : "Motivo obligatorio"}</h2><p>{lostDestination === "future" ? "El lead saldrá del CRM activo y se guardará únicamente en la tabla de próximos cursos." : "Selecciona por qué se ha perdido este lead. Este dato quedará guardado para el análisis comercial."}</p><label>Destino<select autoFocus value={lostDestination} onChange={(event) => { const destination = event.target.value as "lost" | "future"; setLostDestination(destination); setOutcomeError(""); }}><option value="lost">Lost definitivo</option><option value="future">Lead de próximo curso</option></select></label>{lostDestination === "lost" ? <><label>Motivo<select required value={lostReason} onChange={(event) => { setLostReason(event.target.value as LostReason | ""); if (event.target.value !== "other") setLostReasonDetail(""); }}><option value="">Seleccionar motivo…</option>{lostReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{lostReason === "other" && <label>Explicación breve<input required maxLength={120} value={lostReasonDetail} onChange={(event) => setLostReasonDetail(event.target.value)} placeholder="Escribe el motivo" /></label>}</> : <label>Curso académico<select required value={futureAcademicYear} onChange={(event) => setFutureAcademicYear(event.target.value as FutureAcademicYear | "")}><option value="">Seleccionar curso…</option><option value="2027-28">2027-28</option><option value="2028-29">2028-29</option></select></label>}{outcomeError && <small className="team-note-error" role="alert">{outcomeError}</small>}<div className="manual-lead-actions"><Button type="button" variant="outline" disabled={savingOutcome} onClick={() => setPendingLostId(null)}>Cancelar</Button><Button type="submit" disabled={savingOutcome || (lostDestination === "lost" ? !lostReason || (lostReason === "other" && !lostReasonDetail.trim()) : !futureAcademicYear)}>{savingOutcome ? "Moviendo…" : lostDestination === "future" ? "Enviar a próximos cursos" : "Marcar como Lost"}</Button></div></form></div>}
      {stageReminderOpen && <div className="crm-stage-reminder" role="alertdialog" aria-modal="true" aria-labelledby="crm-stage-reminder-title"><section><div className="crm-stage-reminder-icon"><PhoneCall /></div><h2 id="crm-stage-reminder-title">¿Has registrado todas las llamadas?</h2><p>¿Has añadido todas las notas?</p>{stageReminderClosable ? <button type="button" aria-label="Cerrar aviso" onClick={() => setStageReminderOpen(false)}><X /></button> : <small>Podrás cerrar este aviso en 5 segundos.</small>}</section></div>}
    </div>
  );
}

export const leadCampaignLabel = (campaign?: string) => {
  const value = campaign?.trim();
  return value && value.toLowerCase() !== "pendiente de identificar" ? value : "Sin campaña identificada";
};

export const leadCategories: LeadCategory[] = ["delft", "Llegada", "Mentoría", "General", "LATAM", "ESPECIAL"];

export function leadContactAgeTone(days: number | null) {
  if (days == null || days < 1) return "neutral";
  if (days >= 3) return "red";
  if (days >= 2) return "orange";
  return "yellow";
}

export function CategoryPicker({ value, onChange }: { value: LeadCategory | ""; onChange: (value: LeadCategory) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={`category-picker ${open ? "open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{value || "Seleccionar…"}</span><ChevronDown /></button>
    {open && <div className="category-options" role="listbox">{leadCategories.map((category) => <button type="button" role="option" aria-selected={value === category} key={category} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>)}</div>}
  </div>;
}

export const salesStages: CrmStage[] = ["Contactado", "Propuesta enviada", "Llamada programada", "Llamada tenida", "En espera"];

export function EmailComposer({ contacts, notify, onClose }: { contacts: Contact[]; notify: (message: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fieldQuery, setFieldQuery] = useState<string | null>(null);
  const [fieldRange, setFieldRange] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [gmailReady, setGmailReady] = useState(false);
  const [gmailReason, setGmailReason] = useState("Comprobando acceso a Gmail…");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceReason, setWorkspaceReason] = useState("Comprobando base de datos…");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const campaigns = useMemo(() => [...new Set(contacts.map((contact) => contact.campaign).filter((campaign) => campaign && campaign !== "—" && campaign !== "Pendiente de identificar"))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const filtered = useMemo(() => contacts.filter((contact) => (campaignFilter === "all" || contact.campaign === campaignFilter) && `${contact.name} ${contact.email} ${contact.phone}`.toLowerCase().includes(query.trim().toLowerCase())), [contacts, campaignFilter, query]);
  const selectedContacts = contacts.filter((contact) => selectedIds.includes(contact.id));
  const mergeKeys = [...new Set([...emailMergeColumnKeys, ...contacts.flatMap((contact) => Object.keys(contact.databaseFields || {}))])];
  const mergeOptions = mergeKeys.map((key) => ({ key, label: emailMergeColumnLabels[key] || key.replace(/_/g, " ") })).filter((item) => fieldQuery == null || `${item.key} ${item.label}`.toLowerCase().includes(fieldQuery.toLowerCase()));

  useEffect(() => {
    let active = true;
    adminDataClient.getCrmEmailWorkspace().then(({ draft, templates: savedTemplates }) => {
      if (!active) return;
      setWorkspaceReady(true);
      setWorkspaceReason("");
      setTemplates(savedTemplates);
      if (draft) { setSubject(draft.subject); setBody(draft.body); setSelectedIds(draft.recipientIds); setCampaignFilter(draft.campaignFilter || "all"); }
    }).catch((error) => { if (active) { setWorkspaceReady(false); setWorkspaceReason(error instanceof Error ? error.message : "No se pudo cargar el espacio de correo."); notify(error instanceof Error ? error.message : "No se pudo cargar el espacio de correo"); } })
      .finally(() => { if (active) setLoading(false); });
    adminDataClient.getCrmGmailStatus().then((status) => {
      if (!active) return;
      setGmailReady(status.ready);
      setGmailReason(status.ready ? `Conectado a Gmail${status.sender ? ` · ${status.sender}` : ""}` : status.reason || "Gmail no está disponible.");
    }).catch((error) => { if (active) { setGmailReady(false); setGmailReason(error instanceof Error ? error.message : "No se pudo comprobar Gmail."); } });
    return () => { active = false; };
  }, []);

  function insertField(key: string) {
    const start = fieldRange?.start ?? bodyRef.current?.selectionStart ?? body.length;
    const end = fieldRange?.end ?? bodyRef.current?.selectionEnd ?? body.length;
    const insertion = `#${key}`;
    setBody((current) => `${current.slice(0, start)}${insertion}${current.slice(end)}`);
    setFieldQuery(null); setFieldRange(null);
    requestAnimationFrame(() => { bodyRef.current?.focus(); bodyRef.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
  }

  function changeBody(value: string, cursor: number) {
    setBody(value);
    const match = value.slice(0, cursor).match(/#([\p{L}\p{N}_-]*)$/u);
    if (match) { setFieldQuery(match[1]); setFieldRange({ start: cursor - match[0].length, end: cursor }); }
    else { setFieldQuery(null); setFieldRange(null); }
  }

  async function saveDraft() {
    setSaving(true);
    try { await adminDataClient.saveCrmEmailDraft({ subject, body, recipientIds: selectedIds, campaignFilter }); notify("Borrador guardado en la base de datos"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar el borrador"); }
    finally { setSaving(false); }
  }

  async function sendEmail() {
    const recipients = selectedContacts.filter((contact) => contact.email);
    if (!gmailReady || !workspaceReady || !recipients.length || !subject.trim() || !body.trim()) return;
    if (!window.confirm(`¿Enviar este correo a ${recipients.length} destinatarios? Cada persona recibirá un mensaje individual.`)) return;
    setSending(true);
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    try {
      const batches = Array.from({ length: Math.ceil(recipients.length / 10) }, (_, index) => recipients.slice(index * 10, (index + 1) * 10));
      for (let index = 0; index < batches.length; index += 1) {
        setSendProgress(`Enviando lote ${index + 1} de ${batches.length}…`);
        const result = await adminDataClient.sendCrmEmail({ recipientIds: batches[index].map((contact) => contact.id), subject, body });
        sentCount += result.sent.length;
        skippedCount += result.skipped.length;
        failedCount += result.failed.length;
        if (result.failed.some((item) => /permiso|autorizar|Gmail API/i.test(item.reason))) break;
      }
      if (sentCount) {
        try {
          const matchingTemplate = templates.find((template) => template.subject === subject && template.body === body);
          if (!matchingTemplate) {
            const timestamp = new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
            const saved = await adminDataClient.saveCrmEmailTemplate({ name: (subject.trim() || `Correo enviado ${timestamp}`).slice(0, 120), subject, body });
            setTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          }
        } catch (_) {
          notify(`Enviados: ${sentCount}. No se pudo guardar el correo como plantilla; comprueba la migración de la base de datos.`);
          return;
        }
      }
      notify(`Enviados: ${sentCount}${skippedCount ? ` · omitidos: ${skippedCount}` : ""}${failedCount ? ` · con error: ${failedCount}` : ""}${sentCount ? " · guardado en Plantillas" : ""}`);
    } catch (error) {
      notify(`${error instanceof Error ? error.message : "No se pudo completar el envío"}${sentCount ? ` · correos enviados antes del error: ${sentCount}` : ""}`);
    } finally {
      setSending(false);
      setSendProgress("");
    }
  }

  async function saveTemplate(updateExisting = false) {
    const name = templateName.trim();
    if (!name) { notify("Escribe un nombre para la plantilla"); return; }
    setTemplateBusy(true);
    try {
      const saved = await adminDataClient.saveCrmEmailTemplate({ ...(updateExisting && selectedTemplateId ? { id: selectedTemplateId } : {}), name, subject, body });
      setTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setSelectedTemplateId(saved.id); setTemplateName(saved.name);
      notify(updateExisting ? "Plantilla actualizada" : "Plantilla guardada");
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar la plantilla"); }
    finally { setTemplateBusy(false); }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("¿Eliminar esta plantilla?")) return;
    setTemplateBusy(true);
    try { await adminDataClient.deleteCrmEmailTemplate(id); setTemplates((current) => current.filter((item) => item.id !== id)); if (selectedTemplateId === id) { setSelectedTemplateId(""); setTemplateName(""); } notify("Plantilla eliminada"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo eliminar la plantilla"); }
    finally { setTemplateBusy(false); }
  }

  function loadTemplate(template: CrmEmailTemplate) {
    setSubject(template.subject); setBody(template.body); setTemplateName(template.name); setSelectedTemplateId(template.id); setFieldQuery(null);
  }

  return <div className="email-composer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="email-composer" role="dialog" aria-modal="true" aria-labelledby="email-composer-title">
    <header><div><h2 id="email-composer-title">Correo electrónico</h2><p>{gmailReason}{!workspaceReady && workspaceReason ? ` · ${workspaceReason}` : ""}</p></div><button className="email-composer-close" type="button" aria-label="Cerrar" onClick={onClose}><X /></button></header>
    <section className="email-templates-panel"><div className="email-templates-heading"><div><h3>Plantillas</h3><p>Carga una plantilla para editarla o guárdala para reutilizarla.</p></div><label>Nombre<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Ej. Seguimiento webinar" /></label><Button type="button" variant="outline" disabled={templateBusy} onClick={() => void saveTemplate()}>Guardar como plantilla</Button>{selectedTemplateId && <Button type="button" disabled={templateBusy} onClick={() => void saveTemplate(true)}>Actualizar plantilla</Button>}</div><div className="email-template-list">{templates.map((template) => <article className={`email-template-item ${selectedTemplateId === template.id ? "active" : ""}`} key={template.id}><button type="button" className="email-template-load" onClick={() => loadTemplate(template)}><strong>{template.name}</strong><small>{template.subject || "Sin asunto"}</small></button><button type="button" className="email-template-delete" aria-label={`Eliminar ${template.name}`} disabled={templateBusy} onClick={() => void deleteTemplate(template.id)}><X /></button></article>)}{!templates.length && <span className="email-template-empty">Aún no hay plantillas guardadas.</span>}</div></section>
    <div className="email-composer-grid"><section className="email-recipient-panel"><h3>Destinatarios</h3><div className="email-recipient-controls"><label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, email o teléfono" /></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign}>{campaign}</option>)}</select></label></div><div className="email-recipient-summary"><span>{selectedIds.length} seleccionados · {filtered.length} visibles</span><button type="button" onClick={() => setSelectedIds((current) => [...new Set([...current, ...filtered.map((item) => item.id)])])}>Seleccionar visibles</button><button type="button" onClick={() => setSelectedIds([])}>Limpiar</button></div><div className="email-recipient-list">{loading ? <p className="email-recipient-empty">Cargando…</p> : filtered.map((contact) => <label className="email-recipient-row" key={contact.id}><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, contact.id])] : current.filter((id) => id !== contact.id))} /><span><strong>{contact.name}</strong><small>{contact.email || "Sin correo electrónico"} · {contact.campaign || "Sin campaña"}</small></span></label>)}{!loading && !filtered.length && <p className="email-recipient-empty">No hay destinatarios con esos filtros.</p>}</div></section>
      <section className="email-message-panel"><h3>Mensaje</h3><label className="email-subject">Asunto<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Asunto del correo" /></label><label className="email-subject">Cuerpo<textarea ref={bodyRef} className="email-body-editor" value={body} onChange={(event) => changeBody(event.target.value, event.target.selectionStart)} onKeyDown={(event) => { if (fieldQuery == null || !mergeOptions.length) return; if (event.key === "Escape") setFieldQuery(null); if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insertField(mergeOptions[0].key); } }} placeholder="Escribe el correo. Teclea # para insertar una columna." /></label>{fieldQuery != null && <div className="email-merge-list" role="listbox" aria-label="Columnas de crm_leads">{mergeOptions.map((field) => <button type="button" role="option" key={field.key} onMouseDown={(event) => event.preventDefault()} onClick={() => insertField(field.key)}>#{field.key} · {field.label}</button>)}{!mergeOptions.length && <small>No hay columnas que coincidan.</small>}</div>}<p className="email-merge-hint">Los campos se sustituirán con los datos de cada destinatario al enviar.</p></section></div>
    <footer className="email-composer-footer"><span>{selectedContacts.filter((contact) => contact.email).length} de {selectedContacts.length} destinatarios seleccionados tienen email.{sendProgress && <small className="email-send-progress">{sendProgress}</small>}</span><div><Button type="button" variant="outline" disabled={sending} onClick={onClose}>Cerrar</Button><Button type="button" disabled={!workspaceReady || saving || loading || sending} onClick={() => void saveDraft()}>{saving ? "Guardando…" : "Guardar borrador"}</Button><Button type="button" disabled={!gmailReady || !workspaceReady || !selectedContacts.some((contact) => contact.email) || !subject.trim() || !body.trim() || loading || sending} onClick={() => void sendEmail()}>{sending ? "Enviando…" : "Enviar correo"}</Button></div></footer>
  </section></div>;
}

export const emailMergeColumnKeys = ["id", "notion_page_url", "notion_numeric_id", "name", "email", "phone", "email_uid", "summary", "body_text", "comment", "first_contact_comment", "area", "lead_type", "lifecycle", "task_status", "heat", "contact_at", "chase_at", "meeting_at", "overdue_at", "inside_at", "owner_names", "notion_owner_ids", "rolled_up_owner", "robin", "attended_previous_events", "first_payment_received", "folder_created", "checked", "school_name", "school_notion_urls", "campaign_notion_urls", "canva_presentation_url", "source_formula", "source_payload", "source_created_at", "source_updated_at", "created_at", "updated_at", "crm_stage", "lost_at"];

export const emailMergeColumnLabels: Record<string, string> = { id: "ID", notion_page_url: "URL de Notion", notion_numeric_id: "ID numérico de Notion", name: "Nombre", email: "Correo electrónico", phone: "Teléfono", email_uid: "ID de correo", summary: "Resumen", body_text: "Texto del lead", comment: "Comentario", first_contact_comment: "Comentario de primer contacto", area: "Área", lead_type: "Tipo de lead", lifecycle: "Ciclo de vida", task_status: "Estado de tarea", heat: "Heat", contact_at: "Fecha de contacto", chase_at: "Fecha de seguimiento", meeting_at: "Fecha de reunión", overdue_at: "Fecha de vencimiento", inside_at: "Fecha de entrada", owner_names: "Responsables", notion_owner_ids: "IDs de responsables de Notion", rolled_up_owner: "Responsable agregado", robin: "Robin", attended_previous_events: "Asistió a eventos anteriores", first_payment_received: "Primer pago recibido", folder_created: "Carpeta creada", checked: "Revisado", school_name: "Centro educativo", school_notion_urls: "Enlaces de centros", campaign_notion_urls: "Campaña (base de datos)", canva_presentation_url: "Presentación de Canva", source_formula: "Fórmula de origen", source_payload: "Datos de origen", source_created_at: "Fecha de creación de origen", source_updated_at: "Fecha de actualización de origen", created_at: "Fecha de alta CRM", updated_at: "Última actualización", crm_stage: "Estado CRM", lost_at: "Fecha Lost" };
