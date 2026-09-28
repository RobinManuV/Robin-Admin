"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
  CircleX,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { contacts as previewContacts } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureModule } from "@/components/feature-modules";
import type { Contact, CrmStage, LeadCategory } from "@/types/domain";
import { portalClient } from "@/services/portal";
import type { PortalAdmin, PortalSnapshot } from "@/services/portal";
import { adminDataClient } from "@/services/admin-data";

type NavItem = [string, string, typeof LayoutDashboard];

const workspaceTabs = [
  ["/", "Inicio", "home"],
  ["/alumnos", "Alumnos", "students"],
  ["/crm", "CRM", "crm"],
  ["/analiticas", "Analíticas", "analytics"],
  ["/campanas", "Campañas", "campaigns"],
  ["/suscripcion", "Suscripción", "subscription"],
] as const;

const sideMenus: Record<string, NavItem[]> = {
  home: [
    ["/", "Resumen", LayoutDashboard],
    ["/bandeja-leads", "Bandeja de leads", Inbox],
    ["/alumnos-global", "Vista de alumnos", GraduationCap],
    ["/pagos", "Pagos y facturación", CreditCard],
    ["/configuracion", "Configuración", Settings],
  ],
  students: [["/alumnos", "Portal de aplicación", GraduationCap]],
  crm: [
    ["/crm", "Por contactar", UserCheck],
    ["/crm/contactados", "Contactados", Users],
    ["/crm/clientes", "Clientes", Sparkles],
    ["/crm/lost", "Lost", CircleX],
  ],
  analytics: [
    ["/analiticas", "General", LayoutDashboard],
    ["/analiticas/pnl", "P&L", CircleDollarSign],
    ["/analiticas/facturacion-cobros-gastos", "Facturación, cobros y gastos", WalletCards],
    ["/analiticas/ventas", "Ventas", TrendingUp],
    ["/analiticas/tax", "Tax", FileText],
    ["/analiticas/ajustes", "Ajustes", Settings],
  ],
  campaigns: [["/campanas", "Meta Ads", BriefcaseBusiness]],
  subscription: [["/suscripcion", "Administración de suscripciones", CreditCard]],
};

const areaNames: Record<string, string> = {
  home: "Inicio global",
  students: "Alumnos",
  crm: "CRM personal",
  analytics: "Finanzas",
  campaigns: "Campañas personales",
  subscription: "Suscripción",
};

function getArea(path: string) {
  if (path === "/alumnos") return "students";
  if (path.startsWith("/crm")) return "crm";
  if (path.startsWith("/analiticas")) return "analytics";
  if (path.startsWith("/campanas")) return "campaigns";
  if (path.startsWith("/suscripcion")) return "subscription";
  return "home";
}

function isSideItemActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/crm") return path === "/crm";
  if (href === "/campanas") return path.startsWith("/campanas");
  if (href === "/analiticas") return path === "/analiticas";
  return path === href;
}

