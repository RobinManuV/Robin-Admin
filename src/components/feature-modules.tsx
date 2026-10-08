"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  GraduationCap,
  Landmark,
  Mail,
  Megaphone,
  MessageCircle,
  KeyRound,
  Plus,
  PlayCircle,
  Search,
  ShieldCheck,
  StopCircle,
  TrendingUp,
  Trash2,
  UserCheck,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage, LeadCategory, LostReason } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import { adminDataClient } from "@/services/admin-data";
import type { CrmEmailDraft, CrmEmailTemplate, LeadTeamNote } from "@/services/admin-data";
import type { FinanceSnapshot, MetaSnapshot, PaymentAnalytics } from "@/services/integrations";
import { portalClient } from "@/services/portal";
import type { PortalAccessUser, PortalAdmin, PortalClient, PortalSnapshot, SalesTestStatus } from "@/services/portal";
import { RobinStudentsAdmin } from "@/components/robin-students-admin";
import { RobinSubscriptionsAdmin } from "@/components/robin-subscriptions-admin";
import { DashboardLoader } from "@/components/dashboard-loader";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsDateRange, AnalyticsPeriod, FinanceDashboard, FinancePeriod, SalesDashboard } from "@/services/integrations";
import { WebAnalytics } from "@/components/web-analytics";

type FeatureModuleProps = {
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
  leadCategories: Record<string, LeadCategory | "">;
  onCategorizeLead: (id: string, category: LeadCategory | "") => void;
  leadHeat: Record<string, number>;
  onSetLeadHeat: (id: string, heat: number) => void;
  leadNotes: Record<string, string>;
  onSetLeadNotes: (id: string, notes: string) => void;
  leadLostDates: Record<string, string>;
  portalSnapshot: PortalSnapshot | null;
  portalAdmin: PortalAdmin;
  portalConnected: boolean;
  onPortalRefresh: () => Promise<void>;
  onAddAdmin: (name: string) => void;
  onRemoveAdmin: (name: string) => void;
};

export function FeatureModule(props: FeatureModuleProps) {
  const { path } = props;
  if (path === "/bandeja-leads") return <LeadInbox {...props} />;
  if (path === "/alumnos-global" || path.startsWith("/alumnos-global/")) return <GlobalStudents path={path} snapshot={props.portalSnapshot} connected={props.portalConnected} contacts={props.contacts} />;
  if (path === "/analitica-global" || path === "/pagos") return <GlobalAnalytics contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} connected={props.portalConnected} />;
  if (path === "/configuracion") return <Configuration {...props} />;
  if (path === "/alumnos" || path.startsWith("/alumnos/")) return <RobinStudentsAdmin user={props.portalAdmin} />;
  if (path === "/the-robin-plan" || path.startsWith("/the-robin-plan/")) return <RobinSubscriptionsAdmin user={props.portalAdmin} />;
  if (path.startsWith("/crm")) return <Crm {...props} />;
  if (path.startsWith("/analiticas")) return <PersonalAnalytics path={path} currentUser={props.currentUser} contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} />;
  if (path.startsWith("/campanas")) return <Campaigns currentUser={props.currentUser} notify={props.notify} />;
  if (path.startsWith("/web")) return <WebAnalytics notify={props.notify} />;
  return <div className="page"><div className="empty"><AlertTriangle /><h2>Vista no disponible</h2><p>Esta sección ya no forma parte de la nueva navegación.</p></div></div>;
}

function Title({ name, sub, eyebrow = "ROBIN ADMIN PLATFORM", children }: { name: string; sub: string; eyebrow?: string; children?: React.ReactNode }) {
  return <div className="title"><div><span>{eyebrow}</span><h1>{name}</h1><p>{sub}</p></div><div>{children}</div></div>;
}

