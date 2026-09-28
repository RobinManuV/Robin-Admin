"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  GraduationCap,
  Landmark,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage, LeadCategory } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import { adminDataClient } from "@/services/admin-data";
import type { FinanceSnapshot, IntegrationStatus, MetaSnapshot } from "@/services/integrations";
import type { PortalSnapshot } from "@/services/portal";

type FeatureModuleProps = {
  path: string;
  notify: (message: string) => void;
  currentUser: string;
  admins: string[];
  contacts: Contact[];
  leadOwners: Record<string, string>;
  onAssignLead: (id: string, owner: string) => void;
  leadStages: Record<string, CrmStage>;
  onMoveLead: (id: string, stage: CrmStage) => void;
  leadCategories: Record<string, LeadCategory | "">;
  onCategorizeLead: (id: string, category: LeadCategory | "") => void;
  leadHeat: Record<string, number>;
  onSetLeadHeat: (id: string, heat: number) => void;
  leadNotes: Record<string, string>;
  onSetLeadNotes: (id: string, notes: string) => void;
  leadLostDates: Record<string, string>;
  portalSnapshot: PortalSnapshot | null;
  portalConnected: boolean;
  onPortalRefresh: () => Promise<void>;
  onAddAdmin: (name: string) => void;
};

export function FeatureModule(props: FeatureModuleProps) {
  const { path } = props;
  if (path === "/bandeja-leads") return <LeadInbox {...props} />;
  if (path === "/alumnos-global") return <GlobalStudents snapshot={props.portalSnapshot} connected={props.portalConnected} contacts={props.contacts} />;
  if (path === "/analitica-global") return <GlobalAnalytics />;
  if (path === "/pagos") return <GlobalPayments snapshot={props.portalSnapshot} connected={props.portalConnected} />;
  if (path === "/configuracion") return <Configuration {...props} />;
  if (path.startsWith("/alumnos/")) return <StudentProfile id={path.slice("/alumnos/".length)} contacts={props.contacts} snapshot={props.portalSnapshot} />;
  if (path === "/alumnos") return <StudentPortal currentUser={props.currentUser} snapshot={props.portalSnapshot} />;
  if (path.startsWith("/crm")) return <Crm {...props} />;
  if (path.startsWith("/analiticas")) return <PersonalAnalytics path={path} currentUser={props.currentUser} />;
  if (path.startsWith("/campanas")) return <Campaigns currentUser={props.currentUser} notify={props.notify} />;
  if (path === "/suscripcion") return <SubscriptionAdmin />;
  return <div className="page"><div className="empty"><AlertTriangle /><h2>Vista no disponible</h2><p>Esta sección ya no forma parte de la nueva navegación.</p></div></div>;
}

function Title({ name, sub, eyebrow = "ROBIN ADMIN PLATFORM", children }: { name: string; sub: string; eyebrow?: string; children?: React.ReactNode }) {
  return <div className="title"><div><span>{eyebrow}</span><h1>{name}</h1><p>{sub}</p></div><div>{children}</div></div>;
}

function portalProfileHref(portalUrl: string, clientId: string) {
  return `${portalUrl}/portal/alumnos/${encodeURIComponent(clientId)}`;
}

function SubscriptionAdmin() {
  return (
    <div className="page">
      <Title name="Suscripción" sub="Gestión centralizada de planes, renovaciones y accesos." eyebrow="ROBIN ADMIN PLATFORM" />
      <section className="portal-placeholder">
        <i><WalletCards /></i>
        <Badge variant="outline">PRÓXIMAMENTE</Badge>
        <h2>Administración de suscripciones</h2>
        <p>Esta sección se conectará con el menú de administración de suscripciones para gestionar planes, estados de pago, renovaciones y clientes.</p>
        <Button disabled><WalletCards />Conexión pendiente de configurar</Button>
      </section>
    </div>
  );
}