export function AdminApp() {
  const path = window.location.pathname;
  const area = getArea(path);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [admins, setAdmins] = useState(["Noel", "Manuel", "María"]);
  const [currentUser, setCurrentUser] = useState("Noel");
  const [crmContacts, setCrmContacts] = useState<Contact[]>(previewContacts);
  const [leadOwners, setLeadOwners] = useState<Record<string, string>>(() =>
    Object.fromEntries(previewContacts.map((contact) => [contact.id, contact.owner])),
  );
  const [leadStages, setLeadStages] = useState<Record<string, CrmStage>>(() => Object.fromEntries(previewContacts.map((contact) => [contact.id, contact.stage || (contact.status === "Nuevo" ? "Por contactar" : contact.status === "Reunión" ? "Llamada programada" : contact.status === "Propuesta" ? "Propuesta enviada" : contact.status)])) as Record<string, CrmStage>);
  const [leadCategories, setLeadCategories] = useState<Record<string, LeadCategory | "">>(() => Object.fromEntries(previewContacts.map((contact) => [contact.id, contact.category || ""])));
  const [leadHeat, setLeadHeat] = useState<Record<string, number>>(() => Object.fromEntries(previewContacts.map((contact) => [contact.id, contact.heat || 50])));
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>(() => Object.fromEntries(previewContacts.map((contact) => [contact.id, contact.notes || ""])));
  const [leadLostDates, setLeadLostDates] = useState<Record<string, string>>({});
  const [crmLoaded, setCrmLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(true);
  const [previewMode, setPreviewMode] = useState(true);
  const [authUser, setAuthUser] = useState<PortalAdmin | null>(null);
  const [portalSnapshot, setPortalSnapshot] = useState<PortalSnapshot | null>(null);
  const initials = currentUser.slice(0, 2).toUpperCase();

  function advisorName(user: PortalAdmin) {
    if (user.nombre) return user.nombre;
    const key = (user.email || user.username || "").split("@")[0].toLowerCase();
    return key === "maria" ? "María" : key ? key.charAt(0).toUpperCase() + key.slice(1) : "Administrador";
  }

  async function refreshPortalSnapshot() {
    if (previewMode || !authUser) return;
    try { setPortalSnapshot(await portalClient.snapshot()); }
    catch { setPortalSnapshot(null); }
  }

  function hydrateLeads(leads: Contact[]) {
    setCrmContacts(leads);
    setLeadOwners(Object.fromEntries(leads.map((lead) => [lead.id, lead.owner || ""])));
    setLeadStages(Object.fromEntries(leads.map((lead) => [lead.id, lead.stage || "Por contactar"])) as Record<string, CrmStage>);
    setLeadCategories(Object.fromEntries(leads.map((lead) => [lead.id, lead.category || ""])));
    setLeadHeat(Object.fromEntries(leads.map((lead) => [lead.id, lead.heat ?? 50])));
    setLeadNotes(Object.fromEntries(leads.map((lead) => [lead.id, lead.notes || ""])));
    setLeadLostDates(Object.fromEntries(leads.filter((lead) => lead.lostAt).map((lead) => [lead.id, lead.lostAt as string])));
  }

  function persistLead(id: string, patch: Parameters<typeof adminDataClient.updateLead>[1]) {
    void adminDataClient.updateLead(id, patch).catch((error) => setNotice(error instanceof Error ? error.message : "No se pudo guardar el lead"));
  }

  useEffect(() => {
    let active = true;
    const load = () => adminDataClient.listLeads().then((leads) => {
      if (active) hydrateLeads(leads);
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : "No se pudo cargar la base del gestor");
    }).finally(() => { if (active) setCrmLoaded(true); });
    void load();
    const unsubscribe = adminDataClient.subscribe(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, []);

  function moveLead(id: string, stage: CrmStage) {
    setLeadStages((stages) => ({ ...stages, [id]: stage }));
    const lostAt = stage === "Lost" ? new Date().toISOString().slice(0, 10) : "";
    if (stage === "Lost") setLeadLostDates((dates) => ({ ...dates, [id]: lostAt }));
    persistLead(id, { stage, lostAt });
  }

  function addAdmin(name: string) {
    const cleanName = name.trim();
    if (!cleanName || admins.some((admin) => admin.toLowerCase() === cleanName.toLowerCase())) return;
    setAdmins((users) => [...users, cleanName]);
    setNotice(`${cleanName} se ha añadido al equipo de administración`);
  }

  return (
    <div className="shell">
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          <span>R</span>
          <div><strong>Robin</strong><small>ADMIN PLATFORM</small></div>
          <button onClick={() => setOpen(false)} aria-label="Cerrar menú"><X /></button>
        </div>
        <div className="context-title">
          <small>ESPACIO ACTUAL</small>
          <strong>{areaNames[area]}</strong>
          {area !== "home" && <span>Vista de {currentUser}</span>}
        </div>
        <nav>
          {sideMenus[area].map(([href, label, Icon]) => (
            <a href={href} key={href} className={isSideItemActive(path, href) ? "active" : ""} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(false); window.location.assign(href); }}>
              <Icon /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="demo"><ShieldCheck /><div><strong>Entorno configurable</strong><span>Conexiones desde Netlify</span></div></div>
        <div className="profile"><i>{initials}</i><div><strong>{currentUser}</strong><small>Administración</small></div></div>
      </aside>

      {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Cerrar menú" />}

      <div className="work">
        <header className="top">
          <button className="menub" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <nav className="workspace-tabs" aria-label="Áreas del gestor">
            {workspaceTabs.map(([href, label, tabArea]) => <a href={href} key={href} className={area === tabArea ? "active" : ""} onClick={(event) => { event.preventDefault(); event.stopPropagation(); window.location.assign(href); }}>{label === "Analíticas" ? "Finanzas" : label}</a>)}
          </nav>
          <label className="global-search"><Search /><input placeholder="Buscar en Robin…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <Badge variant="outline">DEMO</Badge>
            {previewMode ? <label className="user-switch">
              <span>Usuario</span>
              <select value={currentUser} onChange={(event) => setCurrentUser(event.target.value)}>
                {admins.map((admin) => <option key={admin}>{admin}</option>)}
              </select>
              <ChevronDown />
            </label> : <span className="authenticated-user">{currentUser}</span>}
            <button aria-label="Notificaciones"><Bell /><i /></button>
            {!previewMode && <button aria-label="Cerrar sesión" onClick={async () => { await portalClient.logout().catch(() => undefined); setAuthUser(null); setPortalSnapshot(null); }}><LogOut /></button>}
          </div>
        </header>

        <main>
          {path === "/" ? <Dashboard snapshot={portalSnapshot} contacts={crmContacts} leadStages={leadStages} currentUser={currentUser} /> : (
            <FeatureModule
              path={path}
              notify={setNotice}
              currentUser={currentUser}
              admins={admins}
              contacts={crmContacts}
              leadOwners={leadOwners}
              onAssignLead={(id, owner) => { setLeadOwners((owners) => ({ ...owners, [id]: owner })); persistLead(id, { owner }); }}
              leadStages={leadStages}
              onMoveLead={moveLead}
              leadCategories={leadCategories}
              onCategorizeLead={(id, category) => { setLeadCategories((categories) => ({ ...categories, [id]: category })); persistLead(id, { category }); }}
              leadHeat={leadHeat}
              onSetLeadHeat={(id, heat) => { setLeadHeat((values) => ({ ...values, [id]: heat })); persistLead(id, { heat }); }}
              leadNotes={leadNotes}
              onSetLeadNotes={(id, notes) => { setLeadNotes((values) => ({ ...values, [id]: notes })); persistLead(id, { notes }); }}
              leadLostDates={leadLostDates}
              portalSnapshot={portalSnapshot}
              portalConnected={!previewMode && Boolean(authUser)}
              onPortalRefresh={refreshPortalSnapshot}
              onAddAdmin={addAdmin}
            />
          )}
        </main>
      </div>

      {notice && <div className="toast"><ShieldCheck /><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}
    </div>
  );
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: (user: PortalAdmin) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await portalClient.login(username, password);
      const user = await portalClient.me();
      onAuthenticated(user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No se pudo iniciar sesión");
    } finally { setBusy(false); }
  }
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}><span className="auth-mark">R</span><small>ROBIN ADMIN PLATFORM</small><h1>Acceso administrativo</h1><p>Usa las mismas credenciales que en el portal de aplicación.</p><label>Usuario o email<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="auth-error">{error}</div>}<Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button></form></div>;
}

function Head({ title, sub, action }: { title: string; sub: string; action?: string }) {
  return <header className="phead"><div><h2>{title}</h2><p>{sub}</p></div>{action && <button>{action}</button>}</header>;
}

function Dashboard({ snapshot, contacts, leadStages, currentUser }: { snapshot: PortalSnapshot | null; contacts: Contact[]; leadStages: Record<string, CrmStage>; currentUser: string }) {
  const [period, setPeriod] = useState<"7" | "15" | "30" | "all">("7");
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const periodDays = period === "all" ? null : Number(period);
  const periodLabel = period === "7" ? "Últimos 7 días" : period === "15" ? "Últimos 15 días" : period === "30" ? "Último mes" : "Todo";
  const datedRecords = [...contacts.map((lead) => lead.createdAt), ...(snapshot?.clients || []).map((client) => client.created_at)].filter((value): value is string => Boolean(value));
  const firstRecordDate = datedRecords.length ? new Date(Math.min(...datedRecords.map((value) => new Date(value).getTime()))) : startOfToday;
  const rangeStart = new Date(periodDays ? startOfToday.getTime() - (periodDays - 1) * 86400000 : firstRecordDate.getTime());
  rangeStart.setHours(0, 0, 0, 0);
  const isInRange = (value?: string) => Boolean(value && new Date(value) >= rangeStart && new Date(value) <= new Date());
  const activeLeads = contacts.filter((lead) => !["Por contactar", "Cliente", "Lost"].includes(leadStages[lead.id] || lead.stage || "Por contactar"));
  const portalClients = snapshot?.clients || [];
  const crmClients = contacts.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente");
  const clients = snapshot ? portalClients : crmClients;
  const newLeads = contacts.filter((lead) => isInRange(lead.createdAt));
  const newClients = snapshot ? portalClients.filter((client) => isInRange(client.created_at)) : crmClients.filter((lead) => isInRange(lead.createdAt));
  const liveStats = [
    ["Leads activos", String(activeLeads.length), "Contactados sin IN ni Lost", Users, "blue"],
    ["Nuevos leads", String(newLeads.length), periodLabel, Sparkles, "gold"],
    ["Clientes activos", String(clients.length), snapshot ? "Datos del portal de aplicación" : "Pendiente de conectar al portal", GraduationCap, "green"],
    ["Clientes nuevos", String(newClients.length), periodLabel, CircleDollarSign, "red"],
  ] as const;
  const visibleDays = Math.max(1, Math.floor((startOfToday.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const dailyData = Array.from({ length: visibleDays }, (_, index) => {
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + index);
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const inDay = (value?: string) => Boolean(value && new Date(value) >= dayStart && new Date(value) < dayEnd);
    return { day: date.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", ""), leads: contacts.filter((lead) => inDay(lead.createdAt)).length, clients: snapshot ? portalClients.filter((client) => inDay(client.created_at)).length : crmClients.filter((lead) => inDay(lead.createdAt)).length };
  });
  const chartMaximum = Math.max(...dailyData.flatMap((day) => [day.leads, day.clients])) + 1;
  const hotLeads = contacts.filter((lead) => lead.owner === currentUser && (lead.heat || 0) > 80 && !["Cliente", "Lost"].includes(leadStages[lead.id] || lead.stage || "Por contactar"));
  const funnelStages: Array<[string, CrmStage]> = [["Por contactar", "Por contactar"], ["Contactados", "Contactado"], ["Llamadas programadas", "Llamada programada"], ["Llamadas tenidas", "Llamada tenida"], ["Propuestas", "Propuesta enviada"], ["En espera", "En espera"], ["Clientes (IN)", "Cliente"]];
  const funnel = funnelStages.map(([label, stage]) => [label, contacts.filter((lead) => (leadStages[lead.id] || lead.stage || "Por contactar") === stage).length] as const);
  const funnelBase = Math.max(1, contacts.length);
  return (
    <div className="page">
      <div className="title">
        <div><span>INICIO COMPARTIDO</span><h1>Visión general de Robin</h1><p>Información común para todo el equipo de administración.</p></div>
        <label className="dashboard-period"><CalendarDays /><select value={period} onChange={(event) => setPeriod(event.target.value as "7" | "15" | "30" | "all")}><option value="7">Últimos 7 días</option><option value="15">Últimos 15 días</option><option value="30">Último mes</option><option value="all">Todo</option></select><ChevronDown /></label>
      </div>

      <section className="stats">
        {liveStats.map(([label, value, detail, Icon, tone]) => <article key={label}><i className={tone}><Icon /></i><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}
      </section>

      <div className="grid">
        <section className="panel chart">
          <Head title="Nuevos leads y clientes" sub={`Altas diarias · ${periodLabel.toLowerCase()}`} />
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={dailyData} margin={{ left: -24, right: 10 }}>
              <CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis domain={[0, chartMaximum]} allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip />
              <Bar dataKey="clients" name="Clientes nuevos" fill="#d69b3b" radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="leads" name="Leads nuevos" stroke="#1f416f" strokeWidth={3} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <section className="panel attention">
          <Head title="Leads calientes" sub={`Heat superior a 80 · ${currentUser}`} />
          <div>
            {hotLeads.length ? hotLeads.map((lead) => <button key={lead.id} onClick={() => window.location.assign("/crm")}><i className="red" /><div><strong>{lead.name}</strong><small>{leadStages[lead.id] || lead.stage || "Por contactar"}</small></div><em className="red">Heat {lead.heat}</em></button>) : <p className="empty-copy">No tienes leads con heat superior a 80.</p>}
          </div>
        </section>
      </div>

      <div className="lower">
        <section className="panel">
          <Head title="Embudo de captación" sub="Fases reales del CRM" />
          <div className="funnel">{funnel.map(([label, value]) => <div key={label}><p><span>{label}</span><strong>{value}</strong></p><div><i style={{ width: `${Math.max(4, (value / funnelBase) * 100)}%` }} /></div></div>)}</div>
          <div className="conversion"><strong>{contacts.length ? `${((funnel[funnel.length - 1][1] / contacts.length) * 100).toFixed(1)}%` : "0%"}</strong><span>Conversión total a IN</span><b>{funnel[funnel.length - 1][1]} clientes</b></div>
        </section>

        <section className="panel">
          <Head title="Ingresos, gastos y neto" sub={snapshot?.connections.holded ? "Datos de Holded" : "Pendiente de conectar con Holded"} />
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={[{ label: "Ingresos", value: 0 }, { label: "Gastos", value: 0 }, { label: "Neto", value: 0 }]} layout="vertical" margin={{ left: 30, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#e8edf3" /><XAxis type="number" axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={75} /><Tooltip formatter={(value) => value ? `${Number(value).toLocaleString("es-ES")} €` : "Pendiente de Holded"} /><Bar dataKey="value" name="Importe" fill="#1f416f" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="empty-copy">El gráfico se completará con ingresos, gastos y neto al conectar Holded.</p>
        </section>
      </div>
    </div>
  );
}