function leadEntryTimestamp(value?: string) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatLeadEntry(value?: string) {
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

function leadDaysWithoutContact(contact: Contact, assigned = true, now = Date.now()) {
  const enteredAt = leadEntryTimestamp(contact.createdAt);
  if (!enteredAt) return null;
  const contactedAt = assigned ? leadEntryTimestamp(contact.contactAt) : 0;
  const end = contactedAt || now;
  return Math.max(0, Math.floor((end - enteredAt) / 86400000));
}

function leadContactAgeTone(days: number | null) {
  if (days == null || days < 1) return "neutral";
  if (days >= 3) return "red";
  if (days >= 2) return "orange";
  return "yellow";
}

type LeadGroupRow = { name: string; email: string; phone: string; schoolName: string; area: string; leadType: string; lifecycle: string; taskStatus: string; heat: string; source: string; campaign: string; notes: string; owner: string };
const emptyLeadGroupRow = (): LeadGroupRow => ({ name: "", email: "", phone: "", schoolName: "", area: "", leadType: "", lifecycle: "", taskStatus: "", heat: "50", source: "", campaign: "", notes: "", owner: "" });

function LeadInbox({ admins, contacts, leadOwners, leadStages, onAssignLead, onDeleteLead, onAddLead, onAddLeads, onSetLeadHeat, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
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
    if (!`${contact.name} ${contact.email} ${contact.phone} ${contact.source} ${contact.campaign}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (assignment === "assigned" && !leadOwners[contact.id]) return false;
    if (assignment === "unassigned" && leadOwners[contact.id]) return false;
    if (sourceFilter !== "all" && contact.source !== sourceFilter) return false;
    return campaignFilter === "all" || contact.campaign === campaignFilter;
  }).sort((a, b) => leadEntryTimestamp(b.createdAt) - leadEntryTimestamp(a.createdAt) || b.id.localeCompare(a.id)), [contacts, leadOwners, leadStages, query, assignment, sourceFilter, campaignFilter]);
  const sources = useMemo(() => [...new Set(contacts.map((contact) => contact.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const campaigns = useMemo(() => [...new Set(contacts.map((contact) => contact.campaign).filter((campaign) => campaign && campaign !== "Pendiente de identificar"))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
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
    const headers = ["Nombre", "Email", "Teléfono", "Origen", "Campaña", "Curso", "Interés", "Responsable", "Días sin contactar", "Heat", "Motivo Lost", "Detalle Lost", "Comentario", "Fecha de alta"];
    const body = rows.map((contact) => [contact.name, contact.email, contact.phone, contact.source, contact.campaign, contact.course || "", contact.interest || "", leadOwners[contact.id] || "Sin asignar", leadDaysWithoutContact(contact, Boolean(leadOwners[contact.id])) ?? "", contact.heat ?? "", lostReasonLabel(contact.lostReason), contact.lostReasonDetail || "", contact.comment || "", contact.createdAt || ""].map(csvCell).join(","));
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
        <Button variant="outline" onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{(assignment !== "all" || sourceFilter !== "all" || campaignFilter !== "all") && <span className="filter-count">{Number(assignment !== "all") + Number(sourceFilter !== "all") + Number(campaignFilter !== "all")}</span>}</Button>
        <Button variant="outline" onClick={exportLeads}><Download />Exportar CSV</Button>
        <Button variant="outline" onClick={() => setAddingGroup(true)}><Plus />Añadir grupo</Button>
        <Button onClick={() => setAddingLead(true)}><Plus />Añadir lead</Button>
      </div>
      {filtersOpen && <section className="lead-filters panel"><label>Asignación<select value={assignment} onChange={(event) => setAssignment(event.target.value as typeof assignment)}><option value="all">Todos</option><option value="unassigned">Sin asignar</option><option value="assigned">Asignados</option></select></label><label>Origen<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todos los orígenes</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><button type="button" onClick={() => { setAssignment("all"); setSourceFilter("all"); setCampaignFilter("all"); }}>Limpiar filtros</button></section>}
      <section className="panel inbox-panel">
        <div className="data-table">
          <table>
            <thead><tr><th>Lead</th><th>Entrada</th><th>Origen</th><th>Curso</th><th>Interés</th><th>Asignar a</th><th>Días sin contactar</th></tr></thead>
            <tbody>
              {list.map((contact) => (
                <tr key={contact.id} className={!leadOwners[contact.id] ? "unassigned-lead" : ""} onClick={() => setSelected(contact)}>
                  <td><button type="button" className="lead-name-button" onClick={() => setSelected(contact)}>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<b className={contact.formName === "colegios" ? "school-lead-name" : ""}>{contact.name}</b><small>{contact.email}</small></button></td>
                  <td><time className="lead-entry-time" dateTime={contact.createdAt}>{formatLeadEntry(contact.createdAt)}</time></td>
                  <td><span className="lead-source-readonly">{contact.source || "—"}</span></td>
                  <td>{contact.course || ""}</td>
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
      {addingLead && <div className="drawer-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddingLead(false); }}><form className="manual-lead-card" onSubmit={async (event) => { event.preventDefault(); setSavingLead(true); try { await onAddLead(manualLead); notify(`${manualLead.name} añadido correctamente`); setManualLead({ name: "", email: "", phone: "", notes: "", owner: "", source: "organic" }); setAddingLead(false); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el lead"); } finally { setSavingLead(false); } }}><button className="drawer-close" type="button" onClick={() => setAddingLead(false)}>×</button><span>NUEVO LEAD</span><h2>Añadir manualmente</h2><p>El lead quedará en Por contactar.</p><label>Nombre<input required value={manualLead.name} onChange={(event) => setManualLead((lead) => ({ ...lead, name: event.target.value }))} /></label><div className="manual-lead-row"><label>Email<input type="email" value={manualLead.email} onChange={(event) => setManualLead((lead) => ({ ...lead, email: event.target.value }))} /></label><label>Teléfono<input value={manualLead.phone} onChange={(event) => setManualLead((lead) => ({ ...lead, phone: event.target.value }))} /></label></div><label>Origen<select value={manualLead.source} onChange={(event) => setManualLead((lead) => ({ ...lead, source: event.target.value }))}><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="other">Otros</option><option value="schools">Colegios</option></select></label><label>Asignar a<select value={manualLead.owner} onChange={(event) => setManualLead((lead) => ({ ...lead, owner: event.target.value }))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></label><label>Notas<textarea value={manualLead.notes} onChange={(event) => setManualLead((lead) => ({ ...lead, notes: event.target.value }))} /></label><div className="manual-lead-actions"><Button type="button" variant="outline" onClick={() => setAddingLead(false)}>Cancelar</Button><Button type="submit" disabled={savingLead}>{savingLead ? "Guardando…" : "Crear lead"}</Button></div></form></div>}
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
            <td><select aria-label="Origen" value={row.source} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, source: event.target.value } : item))}><option value="">Auto</option><option value="schools">Colegios</option><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="website">Página web</option><option value="meta">Meta Ads</option><option value="other">Otros</option></select></td>
            <td><input aria-label="Campaña" value={row.campaign} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, campaign: event.target.value } : item))} /></td>
            <td><textarea aria-label="Notas o comentario" value={row.notes} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, notes: event.target.value } : item))} /></td>
            <td><select aria-label="Responsable" value={row.owner} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, owner: event.target.value } : item))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></td>
            <td><button className="lead-sheet-remove" type="button" aria-label={`Quitar fila ${index + 1}`} onClick={() => setGroupRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyLeadGroupRow()])}><X /></button></td>
          </tr>)}
        </tbody></table></div>
        <footer><Button type="button" variant="outline" onClick={() => setGroupRows((rows) => [...rows, emptyLeadGroupRow()])}><Plus />Añadir fila</Button><span>{groupRows.filter((row) => row.name.trim()).length} leads listos</span><div><Button type="button" variant="outline" onClick={() => setAddingGroup(false)}>Cancelar</Button><Button type="submit" disabled={savingGroup}>{savingGroup ? "Guardando…" : "Guardar grupo"}</Button></div></footer>
      </form></div>}
      {selected && <ContactDrawer contact={{ ...selected, owner: leadOwners[selected.id] || "Sin asignar", stage: leadStages[selected.id] }} heat={selected.heat || 50} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} leadMode />}
    </div>
  );
}

function GlobalStudents({ path, snapshot, connected, contacts }: { path: string; snapshot: PortalSnapshot | null; connected: boolean; contacts: Contact[] }) {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [personFilter, setPersonFilter] = useState("all");
  const [studentQuery, setStudentQuery] = useState("");
  if (connected && !snapshot) return <div className="page"><Title name="Alumnos" sub="Sincronizando con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL" /><div className="empty compact"><GraduationCap /><h2>Cargando alumnos…</h2></div></div>;
  if (snapshot) {
    const detailId = path.startsWith("/alumnos-global/") ? decodeURIComponent(path.slice("/alumnos-global/".length)) : "";
    const detail = snapshot.clients.find((client) => client.id === detailId);
    if (detailId) return <StudentProfile client={detail} portalUrl={snapshot.portalUrl} />;
    const normalizedPerson = (value?: string) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const visibleClients = snapshot.clients.filter((client) => {
      const matchesPerson = personFilter === "all" || (personFilter === "unassigned" ? !client.assigned_to : normalizedPerson(client.assigned_to).includes(personFilter));
      const haystack = [client.nombre, client.apellidos, client.email, client.telefono_alumno].filter(Boolean).join(" ").toLowerCase();
      return matchesPerson && haystack.includes(studentQuery.trim().toLowerCase());
    });
    return <div className="page"><Title name="Alumnos" sub="Clientes sincronizados con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL"><div className="student-filter"><label>Persona<select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}><option value="all">Todas</option><option value="noel">Noel</option><option value="manuel">Manuel</option><option value="maria">María</option><option value="unassigned">Sin asignar</option></select></label></div><div className="owner-legend"><span className="owner-tone-noel">Noel</span><span className="owner-tone-manuel">Manuel</span><span className="owner-tone-maria">María</span></div><Badge variant="outline">{visibleClients.length} ALUMNOS</Badge></Title><div className="module-toolbar student-search"><label><Search /><input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Buscar por nombre, email o teléfono…" /></label></div><div className="student-grid">{visibleClients.map((client) => <a key={client.id} className={`student-card ${ownerTone(client.assigned_to)}`} href={`/alumnos-global/${encodeURIComponent(client.id)}`} target="_blank" rel="noreferrer"><i>{`${client.nombre?.[0] || ""}${client.apellidos?.[0] || ""}` || "R"}</i><div><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email || "Sin email"}</p><span>{client.tipo || "general"} · Fase {client.application_phase || 1} · {client.assigned_to || "Sin asignar"}</span></div><Badge variant="outline">{client.requires_onboarding ? "Onboarding" : "Activo"}</Badge><ChevronRight /></a>)}</div></div>;
  }
  return (
    <div className="page">
      <Title name="Alumnos" sub="Vista global de alumnos y acceso a su perfil." eyebrow="INICIO · VISTA GLOBAL">
        <Button><Plus />Añadir alumno</Button>
      </Title>
      <div className="student-grid">
        {contacts.map((contact) => (
          <button key={contact.id} className="student-card" onClick={() => setSelected(contact)}>
            <i>{contact.initials}</i>
            <div><h3>{contact.name}</h3><p>{contact.university}</p><span>{contact.course}</span></div>
            <Badge variant="outline">{contact.status}</Badge>
            <ChevronRight />
          </button>
        ))}
      </div>
      {selected && <ContactDrawer contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ownerTone(owner?: string) {
  if (!owner) return "owner-tone-neutral";
  const value = owner.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("noel")) return "owner-tone-noel";
  if (value.includes("manuel")) return "owner-tone-manuel";
  if (value.includes("maria")) return "owner-tone-maria";
  return "owner-tone-neutral";
}

function StudentProfile({ client, portalUrl }: { client?: PortalClient; portalUrl: string }) {
  if (!client) return <div className="page"><div className="empty"><AlertTriangle /><h2>Alumno no encontrado</h2></div></div>;
  const name = [client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email || "Alumno";
  const rows = [["Email", client.email], ["Teléfono", client.telefono_alumno], ["País", client.pais], ["Origen", client.origin], ["Tipo de servicio", client.tipo], ["Nivel de aplicación", client.application_level], ["Asesor asignado", client.assigned_to], ["Fecha de alta", client.created_at ? new Date(client.created_at).toLocaleDateString("es-ES") : "—"]];
  return <div className="page student-profile-page"><Title name={name} sub="Ficha sincronizada del alumno y estado del onboarding." eyebrow="ALUMNOS · FICHA INDIVIDUAL"><a className="portal-link-button" href={`${portalUrl}/portal/`} target="_blank" rel="noreferrer"><ExternalLink />Abrir portal</a></Title><section className="panel student-profile-hero"><i>{`${client.nombre?.[0] || ""}${client.apellidos?.[0] || ""}` || "R"}</i><div><h2>{name}</h2><p>{client.email}</p></div><Badge variant="outline">Fase {client.application_phase || 1}</Badge></section><section className="student-profile-status"><article><small>Onboarding</small><strong>{client.requires_onboarding ? "Pendiente" : "Completado"}</strong></article><article><small>Identidad</small><strong>{client.dni_completed ? "Verificada" : "Pendiente"}</strong></article><article><small>Perfil</small><strong>{client.profile_completed ? "Completado" : "Pendiente"}</strong></article><article><small>Contrato</small><strong>{client.contract_signed ? "Firmado" : "Pendiente"}</strong></article><article><small>Pago</small><strong>{client.pago_completed ? "Completado" : "Pendiente"}</strong></article></section><section className="panel student-profile-info"><h2>Información del alumno</h2><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>{Boolean(client.intereses?.length) && <div className="student-interests"><strong>Intereses</strong><p>{client.intereses?.join(" · ")}</p></div>}</section></div>;
}

function ContactDrawer({ contact, onClose, heat = contact.heat || 50, onHeatChange, onDeleteLead, leadMode = false }: { contact: Contact; onClose: () => void; heat?: number; onHeatChange?: (value: number) => void; onDeleteLead?: (id: string) => Promise<void>; leadMode?: boolean }) {
  const [localHeat, setLocalHeat] = useState(heat);
  const [teamNotes, setTeamNotes] = useState<LeadTeamNote[]>([]);
  const [teamNoteDraft, setTeamNoteDraft] = useState("");
  const [teamNotesLoading, setTeamNotesLoading] = useState(false);
  const [teamNoteSaving, setTeamNoteSaving] = useState(false);
  const [teamNotesError, setTeamNotesError] = useState("");
  const [phoneCopyStatus, setPhoneCopyStatus] = useState("");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => setPhoneCopyStatus(""), [contact.id]);
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
        <div className="detail-kpis"><article><small>{leadMode ? "Tipo" : "Progreso"}</small><strong>{leadMode ? contact.category || "—" : `${contact.probability}%`}</strong></article><article><small>Responsable</small><strong>{contact.owner}</strong></article></div>
        {!leadMode && <section className="whatsapp-detail"><h3><MessageCircle /> WhatsApp</h3><p>{contact.phone}</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un mensaje…" /><Button variant="outline" onClick={sendMessage} disabled={sending || !message.trim()}>{sending ? "Enviando…" : "Enviar por WhatsApp"}</Button>{messageStatus && <small>{messageStatus}</small>}</section>}
        {leadMode && <section className="lead-information"><h3>Información del lead</h3><dl><div><dt>Correo electrónico</dt><dd>{contact.email || "—"}</dd></div><div><dt>Teléfono</dt><dd className="lead-phone-value"><span>{contact.phone || "—"}</span><Button type="button" size="sm" variant="outline" aria-label={`Copiar teléfono ${contact.phone || ""}`} title="Copiar teléfono" onClick={() => void copyLeadPhone()} disabled={!contact.phone}>{phoneCopyStatus === "Copiado" ? <Check /> : <Copy />}{phoneCopyStatus || "Copiar"}</Button></dd></div><div><dt>Origen</dt><dd>{contact.source || "—"}</dd></div><div><dt>Campaña</dt><dd>{contact.campaign && contact.campaign !== "Pendiente de identificar" ? contact.campaign : "Sin identificar"}</dd></div><div><dt>Curso</dt><dd>{contact.course || "—"}</dd></div><div><dt>Interés</dt><dd>{contact.interest || "—"}</dd></div><div><dt>Estado</dt><dd>{contact.stage || "Por contactar"}</dd></div>{contact.stage === "Lost" && <><div><dt>Motivo Lost</dt><dd>{lostReasonLabel(contact.lostReason)}</dd></div>{contact.lostReasonDetail && <div><dt>Detalle</dt><dd>{contact.lostReasonDetail}</dd></div>}</>}<div><dt>Responsable</dt><dd>{contact.owner || "Sin asignar"}</dd></div><div><dt>Fecha de alta</dt><dd>{contact.createdAt ? new Date(contact.createdAt).toLocaleDateString("es-ES") : "—"}</dd></div></dl></section>}
        <section className="heat-control"><h3><Flame /> Heat del lead <b>{localHeat}</b></h3><input type="range" min="0" max="100" value={localHeat} onChange={(event) => { const value = Number(event.target.value); setLocalHeat(value); onHeatChange?.(value); }} /><div><span>Frío</span><span>Caliente</span></div></section>
        {leadMode && <section className="lead-comment"><h3>Comentario</h3><p>{contact.comment || "Sin comentario"}</p></section>}
        {leadMode && <section className="lead-team-notes"><h3>Nota de equipo</h3>{teamNotesLoading && <small>Cargando notas…</small>}{teamNotes.length > 0 && <div className="lead-team-note-history">{teamNotes.map((note) => <article key={note.id}><p>{note.body}</p><footer><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString("es-ES")}</time><span>{note.authorName}</span></footer></article>)}</div>}<form onSubmit={submitTeamNote}><textarea maxLength={4000} value={teamNoteDraft} onChange={(event) => setTeamNoteDraft(event.target.value)} placeholder="Escribe una nueva nota…" /><Button type="submit" disabled={teamNoteSaving || !teamNoteDraft.trim()}>{teamNoteSaving ? "Enviando…" : "Enviar"}</Button></form>{teamNotesError && <small className="team-note-error" role="alert">{teamNotesError}</small>}</section>}
        {leadMode && onDeleteLead && <section className="lead-delete-section"><Button type="button" variant="outline" className="delete-lead" disabled={deleting} onClick={deleteLead}><Trash2 />{deleting ? "Eliminando…" : "Eliminar lead"}</Button>{deleteError && <small role="alert">{deleteError}</small>}</section>}
        {!leadMode && <><section><h3>Información académica</h3><dl><div><dt>Universidad</dt><dd>{contact.university}</dd></div><div><dt>Curso</dt><dd>{contact.course}</dd></div><div><dt>País</dt><dd>{contact.country}</dd></div></dl></section><section><h3>Próxima acción</h3><p>{contact.nextAction}</p></section></>}
      </aside>
    </div>
  );
}

type AnalyticsPreset = "last_month" | "3m" | "ytd" | "custom";
type SelectedAnalyticsRange = AnalyticsDateRange & { preset: AnalyticsPreset };

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftedMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

function analyticsPreset(preset: Exclude<AnalyticsPreset, "custom">, today = new Date()): SelectedAnalyticsRange {
  const to = dateInputValue(today);
  if (preset === "last_month") {
    return {
      from: dateInputValue(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 0)),
      preset,
    };
  }
  if (preset === "3m") return { from: dateInputValue(shiftedMonths(today, -3)), to, preset };
  const fiscalYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return { from: dateInputValue(new Date(fiscalYear, 6, 1)), to, preset };
}

function AnalyticsRangeControl({ value, onChange }: { value: SelectedAnalyticsRange; onChange: (range: SelectedAnalyticsRange) => void }) {
  const presets: Array<{ value: Exclude<AnalyticsPreset, "custom">; label: string }> = [
    { value: "last_month", label: "Mes pasado" },
    { value: "3m", label: "Últimos tres meses" },
    { value: "ytd", label: "YTD" },
  ];
  return <section className="analytics-range-control" aria-label="Periodo de las analíticas generales">
    <div className="analytics-date-fields">
      <label>Desde<input type="date" value={value.from} max={value.to} onChange={(event) => onChange({ ...value, from: event.target.value, preset: "custom" })} /></label>
      <label>Hasta<input type="date" value={value.to} min={value.from} onChange={(event) => onChange({ ...value, to: event.target.value, preset: "custom" })} /></label>
    </div>
    <div className="analytics-range-presets">{presets.map((preset) => <button key={preset.value} type="button" className={value.preset === preset.value ? "active" : ""} aria-pressed={value.preset === preset.value} onClick={() => onChange(analyticsPreset(preset.value))}>{preset.label}</button>)}</div>
  </section>;
}

function GlobalAnalytics({ contacts, leadStages, snapshot, connected }: { contacts: Contact[]; leadStages: Record<string, CrmStage>; snapshot: PortalSnapshot | null; connected: boolean }) {
  const [activeTab, setActiveTab] = useState<"finance" | "sales">("finance");
  const [range, setRange] = useState<SelectedAnalyticsRange>(() => analyticsPreset("ytd"));
  const validRange = Boolean(range.from && range.to && range.from <= range.to);
  return (
    <div className="page">
      <Title name="Analíticas generales" sub="Rendimiento consolidado de Robin." eyebrow="INICIO · VISTA GLOBAL">
        <div className="analytics-tabs" role="tablist" aria-label="Secciones de analíticas generales">
          <button type="button" role="tab" aria-selected={activeTab === "finance"} className={activeTab === "finance" ? "active" : ""} onClick={() => setActiveTab("finance")}>Finance</button>
          <button type="button" role="tab" aria-selected={activeTab === "sales"} className={activeTab === "sales" ? "active" : ""} onClick={() => setActiveTab("sales")}>Ventas</button>
        </div>
      </Title>
      <AnalyticsRangeControl value={range} onChange={setRange} />
      {!validRange && <div className="finance-error compact"><AlertTriangle /><div><strong>Periodo no válido</strong><span>La fecha de inicio debe ser anterior o igual a la fecha de fin.</span></div></div>}
      {validRange && (activeTab === "finance" ? <FinanceOverview selectedPeriod={range} /> : <SalesOverview selectedPeriod={range} />)}
    </div>
  );
}

const FINANCE_PERIODS: Array<{ value: FinancePeriod; label: string }> = [
  { value: "30d", label: "Últimos 30 días" },
  { value: "month", label: "Mes actual" },
  { value: "last_month", label: "Mes pasado" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "365d", label: "Últimos 365 días" },
  { value: "ytd", label: "Year to date" },
];

const GRANULARITY_LABEL = { day: "Por día", week: "Por semana", month: "Por mes" } as const;

function money(value: number | null | undefined, currency = "EUR") {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function plainNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("es-ES");
}

function SourceTag({ children, source }: { children: React.ReactNode; source: "holded" | "portal" | "both" | "meta" }) {
  return <span className={`finance-source ${source}`}>{children}</span>;
}

function ChartHeading({ title, sub, source, granularity, aside }: { title: string; sub: string; source?: "holded" | "portal" | "both"; granularity?: FinanceDashboard["granularity"]; aside?: React.ReactNode }) {
  return <div className="finance-chart-heading"><div><div className="finance-chart-title"><h2>{title}</h2>{source === "both" ? <><SourceTag source="holded">Holded</SourceTag><SourceTag source="portal">Portal</SourceTag></> : source ? <SourceTag source={source}>{source === "holded" ? "Holded" : "Portal"}</SourceTag> : null}{granularity && <span className="finance-granularity">{GRANULARITY_LABEL[granularity]}</span>}</div><p>{sub}</p></div>{aside}</div>;
}

function FinanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="finance-tooltip"><strong>{label}</strong>{payload.map((item: any) => <span key={item.dataKey} style={{ color: item.color }}>{item.name}: {typeof item.value === "number" ? money(item.value) : item.value}</span>)}</div>;
}

function FinanceXAxis({ buckets }: { buckets: FinanceDashboard["buckets"] }) {
  return <XAxis dataKey="label" tickFormatter={(_, index) => buckets[index]?.tick || ""} axisLine={false} tickLine={false} fontSize={10} />;
}

function expenseDiagnosticCopy(data: FinanceDashboard) {
  const diagnostic = data.expenseDiagnostics;
  if (!diagnostic) {
    return data.sources?.holdedAccounting === false
      ? { tone: "unavailable", title: "Gastos de Holded no disponibles", text: "El portal no ha podido leer la contabilidad de gastos. Los importes se muestran como “—”." }
      : null;
  }
  if (diagnostic.status === "ok") return { tone: "ok", title: "Gastos de Holded sincronizados", text: `${diagnostic.classifiedDocuments} facturas de compra clasificadas en el periodo seleccionado.` };
  if (diagnostic.status === "empty") return { tone: "empty", title: "Holded respondió sin gastos", text: "La conexión funciona, pero Holded no devolvió facturas de compra para el periodo seleccionado." };
  if (diagnostic.status === "partial") return { tone: "partial", title: "Hay gastos pendientes de clasificar", text: `Holded devolvió ${diagnostic.documentCount} facturas de compra: ${diagnostic.classifiedDocuments} clasificadas y ${diagnostic.unclassifiedDocuments} sin una cuenta configurada.` };
  if (diagnostic.status === "fallback") return { tone: "fallback", title: "Gastos cargados en modo alternativo", text: "No se pudieron leer las facturas de compra. Se muestran movimientos pagados o asientos; las facturas pendientes podrían no estar incluidas." };
  const missingCredential = diagnostic.code === "holded_analytics_not_configured" || diagnostic.primaryError === "holded_analytics_not_configured";
  return {
    tone: "unavailable",
    title: "Gastos de Holded no disponibles",
    text: missingCredential
      ? "Falta HOLDED_API_KEY en el despliegue de producción que ejecuta este portal."
      : diagnostic.code === "holded_expenses_unclassified"
        ? `Holded devolvió ${diagnostic.documentCount} facturas, pero ninguna utiliza una cuenta de gastos configurada.`
        : `Holded no ha entregado los gastos. Código de diagnóstico: ${diagnostic.code || "holded_accounting_unavailable"}.`,
  };
}

function FinanceOverview({ selectedPeriod }: { selectedPeriod?: AnalyticsPeriod } = {}) {
  const [localPeriod, setLocalPeriod] = useState<FinancePeriod>("ytd");
  const period = selectedPeriod || localPeriod;
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [salesData, setSalesData] = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceLimit, setInvoiceLimit] = useState(5);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setInvoiceLimit(5);
    Promise.allSettled([integrationClient.financeDashboard(period), integrationClient.salesDashboard(period)])
      .then(([financeResult, salesResult]) => {
        if (!active) return;
        if (financeResult.status === "fulfilled") setData(financeResult.value);
        else {
          setData(null);
          setError(financeResult.reason instanceof Error ? financeResult.reason.message : "No se pudieron cargar las finanzas");
        }
        setSalesData(salesResult.status === "fulfilled" ? salesResult.value : null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  if (loading && !data) return <DashboardLoader />;
  if (error && !data) return <div className="finance-error"><AlertTriangle /><div><strong>No se pudieron cargar las finanzas</strong><span>{error}</span></div></div>;
  if (!data) return null;
  const hasAccounting = data.sources?.holdedAccounting !== false;
  const expenseStatus = expenseDiagnosticCopy(data);
  const hasOtherWarnings = data.warnings?.some((warning) => !warning.startsWith("holded_expenses_") && warning !== "holded_accounting_unavailable");
  const purchaseTax = data.expenses.purchaseTax ?? data.expenses.taxes;
  const salesTax = data.expenses.salesTax ?? null;
  const netTax = data.expenses.netTax ?? (salesTax != null && purchaseTax != null ? salesTax - purchaseTax : null);
  const netTaxLabel = netTax != null && netTax < 0 ? "IVA neto a compensar" : "IVA neto a pagar";
  const netTaxValue = netTax != null && netTax < 0 ? Math.abs(netTax) : netTax;
  const kpis = [
    { label: "Ventas", source: "holded" as const, value: money(data.kpis.sales), detail: data.kpis.invoices == null ? "—" : `${data.kpis.invoices} facturas emitidas`, icon: CircleDollarSign },
    { label: "Contratado", source: "portal" as const, value: money(data.kpis.contracted), detail: "Todas las cuotas previstas del plan", icon: FileText, alert: data.kpis.anomaly },
    { label: "Alumnos", source: "portal" as const, value: plainNumber(data.kpis.students), detail: "Contratos firmados en el periodo", icon: GraduationCap },
    { label: "CAC", source: "meta" as const, value: salesData?.sources.meta ? money(salesData.kpis.cac) : "—", detail: "Inversión Meta Ads ÷ nuevos alumnos del Portal", icon: BarChart3 },
  ];
  const cashPoints = data.cash.points.map((point) => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) }));
  const currentCash = cashPoints.at(-1)?.balance ?? null;
  const cutoffPoint = (months: number) => {
    const target = new Date(); target.setMonth(target.getMonth() - months);
    return [...cashPoints].reverse().find((point) => new Date(`${point.date}T12:00:00`) <= target) || null;
  };
  const startYearPoint = cashPoints.find((point) => point.date >= `${new Date().getFullYear()}-01-01`) || null;
  const cashCards = [
    { tag: "−365d", name: "Hace 365 días", point: cashPoints[0] || null },
    { tag: "YTD", name: "Inicio de año", point: startYearPoint },
    { tag: "−3m", name: "Hace 3 meses", point: cutoffPoint(3) },
    { tag: "−1m", name: "Hace 1 mes", point: cutoffPoint(1) },
    { tag: "Hoy", name: "Hoy", point: cashPoints.at(-1) || null, current: true },
  ];
  const cashMarkers = Array.from(new Map(cashCards.filter((card) => card.point).map((card) => [card.point!.date, card])).values());
  const statusLabels: Record<string, string> = { paid: "Pagada", partial: "Pago parcial", pending: "Pendiente", overdue: "Vencida", draft: "Borrador" };

  return <div className="finance-dashboard" role="tabpanel" aria-label="Finance">
    <header className="finance-dashboard-header">
      <div><span>INICIO · FINANZAS</span><h2>Finanzas</h2><p>Ventas, cobros y pagos de Robin · {data.rangeLabel}</p></div>
      {!selectedPeriod && <div className="finance-period"><label htmlFor="finance-period">Periodo</label><select id="finance-period" value={localPeriod} onChange={(event) => setLocalPeriod(event.target.value as FinancePeriod)}>{FINANCE_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Gráficos {GRANULARITY_LABEL[data.granularity].toLowerCase()} · el filtro aplica a todo salvo Caja</small></div>}
    </header>

    {data.kpis.anomaly && <div className="finance-anomaly"><AlertTriangle /><span>{data.period === "ytd" || data.period === "365d" ? <><strong>Diferencia de histórico:</strong> El Portal conserva datos desde agosto, mientras Holded contiene el periodo completo. Por eso Contratado puede quedar por debajo de Ventas.</> : <><strong>Inconsistencia de datos:</strong> Contratado es inferior a Ventas en este periodo. Revisa el cruce entre Portal y Holded.</>}</span></div>}
    {expenseStatus && <div className={`finance-expense-status ${expenseStatus.tone}`}><AlertTriangle /><span><strong>{expenseStatus.title}</strong>{expenseStatus.text}</span></div>}
    {hasOtherWarnings ? <div className="finance-source-warning"><AlertTriangle /><span>Hay otras fuentes temporalmente no disponibles. Sus importes se muestran como “—”.</span></div> : null}

    <section className="finance-kpis">{kpis.map(({ label, source, value, detail, icon: Icon, alert }) => <article key={label} className={alert ? "is-alert" : ""}><i><Icon /></i><div><span>{label}<SourceTag source={source}>{source === "both" ? "Holded + Portal" : source === "holded" ? "Holded" : source === "meta" ? "Meta Ads + Portal" : "Portal"}</SourceTag></span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>

    <div className="finance-two-columns">
      <section className="panel finance-chart"><ChartHeading title="Ventas" sub="Facturas emitidas, con IVA" source="holded" granularity={data.granularity} /><ResponsiveContainer width="100%" height={245}><BarChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip content={<FinanceTooltip />} /><Bar dataKey="sales" name="Ventas" fill="#2f5a8a" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></section>
      <section className="panel finance-chart"><ChartHeading title="Contratado vs cobrado" sub="Acumulado dentro del periodo" source="both" granularity={data.granularity} /><ResponsiveContainer width="100%" height={245}><LineChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip content={<FinanceTooltip />} cursor={{ stroke: "#9aa8b8", strokeDasharray: "3 3" }} /><Line type="monotone" dataKey="cumulativeContracted" name="Contratado" stroke="#c8742a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="cumulativeCollected" name="Cobrado" stroke="#2f5a8a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></section>
    </div>

    <div className="finance-two-columns">
      <section className="panel finance-chart"><ChartHeading title="Pagos: cobrado / pendiente" sub="Facturas emitidas según estado de cobro" source="holded" granularity={data.granularity} aside={<div className="finance-chart-totals"><span>Cobrado<strong>{money(data.collections.collected)}</strong></span><span>Pendiente<strong>{money(data.collections.pending)}</strong></span></div>} /><ResponsiveContainer width="100%" height={230}><BarChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip content={<FinanceTooltip />} /><Bar dataKey="collected" name="Cobrado" stackId="payments" fill="#4a8a6a" /><Bar dataKey="pending" name="Pendiente" stackId="payments" fill="#e0a15c" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></section>
      <section className="panel finance-chart"><ChartHeading title="Clientes nuevos" sub="Contratos firmados" source="portal" granularity={data.granularity} aside={<div className="finance-chart-total"><span>En el periodo</span><strong>{plainNumber(data.kpis.students)}</strong></div>} /><ResponsiveContainer width="100%" height={230}><BarChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip /><Bar dataKey="newClients" name="Alumnos" fill="#c8742a" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></section>
    </div>

    <section className="panel finance-summary">
      <div><h2>Cobros</h2><div className="finance-summary-grid">{[
        ["Ventas", "Holded", money(data.collections.sales)], ["Cobrado", "Holded", money(data.collections.collected)], ["Emitido (con IVA)", "Holded", money(data.collections.emitted)], ["Contratado", "Portal", money(data.collections.contracted)], ["Nº facturas emitidas", "Holded", plainNumber(data.collections.invoices)], ["Pendiente", "Holded", money(data.collections.pending)], ["Factura media", "Holded", money(data.collections.averageInvoice)], ["Ticket medio", "Portal", money(data.collections.averageTicket)],
      ].map(([label, source, value]) => <div key={label}><span>{label}<SourceTag source={source === "Holded" ? "holded" : "portal"}>{source}</SourceTag></span><strong>{value}</strong></div>)}</div></div>
      <i />
      <div><h2>Gastos contabilizados <SourceTag source="holded">Holded</SourceTag></h2><p className="finance-expense-basis">Facturas de compra por fecha de emisión, estén pagadas o pendientes.</p><div className="finance-expenses">{[
        ["Operativos", data.expenses.operational, ""], ["Marketing", data.expenses.marketing, ""], ["Otros", data.expenses.other, ""], ["CAPEX", data.expenses.capex, ""], ["Base de gastos", data.expenses.payments, "total"], ["IVA soportado · compras", purchaseTax, "tax-total"], ["Total compras", data.expenses.total, "grand-total"], ["IVA repercutido · ventas", salesTax, "sales-tax"], [netTaxLabel, netTaxValue, "net-tax"],
      ].map(([label, value, className]) => <div key={String(label)} className={String(className)}><span>{label}</span><strong>{hasAccounting ? money(value as number | null) : "—"}</strong></div>)}</div></div>
    </section>

    <section className="panel finance-chart finance-wide-chart"><ChartHeading title="Cobros vs gastos" sub="Cobros frente al total de compras contabilizadas: base más IVA soportado" source="holded" granularity={data.granularity} />{hasAccounting ? <ResponsiveContainer width="100%" height={260}><LineChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip content={<FinanceTooltip />} cursor={{ stroke: "#9aa8b8", strokeDasharray: "3 3" }} /><Line type="monotone" dataKey="collected" name="Cobros" stroke="#2f5a8a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="expenses" name="Gastos (base + IVA)" stroke="#c8742a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer> : <div className="finance-chart-unavailable">— · {expenseStatus?.text || "Contabilidad de Holded no disponible"}</div>}</section>

    <div className="finance-reports"><article><div><strong>P&amp;L</strong><span>Pérdidas y ganancias · Holded</span></div><Badge variant="outline">WIP</Badge></article><article><div><strong>Balance</strong><span>Balance de situación · Holded</span></div><Badge variant="outline">WIP</Badge></article></div>

    <section className="panel finance-chart finance-wide-chart"><ChartHeading title="Ventas vs año anterior" sub={`Cada ${data.granularity === "day" ? "día" : data.granularity === "week" ? "semana" : "mes"} frente al mismo periodo del año anterior`} source="holded" granularity={data.granularity} /><ResponsiveContainer width="100%" height={280}><BarChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><FinanceXAxis buckets={data.buckets} /><YAxis hide /><Tooltip content={<FinanceTooltip />} /><Bar dataKey="previousSales" name="Año anterior" fill="#d5dce6" radius={[3,3,0,0]} /><Bar dataKey="sales" name="Actual" fill="#2f5a8a" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer></section>

    <section className="panel finance-invoices"><ChartHeading title="Últimas facturas" sub="Tipo de cliente y cuota cruzados con el Portal" source="both" /><div className="data-table"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Tipo de cliente</th><th>Pago</th><th>Fecha</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th></tr></thead><tbody>{data.invoices.slice(0, invoiceLimit).map((invoice) => <tr key={invoice.id}><td><b>{invoice.number}</b></td><td>{invoice.customer}</td><td>{invoice.clientType || "—"}</td><td>{invoice.installment || "—"}</td><td>{invoice.date ? new Date(`${invoice.date}T12:00:00`).toLocaleDateString("es-ES") : "—"}</td><td>{money(invoice.base, invoice.currency)}</td><td>{money(invoice.tax, invoice.currency)}</td><td><b>{money(invoice.total, invoice.currency)}</b></td><td><Badge variant="outline">{statusLabels[invoice.status] || invoice.status}</Badge></td></tr>)}</tbody></table>{!data.invoices.length && <p className="finance-empty-row">No hay facturas en el periodo seleccionado.</p>}</div>{invoiceLimit < data.invoices.length && <button className="finance-load-more" type="button" onClick={() => setInvoiceLimit((limit) => limit + 5)}>Cargar 5 más</button>}</section>

    <section className="panel finance-cash"><ChartHeading title="Caja" sub="Saldo conjunto de todas las cuentas de Tesorería, convertido a EUR con el cambio diario del BCE" source="holded" /><div className="finance-cash-cards">{cashCards.map((card) => { const delta = card.point && currentCash != null ? currentCash - card.point.balance : null; return <article key={card.tag} className={card.current ? "current" : ""}><span><b>{card.tag}</b>{card.name}</span><strong>{card.point ? money(card.point.balance) : "—"}</strong><small>{card.point ? `${new Date(`${card.point.date}T12:00:00`).toLocaleDateString("es-ES")} · ${card.current ? "saldo actual" : `${delta != null && delta >= 0 ? "+" : "−"}${money(Math.abs(delta || 0))} hasta hoy`}` : "Sin histórico disponible"}</small></article>; })}</div>{data.cash.available && cashPoints.length ? <ResponsiveContainer width="100%" height={270}><AreaChart data={cashPoints}><defs><linearGradient id="cash-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f5a8a" stopOpacity={0.18} /><stop offset="100%" stopColor="#2f5a8a" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { month: "short", year: "2-digit" })} axisLine={false} tickLine={false} fontSize={10} /><YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k €`} axisLine={false} tickLine={false} width={55} fontSize={10} domain={["auto", "auto"]} /><Tooltip content={<FinanceTooltip />} />{cashMarkers.map((marker) => <ReferenceLine key={marker.point!.date} x={marker.point!.date} stroke="#9ca9b8" strokeDasharray="3 4" label={{ value: marker.tag, position: "insideTopRight", fill: "#708096", fontSize: 9 }} />)}<Area type="monotone" dataKey="balance" name="Saldo" stroke="#2f5a8a" strokeWidth={2.5} fill="url(#cash-fill)" activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer> : <div className="finance-cash-empty"><Landmark /><strong>El histórico comienza hoy</strong><span>Las capturas diarias y los cierres mensuales aparecerán aquí.</span></div>}</section>
  </div>;
}

const SALES_CHANNEL_COLORS: Record<string, string> = {
  meta: "#2f5a8a",
  organic: "#c8742a",
  organic_social: "#5f9c86",
  referral: "#9274a8",
  other: "#aab4c2",
  schools: "#d4a84f",
};

function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function SalesHeading({ title, sub, sources, granularity }: { title: string; sub: string; sources: Array<"portal" | "holded" | "meta">; granularity?: SalesDashboard["granularity"] }) {
  return <div className="finance-chart-heading"><div><div className="finance-chart-title"><h2>{title}</h2>{sources.map((source) => <SourceTag key={source} source={source}>{source === "portal" ? "Portal" : source === "holded" ? "Holded" : "Meta Ads"}</SourceTag>)}{granularity && <span className="finance-granularity">{GRANULARITY_LABEL[granularity]}</span>}</div><p>{sub}</p></div></div>;
}

function crmDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours} h${rest ? ` ${rest} min` : ""}`;
}

function nullableNumber(value: number | null | undefined) {
  return value == null ? "—" : plainNumber(value);
}

function CrmTeamOverview({ team, campaigns, personalUser }: { team: SalesDashboard["team"]; campaigns: SalesDashboard["campaigns"]; personalUser?: string }) {
  const campaignTotals = campaigns.reduce((totals, campaign) => ({ spend: totals.spend + Number(campaign.spend || 0), leads: totals.leads + Number(campaign.leads || 0), matchedCrmLeads: totals.matchedCrmLeads + Number(campaign.matchedCrmLeads || 0), contacted: totals.contacted + Number(campaign.contacted || 0), contracts: totals.contracts + Number(campaign.contracts || 0), contracted: totals.contracted + Number(campaign.contracted || 0), paid: totals.paid + Number(campaign.paid || 0) }), { spend: 0, leads: 0, matchedCrmLeads: 0, contacted: 0, contracts: 0, contracted: 0, paid: 0 });
  const summaryCards = [
    { label: "Leads nuevos", value: plainNumber(team.summary.newLeads), detail: "CRM nativo + histórico validado", sources: ["CRM", "HISTÓRICO"] },
    { label: "Clientes de cohorte", value: plainNumber(team.summary.contracts), detail: "IN/25-26 históricos + firmas del Portal", sources: ["PORTAL", "HISTÓRICO"] },
    { label: "Ingresos firmados", value: money(team.summary.contracted), detail: `Ticket medio ${money(team.summary.averageTicket)}`, sources: ["PORTAL"] },
    { label: "Win rate", value: percent(team.summary.winRate), detail: team.summary.won == null ? "Pendiente de histórico de cierres" : `${team.summary.won} IN de ${Number(team.summary.won) + Number(team.summary.lost)} cierres`, sources: ["EVENTOS"] },
    { label: "Speed to lead", value: crmDuration(team.summary.speedMinutes), detail: "Mediana asignación → contactado", sources: ["EVENTOS"] },
    { label: "ROAS", value: campaignTotals.spend ? `${(campaignTotals.contracted / campaignTotals.spend).toLocaleString("es-ES", { maximumFractionDigits: 1 })}×` : "—", detail: campaignTotals.spend ? `${money(campaignTotals.spend)} invertido · ${campaignTotals.paid ? `${(campaignTotals.paid / campaignTotals.spend).toLocaleString("es-ES", { maximumFractionDigits: 1 })}× cobrado` : "cobrado —"}` : "Sin inversión Meta disponible", sources: ["META", "PORTAL"] },
    { label: "Cobrado", value: percent(team.summary.collectionRate), detail: `${money(team.summary.collected)} pagado en Portal`, sources: ["PORTAL"] },
    { label: "Calidad del dato", value: plainNumber(team.summary.qualityIssues), detail: "Registros a revisar", sources: ["CRM"] },
  ];
  const maxAgentRevenue = Math.max(...team.agents.map((agent) => agent.contracted), 1);
  const maxLost = Math.max(...team.lostReasons.map((reason) => reason.count), 1);
  const maxFunnel = Math.max(...(team.funnel || []).map((row) => row.count), 1);

  return <div className="crm-performance">
    <div className="sales-section-title"><span>{personalUser ? "RENDIMIENTO PERSONAL" : "EQUIPO COMERCIAL"}</span><h2>{personalUser ? `Rendimiento comercial de ${personalUser}` : "Rendimiento comercial"}</h2><p>{personalUser ? "Dedicación, velocidad, conversión y valor de la cartera personal." : "Dedicación, velocidad, conversión y valor del equipo."}</p></div>
    {!team.history.eventsComplete && <div className="crm-history-note"><AlertTriangle /><span>El histórico de eventos comienza con esta implantación. Las métricas que requieren cubrir todo el periodo aparecen como “—” hasta disponer de una serie completa.</span></div>}

    <section className="crm-performance-section"><header><h3>Resumen del periodo</h3><p>Lo que un administrador necesita revisar primero.</p></header><div className="crm-team-kpis">{summaryCards.map((card) => <article className="panel" key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small><footer>{card.sources.map((source) => <b key={source}>{source}</b>)}</footer></article>)}</div></section>

    <section className="crm-performance-section"><header><h3>Comparativa de gestores</h3><p>La cohorte histórica atribuye leads y clientes a Noel, María y Manuel. “Varios” y “Sin gestor” solo entran en el total del equipo.</p></header><article className="panel crm-scorecard"><div className="data-table"><table><thead><tr><th>Gestor</th><th>Leads cohorte</th><th>Clientes cohorte</th><th>Asignados actuales</th><th>Contactado</th><th>Speed to lead</th><th>Firmas con fecha</th><th>Win rate</th><th>Contratado</th><th>€ / lead</th><th>Cartera</th><th>Estancados</th><th>Días activos</th><th>Acciones / día</th></tr></thead><tbody>{team.agents.map((agent) => <tr key={agent.key}><td><b>{agent.name}</b></td><td>{nullableNumber(agent.cohortLeads)}</td><td>{nullableNumber(agent.cohortClients)}</td><td>{nullableNumber(agent.assigned)}</td><td>{percent(agent.contactRate)}</td><td className={agent.speedMinutes != null && agent.speedMinutes > 240 ? "crm-bad" : agent.speedMinutes != null && agent.speedMinutes > 60 ? "crm-warn" : ""}>{crmDuration(agent.speedMinutes)}</td><td>{agent.contracts}</td><td>{percent(agent.winRate)}</td><td>{money(agent.contracted)}</td><td>{money(agent.revenuePerLead)}</td><td>{agent.portfolio}</td><td className={Number(agent.stale || 0) > 5 ? "crm-bad" : ""}>{nullableNumber(agent.stale)}</td><td>{nullableNumber(agent.activeDays)}</td><td>{nullableNumber(agent.actionsPerDay)}</td></tr>)}<tr className="crm-total"><td>Equipo</td><td>{team.summary.newLeads}</td><td>{team.summary.contracts}</td><td>{team.history.eventsComplete ? team.agents.reduce((sum, agent) => sum + Number(agent.assigned || 0), 0) : "—"}</td><td>—</td><td>{crmDuration(team.summary.speedMinutes)}</td><td>{team.agents.reduce((sum, agent) => sum + Number(agent.contracts || 0), 0)}</td><td>{percent(team.summary.winRate)}</td><td>{money(team.summary.contracted)}</td><td>—</td><td>{team.agents.reduce((sum, agent) => sum + agent.portfolio, 0)}</td><td>{team.history.eventsAvailable ? team.agents.reduce((sum, agent) => sum + Number(agent.stale || 0), 0) : "—"}</td><td>—</td><td>—</td></tr></tbody></table></div></article>
      <div className="crm-performance-grid"><article className="panel crm-performance-card"><h4>Ingresos e ingreso por lead asignado</h4><p>Contratado del Portal atribuido al agente de venta.</p><div className="crm-bars">{team.agents.map((agent) => <div key={agent.key}><span>{agent.name}</span><i><b style={{ width: `${agent.contracted / maxAgentRevenue * 100}%` }} /></i><strong>{money(agent.contracted)} · {money(agent.revenuePerLead)}/lead</strong></div>)}</div></article><article className="panel crm-performance-card"><h4>Tiempo en cada etapa</h4><p>Mediana de días por agente desde el nuevo histórico.</p><div className="data-table"><table><thead><tr><th>Etapa</th>{team.agents.map((agent) => <th key={agent.key}>{agent.name}</th>)}</tr></thead><tbody>{team.stageTimes.map((row) => <tr key={row.stage}><td>{row.stage}</td>{team.agents.map((agent) => <td key={agent.key}>{row.values[agent.key] == null ? "—" : `${Number(row.values[agent.key]).toLocaleString("es-ES", { maximumFractionDigits: 1 })} d`}</td>)}</tr>)}</tbody></table></div></article></div>
    </section>

    <section className="crm-performance-section"><header><h3>Embudo y pérdidas</h3><p>Dónde se atascan y por qué se pierden los leads.</p></header><div className="crm-performance-grid crm-funnel-grid"><article className="panel crm-performance-card"><h4>Embudo del equipo</h4>{team.funnel ? <div className="crm-bars crm-funnel">{team.funnel.map((row) => <div key={row.stage}><span>{row.stage}</span><i><b style={{ width: `${row.count / maxFunnel * 100}%` }} /></i><strong>{row.count}{row.conversion != null ? ` · ${percent(row.conversion)}` : ""}{row.lost ? ` · −${row.lost}` : ""}</strong></div>)}</div> : <div className="crm-unavailable">—<small>Necesita un periodo cubierto por el histórico de eventos.</small></div>}</article><article className="panel crm-performance-card"><h4>Motivos de Lost</h4><div className="crm-bars crm-lost-bars">{team.lostReasons.map((reason) => <div key={reason.key}><span>{reason.label}</span><i><b style={{ width: `${reason.count / maxLost * 100}%` }} /></i><strong>{reason.count} · {percent(reason.percentage)}</strong></div>)}</div></article></div></section>

    <section className="crm-performance-section"><header><h3>Operativa y reparto</h3><p>Alertas actuales y reparto cronológico de la bandeja.</p></header><div className="crm-performance-grid"><article className="panel crm-performance-card"><h4>Alertas operativas</h4><div className="crm-alert-list">{team.alerts.map((alert) => <div className={alert.severity} key={alert.key}><i /><strong>{nullableNumber(alert.count)}</strong><span>{alert.label}</span></div>)}</div></article><article className="panel crm-performance-card"><h4>Reparto de la bandeja · índice FIFO</h4><div className="crm-bars">{team.fifo.map((agent) => <div key={agent.key}><span>{agent.name}</span><i><b style={{ width: `${agent.value || 0}%` }} /></i><strong>{percent(agent.value)}</strong></div>)}</div></article></div></section>

    <section className="crm-performance-section"><header><h3>Campañas</h3><p>CRM + histórico aportan los leads y clientes; Meta aporta el gasto de las campañas coincidentes; Portal aporta contratado y pagado.</p></header><article className="panel crm-scorecard"><div className="data-table"><table><thead><tr><th>Campaña</th><th>Gasto Meta</th><th>Leads</th><th>CPL</th><th>Contactado</th><th>Clientes</th><th>CAC</th><th>Contratado</th><th>ROAS</th><th>Pagado</th><th>ROAS pagado</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id || campaign.name}><td><b>{campaign.name}</b></td><td>{money(campaign.spend)}</td><td>{campaign.leads}</td><td>{money(campaign.cpl)}</td><td>{percent(campaign.contactRate)}</td><td>{campaign.contracts}</td><td>{money(campaign.cac)}</td><td>{money(campaign.contracted)}</td><td>{campaign.roas == null ? "—" : `${campaign.roas.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`}</td><td>{money(campaign.paid)}</td><td>{campaign.roasCollected == null ? "—" : `${campaign.roasCollected.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`}</td></tr>)}<tr className="crm-total"><td>Total</td><td>{money(campaignTotals.spend)}</td><td>{campaignTotals.leads}</td><td>{campaignTotals.leads ? money(campaignTotals.spend / campaignTotals.leads) : "—"}</td><td>{campaignTotals.matchedCrmLeads ? percent(campaignTotals.contacted / campaignTotals.leads * 100) : "—"}</td><td>{campaignTotals.contracts}</td><td>{campaignTotals.contracts ? money(campaignTotals.spend / campaignTotals.contracts) : "—"}</td><td>{money(campaignTotals.contracted)}</td><td>{campaignTotals.spend ? `${(campaignTotals.contracted / campaignTotals.spend).toLocaleString("es-ES", { maximumFractionDigits: 1 })}×` : "—"}</td><td>{money(campaignTotals.paid)}</td><td>{campaignTotals.spend ? `${(campaignTotals.paid / campaignTotals.spend).toLocaleString("es-ES", { maximumFractionDigits: 1 })}×` : "—"}</td></tr></tbody></table></div></article></section>

    <section className="crm-performance-section"><header><h3>Después de la firma</h3><p>Cobro del Portal y resultado actual de las solicitudes.</p></header><div className="crm-performance-grid"><article className="panel crm-performance-card"><h4>Firmado frente a cobrado</h4><div className="crm-bars">{team.agents.map((agent) => <div key={agent.key}><span>{agent.name}</span><i><b style={{ width: `${Math.max(0, Math.min(100, agent.collectionRate || 0))}%` }} /></i><strong>{percent(agent.collectionRate)} · {crmDuration(agent.collectionDays == null ? null : agent.collectionDays * 1440)}</strong></div>)}</div><p>Porcentaje pagado y mediana desde la firma hasta el primer pago.</p></article><article className="panel crm-performance-card"><h4>Admisiones conseguidas</h4><div className="crm-bars">{team.agents.map((agent) => <div key={agent.key}><span>{agent.name}</span><i><b style={{ width: `${agent.admissionRate || 0}%` }} /></i><strong>{percent(agent.admissionRate)} · {nullableNumber(agent.applications)} sol.</strong></div>)}</div></article></div><article className="panel crm-quality"><h4>Calidad del dato</h4><div>{team.quality.map((item) => <span key={item.key}><strong>{item.count}</strong><small>{item.label}</small></span>)}</div></article></section>
  </div>;
}

function SalesOverview({ personalUser, selectedPeriod }: { personalUser?: string; selectedPeriod?: AnalyticsPeriod } = {}) {
  const [localPeriod, setLocalPeriod] = useState<FinancePeriod>("ytd");
  const period = selectedPeriod || localPeriod;
  const [data, setData] = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    integrationClient.salesDashboard(period, personalUser ? "personal" : "global")
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : "No se pudieron cargar las ventas"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, personalUser]);

  if (loading && !data) return <DashboardLoader />;
  if (error && !data) return <div className="finance-error"><AlertTriangle /><div><strong>No se pudieron cargar las ventas</strong><span>{error}</span></div></div>;
  if (!data) return null;

  const visibleChannels = data.channels.filter((channel) => channel.contracted > 0);
  const totalContracted = data.kpis.contracted;
  const channelPie = visibleChannels.map((channel) => ({ ...channel, value: channel.contracted }));
  const campaignMax = Math.max(...data.campaigns.flatMap((campaign) => [campaign.leads, campaign.contracts]), 1);
  const cacCampaigns = data.campaigns.filter((campaign) => campaign.cac != null);
  const sourcesUnavailable = !data.sources.meta;
  const isPersonal = Boolean(personalUser);
  const viewerName = data.scope?.userName || personalUser;
  const metaLabel = isPersonal ? "Meta Ads · global" : "Meta Ads";
  const personalAgentKey = String(viewerName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/)[0];
  const scopedTeam = isPersonal && personalAgentKey
    ? {
        ...data.team,
        agents: data.team.agents.filter((agent) => agent.key === personalAgentKey),
        fifo: data.team.fifo.filter((agent) => agent.key === personalAgentKey),
      }
    : data.team;
  const kpis = [
    { label: "Contratado", source: ["portal"] as const, value: money(data.kpis.contracted), detail: `${plainNumber(data.kpis.contracts)} clientes de cohorte; importe solo con contrato verificable`, icon: UserCheck },
    { label: "Conversión", source: ["portal"] as const, value: percent(data.kpis.conversion), detail: `${plainNumber(data.kpis.contracts)} clientes de ${plainNumber(data.kpis.leads)} leads · CRM + histórico`, icon: TrendingUp },
    { label: "CAC", source: ["meta", "portal"] as const, value: data.sources.meta ? money(data.kpis.cac) : "—", detail: `${isPersonal ? "Gasto global" : "Gasto"} de campañas Meta ÷ clientes`, icon: BarChart3 },
    { label: "LAC", source: ["meta", "portal"] as const, value: data.sources.meta ? money(data.kpis.lac) : "—", detail: `${isPersonal ? "Gasto global" : "Gasto"} de campañas Meta ÷ leads del Portal`, icon: Megaphone },
  ];

  return <div className="finance-dashboard sales-dashboard" role="tabpanel" aria-label="Ventas">
    <header className="finance-dashboard-header">
      <div><span>{isPersonal ? "OTRAS MÉTRICAS · VENTAS P" : "INICIO · VENTAS"}</span><h2>{isPersonal ? "Ventas P" : "Ventas"}</h2><p>{isPersonal ? `Rendimiento comercial de ${viewerName}` : "Leads, conversión y rentabilidad comercial"} · {data.rangeLabel}</p></div>
      {!selectedPeriod && <div className="finance-period"><label htmlFor="sales-period">Periodo</label><select id="sales-period" value={localPeriod} onChange={(event) => setLocalPeriod(event.target.value as FinancePeriod)}>{FINANCE_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Gráficos {GRANULARITY_LABEL[data.granularity].toLowerCase()} · el filtro aplica a toda la pantalla</small></div>}
    </header>

    {sourcesUnavailable && <div className="finance-source-warning"><AlertTriangle /><span>Meta Ads no está disponible: no se ha recibido el gasto de campañas. La conversión sigue usando los leads históricos guardados en el Portal; CAC, LAC y el detalle de campañas se muestran como “—”.</span></div>}
    {isPersonal && data.sources.meta && <div className="finance-source-warning"><AlertTriangle /><span><strong>Meta Ads es global.</strong> La inversión, los leads de Meta y las métricas derivadas —CAC, LAC, ROAS y margen— usan el total de las campañas. Los datos de CRM, contratos, contratado y cobrado están filtrados para {viewerName}.</span></div>}

    <section className="finance-kpis sales-kpis">{kpis.map(({ label, source, value, detail, icon: Icon }) => <article key={label}><i><Icon /></i><div><span>{label}<span className="sales-source-list">{source.map((item) => <SourceTag key={item} source={item}>{item === "portal" ? "Portal" : item === "meta" ? metaLabel : "Holded"}</SourceTag>)}</span></span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>

    <div className="sales-primary-grid">
      <section className="panel finance-chart sales-temporal-chart"><SalesHeading title="Clientes vs leads" sub="Leads por fecha de adquisición; las barras de clientes solo usan firmas con fecha conocida y la conversión incluye clientes históricos de la cohorte" sources={["portal"]} granularity={data.granularity} /><ResponsiveContainer width="100%" height={290}><ComposedChart data={data.buckets}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="label" tickFormatter={(_, index) => data.buckets[index]?.tick || ""} axisLine={false} tickLine={false} fontSize={10} /><YAxis yAxisId="count" hide domain={[0, "auto"]} /><YAxis yAxisId="conversion" orientation="right" domain={[0, "auto"]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} width={38} fontSize={9} /><Tooltip formatter={(value: any, name: any) => [name === "Conversión" ? percent(Number(value)) : Number(value).toLocaleString("es-ES"), name]} /><Bar yAxisId="count" dataKey="leads" name="Leads CRM + histórico" fill="#b9c9df" radius={[4,4,0,0]} /><Bar yAxisId="count" dataKey="contracts" name="Firmas con fecha" fill="#2f5a8a" radius={[4,4,0,0]} /><Line yAxisId="conversion" type="monotone" dataKey="conversion" name="Conversión de cohorte" stroke="#c8742a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} /></ComposedChart></ResponsiveContainer></section>
      <section className="panel finance-chart sales-channel-chart"><SalesHeading title="Contratado por canal" sub="Importe contratado en Portal según el canal del lead" sources={["portal"]} />{totalContracted > 0 && channelPie.length ? <><ResponsiveContainer width="100%" height={210}><RechartsPieChart><Pie data={channelPie} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={2}>{channelPie.map((channel) => <Cell key={channel.key} fill={SALES_CHANNEL_COLORS[channel.key]} />)}<LabelList dataKey="value" position="outside" formatter={(value: any) => money(Number(value))} /></Pie><Tooltip formatter={(value: any, _name: any, item: any) => [`${money(Number(value))} · ${percent(item?.payload?.percentage)}`, item?.payload?.label]} /></RechartsPieChart></ResponsiveContainer><div className="sales-donut-total"><strong>{money(channelPie.reduce((total, channel) => total + channel.value, 0))}</strong><span>contratado con canal</span></div><div className="sales-channel-legend">{visibleChannels.map((channel) => <div key={channel.key}><span><i style={{ background: SALES_CHANNEL_COLORS[channel.key] }} />{channel.label}</span><strong>{percent(channel.percentage)}</strong></div>)}</div></> : <div className="sales-empty-chart">No hay importe contratado con un canal identificable en el periodo.</div>}</section>
    </div>

    <section className="panel finance-chart sales-campaign-wide"><SalesHeading title="Leads vs clientes por campaña" sub="Cohortes de CRM + histórico; Meta aporta la inversión y Portal el importe contratado" sources={["meta", "portal"]} />{data.campaigns.length ? <ResponsiveContainer width="100%" height={310}><BarChart data={data.campaigns} margin={{ top: 42, right: 12, left: 0, bottom: 46 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" axisLine={false} tickLine={false} height={62} fontSize={10} /><YAxis hide domain={[0, campaignMax * 1.3]} /><Tooltip formatter={(value: any, name: any, item: any) => [name === "Conversión" ? percent(Number(value)) : Number(value).toLocaleString("es-ES"), name]} /><Bar dataKey="leads" name="Leads CRM + histórico" fill="#b9c9df" radius={[4,4,0,0]}><LabelList dataKey="leads" position="top" fill="#65758a" fontSize={10} /><LabelList dataKey="conversion" name="Conversión" position="top" offset={20} fill="#c8742a" fontSize={9} formatter={(value: any) => percent(Number(value))} /></Bar><Bar dataKey="contracts" name="Clientes de cohorte" fill="#2f5a8a" radius={[4,4,0,0]}><LabelList dataKey="contracts" position="top" fill="#1f3d63" fontSize={10} /></Bar></BarChart></ResponsiveContainer> : <div className="sales-empty-chart">No hay campañas con leads para el periodo.</div>}</section>

    <div className="sales-secondary-grid">
      <section className="panel finance-chart"><SalesHeading title="CAC por campaña" sub="Inversión de Meta Ads ÷ contratos firmados en Portal atribuidos a la campaña" sources={["meta", "portal"]} />{cacCampaigns.length ? <ResponsiveContainer width="100%" height={275}><BarChart data={cacCampaigns} margin={{ top: 28, right: 10, left: 0, bottom: 42 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" axisLine={false} tickLine={false} height={58} fontSize={9} /><YAxis hide /><Tooltip formatter={(value: any) => money(Number(value))} /><Bar dataKey="cac" name="CAC" fill="#c8742a" radius={[5,5,0,0]}><LabelList dataKey="cac" position="top" fill="#1f3d63" fontSize={9} formatter={(value: any) => money(Number(value))} /></Bar></BarChart></ResponsiveContainer> : <div className="sales-empty-chart">No hay contratos del Portal atribuidos a campañas de Meta en el periodo.</div>}</section>
      <section className="panel finance-chart"><SalesHeading title="Margen por canal" sub="(Pagado por los clientes del canal − coste del canal) ÷ pagado" sources={["portal", "meta"]} /><ResponsiveContainer width="100%" height={225}><BarChart data={data.marginsByChannel} margin={{ top: 28, right: 10, left: 0, bottom: 14 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="label" interval={0} axisLine={false} tickLine={false} fontSize={9} /><YAxis hide domain={["auto", "auto"]} /><Tooltip formatter={(value: any) => percent(Number(value))} /><Bar dataKey="margin" name="Margen" fill="#5f9c86" radius={[5,5,0,0]}><LabelList dataKey="margin" position="top" fill="#2d6150" fontSize={10} formatter={(value: any) => percent(Number(value))} /></Bar></BarChart></ResponsiveContainer></section>
    </div>

    <CrmTeamOverview team={scopedTeam} campaigns={data.campaigns} personalUser={viewerName} />
  </div>;
}

function PaymentStatusChart({ title, sub, data, unavailable = "" }: { title: string; sub: string; data: { paid: number; pending: number } | null; unavailable?: string }) {
  const paid = data?.paid || 0;
  const pending = data?.pending || 0;
  const max = Math.max(paid, pending, 1);
  const euro = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const unavailableText = unavailable === "invalid_robin_plan_key" ? "La clave de acceso de Robin Plan configurada en Netlify no es válida." : "No se pudo conectar con esta base de datos.";
  return <section className={`panel payment-status-chart ${pending > 0 ? "has-pending" : ""}`}><div className="panel-heading"><div><h2>{title}</h2><p>{sub}</p></div>{pending > 0 && <Badge variant="outline">PENDIENTE</Badge>}</div>{unavailable ? <p className="chart-unavailable">{unavailableText}</p> : <div className="payment-bars"><div><span>Pagado</span><i><b className="paid" style={{ width: `${paid / max * 100}%` }} /></i><strong>{euro(paid)}</strong><small>status = paid</small></div><div className={pending > 0 ? "pending-alert" : ""}><span>Pendiente</span><i><b className="pending" style={{ width: `${pending / max * 100}%` }} /></i><strong>{euro(pending)}</strong><small>status = unlocked</small></div></div>}</section>;
}

function GlobalPayments({ snapshot, connected, embedded = false }: { snapshot: PortalSnapshot | null; connected: boolean; embedded?: boolean }) {
  const [holded, setHolded] = useState<FinanceSnapshot | null>(null);
  const [holdedLoading, setHoldedLoading] = useState(true);
  const [holdedMessage, setHoldedMessage] = useState("Conectando con Holded…");
  async function loadHolded() {
    setHoldedLoading(true);
    try {
      const data = await integrationClient.holded();
      setHolded(data);
      setHoldedMessage(`Sincronizado con Holded · ${new Date(data.syncedAt).toLocaleString("es-ES")}`);
    } catch (error) {
      setHoldedMessage(error instanceof Error ? error.message : "No se pudo conectar con Holded");
    } finally { setHoldedLoading(false); }
  }
  useEffect(() => { void loadHolded(); }, []);

  const euro = (value: number, currency = holded?.currency || "EUR") => `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "EUR" ? "€" : currency}`;
  const statusLabel: Record<string, string> = { paid: "Pagada", pending: "Pendiente", partial: "Pago parcial", overdue: "Vencida", draft: "Borrador" };
  const month = holded?.currentMonth;
  const year = holded?.currentYear;
  const maxMonthly = Math.max(...(holded?.last12Months.flatMap((item) => [item.sales, item.previousYearSales]) || [0]), 1);
  const byId = new Map((snapshot?.clients || []).map((client) => [client.id, client]));
  const portalBilled = (snapshot?.payments || []).reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const portalCollected = (snapshot?.payments || []).filter((payment) => payment.status === "paid").reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const portalPending = (snapshot?.payments || []).filter((payment) => payment.status !== "paid").reduce((total, payment) => total + Number(payment.amount || 0), 0);

  return <div className={embedded ? "embedded-finance" : "page"}>
    {embedded ? <div className="finance-group-title merged-section-title"><div><h2>Pagos y facturación</h2><p>Detalle fiscal de Holded y cobros operativos del portal.</p></div><Button variant="outline" onClick={loadHolded} disabled={holdedLoading}><Landmark />{holdedLoading ? "Sincronizando…" : "Actualizar Holded"}</Button></div> : <Title name="Pagos y facturación" sub="Facturación fiscal de Holded y cobros operativos del portal." eyebrow="INICIO · VISTA GLOBAL"><Button variant="outline" onClick={loadHolded} disabled={holdedLoading}><Landmark />{holdedLoading ? "Sincronizando…" : "Actualizar Holded"}</Button></Title>}
    <div className="sync-status"><ShieldCheck /><span>{holdedMessage}</span><Badge variant="outline">HOLDED REAL</Badge></div>

    <div className="finance-group-title"><h2>Mes actual</h2><p>Facturas emitidas y cobros registrados en Holded.</p></div>
    <section className="stats mini">
      <article><i><FileText /></i><div><span>Ventas</span><strong>{euro(month?.sales || 0)}</strong><small>{month?.invoices || 0} facturas · sin impuestos</small></div></article>
      <article><i className="green"><Check /></i><div><span>Cobrado</span><strong>{euro(month?.collected || 0)}</strong><small>{(month?.collectionRate || 0).toFixed(1)}% del total emitido</small></div></article>
      <article className={(month?.pending || 0) > 0 ? "pending-money-card" : ""}><i className="red"><CircleDollarSign /></i><div><span>Pendiente vencido</span><strong>{euro(month?.pending || 0)}</strong><small>{month?.pendingInvoices || 0} facturas vencidas</small></div></article>
      <article><i className="red"><AlertTriangle /></i><div><span>Vencido</span><strong>{euro(month?.overdue || 0)}</strong><small>{month?.overdueInvoices || 0} facturas vencidas</small></div></article>
    </section>

    <section className="ads-kpi-grid">
      <article><span>Total emitido · mes</span><strong>{euro(month?.billed || 0)}</strong><small>Ventas más impuestos</small></article>
      <article><span>Impuestos · mes</span><strong>{euro(month?.tax || 0)}</strong><small>IVA facturado</small></article>
      <article><span>Ticket medio · mes</span><strong>{euro(month?.averageTicket || 0)}</strong><small>Por factura</small></article>
      <article><span>Facturas pagadas · mes</span><strong>{month?.paidInvoices || 0}</strong><small>De {month?.invoices || 0} emitidas</small></article>
      <article><span>Ventas · año</span><strong>{euro(year?.sales || 0)}</strong><small>{year?.invoices || 0} facturas · sin impuestos</small></article>
      <article><span>Cobrado · año</span><strong>{euro(year?.collected || 0)}</strong><small>{(year?.collectionRate || 0).toFixed(1)}% del total emitido</small></article>
      <article className={(year?.pending || 0) > 0 ? "pending-money-card" : ""}><span>Pendiente vencido · año</span><strong>{euro(year?.pending || 0)}</strong><small>{year?.pendingInvoices || 0} facturas vencidas</small></article>
      <article><span>Vencido · año</span><strong>{euro(year?.overdue || 0)}</strong><small>{year?.overdueInvoices || 0} vencidas</small></article>
    </section>

    <section className="panel clean-chart"><div className="panel-heading"><div><h2>Ventas de los últimos 12 meses</h2><p>Comparativa con el mismo mes del año anterior</p></div><div className="comparison-legend"><span className="current">Actual</span><span className="previous">Anterior</span></div></div><div className="metric-bars comparison">{holded?.last12Months.map((item) => <div key={item.month} title={`${item.month}: ${euro(item.sales)} · año anterior: ${euro(item.previousYearSales)}`}><i className="comparison-bars"><span className="previous-year" style={{ height: `${Math.max(2, item.previousYearSales / maxMonthly * 100)}%` }} /><span className="current-year" style={{ height: `${Math.max(2, item.sales / maxMonthly * 100)}%` }} /></i><small>{item.label}</small></div>)}</div></section>

    <section className="panel campaign-panel"><div className="panel-heading"><div><h2>Últimas facturas de Holded</h2><p>Desglose fiscal y estado de cobro</p></div></div><div className="data-table"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Base</th><th>IVA</th><th>Total</th><th>Cobrado</th><th>Pendiente</th><th>Estado</th></tr></thead><tbody>{holded?.recentInvoices.map((invoice) => <tr key={invoice.id}><td><b>{invoice.number}</b></td><td>{invoice.customer}</td><td>{invoice.date ? new Date(`${invoice.date}T12:00:00`).toLocaleDateString("es-ES") : "—"}</td><td>{euro(invoice.subtotal, invoice.currency)}</td><td>{euro(invoice.tax, invoice.currency)}</td><td>{euro(invoice.total, invoice.currency)}</td><td>{euro(invoice.paid, invoice.currency)}</td><td>{euro(invoice.pending, invoice.currency)}</td><td><Badge variant="outline">{statusLabel[invoice.status] || invoice.status}</Badge></td></tr>)}</tbody></table></div></section>

    <div className="finance-group-title"><h2>Pagos del portal</h2><p>Cuotas previstas y cobros registrados en Supabase/Stripe.</p></div>
    {connected && !snapshot ? <div className="empty compact"><WalletCards /><h2>Cargando pagos del portal…</h2></div> : <>
      <section className="stats mini"><article><i><WalletCards /></i><div><span>Planificado</span><strong>{euro(portalBilled)}</strong><small>{snapshot?.payments.length || 0} cuotas</small></div></article><article><i className="green"><Check /></i><div><span>Cobrado</span><strong>{euro(portalCollected)}</strong><small>Stripe y transferencias</small></div></article><article><i className="gold"><CircleDollarSign /></i><div><span>Pendiente</span><strong>{euro(portalPending)}</strong><small>Cuotas abiertas o bloqueadas</small></div></article><article><i className="red"><AlertTriangle /></i><div><span>Fallidos</span><strong>{snapshot?.payments.filter((payment) => payment.status === "failed").length || 0}</strong><small>Requieren atención</small></div></article></section>
      <section className="panel"><div className="panel-heading"><div><h2>Cuotas del portal</h2><p>Estado financiero operativo</p></div></div><div className="data-table"><table><thead><tr><th>Cliente</th><th>Concepto</th><th>Importe</th><th>Estado</th><th>Factura</th></tr></thead><tbody>{snapshot?.payments.map((payment) => { const client = byId.get(payment.user_id); return <tr key={payment.id}><td><b>{[client?.nombre, client?.apellidos].filter(Boolean).join(" ") || client?.email || payment.user_id}</b></td><td>{payment.concept || `Cuota ${payment.installment}`}</td><td>{Number(payment.amount).toLocaleString("es-ES")} {payment.currency || "EUR"}</td><td><Badge variant="outline">{payment.status}</Badge></td><td>{payment.invoice_number || "—"}</td></tr>; })}</tbody></table></div></section>
    </>}
  </div>;
}

function Configuration({ onAddAdmin, onRemoveAdmin, currentUser, portalAdmin, notify }: FeatureModuleProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<PortalAccessUser[]>([]);
  const [avatarUrl, setAvatarUrl] = useState(portalAdmin.avatar_url || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<SalesTestStatus | null>(null);
  useEffect(() => { portalClient.adminUsers().then((result) => setUsers(result.users)).catch(() => setUsers([])); }, []);
  useEffect(() => { portalClient.salesTestStatus().then(setTestStatus).catch(() => setTestStatus(null)); }, []);

  async function launchTest() {
    setTestBusy(true);
    try { const result = await portalClient.launchSalesTest(); setTestStatus(result); notify("Modo de prueba activado para todos los administradores"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo activar el modo de prueba"); }
    finally { setTestBusy(false); }
  }

  async function stopTest() {
    if (!window.confirm("Se borrarán todos los leads, clientes, pagos y campañas creados por el test. Los datos reales no se modificarán. ¿Continuar?")) return;
    setTestBusy(true);
    try { const result = await portalClient.stopSalesTest(); setTestStatus(result); notify(`Test detenido: ${result.removed?.leads || 0} leads y ${result.removed?.users || 0} clientes eliminados`); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo detener y limpiar el test"); }
    finally { setTestBusy(false); }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { const result = await portalClient.createAdmin({ name, email, password }); setUsers((items) => [...items, result.user]); onAddAdmin(name); setName(""); setEmail(""); setPassword(""); setAdding(false); notify("Usuario administrador creado"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el usuario"); }
    finally { setBusy(false); }
  }

  async function removeUser(user: PortalAccessUser) {
    if (!window.confirm(`¿Eliminar el acceso de ${user.nombre || user.email}?`)) return;
    try { await portalClient.deleteAdmin(user.id); setUsers((items) => items.filter((item) => item.id !== user.id)); onRemoveAdmin(user.nombre || user.email || ""); notify("Acceso eliminado"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo eliminar el usuario"); }
  }
  return (
    <div className="page">
      <Title name="Configuración" sub="Gestiona los usuarios con acceso al portal." eyebrow="INICIO · VISTA GLOBAL"><Button onClick={() => setAdding(true)}><UserPlus />Añadir usuario</Button></Title>
      {adding && (
        <form className="panel add-user-form" onSubmit={createUser}>
          <div><h2>Nuevo usuario administrador</h2><p>Añade un usuario con acceso al panel.</p></div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" autoFocus required />
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña inicial" minLength={10} required />
          <Button type="submit" disabled={busy}>{busy ? "Creando…" : "Añadir"}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
        </form>
      )}
      <section className="settings-security-grid">
        <form className="panel profile-photo-card" onSubmit={(event) => event.preventDefault()}><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" /> : currentUser.slice(0, 2).toUpperCase()}</div><div><h2>Foto de perfil</h2><p>JPG, PNG o WEBP de hasta 5 MB.</p><label className="ui-button outline"><Camera />Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await portalClient.uploadAvatar(file); setAvatarUrl(result.avatar_url); notify("Foto de perfil actualizada"); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo subir la foto"); } }} /></label></div></form>
        <form className="panel password-card" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await portalClient.changePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); notify("Contraseña actualizada"); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo cambiar la contraseña"); } finally { setBusy(false); } }}><div><h2><KeyRound /> Cambiar mi contraseña</h2><p>Usa al menos 10 caracteres.</p></div><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Contraseña actual" required /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña" minLength={10} required /><Button type="submit" disabled={busy}>Actualizar</Button></form>
      </section>
      <section className={`panel sales-test-card ${testStatus?.active ? "is-active" : ""}`}>
        <div><h2>{testStatus?.active ? "Modo de prueba activo" : "Modo de prueba de ventas"}</h2><p>{testStatus?.active ? "Visible para todos los administradores. Puedes mover los leads, convertirlos en clientes o marcarlos como Lost; Detener test eliminará todo el conjunto." : "Crea 20 leads simulados, campañas de Meta y clientes de prueba. Los clientes tienen contrato firmado y solo la primera cuota pagada."}</p></div>
        <Badge variant="outline">{testStatus?.active ? "TEST ACTIVO" : "INACTIVO"}</Badge>
        {testStatus?.active
          ? <Button type="button" variant="outline" onClick={() => void stopTest()} disabled={testBusy}><StopCircle />{testBusy ? "Deteniendo…" : "Detener test"}</Button>
          : <Button type="button" onClick={() => void launchTest()} disabled={testBusy}><PlayCircle />{testBusy ? "Activando…" : "Launch test"}</Button>}
      </section>
      <section className="admin-grid">
        {users.map((user) => { const label = user.nombre || user.email || user.username || "Administrador"; const current = user.id === portalAdmin.id; return <article className="panel" key={user.id}><i className={user.avatar_url ? "has-photo" : ""}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : label.slice(0, 2).toUpperCase()}</i><div><h3>{label}</h3><p>{user.email || "Administrador"}{current ? " · Usuario actual" : ""}</p></div><Badge variant="outline">Activo</Badge>{current ? <span /> : <button type="button" className="remove-admin" aria-label={`Eliminar ${label}`} onClick={() => void removeUser(user)}><Trash2 /></button>}</article>; })}
      </section>
    </div>
  );
}

function StudentPortal({ currentUser, snapshot }: { currentUser: string; snapshot: PortalSnapshot | null }) {
  return (
    <div className="page">
      <Title name="Portal de aplicación" sub={`Acceso personal de ${currentUser} al seguimiento de sus alumnos.`} eyebrow="ÁREA PERSONAL · ALUMNOS" />
      <section className="portal-placeholder">
        <i><GraduationCap /></i><Badge variant="outline">{snapshot ? "CONECTADO" : "VISTA PREVIA"}</Badge>
        <h2>Portal de aplicación</h2>
        <p>{snapshot ? "Abre el portal conectado para gestionar los expedientes asignados a tu cuenta." : "La URL real se habilitará al configurar Netlify."}</p>
        {snapshot ? <a className="portal-link-button" href={`${snapshot.portalUrl}/portal/`} target="_blank" rel="noreferrer"><ExternalLink />Abrir portal de aplicación</a> : <Button disabled><ExternalLink />URL pendiente de configurar</Button>}
      </section>
    </div>
  );
}

const leadCategories: LeadCategory[] = ["delft", "Llegada", "Mentoría", "General", "LATAM", "ESPECIAL"];
const salesStages: CrmStage[] = ["Contactado", "Propuesta enviada", "Llamada programada", "Llamada tenida", "En espera"];
const lostReasonOptions: Array<{ value: LostReason; label: string }> = [
  { value: "price", label: "Precio" },
  { value: "more_destinations", label: "Están buscando más destinos" },
  { value: "competition", label: "Competencia" },
  { value: "other", label: "Otros" },
];
const lostReasonLabel = (reason?: LostReason) => lostReasonOptions.find((option) => option.value === reason)?.label || "—";
const leadCampaignLabel = (campaign?: string) => {
  const value = campaign?.trim();
  return value && value.toLowerCase() !== "pendiente de identificar" ? value : "Sin campaña identificada";
};

function CategoryPicker({ value, onChange }: { value: LeadCategory | ""; onChange: (value: LeadCategory) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={`category-picker ${open ? "open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{value || "Seleccionar…"}</span><ChevronDown /></button>
    {open && <div className="category-options" role="listbox">{leadCategories.map((category) => <button type="button" role="option" aria-selected={value === category} key={category} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>)}</div>}
  </div>;
}

const emailMergeColumnKeys = ["id", "notion_page_url", "notion_numeric_id", "name", "email", "phone", "email_uid", "summary", "body_text", "comment", "first_contact_comment", "area", "lead_type", "lifecycle", "task_status", "heat", "contact_at", "chase_at", "meeting_at", "overdue_at", "inside_at", "owner_names", "notion_owner_ids", "rolled_up_owner", "robin", "attended_previous_events", "first_payment_received", "folder_created", "checked", "school_name", "school_notion_urls", "campaign_notion_urls", "canva_presentation_url", "source_formula", "source_payload", "source_created_at", "source_updated_at", "created_at", "updated_at", "crm_stage", "lost_at"];
const emailMergeColumnLabels: Record<string, string> = { id: "ID", notion_page_url: "URL de Notion", notion_numeric_id: "ID numérico de Notion", name: "Nombre", email: "Correo electrónico", phone: "Teléfono", email_uid: "ID de correo", summary: "Resumen", body_text: "Texto del lead", comment: "Comentario", first_contact_comment: "Comentario de primer contacto", area: "Área", lead_type: "Tipo de lead", lifecycle: "Ciclo de vida", task_status: "Estado de tarea", heat: "Heat", contact_at: "Fecha de contacto", chase_at: "Fecha de seguimiento", meeting_at: "Fecha de reunión", overdue_at: "Fecha de vencimiento", inside_at: "Fecha de entrada", owner_names: "Responsables", notion_owner_ids: "IDs de responsables de Notion", rolled_up_owner: "Responsable agregado", robin: "Robin", attended_previous_events: "Asistió a eventos anteriores", first_payment_received: "Primer pago recibido", folder_created: "Carpeta creada", checked: "Revisado", school_name: "Centro educativo", school_notion_urls: "Enlaces de centros", campaign_notion_urls: "Campaña (base de datos)", canva_presentation_url: "Presentación de Canva", source_formula: "Fórmula de origen", source_payload: "Datos de origen", source_created_at: "Fecha de creación de origen", source_updated_at: "Fecha de actualización de origen", created_at: "Fecha de alta CRM", updated_at: "Última actualización", crm_stage: "Estado CRM", lost_at: "Fecha Lost" };

function EmailComposer({ contacts, notify, onClose }: { contacts: Contact[]; notify: (message: string) => void; onClose: () => void }) {
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

function Crm({ path, currentUser, admins, contacts, leadOwners, leadStages, onMoveLead, onDeleteLead, leadCategories: categories, onCategorizeLead, leadHeat, onSetLeadHeat, leadNotes, onSetLeadNotes, leadLostDates, portalSnapshot, portalConnected, onPortalRefresh, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const owned = useMemo(() => contacts.filter((contact) => leadOwners[contact.id] === currentUser && `${contact.name} ${contact.email} ${contact.source}`.toLowerCase().includes(query.toLowerCase())), [contacts, currentUser, leadOwners, query]);
  const campaigns = useMemo(() => Array.from(new Set(contacts
    .filter((contact) => leadOwners[contact.id] === currentUser && (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar")
    .map((contact) => leadCampaignLabel(contact.campaign))))
    .sort((a, b) => a.localeCompare(b, "es")), [contacts, currentUser, leadOwners, leadStages]);
  const porContactarLeads = owned.filter((contact) => {
    if ((leadStages[contact.id] || contact.stage || "Por contactar") !== "Por contactar") return false;
    if (categoryFilter !== "all" && categories[contact.id] !== categoryFilter) return false;
    const campaign = leadCampaignLabel(contact.campaign);
    return campaignFilter === "all" || campaign === campaignFilter;
  });
  const activeCrmFilters = Number(categoryFilter !== "all") + Number(campaignFilter !== "all");

  function openContact(contact: Contact) {
    setSelected({ ...contact, owner: currentUser, category: categories[contact.id] || undefined, heat: leadHeat[contact.id], notes: leadNotes[contact.id] });
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
    if (stage === "Lost") {
      setLostReason("");
      setLostReasonDetail("");
      setPendingLostId(leadId);
      return;
    }
    if (stage !== "Cliente") {
      onMoveLead(leadId, stage);
      notify(`Lead movido a ${stage}`);
      return;
    }
    const contact = contacts.find((item) => item.id === leadId);
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

  function confirmLost() {
    const leadId = pendingLostId;
    if (!leadId || !lostReason || (lostReason === "other" && !lostReasonDetail.trim())) return;
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
      <Title name={title} sub={`Cartera comercial de ${currentUser}.`} eyebrow="CRM PERSONAL"><Badge variant="outline">{owned.length} REGISTROS</Badge></Title>
      <div className="module-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en mi cartera…" /></label>{path === "/crm" && <><Button variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{activeCrmFilters > 0 && <span className="filter-count">{activeCrmFilters}</span>}</Button><Button className="crm-email-button" variant="outline" onClick={() => setEmailComposerOpen(true)}><Mail />Correo electrónico</Button></>}{path === "/crm/clientes" && <Button variant="outline" disabled={exportingClients} onClick={() => void exportClientDatabase()}><Download />{exportingClients ? "Preparando…" : "Descargar base de datos"}</Button>}</div>

      {path === "/crm" && (
        <>
        {filtersOpen && <section className="lead-filters panel crm-lead-filters"><label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as LeadCategory | "all")}><option value="all">Todas las categorías</option>{leadCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Limpiar filtros</button></section>}
        <div className="qualification-grid">
          {porContactarLeads.map((contact) => (
            <article className={`qualification-card ${contact.formName === "colegios" ? "school-lead" : ""}`} key={contact.id}>
              <span className={`lead-age-dot ${leadContactAgeTone(leadDaysWithoutContact(contact))}`} title={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} aria-label={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} />
              <button className="card-main" onClick={() => openContact(contact)}><small className={contact.formName === "colegios" ? "school-lead-label" : ""}>{contact.formName === "colegios" ? "COLEGIOS" : contact.source}</small><h3>{contact.name}</h3><p>{contact.email}</p><span><Flame /> Heat {leadHeat[contact.id]}</span></button>
              <label>Categoría obligatoria<CategoryPicker value={categories[contact.id] || ""} onChange={(category) => onCategorizeLead(contact.id, category)} /></label>
              <Button disabled={!categories[contact.id]} onClick={() => { onMoveLead(contact.id, "Contactado"); notify(`${contact.name} ha pasado a Contactado`); }}>Pasar a contactado<ArrowRight /></Button>
            </article>
          ))}
          {porContactarLeads.length === 0 && <div className="empty compact"><UserCheck /><h2>{owned.some((contact) => (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar") ? "No hay resultados con esos filtros" : "No hay leads por contactar"}</h2><p>{activeCrmFilters ? <button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Quitar filtros</button> : `Los nuevos leads asignados a ${currentUser} aparecerán aquí.`}</p></div>}
        </div>
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

      {path === "/crm/clientes" && <div className="personal-leads">{portalConnected && !portalSnapshot ? <div className="empty compact"><GraduationCap /><h2>Cargando clientes…</h2></div> : portalSnapshot ? portalSnapshot.clients.filter((client) => client.assigned_to === portalSnapshot.admin.email).map((client) => <a className="lead-card" key={client.id} href={`${portalSnapshot.portalUrl}/portal/`} target="_blank" rel="noreferrer"><small>{client.tipo || "general"}</small><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email}</p><div><span>Fase {client.application_phase || 1}</span><strong>{client.pago_completed ? "Al corriente" : "Onboarding"}</strong></div><footer>Abrir en portal<ChevronRight /></footer></a>) : owned.filter((contact) => leadStages[contact.id] === "Cliente").map((contact) => <button className="lead-card" key={contact.id} onClick={() => openContact(contact)}><small>{categories[contact.id]}</small><h3>{contact.name}</h3><p>{contact.email}</p><div><span>Agente de venta: {currentUser}</span><strong>{contact.value.toLocaleString("es-ES")} €</strong></div><footer>Ver portal del cliente<ChevronRight /></footer></button>)}</div>}

      {path === "/crm/lost" && <><div className="lost-filters"><label>Desde<input type="date" value={lostFrom} onChange={(event) => setLostFrom(event.target.value)} /></label><label>Hasta<input type="date" value={lostTo} onChange={(event) => setLostTo(event.target.value)} /></label><label>Categoría<select value={lostCategory} onChange={(event) => setLostCategory(event.target.value)}><option value="">Todas</option>{leadCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Heat mínimo<input type="number" min="0" max="100" value={lostHeat} onChange={(event) => setLostHeat(event.target.value)} /></label></div><div className="data-table panel"><table><thead><tr><th>Lead</th><th>Categoría</th><th>Heat final</th><th>Origen</th><th>Motivo</th><th>Fecha Lost</th></tr></thead><tbody>{owned.filter((contact) => { const lostDate = (leadLostDates[contact.id] || "").slice(0, 10); return leadStages[contact.id] === "Lost" && (!lostCategory || categories[contact.id] === lostCategory) && leadHeat[contact.id] >= Number(lostHeat || 0) && (!lostFrom || lostDate >= lostFrom) && (!lostTo || lostDate <= lostTo); }).map((contact) => <tr key={contact.id} onClick={() => openContact(contact)}><td><b>{contact.name}</b><small>{contact.email}</small></td><td>{categories[contact.id]}</td><td>{leadHeat[contact.id]}</td><td>{contact.source}</td><td>{lostReasonLabel(contact.lostReason)}{contact.lostReasonDetail && <small>{contact.lostReasonDetail}</small>}</td><td>{leadLostDates[contact.id]?.slice(0, 10) || "—"}</td></tr>)}</tbody></table></div></>}

      {selected && <ContactDrawer contact={selected} leadMode heat={leadHeat[selected.id]} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} />}
      {emailComposerOpen && path === "/crm" && <EmailComposer contacts={porContactarLeads} notify={notify} onClose={() => setEmailComposerOpen(false)} />}
      {pendingClientId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget && !convertingId) setPendingClientId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); void confirmClientConversion(); }}><button className="drawer-close" type="button" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>×</button><span>PASAR A IN</span><h2>Asignar asesor del cliente</h2><p>El agente de venta seguirá siendo <b>{leadOwners[pendingClientId] || currentUser}</b>. El asesor elegido será quien reciba al alumno en el Portal del Alumno.</p><label>Asesor<select required autoFocus value={selectedAdvisor} onChange={(event) => setSelectedAdvisor(event.target.value)}><option value="">Seleccionar asesor…</option>{admins.map((admin) => <option key={admin} value={admin}>{admin}</option>)}</select></label><div className="outcome-role-summary"><span>Agente de venta<strong>{leadOwners[pendingClientId] || currentUser}</strong></span><span>Asesor del cliente<strong>{selectedAdvisor || "Pendiente"}</strong></span></div><div className="manual-lead-actions"><Button type="button" variant="outline" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>Cancelar</Button><Button type="submit" disabled={!selectedAdvisor || !!convertingId}>{convertingId ? "Creando cliente…" : "Crear cliente"}</Button></div></form></div>}
      {pendingLostId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingLostId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); confirmLost(); }}><button className="drawer-close" type="button" onClick={() => setPendingLostId(null)}>×</button><span>MARCAR COMO LOST</span><h2>Motivo obligatorio</h2><p>Selecciona por qué se ha perdido este lead. Este dato quedará guardado para el análisis comercial.</p><label>Motivo<select required autoFocus value={lostReason} onChange={(event) => { setLostReason(event.target.value as LostReason | ""); if (event.target.value !== "other") setLostReasonDetail(""); }}><option value="">Seleccionar motivo…</option>{lostReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{lostReason === "other" && <label>Explicación breve<input required maxLength={120} value={lostReasonDetail} onChange={(event) => setLostReasonDetail(event.target.value)} placeholder="Escribe el motivo" /></label>}<div className="manual-lead-actions"><Button type="button" variant="outline" onClick={() => setPendingLostId(null)}>Cancelar</Button><Button type="submit" disabled={!lostReason || (lostReason === "other" && !lostReasonDetail.trim())}>Marcar como Lost</Button></div></form></div>}
    </div>
  );
}

function PersonalAnalytics({ path, currentUser, contacts, leadStages, snapshot }: { path: string; currentUser: string; contacts: Contact[]; leadStages: Record<string, CrmStage>; snapshot: PortalSnapshot | null }) {
  const key = path.split("/").filter(Boolean)[1] || "ventas";
  if (key === "ventas" || key === "finanzas" || key === "pagos") return <div className="page"><SalesOverview personalUser={currentUser} /></div>;
  const owned = contacts.filter((lead) => lead.owner === currentUser);
  const metrics = [
    { label: "Alumnos del portal", value: String(snapshot?.clients.length || 0), detail: "Datos del portal" },
    { label: "Leads asignados", value: String(owned.length), detail: currentUser },
    { label: "Clientes cerrados", value: String(owned.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente").length), detail: "CRM" },
    { label: "En onboarding", value: String(snapshot?.clients.filter((client) => client.requires_onboarding).length || 0), detail: "Requieren seguimiento" },
  ];
  return <div className="page"><Title name="Otras métricas" sub={`Carga operativa real · ${currentUser}`} eyebrow="OPERACIONES" /><ReadonlyMetricGrid metrics={metrics} /></div>;
}

function ReadonlyMetricGrid({ metrics }: { metrics: { label: string; value: string; detail: string }[] }) {
  return <section className="ads-kpi-grid">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section>;
}

function Campaigns({ currentUser, notify }: { currentUser: string; notify: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<MetaSnapshot | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [connection, setConnection] = useState("Conectando con Meta Marketing API…");
  async function syncMeta(force = false) {
    setSyncing(true);
    try {
      const data = await integrationClient.meta(force);
      setSnapshot(data);
      setConnection(`Sincronizado con ${data.account.name} · ${new Date(data.syncedAt).toLocaleString("es-ES")}`);
    }
    catch (error) { setConnection(error instanceof Error ? error.message : "No se pudo conectar con Meta"); }
    finally { setSyncing(false); }
  }
  useEffect(() => { void syncMeta(false); }, []);
  const euro = (value: number) => `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
  const summary = snapshot?.summary ?? { spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpc: 0, cpm: 0, leads: 0, purchases: 0, revenue: 0, cpl: 0, cac: 0, roas: 0 };
  const maxSpend = Math.max(...(snapshot?.daily.map((day) => day.spend) ?? [0]), 1);
  const maxCpm = Math.max(...(snapshot?.daily.map((day) => day.cpm) ?? [0]), 1);
  const statusLabel: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", ARCHIVED: "Archivada", DELETED: "Eliminada", CAMPAIGN_PAUSED: "Pausada", ADSET_PAUSED: "Pausada", IN_PROCESS: "En revisión", WITH_ISSUES: "Con incidencias" };
  if (syncing && !snapshot) return <div className="page"><DashboardLoader /></div>;
  return (
    <div className="page">
      <Title name="Meta Ads" sub={`Resultados reales de la cuenta publicitaria · acceso de ${currentUser}.`} eyebrow="CAMPAÑAS"><Button variant="outline" onClick={() => void syncMeta(true)} disabled={syncing}><Megaphone />{syncing ? "Sincronizando…" : "Actualizar datos"}</Button></Title>
      <div className="meta-banner"><ShieldCheck /><div><strong>{connection}</strong><p>Periodo: últimos 30 días · importes en {snapshot?.account.currency || "EUR"} · zona horaria {snapshot?.account.timezone || "de la cuenta"}</p></div><Badge variant="outline">DATOS REALES</Badge></div>
      <section className="ads-kpi-grid">{[
        ["Inversión", euro(summary.spend), "Gasto total"], ["Impresiones", summary.impressions.toLocaleString("es-ES"), `${(summary.impressions / 1000).toFixed(1)}k`], ["Clics", summary.clicks.toLocaleString("es-ES"), `${summary.ctr.toFixed(2)}% CTR`], ["CTR", `${summary.ctr.toFixed(2)}%`, "Clics / impresiones"],
        ["CPC medio", euro(summary.cpc), "Coste por clic"], ["CPM", euro(summary.cpm), "Coste por mil"], ["Alcance", summary.reach.toLocaleString("es-ES"), "Personas únicas"], ["Leads", summary.leads.toLocaleString("es-ES"), "Conversiones atribuidas"],
        ["CPL real", euro(summary.cpl), "Inversión / leads"], ["Ventas", summary.purchases.toLocaleString("es-ES"), "Compras atribuidas"], ["CAC", euro(summary.cac), "Inversión / ventas"], ["ROAS", `${summary.roas.toFixed(2)}×`, euro(summary.revenue)],
      ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
      <div className="sales-analysis-grid"><section className="panel clean-chart"><h2>Inversión diaria</h2><div className="metric-bars">{snapshot?.daily.map((day) => <div key={day.date} title={`${day.date}: ${euro(day.spend)}`}><span style={{ height: `${Math.max(2, day.spend / maxSpend * 100)}%` }} /><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit" })}</small></div>)}</div></section><section className="panel clean-chart"><h2>CPM diario</h2><div className="metric-bars gold-bars">{snapshot?.daily.map((day) => <div key={day.date} title={`${day.date}: ${euro(day.cpm)}`}><span style={{ height: `${Math.max(2, day.cpm / maxCpm * 100)}%` }} /><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit" })}</small></div>)}</div></section></div>
      <section className="panel campaign-panel"><div className="panel-heading"><div><h2>Campañas</h2><p>Datos reales · últimos 30 días</p></div></div><div className="data-table"><table><thead><tr><th>Campaña</th><th>Estado</th><th>Inversión</th><th>Leads</th><th>CPL</th><th>ROAS</th></tr></thead><tbody>{snapshot?.campaigns.map((row) => <tr key={row.id}><td><b>{row.name}</b><small>ID: {row.id}</small></td><td><Badge variant="outline">{statusLabel[row.status] || row.status}</Badge></td><td>{euro(row.spend)}</td><td>{row.leads.toLocaleString("es-ES")}</td><td>{euro(row.cpl)}</td><td>{row.roas.toFixed(2)}×</td></tr>)}{snapshot && snapshot.campaigns.length === 0 && <tr><td colSpan={6}>No hay campañas con entrega en los últimos 30 días.</td></tr>}</tbody></table></div></section>
    </div>
  );
}