function LeadInbox({ admins, contacts, leadOwners, leadStages, onAssignLead, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.email} ${contact.source}`.toLowerCase().includes(query.toLowerCase())), [contacts, query]);
  return (
    <div className="page">
      <Title name="Bandeja de entrada de leads" sub="Asigna cada nuevo lead al administrador que lo gestionará." eyebrow="INICIO · VISTA GLOBAL">
        <Badge variant="outline">{list.length} LEADS</Badge>
      </Title>
      <div className="module-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, email o canal…" /></label>
        <Button variant="outline"><Filter />Filtros</Button>
      </div>
      <section className="panel inbox-panel">
        <div className="data-table">
          <table>
            <thead><tr><th>Lead</th><th>Origen</th><th>Estado</th><th>Valor</th><th>Asignar a</th></tr></thead>
            <tbody>
              {list.map((contact) => (
                <tr key={contact.id}>
                  <td><b>{contact.name}</b><small>{contact.email}</small></td>
                  <td>{contact.source}</td>
                  <td><Badge variant="outline">{leadStages[contact.id]}</Badge></td>
                  <td>{contact.value.toLocaleString("es-ES")} €</td>
                  <td>
                    <select
                      className="owner-select"
                      value={leadOwners[contact.id] || ""}
                      onChange={(event) => {
                        onAssignLead(contact.id, event.target.value);
                        notify(`${contact.name} asignado a ${event.target.value}`);
                      }}
                    >
                      <option value="">Sin asignar</option>
                      {admins.map((admin) => <option key={admin}>{admin}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="assignment-note"><UserCheck /> Al asignar un lead, aparecerá inmediatamente en el CRM personal del usuario seleccionado.</p>
    </div>
  );
}

function GlobalStudents({ snapshot, connected, contacts }: { snapshot: PortalSnapshot | null; connected: boolean; contacts: Contact[] }) {
  if (connected && !snapshot) return <div className="page"><Title name="Alumnos" sub="Sincronizando con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL" /><div className="empty compact"><GraduationCap /><h2>Cargando alumnos…</h2></div></div>;
  if (snapshot) return <div className="page"><Title name="Alumnos" sub="Clientes sincronizados con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL"><Badge variant="outline">{snapshot.clients.length} ALUMNOS</Badge></Title><div className="student-grid">{snapshot.clients.map((client) => <a key={client.id} className="student-card" href={`/alumnos/${client.id}`}><i>{`${client.nombre?.[0] || ""}${client.apellidos?.[0] || ""}` || "R"}</i><div><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email || "Sin email"}</p><span>{client.tipo || "general"} · Fase {client.application_phase || 1}</span></div><Badge variant="outline">{client.requires_onboarding ? "Onboarding" : "Activo"}</Badge><ChevronRight /></a>)}</div></div>;
  return (
    <div className="page">
      <Title name="Alumnos" sub="Vista global de alumnos y acceso a su perfil." eyebrow="INICIO · VISTA GLOBAL">
        <Button><Plus />Añadir alumno</Button>
      </Title>
      <div className="student-grid">
        {contacts.map((contact) => (
          <a key={contact.id} className="student-card" href={`/alumnos/${contact.portalUserId || contact.id}`}>
            <i>{contact.initials}</i>
            <div><h3>{contact.name}</h3><p>{contact.university}</p><span>{contact.course}</span></div>
            <Badge variant="outline">{contact.status}</Badge>
            <ChevronRight />
          </a>
        ))}
      </div>
    </div>
  );
}

function StudentProfile({ id, contacts, snapshot }: { id: string; contacts: Contact[]; snapshot: PortalSnapshot | null }) {
  const client = snapshot?.clients.find((item) => item.id === id);
  const contact = contacts.find((item) => item.portalUserId === id || item.id === id);
  const name = client ? [client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email : contact?.name || "Alumno";
  return <div className="page"><Title name={name} sub="Ficha individual del alumno." eyebrow="ALUMNOS · PERFIL" /><section className="portal-placeholder"><i><GraduationCap /></i><Badge variant="outline">CONEXIÓN PENDIENTE</Badge><h2>Perfil de alumno</h2><p>Esta ficha se conectará al perfil del alumno dentro del portal de aplicación. No corresponde a la ficha de un lead del CRM.</p>{client && snapshot ? <a className="portal-link-button" href={portalProfileHref(snapshot.portalUrl, client.id)} target="_blank" rel="noreferrer"><ExternalLink />Abrir perfil en el portal</a> : <Button disabled><ExternalLink />Perfil pendiente de conectar</Button>}</section></div>;
}

function ContactDrawer({ contact, onClose, heat = contact.heat || 50, notes = contact.notes || "", onHeatChange, onNotesChange, leadMode = false }: { contact: Contact; onClose: () => void; heat?: number; notes?: string; onHeatChange?: (value: number) => void; onNotesChange?: (value: string) => void; leadMode?: boolean }) {
  const [localHeat, setLocalHeat] = useState(heat);
  const [localNotes, setLocalNotes] = useState(notes);
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [sending, setSending] = useState(false);
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
        <section className="whatsapp-detail"><h3><MessageCircle /> WhatsApp</h3><p>{contact.phone}</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un mensaje…" /><Button variant="outline" onClick={sendMessage} disabled={sending || !message.trim()}>{sending ? "Enviando…" : "Enviar por WhatsApp"}</Button>{messageStatus && <small>{messageStatus}</small>}</section>
        <section className="heat-control"><h3><Flame /> Heat del lead <b>{localHeat}</b></h3><input type="range" min="0" max="100" value={localHeat} onChange={(event) => { const value = Number(event.target.value); setLocalHeat(value); onHeatChange?.(value); }} /><div><span>Frío</span><span>Caliente</span></div></section>
        <section className="lead-notes"><h3>Notas del equipo</h3><textarea value={localNotes} onChange={(event) => { setLocalNotes(event.target.value); onNotesChange?.(event.target.value); }} placeholder="Añade contexto, objeciones y próximos pasos…" /><small>Guardado automáticamente en este espacio de trabajo.</small></section>
        {!leadMode && <><section><h3>Información académica</h3><dl><div><dt>Universidad</dt><dd>{contact.university}</dd></div><div><dt>Curso</dt><dd>{contact.course}</dd></div><div><dt>País</dt><dd>{contact.country}</dd></div></dl></section><section><h3>Próxima acción</h3><p>{contact.nextAction}</p></section></>}
      </aside>
    </div>
  );
}

const globalStats = [
  ["Ingresos acumulados", "142.680 €", "+18,6% interanual", CircleDollarSign],
  ["Conversión total", "12,8%", "+2,4 puntos", TrendingUp],
  ["Alumnos activos", "128", "+19 este mes", GraduationCap],
  ["Coste por lead", "27,94 €", "-9,6%", BarChart3],
] as const;

function GlobalAnalytics() {
  return (
    <div className="page">
      <Title name="Analíticas generales" sub="Rendimiento consolidado de Robin." eyebrow="INICIO · VISTA GLOBAL" />
      <section className="stats">{globalStats.map(([label, value, detail, Icon], index) => <article key={label}><i className={index === 1 ? "green" : index === 3 ? "gold" : ""}><Icon /></i><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
      <div className="analytics-grid">
        <section className="panel metric-panel"><h2>Crecimiento mensual</h2><div className="metric-bars">{[["Abr", 54], ["May", 62], ["Jun", 58], ["Jul", 76], ["Ago", 84], ["Sep", 92]].map(([month, value]) => <div key={month}><span style={{ height: `${value}%` }} /><small>{month}</small></div>)}</div></section>
        <section className="panel performance-list"><h2>Rendimiento por área</h2>{[["Ventas", "94%", "green"], ["Operaciones", "86%", "blue"], ["Finanzas", "78%", "gold"], ["Campañas", "71%", "gray"]].map(([label, value, tone]) => <div key={label}><span>{label}</span><div><i className={tone} style={{ width: value }} /></div><strong>{value}</strong></div>)}</section>
      </div>
    </div>
  );
}

function GlobalPayments({ snapshot, connected }: { snapshot: PortalSnapshot | null; connected: boolean }) {
  if (connected && !snapshot) return <div className="page"><Title name="Pagos y facturación" sub="Sincronizando pagos con el portal." eyebrow="INICIO · VISTA GLOBAL" /><div className="empty compact"><WalletCards /><h2>Cargando pagos…</h2></div></div>;
  if (snapshot) {
    const byId = new Map(snapshot.clients.map((client) => [client.id, client]));
    const billed = snapshot.clients.reduce((total, client) => {
      const contracted = Number(client.contracted_amount || snapshot.payments.filter((payment) => payment.user_id === client.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
      return total + (client.is_latam ? contracted : contracted / 1.21);
    }, 0);
    const collected = snapshot.payments.filter((payment) => payment.status === "paid").reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const pendingPayments = snapshot.payments.filter((payment) => !["paid", "failed"].includes(payment.status));
    const pending = pendingPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(); date.setMonth(date.getMonth() - (5 - index));
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const sameMonth = (value?: string) => { const dateValue = value ? new Date(value) : null; return dateValue ? `${dateValue.getFullYear()}-${dateValue.getMonth()}` === monthKey : false; };
      return { month: date.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""), contratado: snapshot.clients.filter((client) => sameMonth(client.created_at)).reduce((sum, client) => sum + (client.is_latam ? Number(client.contracted_amount || 0) : Number(client.contracted_amount || 0) / 1.21), 0), cobrado: snapshot.payments.filter((payment) => payment.status === "paid" && sameMonth(payment.paid_at || payment.created_at)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0) };
    });
    return <div className="page"><Title name="Pagos y facturación" sub="Contratado desde el portal de aplicación; cobros y pendientes desde Holded o el portal." eyebrow="INICIO · VISTA GLOBAL" /><section className="stats mini"><article><i><WalletCards /></i><div><span>Contratado</span><strong>{billed.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €</strong><small>Sin IVA · excepto LATAM</small></div></article><article><i className="green"><Check /></i><div><span>Cobrado</span><strong>{collected.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €</strong><small>{snapshot.connections.holded ? "Holded" : "Portal de aplicación"}</small></div></article><article className="pending-stat"><i className="red"><CircleDollarSign /></i><div><span>Pendiente</span><strong>{pending.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €</strong><small>{pendingPayments.length} cuotas pendientes</small></div></article></section><section className="panel payment-chart"><div className="panel-heading"><div><h2>Facturado y cobrado por mes</h2><p>Contratado sin IVA frente a cobros registrados</p></div></div><ResponsiveContainer width="100%" height={280}><BarChart data={months} margin={{ left: -12, right: 10 }}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => `${Number(value).toLocaleString("es-ES")} €`} /><Bar dataKey="contratado" name="Contratado" fill="#1f416f" radius={[4, 4, 0, 0]} /><Bar dataKey="cobrado" name="Cobrado" fill="#4a8a72" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="panel pending-payments"><div className="panel-heading"><div><h2>Pendientes de cobro</h2><p>Abre el perfil del alumno para revisar su situación.</p></div></div>{pendingPayments.length ? <div>{pendingPayments.map((payment) => { const client = byId.get(payment.user_id); return <a key={payment.id} href={client ? portalProfileHref(snapshot.portalUrl, client.id) : `${snapshot.portalUrl}/portal/`} target="_blank" rel="noreferrer"><div><strong>{[client?.nombre, client?.apellidos].filter(Boolean).join(" ") || client?.email || payment.user_id}</strong><small>{payment.concept || `Cuota ${payment.installment}`}</small></div><b>{Number(payment.amount).toLocaleString("es-ES")} {payment.currency || "EUR"}</b><ChevronRight /></a>; })}</div> : <p className="empty-copy">No hay pagos pendientes.</p>}</section></div>;
  }
  return (
    <div className="page">
      <Title name="Pagos y facturación" sub="Conecta el portal de aplicación y Holded para ver datos financieros reales." eyebrow="INICIO · VISTA GLOBAL" />
      <div className="empty compact"><WalletCards /><h2>Datos financieros pendientes de sincronizar</h2><p>El apartado mostrará contratado, cobrado, pendientes y el gráfico mensual al conectar el portal de aplicación.</p></div>
    </div>
  );
}

function Configuration({ admins, onAddAdmin, currentUser }: FeatureModuleProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  useEffect(() => { integrationClient.status().then(setIntegrationStatus).catch(() => setIntegrationStatus(null)); }, []);
  return (
    <div className="page">
      <Title name="Configuración" sub="Gestiona los usuarios con acceso al portal." eyebrow="INICIO · VISTA GLOBAL"><Button onClick={() => setAdding(true)}><UserPlus />Añadir usuario</Button></Title>
      {adding && (
        <form className="panel add-user-form" onSubmit={(event) => { event.preventDefault(); onAddAdmin(name); setName(""); setAdding(false); }}>
          <div><h2>Nuevo usuario administrador</h2><p>Esta acción solo se guardará en la demo local.</p></div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del usuario" autoFocus />
          <Button type="submit">Añadir</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
        </form>
      )}
      <section className="admin-grid">
        {admins.map((admin) => <article className="panel" key={admin}><i>{admin.slice(0, 2).toUpperCase()}</i><div><h3>{admin}</h3><p>Administrador{admin === currentUser ? " · Usuario actual" : ""}</p></div><Badge variant="outline">Activo</Badge><button><MoreHorizontal /></button></article>)}
      </section>
      <div className="integration-heading"><div><h2>Conexiones de producción</h2><p>Las credenciales se leen exclusivamente desde las variables de entorno de Netlify.</p></div><ShieldCheck /></div>
      <section className="connection-grid">
        {[
          ["Holded", integrationStatus?.holded, "HOLDED_API_KEY en este gestor · HOLDED_API_PAT en el portal de aplicación"],
          ["Meta Marketing API", integrationStatus?.meta, "META_ACCESS_TOKEN · META_AD_ACCOUNT_ID · META_API_VERSION"],
          ["Stripe", integrationStatus?.stripe, "STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET en el portal de aplicación"],
          ["Email de alta", integrationStatus?.email, "RESEND_API_KEY · RESEND_FROM en el portal de aplicación"],
          ["Portal de aplicación", integrationStatus?.applicationPortal, "APPLICATION_PORTAL_URL · APPLICATION_PORTAL_SYNC_SECRET"],
          ["Base de datos del gestor", integrationStatus?.adminDatabase, "ADMIN_SUPABASE_URL · ADMIN_SUPABASE_SECRET_KEY"],
        ].map(([label, connected, variables]) => <article className="panel connection-card" key={String(label)}><div><i className={connected ? "connected" : ""} /><h3>{label}</h3><Badge variant="outline">{connected ? "Conectado" : "Pendiente"}</Badge></div><p>{variables}</p></article>)}
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

function CategoryPicker({ value, onChange }: { value: LeadCategory | ""; onChange: (value: LeadCategory) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={`category-picker ${open ? "open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{value || "Seleccionar…"}</span><ChevronDown /></button>
    {open && <div className="category-options" role="listbox">{leadCategories.map((category) => <button type="button" role="option" aria-selected={value === category} key={category} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>)}</div>}
  </div>;
}

function Crm({ path, currentUser, contacts, leadOwners, leadStages, onMoveLead, leadCategories: categories, onCategorizeLead, leadHeat, onSetLeadHeat, leadNotes, onSetLeadNotes, leadLostDates, portalSnapshot, portalConnected, onPortalRefresh, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [lostCategory, setLostCategory] = useState("");
  const [lostHeat, setLostHeat] = useState("0");
  const [lostFrom, setLostFrom] = useState("");
  const [lostTo, setLostTo] = useState("");
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const owned = useMemo(() => contacts.filter((contact) => leadOwners[contact.id] === currentUser && `${contact.name} ${contact.email} ${contact.source}`.toLowerCase().includes(query.toLowerCase())), [contacts, currentUser, leadOwners, query]);

  function openContact(contact: Contact) {
    setSelected({ ...contact, owner: currentUser, category: categories[contact.id] || undefined, heat: leadHeat[contact.id], notes: leadNotes[contact.id] });
  }

  async function dropLead(stage: CrmStage) {
    const leadId = draggingId;
    if (!leadId) return;
    setDraggingId(null);
    if (stage !== "Cliente") {
      onMoveLead(leadId, stage);
      notify(stage === "Lost" ? "Lead marcado como perdido" : `Lead movido a ${stage}`);
      return;
    }
    const contact = contacts.find((item) => item.id === leadId);
    const clientType = categories[leadId];
    if (!contact || !clientType) {
      notify("No se puede crear el cliente sin email y tipo de contrato");
      return;
    }
    setConvertingId(leadId);
    notify(`Creando la cuenta de ${contact.name} en el portal…`);
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      onMoveLead(leadId, "Cliente");
      setConvertingId(null);
      notify(`Vista previa: ${contact.name} ha pasado a Clientes`);
      return;
    }
    try {
      const result = await integrationClient.convertLead({ leadId, name: contact.name, email: contact.email, advisor: currentUser, clientType });
      onMoveLead(leadId, "Cliente");
      await onPortalRefresh();
      if (result.result === "exists") notify(`${contact.name} ya existía en el portal y se ha vinculado como cliente`);
      else if (result.emailSent) notify(`Cuenta creada para ${contact.name} y correo de acceso enviado`);
      else notify(`Cuenta creada para ${contact.name}; el correo no pudo enviarse y queda pendiente`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo crear la cuenta en el portal");
    } finally { setConvertingId(null); }
  }

  function startDragging(leadId: string) {
    setDraggingId(leadId);
    window.requestAnimationFrame(() => boardWrapRef.current?.scrollTo({ left: boardWrapRef.current.scrollWidth, behavior: "smooth" }));
  }

  const title = path === "/crm/contactados" ? "Pipeline de contactados" : path === "/crm/clientes" ? "Clientes" : path === "/crm/lost" ? "Lost" : "Por contactar";
  return (
    <div className="page">
      <Title name={title} sub={`Cartera comercial de ${currentUser}.`} eyebrow="CRM PERSONAL"><Badge variant="outline">{owned.length} REGISTROS</Badge></Title>
      <div className="module-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en mi cartera…" /></label><Button variant="outline"><Filter />Filtros</Button></div>

      {path === "/crm" && (
        <div className="qualification-grid">
          {owned.filter((contact) => leadStages[contact.id] === "Por contactar").map((contact) => (
            <article className="qualification-card" key={contact.id}>
              <button className="card-main" onClick={() => openContact(contact)}><small>{contact.source}</small><h3>{contact.name}</h3><p>{contact.email}</p><span><Flame /> Heat {leadHeat[contact.id]}</span></button>
              <label>Categoría obligatoria<CategoryPicker value={categories[contact.id] || ""} onChange={(category) => onCategorizeLead(contact.id, category)} /></label>
              <Button disabled={!categories[contact.id]} onClick={() => { onMoveLead(contact.id, "Contactado"); notify(`${contact.name} ha pasado a Contactado`); }}>Pasar a contactado<ArrowRight /></Button>
            </article>
          ))}
          {!owned.some((contact) => leadStages[contact.id] === "Por contactar") && <div className="empty compact"><UserCheck /><h2>No hay leads por contactar</h2><p>Los nuevos leads asignados a {currentUser} aparecerán aquí.</p></div>}
        </div>
      )}

      {path === "/crm/contactados" && (
        <div className="crm-board-wrap" ref={boardWrapRef}>
          <div className="crm-board show-outcomes">
            {salesStages.map((stage) => (
              <section key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead(stage)}>
                <header><strong>{stage}</strong><span>{owned.filter((contact) => leadStages[contact.id] === stage).length}</span></header>
                {owned.filter((contact) => leadStages[contact.id] === stage).map((contact) => (
                  <button draggable={!convertingId} disabled={convertingId === contact.id} className="pipeline-card" key={contact.id} onDragStart={() => startDragging(contact.id)} onDragEnd={() => setDraggingId(null)} onClick={() => openContact(contact)}>
                    <div><Badge variant="outline">{categories[contact.id] || "Sin categoría"}</Badge><span className={`heat-pill heat-${Math.ceil((leadHeat[contact.id] || 0) / 25)}`}><Flame />{leadHeat[contact.id]}</span></div>
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

      {path === "/crm/clientes" && <div className="personal-leads">{portalConnected && !portalSnapshot ? <div className="empty compact"><GraduationCap /><h2>Cargando clientes…</h2></div> : portalSnapshot ? portalSnapshot.clients.filter((client) => client.assigned_to === portalSnapshot.admin.email).map((client) => <a className="lead-card" key={client.id} href={portalProfileHref(portalSnapshot.portalUrl, client.id)} target="_blank" rel="noreferrer"><small>{client.tipo || "general"}</small><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email}</p><div><span>Fase {client.application_phase || 1}</span><strong>{client.pago_completed ? "Al corriente" : "Onboarding"}</strong></div><footer>Abrir en portal<ChevronRight /></footer></a>) : owned.filter((contact) => leadStages[contact.id] === "Cliente").map((contact) => <button className="lead-card" key={contact.id} onClick={() => openContact(contact)}><small>{categories[contact.id]}</small><h3>{contact.name}</h3><p>{contact.email}</p><div><span>Agente de venta: {currentUser}</span><strong>{contact.value.toLocaleString("es-ES")} €</strong></div><footer>Ver portal del cliente<ChevronRight /></footer></button>)}</div>}

      {path === "/crm/lost" && <><div className="lost-filters"><label>Desde<input type="date" value={lostFrom} onChange={(event) => setLostFrom(event.target.value)} /></label><label>Hasta<input type="date" value={lostTo} onChange={(event) => setLostTo(event.target.value)} /></label><label>Categoría<select value={lostCategory} onChange={(event) => setLostCategory(event.target.value)}><option value="">Todas</option>{leadCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Heat mínimo<input type="number" min="0" max="100" value={lostHeat} onChange={(event) => setLostHeat(event.target.value)} /></label></div><div className="data-table panel"><table><thead><tr><th>Lead</th><th>Categoría</th><th>Heat final</th><th>Origen</th><th>Fecha Lost</th></tr></thead><tbody>{owned.filter((contact) => { const lostDate = leadLostDates[contact.id] || ""; return leadStages[contact.id] === "Lost" && (!lostCategory || categories[contact.id] === lostCategory) && leadHeat[contact.id] >= Number(lostHeat || 0) && (!lostFrom || lostDate >= lostFrom) && (!lostTo || lostDate <= lostTo); }).map((contact) => <tr key={contact.id} onClick={() => openContact(contact)}><td><b>{contact.name}</b><small>{contact.email}</small></td><td>{categories[contact.id]}</td><td>{leadHeat[contact.id]}</td><td>{contact.source}</td><td>{leadLostDates[contact.id] || "—"}</td></tr>)}</tbody></table></div></>}

      {selected && <ContactDrawer contact={selected} leadMode heat={leadHeat[selected.id]} notes={leadNotes[selected.id]} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onNotesChange={(value) => onSetLeadNotes(selected.id, value)} onClose={() => setSelected(null)} />}
    </div>
  );
}

type EditableMetric = { id: string; label: string; value: string; detail: string; group?: string };

function useEditableMetrics(storageKey: string, defaults: EditableMetric[]) {
  const [metrics, setMetrics] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    adminDataClient.listMetrics(storageKey).then((saved) => {
      if (!active) return;
      if (saved.length) setMetrics(saved);
      setLoaded(true);
    }).catch(() => {
      if (!active) return;
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try { setMetrics(JSON.parse(saved)); }
        catch { window.localStorage.removeItem(storageKey); }
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify(metrics));
    const timer = window.setTimeout(() => { void adminDataClient.replaceMetrics(storageKey, metrics).catch(() => undefined); }, 600);
    return () => window.clearTimeout(timer);
  }, [loaded, metrics, storageKey]);
  const update = (id: string, patch: Partial<EditableMetric>) => setMetrics((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  return { metrics, setMetrics, update };
}

function EditableMetricGrid({ metrics, onChange }: { metrics: EditableMetric[]; onChange: (id: string, patch: Partial<EditableMetric>) => void }) {
  return <div className="editable-metrics">{metrics.map((metric) => <article key={metric.id}><span>{metric.label}</span><input value={metric.value} onChange={(event) => onChange(metric.id, { value: event.target.value })} aria-label={`Valor de ${metric.label}`} /><input className="metric-detail-input" value={metric.detail} onChange={(event) => onChange(metric.id, { detail: event.target.value })} aria-label={`Detalle de ${metric.label}`} /><small>Editable</small></article>)}</div>;
}

const simpleAnalytics: Record<string, { title: string; subtitle: string; metrics: EditableMetric[] }> = {
  pagos: { title: "Pagos y facturación", subtitle: "Cobros asociados a tu cartera", metrics: [{ id: "billed", label: "Facturado", value: "8.420 €", detail: "+14%" }, { id: "collected", label: "Cobrado", value: "6.780 €", detail: "80,5%" }, { id: "pending", label: "Pendiente", value: "1.640 €", detail: "3 facturas" }, { id: "avg", label: "Ticket medio", value: "2.106 €", detail: "+8%" }] },
  operaciones: { title: "Operaciones", subtitle: "Eficiencia y carga de trabajo", metrics: [{ id: "students", label: "Alumnos activos", value: "18", detail: "+3" }, { id: "tasks", label: "Tareas abiertas", value: "12", detail: "4 urgentes" }, { id: "response", label: "Tiempo de respuesta", value: "21 min", detail: "-8 min" }, { id: "csat", label: "Satisfacción", value: "4,8/5", detail: "+0,2" }] },
};

function PersonalAnalytics({ path, currentUser }: { path: string; currentUser: string }) {
  const key = path.split("/").filter(Boolean)[1] || "general";
  if (key === "general") return <FinanceGeneral />;
  if (key === "pnl") return <HoldedPlaceholder title="P&L" description="La cuenta de pérdidas y ganancias se mostrará exactamente con la estructura de Holded cuando se complete la conexión." icon={<Landmark />} />;
  if (key === "facturacion-cobros-gastos") return <HoldedPlaceholder title="Facturación, cobros y gastos" description="Aquí se consolidarán facturas emitidas, cobros realizados y gastos desde Holded." icon={<WalletCards />} />;
  if (key === "ventas") return <SalesAnalytics currentUser={currentUser} />;
  if (key === "tax") return <TaxOverview />;
  if (key === "ajustes") return <FinanceSettings />;
  return <FinanceGeneral />;
}

function FinanceGeneral() {
  const clientMargins = ["Delft", "General", "Llegada", "Mentoría", "LATAM", "Especial"].map((type) => ({ type, margin: 0 }));
  return <div className="page"><Title name="General" sub="Resumen financiero operativo de Robin." eyebrow="FINANZAS · GENERAL" /><section className="stats mini"><article><i><WalletCards /></i><div><span>Cash disponible</span><strong>—</strong><small>Pendiente de conectar Holded</small></div></article><article><i className="gold"><CircleDollarSign /></i><div><span>Upcoming cash</span><strong>—</strong><small>Cobros pendientes</small></div></article><article><i className="red"><Landmark /></i><div><span>Upcoming pagos</span><strong>—</strong><small>IVA, gastos fijos y pagos pendientes</small></div></article></section><div className="finance-general-grid"><HoldedPlaceholder title="Facturación y cobros" description="Se mostrarán facturado, cobrado y pendiente con los datos de Holded y del portal de aplicación." icon={<WalletCards />} compact /><section className="panel"><div className="panel-heading"><div><h2>Margen por cliente y CAC</h2><p>Configurado desde Ajustes</p></div></div><div className="holded-summary"><article><span>Margen por cliente</span><strong>—</strong><small>Cobrado neto − coste variable</small></article><article><span>CAC</span><strong>—</strong><small>Marketing y ventas ÷ clientes nuevos</small></article></div></section><section className="panel finance-margin-chart"><div className="panel-heading"><div><h2>Tipos de cliente por margen</h2><p>Delft, General y otros tipos</p></div></div><ResponsiveContainer width="100%" height={260}><BarChart data={clientMargins} layout="vertical" margin={{ left: 15, right: 20 }}><CartesianGrid horizontal={false} stroke="#e8edf3" /><XAxis type="number" axisLine={false} tickLine={false} /><YAxis type="category" dataKey="type" width={65} axisLine={false} tickLine={false} /><Tooltip formatter={() => "Pendiente de conexión"} /><Bar dataKey="margin" name="Margen" fill="#1f416f" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer><p className="empty-copy">Los márgenes se clasificarán cuando Holded y el portal estén conectados.</p></section></div></div>;
}

function HoldedPlaceholder({ title, description, icon, compact = false }: { title: string; description: string; icon: React.ReactNode; compact?: boolean }) {
  return <section className={`panel finance-placeholder${compact ? " compact" : ""}`}><i>{icon}</i><Badge variant="outline">PENDIENTE DE CONEXIÓN</Badge><h2>{title}</h2><p>{description}</p></section>;
}

function TaxOverview() {
  return <div className="page"><Title name="Tax" sub="Sociedades y retenciones desde Holded." eyebrow="FINANZAS · TAX" /><HoldedPlaceholder title="Sociedades y retenciones" description="Esta vista será informativa y reunirá los importes, vencimientos y obligaciones fiscales procedentes de Holded. La configuración se gestiona desde Ajustes." icon={<FileText />} /><a className="portal-link-button" href="/analiticas/ajustes">Abrir ajustes de fórmulas y tax<ChevronRight /></a></div>;
}

const financeFormulaDefaults: EditableMetric[] = [
  { id: "margin", label: "Fórmula de margen por cliente", value: "Cobrado neto − coste variable", detail: "El IVA se excluye del cobrado neto" },
  { id: "variable-cost", label: "Coste variable por defecto", value: "0 €", detail: "Se restará al margen de cada cliente" },
  { id: "cac", label: "Fórmula de CAC", value: "Marketing + ventas ÷ clientes nuevos", detail: "Gastos obtenidos de Holded" },
  { id: "tax", label: "Fuente de sociedades y retenciones", value: "Holded", detail: "Vista informativa en Tax" },
];

function FinanceSettings() {
  const { metrics, update } = useEditableMetrics("robin-finance-formulas", financeFormulaDefaults);
  return <div className="page"><Title name="Ajustes" sub="Personaliza los cálculos que se usarán en Finanzas." eyebrow="FINANZAS · AJUSTES" /><section className="panel finance-settings-note"><h2>Cómo se calcularán las métricas</h2><p>El margen por cliente partirá del cobrado sin IVA y restará el coste variable definido. El CAC dividirá los gastos de marketing y ventas de Holded entre los clientes nuevos del periodo seleccionado.</p></section><EditableMetricGrid metrics={metrics} onChange={update} /></div>;
}

function SimpleEditableAnalytics({ data, currentUser, storageKey }: { data: { title: string; subtitle: string; metrics: EditableMetric[] }; currentUser: string; storageKey: string }) {
  const { metrics, update } = useEditableMetrics(storageKey, data.metrics);
  return <div className="page"><Title name={data.title} sub={`${data.subtitle} · ${currentUser}`} eyebrow="ANALÍTICAS PERSONALES"><Badge variant="outline">DATOS EDITABLES</Badge></Title><EditableMetricGrid metrics={metrics} onChange={update} /><section className="panel clean-chart"><h2>Evolución mensual</h2><div className="metric-bars">{[["Abr", 38], ["May", 54], ["Jun", 49], ["Jul", 68], ["Ago", 77], ["Sep", 88]].map(([month, value]) => <div key={month}><span style={{ height: `${value}%` }} /><small>{month}</small></div>)}</div></section></div>;
}

const financeDefaults: EditableMetric[] = [
  { id: "mrr", group: "Ingresos recurrentes", label: "MRR", value: "12.680 €", detail: "Ingreso recurrente mensual" },
  { id: "arr", group: "Ingresos recurrentes", label: "ARR", value: "152.160 €", detail: "MRR × 12" },
  { id: "nrr", group: "Ingresos recurrentes", label: "Net revenue retention", value: "108%", detail: "Expansión neta de churn" },
  { id: "churn", group: "Ingresos recurrentes", label: "Churn de suscripciones", value: "3,2%", detail: "Este mes" },
  { id: "gmv", group: "Marketplace y comisiones", label: "GMV", value: "84.200 €", detail: "Volumen bruto" },
  { id: "take-rate", group: "Marketplace y comisiones", label: "Take rate", value: "14,8%", detail: "Comisión / GMV" },
  { id: "commission", group: "Marketplace y comisiones", label: "Comisión efectiva", value: "12.461 €", detail: "Ingreso neto por comisiones" },
  { id: "payouts", group: "Marketplace y comisiones", label: "Payouts pendientes", value: "8.940 €", detail: "Pasarela pendiente de definir" },
  { id: "retention", group: "Retención y segmentos", label: "Retención cohorte M3", value: "82%", detail: "Suscripciones activas" },
  { id: "sellers", group: "Retención y segmentos", label: "Sellers activos", value: "46", detail: "Segmento profesional" },
  { id: "buyers", group: "Retención y segmentos", label: "Buyers activos", value: "128", detail: "Segmento estudiantes" },
  { id: "aov", group: "Transacciones", label: "AOV", value: "186 €", detail: "Valor medio del pedido" },
  { id: "frequency", group: "Transacciones", label: "Frecuencia", value: "1,8", detail: "Transacciones por buyer" },
  { id: "ticket", group: "Transacciones", label: "Ticket medio", value: "174 €", detail: "Por transacción" },
];

function FinanceAnalytics({ currentUser }: { currentUser: string }) {
  const { metrics, setMetrics, update } = useEditableMetrics(`robin-finance-${currentUser}`, financeDefaults);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Datos manuales editables");
  const groups = [...new Set(metrics.map((metric) => metric.group))];
  const euro = (value: number) => `${Math.round(value).toLocaleString("es-ES")} €`;
  async function syncHolded() {
    setSyncing(true);
    try {
      const snapshot: FinanceSnapshot = await integrationClient.holded();
      const values: Record<string, string> = { mrr: euro(snapshot.mrr), arr: euro(snapshot.arr), nrr: `${snapshot.nrr.toFixed(1)}%`, churn: `${snapshot.churnRate.toFixed(1)}%`, gmv: euro(snapshot.gmv), "take-rate": `${snapshot.takeRate.toFixed(1)}%`, commission: euro(snapshot.effectiveCommission), aov: euro(snapshot.aov), frequency: snapshot.transactionFrequency.toFixed(1), ticket: euro(snapshot.aov) };
      setMetrics((items) => items.map((item) => values[item.id] ? { ...item, value: values[item.id] } : item));
      setSyncMessage(`Sincronizado con Holded · ${snapshot.invoices} facturas · ${snapshot.payments} pagos`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "No se pudo conectar con Holded");
    } finally { setSyncing(false); }
  }
  return <div className="page"><Title name="Finanzas" sub={`Métricas financieras y unit economics · ${currentUser}`} eyebrow="ANALÍTICAS PERSONALES"><Button variant="outline" onClick={syncHolded} disabled={syncing}><Landmark />{syncing ? "Sincronizando…" : "Sincronizar Holded"}</Button></Title><div className="sync-status"><ShieldCheck /><span>{syncMessage}</span><Badge variant="outline">EDITABLE</Badge></div>{groups.map((group) => <section className="finance-group" key={group}><div className="finance-group-title"><h2>{group}</h2><p>Edita cualquier valor o detalle sin cambiar el código.</p></div><EditableMetricGrid metrics={metrics.filter((metric) => metric.group === group)} onChange={update} /></section>)}<section className="panel cohort-panel"><div><h2>Cohortes de retención</h2><p>Seguimiento de suscripciones por mes de alta.</p></div><div className="cohort-grid"><span>Cohorte</span><span>M0</span><span>M1</span><span>M2</span><span>M3</span>{[["Jun", "100%", "91%", "86%", "82%"], ["Jul", "100%", "93%", "87%", "—"], ["Ago", "100%", "89%", "—", "—"], ["Sep", "100%", "—", "—", "—"]].flat().map((cell, index) => <b key={`${cell}-${index}`}>{cell}</b>)}</div></section></div>;
}

const salesDefaults: EditableMetric[] = [
  { id: "leads", label: "Leads", value: "42", detail: "En el periodo" }, { id: "contacted", label: "Contactados", value: "34", detail: "81,0% de leads" }, { id: "qualified", label: "Cualificados", value: "25", detail: "59,5% de leads" }, { id: "scheduled", label: "Llamadas agendadas", value: "20", detail: "80% de cualificados" },
  { id: "held", label: "Llamadas hechas", value: "16", detail: "80% de agendadas" }, { id: "sales", label: "Ventas", value: "7", detail: "43,8% de llamadas" }, { id: "revenue", label: "Facturación", value: "22.400 €", detail: "Ventas del periodo" }, { id: "collected", label: "Cobrado", value: "18.900 €", detail: "En el periodo" },
  { id: "ticket", label: "Ticket medio", value: "3.200 €", detail: "Por venta" }, { id: "lead-sale", label: "% Lead → venta", value: "16,7%", detail: "7 de 42 leads" }, { id: "call-sale", label: "% Llamada → venta", value: "43,8%", detail: "Cierre en llamada" }, { id: "no-show", label: "No-shows", value: "4", detail: "20% de agendadas" },
];

function SalesAnalytics({ currentUser }: { currentUser: string }) {
  const { metrics, update } = useEditableMetrics(`robin-sales-${currentUser}`, salesDefaults);
  return <div className="page"><Title name="Ventas" sub={`Embudo y rendimiento comercial · ${currentUser}`} eyebrow="ANALÍTICAS PERSONALES"><Badge variant="outline">DATOS EDITABLES</Badge></Title><div className="sales-filters"><label>Desde<input type="date" /></label><label>Hasta<input type="date" /></label><label>Origen<select><option>Todos</option><option>Meta Ads</option><option>Instagram</option><option>Referido</option><option>Orgánico</option></select></label><label>Campaña<select><option>Todas</option><option>Grados en Holanda</option><option>Estudiar en España</option></select></label><div><button>7 días</button><button>30 días</button><button>Este mes</button></div></div><EditableMetricGrid metrics={metrics} onChange={update} /><div className="sales-analysis-grid"><section className="panel sales-funnel"><h2>Embudo de conversión</h2>{[["Leads totales", 42, 100], ["Contactados", 34, 81], ["Cualificados", 25, 60], ["Llamadas agendadas", 20, 48], ["Llamadas hechas", 16, 38], ["Ventas cerradas", 7, 17]].map(([label, value, width]) => <div key={label}><p><span>{label}</span><strong>{value}</strong></p><i><b style={{ width: `${width}%` }} /></i></div>)}</section><section className="panel clean-chart"><h2>Evolución diaria</h2><div className="metric-bars">{[["L", 42], ["M", 70], ["X", 54], ["J", 88], ["V", 62], ["S", 30], ["D", 46]].map(([day, value]) => <div key={day}><span style={{ height: `${value}%` }} /><small>{day}</small></div>)}</div></section></div><div className="sales-tables"><PerformanceTable title="Rendimiento por origen" rows={[["Meta Ads", "18", "11", "4", "22,2%", "12.800 €"], ["Instagram", "9", "5", "1", "11,1%", "3.200 €"], ["Referido", "8", "6", "2", "25,0%", "6.400 €"], ["Orgánico", "7", "3", "0", "0%", "0 €"]]} /><PerformanceTable title="Rendimiento por campaña" rows={[["Grados en Holanda", "21", "14", "4", "19,0%", "12.800 €"], ["Estudiar en España", "13", "7", "2", "15,4%", "6.400 €"], ["Boca a boca", "8", "4", "1", "12,5%", "3.200 €"]]} /></div></div>;
}

function PerformanceTable({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>Conversión y facturación</p></div></div><div className="data-table"><table><thead><tr><th>Segmento</th><th>Leads</th><th>Cual.</th><th>Ventas</th><th>% conv.</th><th>Facturación</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{index === 0 ? <b>{cell}</b> : cell}</td>)}</tr>)}</tbody></table></div></section>;
}

function Campaigns({ currentUser, notify }: { currentUser: string; notify: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<MetaSnapshot>({ spend: 3262, impressions: 184200, clicks: 4210, reach: 102600, ctr: 2.29, cpc: 0.77, cpm: 17.71, leads: 127, purchases: 18, revenue: 14027, cpl: 25.69, cac: 181.22, roas: 4.3 });
  const [syncing, setSyncing] = useState(false);
  const [connection, setConnection] = useState("Datos de demostración");
  const rows = [["Grados en Holanda · Otoño", "1.842 €", "74", "24,89 €", "4,8×"], ["Estudiar en España · General", "984 €", "31", "31,74 €", "3,2×"], ["The Robin Plan · Retargeting", "436 €", "22", "19,82 €", "5,1×"]];
  async function syncMeta() {
    setSyncing(true);
    try { const data = await integrationClient.meta(); setSnapshot(data); setConnection("Sincronizado con Meta Marketing API"); }
    catch (error) { setConnection(error instanceof Error ? error.message : "No se pudo conectar con Meta"); }
    finally { setSyncing(false); }
  }
  const euro = (value: number) => `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
  return (
    <div className="page">
      <Title name="Meta Ads" sub={`Campañas y resultados asignados a ${currentUser}.`} eyebrow="CAMPAÑAS PERSONALES"><Button variant="outline" onClick={syncMeta} disabled={syncing}><Megaphone />{syncing ? "Sincronizando…" : "Sincronizar Meta"}</Button><Button onClick={() => notify("Campaña creada como borrador demo")}><Plus />Nueva campaña</Button></Title>
      <div className="meta-banner"><ShieldCheck /><div><strong>{connection}</strong><p>Al configurar las variables de Netlify, este panel consultará los últimos 30 días.</p></div><Badge variant="outline">META API</Badge></div>
      <section className="ads-kpi-grid">{[
        ["Inversión", euro(snapshot.spend), "Gasto total"], ["Impresiones", snapshot.impressions.toLocaleString("es-ES"), `${(snapshot.impressions / 1000).toFixed(1)}k`], ["Clics", snapshot.clicks.toLocaleString("es-ES"), `${snapshot.ctr.toFixed(2)}% CTR`], ["CTR", `${snapshot.ctr.toFixed(2)}%`, "Clics / impresiones"],
        ["CPC medio", euro(snapshot.cpc), "Coste por clic"], ["CPM", euro(snapshot.cpm), "Coste por mil"], ["Alcance", snapshot.reach.toLocaleString("es-ES"), "Personas únicas"], ["Leads", snapshot.leads.toLocaleString("es-ES"), "Conversiones atribuidas"],
        ["CPL real", euro(snapshot.cpl), "Inversión / leads"], ["Ventas", snapshot.purchases.toLocaleString("es-ES"), "Compras atribuidas"], ["CAC", euro(snapshot.cac), "Inversión / ventas"], ["ROAS", `${snapshot.roas.toFixed(2)}×`, euro(snapshot.revenue)],
      ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
      <div className="sales-analysis-grid"><section className="panel clean-chart"><h2>Inversión diaria</h2><div className="metric-bars">{[["L", 52], ["M", 78], ["X", 63], ["J", 92], ["V", 70], ["S", 34], ["D", 45]].map(([day, value]) => <div key={day}><span style={{ height: `${value}%` }} /><small>{day}</small></div>)}</div></section><section className="panel clean-chart"><h2>CPM diario</h2><div className="metric-bars gold-bars">{[["L", 44], ["M", 61], ["X", 56], ["J", 74], ["V", 68], ["S", 50], ["D", 58]].map(([day, value]) => <div key={day}><span style={{ height: `${value}%` }} /><small>{day}</small></div>)}</div></section></div>
      <section className="panel campaign-panel"><div className="panel-heading"><div><h2>Campañas</h2><p>Datos demostrativos · últimos 30 días</p></div></div><div className="data-table"><table><thead><tr><th>Campaña</th><th>Estado</th><th>Inversión</th><th>Leads</th><th>CPL</th><th>ROAS</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}><td><b>{row[0]}</b><small>Responsable: {currentUser}</small></td><td><Badge variant="outline">Activa</Badge></td>{row.slice(1).map((cell) => <td key={cell}>{cell}</td>)}<td><button className="icon-action" onClick={() => notify(`Abriendo ${row[0]} en modo demo`)}><ArrowRight /></button></td></tr>)}</tbody></table></div></section>
    </div>
  );
}
