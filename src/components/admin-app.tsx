"use client";

import { useEffect, useState } from "react";
import { apiPath } from "@/lib/api-path";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  FileText,
  ExternalLink,
  GraduationCap,
  Globe2,
  Handshake,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  Percent,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  CircleX,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureModule } from "@/components/feature-modules";
import type { Contact, CrmStage, LeadCategory, LeadContactRole, LostReason } from "@/types/domain";
import { portalClient } from "@/services/portal";
import type { PortalAdmin, PortalClient, PortalSnapshot } from "@/services/portal";
import { adminDataClient } from "@/services/admin-data";
import type { FutureAcademicYear } from "@/services/admin-data";
import { integrationClient } from "@/services/integrations";
import type { AnalyticsDateRange, HoldedSnapshot, SalesDashboard } from "@/services/integrations";
const robinPlanWordmark = /(^|\.)project-robin\.com$/i.test(window.location.hostname)
  ? "/admin/robin-wordmark.png"
  : "/robin-wordmark.png";
import { DashboardLoader } from "@/components/dashboard-loader";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { allAdminTabPermissions, isDeveloperAdminEmail, isProAdminEmail } from "@/lib/admin-permissions";

type NavItem = [string, string, typeof LayoutDashboard, string];

const workspaceTabs = [
  ["/", "Inicio", "home", "home."],
  ["https://project-robin.com/login", "Portal del Alumno", "external", "platform.student_portal"],
  ["https://project-robin.com/therobinplan/", "The Robin Plan", "subscriptions", "platform.robin_plan"],
  ["/crm", "CRM", "crm", "crm."],
  ["/analiticas/ventas", "Otras métricas", "analytics", "analytics."],
] as const;

const sideMenus: Record<string, NavItem[]> = {
  home: [
    ["/", "Resumen", LayoutDashboard, "home.summary"],
    ["/bandeja-leads", "Bandeja de leads", Inbox, "home.leads"],
    ["/alumnos-global", "Vista de alumnos", GraduationCap, "home.students"],
    ["/analitica-global", "Analíticas generales", BarChart3, "home.analytics"],
    ["/configuracion", "Configuración", Settings, "home.settings"],
  ],
  crm: [
    ["/crm", "Por contactar", UserCheck, "crm.to_contact"],
    ["/crm/contactados", "Contactados", Users, "crm.contacted"],
    ["/crm/clientes", "Clientes", Sparkles, "crm.clients"],
    ["/crm/lost", "Lost", CircleX, "crm.lost"],
  ],
  analytics: [
    ["/analiticas/ventas", "Ventas P", TrendingUp, "analytics.sales"],
    ["/campanas", "Campañas", BriefcaseBusiness, "analytics.campaigns"],
    ["/web", "Web", Globe2, "analytics.web"],
    ["/analiticas/operaciones", "Operaciones", PieChart, "analytics.operations"],
  ],
};

const areaNames: Record<string, string> = {
  home: "Inicio global",
  crm: "CRM personal",
  analytics: "Otras métricas",
};

function getArea(path: string) {
  if (path.startsWith("/crm")) return "crm";
  if (path.startsWith("/analiticas") || path.startsWith("/campanas") || path.startsWith("/web")) return "analytics";
  return "home";
}

function adminPath(path: string) {
  if (typeof window === "undefined" || !/(^|\.)project-robin\.com$/i.test(window.location.hostname)) return path;
  return `/admin${path === "/" ? "" : path}`;
}

function isSideItemActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/crm") return path === "/crm";
  if (href === "/campanas") return path.startsWith("/campanas");
  if (href === "/web") return path.startsWith("/web");
  if (href === "/analiticas/ventas") return path === "/analiticas" || path === "/analiticas/pagos" || path === "/analiticas/finanzas" || path === href;
  return path === href;
}

export function AdminApp({ authUser, onLogout }: { authUser: PortalAdmin; onLogout: () => Promise<void> }) {
  const [permissionProfile, setPermissionProfile] = useState(authUser);
  useEffect(() => {
    let active = true;
    const refreshPermissions = () => {
      if (document.visibilityState === "visible") void portalClient.me().then((user) => { if (active) setPermissionProfile(user); }).catch(() => undefined);
    };
    window.addEventListener("focus", refreshPermissions);
    document.addEventListener("visibilitychange", refreshPermissions);
    return () => { active = false; window.removeEventListener("focus", refreshPermissions); document.removeEventListener("visibilitychange", refreshPermissions); };
  }, [authUser.id]);
  const path = window.location.pathname.replace(/^\/admin(?=\/|$)/, "") || "/";
  const area = getArea(path);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [admins, setAdmins] = useState(() => ["Noel", "Manuel", "María", ...(isDeveloperAdminEmail(authUser.email) ? ["Santi"] : [])]);
  const isProAdmin = isProAdminEmail(permissionProfile.email) || permissionProfile.is_pro_admin === true;
  const isDeveloperAdmin = isDeveloperAdminEmail(authUser.email);
  const visibleTabs = isProAdmin ? allAdminTabPermissions : (permissionProfile.visible_tabs || []);
  const canSee = (key: string) => visibleTabs.includes(key);
  const routePermission = path === "/" || path.startsWith("/informes/inicio") ? "home.summary"
    : path === "/bandeja-leads" ? "home.leads"
      : path === "/alumnos-global" || path.startsWith("/alumnos-global/") ? "home.students"
        : path === "/analitica-global" || path === "/pagos" ? "home.analytics"
          : path === "/configuracion" ? "home.settings"
            : path.startsWith("/crm/contactados") ? "crm.contacted"
              : path.startsWith("/crm/clientes") ? "crm.clients"
                : path.startsWith("/crm/lost") ? "crm.lost"
                  : path.startsWith("/crm") ? "crm.to_contact"
                    : path.startsWith("/alumnos") ? "platform.student_portal"
                      : path.startsWith("/the-robin-plan") ? "platform.robin_plan"
                        : path.startsWith("/campanas") ? "analytics.campaigns"
                          : path.startsWith("/web") ? "analytics.web"
                            : path.startsWith("/analiticas/operaciones") ? "analytics.operations"
                              : path.startsWith("/analiticas") ? "analytics.sales" : null;
  const accessDenied = !isProAdmin && !!routePermission && !canSee(routePermission);
  const firstAllowedHref = Object.values(sideMenus).flat().find(([, , , permission]) => canSee(permission))?.[0];
  const [currentUser] = useState(() => advisorName(authUser));
  const [crmContacts, setCrmContacts] = useState<Contact[]>([]);
  const [leadOwners, setLeadOwners] = useState<Record<string, string>>({});
  const [leadStages, setLeadStages] = useState<Record<string, CrmStage>>({});
  const [leadCategories, setLeadCategories] = useState<Record<string, LeadCategory | "">>({});
  const [leadHeat, setLeadHeat] = useState<Record<string, number>>({});
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});
  const [leadLostDates, setLeadLostDates] = useState<Record<string, string>>({});
  const [crmLoaded, setCrmLoaded] = useState(false);
  const [portalSnapshot, setPortalSnapshot] = useState<PortalSnapshot | null>(null);
  const [portalLoading, setPortalLoading] = useState(true);
  const [holdedSnapshot, setHoldedSnapshot] = useState<HoldedSnapshot | null>(null);
  const [holdedLoading, setHoldedLoading] = useState(true);
  const initials = currentUser.slice(0, 2).toUpperCase();

  async function logout() {
    await onLogout();
  }

  function advisorName(user: PortalAdmin) {
    if (user.nombre) return user.nombre;
    const key = (user.email || user.username || "").split("@")[0].toLowerCase();
    return key === "maria" ? "María" : key ? key.charAt(0).toUpperCase() + key.slice(1) : "Administrador";
  }

  async function refreshPortalSnapshot() {
    setPortalLoading(true);
    try { setPortalSnapshot(await portalClient.snapshot()); }
    catch { setPortalSnapshot(null); }
    finally { setPortalLoading(false); }
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

  function assignLead(id: string, owner: string) {
    setLeadOwners((owners) => ({ ...owners, [id]: owner }));
    setCrmContacts((contacts) => contacts.map((contact) => contact.id === id ? { ...contact, owner } : contact));
    persistLead(id, { owner });
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

  useEffect(() => { void refreshPortalSnapshot(); }, [authUser.id]);

  useEffect(() => {
    portalClient.adminUsers().then(({ users }) => {
      const names = users.map((user) => user.nombre || user.email || user.username || "").filter(Boolean);
      if (names.length) setAdmins(names);
    }).catch(() => undefined);
  }, [authUser.id]);

  useEffect(() => {
    let active = true;
    integrationClient.holded().then((data) => { if (active) setHoldedSnapshot(data); }).catch(() => { if (active) setHoldedSnapshot(null); }).finally(() => { if (active) setHoldedLoading(false); });
    return () => { active = false; };
  }, [authUser.id]);

  useEffect(() => {
    let lastActivityAt = Date.now();
    let stopped = false;
    const markActivity = () => { lastActivityAt = Date.now(); };
    const sendHeartbeat = () => {
      if (stopped || document.visibilityState !== "visible" || Date.now() - lastActivityAt > 5 * 60_000) return;
      void fetch(apiPath("/api/admin/crm/heartbeat"), { method: "POST", credentials: "include", keepalive: true }).catch(() => undefined);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") { markActivity(); sendHeartbeat(); } };
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((name) => window.addEventListener(name, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 180_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      activityEvents.forEach((name) => window.removeEventListener(name, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authUser.id]);

  function moveLead(id: string, stage: CrmStage, outcome?: { lostReason?: LostReason; lostReasonDetail?: string }) {
    setLeadStages((stages) => ({ ...stages, [id]: stage }));
    const lostAt = stage === "Lost" ? new Date().toISOString() : "";
    if (stage === "Lost") setLeadLostDates((dates) => ({ ...dates, [id]: lostAt }));
    else setLeadLostDates((dates) => { const next = { ...dates }; delete next[id]; return next; });
    const lostReason = stage === "Lost" ? outcome?.lostReason || "" : "";
    const lostReasonDetail = stage === "Lost" ? outcome?.lostReasonDetail || "" : "";
    setCrmContacts((contacts) => contacts.map((contact) => contact.id === id ? { ...contact, stage, lostAt: lostAt || undefined, lostReason: lostReason || undefined, lostReasonDetail: lostReasonDetail || undefined } : contact));
    persistLead(id, { stage, lostAt, lostReason, lostReasonDetail });
  }

  async function qualifyLead(id: string, input: { contactRole: LeadContactRole; heat: number; durationMinutes: number; notes: string }) {
    await adminDataClient.updateLead(id, { contactRole: input.contactRole, heat: input.heat });
    await adminDataClient.addLeadCall(id, input.durationMinutes, input.notes);
    setLeadHeat((values) => ({ ...values, [id]: input.heat }));
    setCrmContacts((contacts) => contacts.map((contact) => contact.id === id ? { ...contact, contactRole: input.contactRole, heat: input.heat } : contact));
    moveLead(id, "Contactado");
  }

  async function moveLeadToFuture(id: string, academicYear: FutureAcademicYear) {
    await adminDataClient.moveLeadToFuture(id, academicYear);
    setCrmContacts((contacts) => contacts.filter((contact) => contact.id !== id));
    const withoutLead = <T,>(values: Record<string, T>) => { const next = { ...values }; delete next[id]; return next; };
    setLeadOwners(withoutLead);
    setLeadStages(withoutLead);
    setLeadCategories(withoutLead);
    setLeadHeat(withoutLead);
    setLeadNotes(withoutLead);
    setLeadLostDates(withoutLead);
  }

  function addAdmin(name: string) {
    const cleanName = name.trim();
    if (!cleanName || admins.some((admin) => admin.toLowerCase() === cleanName.toLowerCase())) return;
    setAdmins((users) => [...users, cleanName]);
    setNotice(`${cleanName} se ha añadido al equipo de administración`);
  }

  function removeAdmin(name: string) {
    setAdmins((users) => users.filter((user) => user !== name));
  }

  async function deleteLead(id: string) {
    await adminDataClient.deleteLead(id);
    hydrateLeads(await adminDataClient.listLeads());
  }

  async function deleteLeads(ids: string[]) {
    await adminDataClient.deleteLeads(ids);
    hydrateLeads(await adminDataClient.listLeads());
  }

  async function addLead(input: { name: string; email?: string; phone?: string; notes?: string; owner?: string; source?: string }) {
    const lead = await adminDataClient.createLead(input);
    hydrateLeads([lead, ...crmContacts]);
  }

  async function addLeads(inputs: Array<{ name: string; email?: string; phone?: string; schoolName?: string; area?: string; leadType?: string; lifecycle?: string; taskStatus?: string; heat?: number; campaign?: string; notes?: string; owner?: string; groupName?: string }>) {
    const leads = await adminDataClient.createLeads(inputs);
    hydrateLeads([...leads, ...crmContacts]);
  }

  const dashboardLoading =
    (!crmLoaded && (path === "/bandeja-leads" || path.startsWith("/crm"))) ||
    (portalLoading && (["/", "/alumnos-global", "/analitica-global"].includes(path) || path.startsWith("/informes/inicio"))) ||
    (!crmLoaded && path.startsWith("/informes/inicio"));

  return (
    <div className="shell">
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          <img src={robinPlanWordmark} alt="ROBIN" />
          <div><small>ADMIN PLATFORM</small></div>
          <button onClick={() => setOpen(false)} aria-label="Cerrar menú"><X /></button>
        </div>
        <div className="context-title">
          <small>ESPACIO ACTUAL</small>
          <strong>{areaNames[area]}</strong>
          {area !== "home" && <span>Vista de {currentUser}</span>}
        </div>
        <nav>
          {sideMenus[area].filter(([, , , permission]) => canSee(permission)).map(([href, label, Icon]) => (
            <a href={adminPath(href)} key={href} className={isSideItemActive(path, href) ? "active" : ""} onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              window.location.assign(adminPath(href));
            }}>
              <Icon /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="profile"><i className={authUser.avatar_url ? "has-photo" : ""}>{authUser.avatar_url ? <img src={authUser.avatar_url} alt="" /> : initials}</i><div><strong>{currentUser}</strong><small>Administración</small></div></div>
      </aside>

      {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Cerrar menú" />}

      <div className="work">
        <header className="top">
          <button className="menub" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <nav className="workspace-tabs" aria-label="Áreas del gestor">
            {workspaceTabs.filter(([, , , permission]) => permission.endsWith(".") ? visibleTabs.some((key) => key.startsWith(permission)) : canSee(permission)).map(([href, label, tabArea]) => {
              const external = href.startsWith("https://");
              const destination = external ? href : adminPath(href);
              return <a href={destination} key={href} className={area === tabArea ? "active" : ""} rel={external ? "noreferrer" : undefined} onClick={external ? undefined : (event) => { event.preventDefault(); event.stopPropagation(); window.location.assign(destination); }}>{label}</a>;
            })}
          </nav>
          <div className="top-actions">
            <span className="authenticated-user">{currentUser}</span>
            <button aria-label="Cerrar sesión" onClick={() => void logout()}><LogOut /></button>
          </div>
        </header>

        <main>
          {accessDenied ? <div className="page"><div className="empty"><ShieldCheck /><h2>Sección no disponible</h2><p>Tu perfil no tiene acceso a esta sección. Pide a un administrador Pro que ajuste sus pestañas.</p>{firstAllowedHref && <a className="portal-link-button" href={adminPath(firstAllowedHref)}>Ir a una sección disponible</a>}</div></div> : dashboardLoading || ((path === "/" || path.startsWith("/informes/inicio")) && holdedLoading) ? <div className="page"><DashboardLoader /></div> : path === "/" ? <Dashboard snapshot={portalSnapshot} contacts={crmContacts} leadStages={leadStages} currentUser={currentUser} holded={holdedSnapshot} isDeveloperAdmin={isDeveloperAdmin} /> : path.startsWith("/informes/inicio") ? <DashboardReport snapshot={portalSnapshot} contacts={crmContacts} leadStages={leadStages} holded={holdedSnapshot} /> : (
            <FeatureModule
              path={path}
              notify={setNotice}
              currentUser={currentUser}
              admins={admins}
              contacts={crmContacts}
              leadOwners={leadOwners}
              onAssignLead={assignLead}
              onSetLeadSource={(id, source) => { const labels: Record<string, string> = { meta: "Meta Ads", website: "Página web", organic: "Orgánico", organic_social: "Orgánico RRSS", referral: "Referidos", other: "Otros", schools: "Colegios" }; const label = labels[source] || "Otros"; setCrmContacts((contacts) => contacts.map((contact) => contact.id === id ? { ...contact, source: label } : contact)); persistLead(id, { source }); }}
              onDeleteLead={deleteLead}
              onDeleteLeads={deleteLeads}
              onAddLead={addLead}
              onAddLeads={addLeads}
              leadStages={leadStages}
              onMoveLead={moveLead}
              onMoveLeadToFuture={moveLeadToFuture}
              onQualifyLead={qualifyLead}
              leadCategories={leadCategories}
              onCategorizeLead={(id, category) => { setLeadCategories((categories) => ({ ...categories, [id]: category })); persistLead(id, { category }); }}
              leadHeat={leadHeat}
              onSetLeadHeat={(id, heat) => { setLeadHeat((values) => ({ ...values, [id]: heat })); persistLead(id, { heat }); }}
              onSetLeadContactRole={(id, contactRole) => { setCrmContacts((contacts) => contacts.map((contact) => contact.id === id ? { ...contact, contactRole } : contact)); persistLead(id, { contactRole }); }}
              leadNotes={leadNotes}
              onSetLeadNotes={(id, notes) => { setLeadNotes((values) => ({ ...values, [id]: notes })); persistLead(id, { notes }); }}
              leadLostDates={leadLostDates}
              portalSnapshot={portalSnapshot}
              portalConnected={true}
              portalAdmin={authUser}
              isProAdmin={isProAdmin}
              isDeveloperAdmin={isDeveloperAdmin}
              onPortalRefresh={refreshPortalSnapshot}
              onAddAdmin={addAdmin}
              onRemoveAdmin={removeAdmin}
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
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}><span className="auth-mark"><img src={robinPlanWordmark} alt="Robin" /></span><small>ROBIN ADMIN PLATFORM</small><h1>Acceso administrativo</h1><p>Usa las mismas credenciales que en el portal de aplicación.</p><label>Usuario o email<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="auth-error">{error}</div>}<Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button></form></div>;
}

function Head({ title, sub, action }: { title: string; sub: string; action?: string }) {
  return <header className="phead"><div><h2>{title}</h2><p>{sub}</p></div>{action && <button>{action}</button>}</header>;
}

function dashboardReportUrl(type: "altas" | "embudo" | "facturacion", period: string) {
  return `${adminPath("/informes/inicio")}?tipo=${type}&periodo=${period}`;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dashboardAcquisitionPeriod(period: "7" | "15" | "30" | "all"): AnalyticsDateRange {
  const end = new Date();
  const start = period === "all" ? new Date(2025, 4, 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - Number(period) + 1);
  return { from: localDateKey(start), to: localDateKey(end) };
}

function Dashboard({ snapshot, contacts, leadStages, currentUser, holded, isDeveloperAdmin }: { snapshot: PortalSnapshot | null; contacts: Contact[]; leadStages: Record<string, CrmStage>; currentUser: string; holded: HoldedSnapshot | null; isDeveloperAdmin: boolean }) {
  const [period, setPeriod] = useState<"7" | "15" | "30" | "all">("all");
  const [acquisition, setAcquisition] = useState<SalesDashboard["acquisition"] | null>(null);
  useEffect(() => {
    let active = true;
    setAcquisition(null);
    integrationClient.salesDashboard(dashboardAcquisitionPeriod(period))
      .then((result) => { if (active) setAcquisition(result.acquisition); })
      .catch(() => { if (active) setAcquisition(null); });
    return () => { active = false; };
  }, [period]);
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const dated = [...contacts.map((item) => item.createdAt), ...(snapshot?.clients || []).map((item) => item.created_at)].filter((value): value is string => Boolean(value));
  const periodDays = period === "all" ? null : Number(period);
  const earliest = dated.length ? new Date(Math.min(...dated.map((value) => new Date(value).getTime()))) : new Date(today);
  const rangeStart = periodDays ? new Date(today.getTime() - (periodDays - 1) * 86400000) : earliest;
  rangeStart.setHours(0, 0, 0, 0);
  const inRange = (value?: string) => Boolean(value && new Date(value) >= rangeStart && new Date(value) <= today);
  const periodLabel = period === "7" ? "Últimos 7 días" : period === "15" ? "Últimos 15 días" : period === "30" ? "Últimos 30 días" : "Todo el histórico";
  const clients = snapshot?.clients || [];
  const crmClients = contacts.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente");
  const newLeads = contacts.filter((lead) => inRange(lead.createdAt));
  const newClients = clients.filter((client) => inRange(client.created_at));
  const activeLeads = contacts.filter((lead) => !["Cliente", "Lost"].includes(leadStages[lead.id] || lead.stage || "Por contactar"));
  const liveStats = [
    ["Leads activos", String(activeLeads.length), "CRM conectado", Users, "blue", null],
    ["Nuevos leads", String(acquisition?.leads ?? newLeads.length), `${periodLabel} · CRM + histórico`, Sparkles, "gold", null],
    ["Nuevos clientes", String(acquisition?.newClients ?? newClients.length), `${periodLabel} · conversión CRM o firma`, GraduationCap, "green", dashboardReportUrl("altas", period)],
    ["Ventas este año", holded ? `${Math.round(holded.currentYear.sales).toLocaleString("es-ES")} €` : "—", holded ? `${holded.currentYear.invoices} facturas en Holded` : "Holded no disponible", CircleDollarSign, "red", dashboardReportUrl("facturacion", period)],
  ] as const;
  const visibleDays = Math.max(1, Math.floor((today.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const chartData = acquisition?.buckets.map((bucket) => ({ day: bucket.tick || bucket.label, leads: bucket.leads, clients: bucket.clients }))
    || (period === "all" ? monthlySeries(rangeStart, today, contacts, clients) : dailySeries(rangeStart, visibleDays, contacts, clients));
  const chartHasValues = chartData.some((point) => point.leads > 0 || point.clients > 0);
  const hotLeads = contacts.filter((lead) => (isDeveloperAdmin || lead.owner === currentUser) && (lead.heat || 0) >= 80 && !["Cliente", "Lost"].includes(leadStages[lead.id] || lead.stage || "Por contactar"));
  const funnelStages: Array<[string, CrmStage]> = [["Por contactar", "Por contactar"], ["Contactados", "Contactado"], ["Llamadas", "Llamada programada"], ["Propuestas", "Propuesta enviada"], ["Clientes", "Cliente"]];
  const funnel = funnelStages.map(([label, stage]) => [label, contacts.filter((lead) => (leadStages[lead.id] || lead.stage || "Por contactar") === stage).length] as const);
  const funnelBase = Math.max(1, contacts.length);
  const financeData = holded ? [{ label: "Ventas", value: holded.currentYear.sales, previousValue: holded.previousYear.sales }, { label: "Cobrado", value: holded.currentYear.collected, previousValue: holded.previousYear.collected }, { label: "Pendiente", value: holded.currentYear.pending, previousValue: holded.previousYear.pending }] : [];
  return (
    <div className="page">
      <div className="title">
        <div><span>INICIO COMPARTIDO</span><h1>Visión general de Robin</h1><p>Información común para todo el equipo de administración.</p></div>
        <label className="dashboard-period"><CalendarDays /><select value={period} onChange={(event) => setPeriod(event.target.value as "7" | "15" | "30" | "all")}><option value="7">Últimos 7 días</option><option value="15">Últimos 15 días</option><option value="30">Últimos 30 días</option><option value="all">Todo</option></select><ChevronDown /></label>
      </div>

      <section className="stats">
        {liveStats.map(([label, value, detail, Icon, tone, report]) => report ? <a className="stat-report-link" href={report} target="_blank" rel="noreferrer" key={label} aria-label={`Abrir informe de ${label}`}><article><i className={tone}><Icon /></i><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><ExternalLink /></article></a> : <article key={label}><i className={tone}><Icon /></i><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}
      </section>

      <div className="grid">
        <a className="panel chart report-chart" href={dashboardReportUrl("altas", period)} target="_blank" rel="noreferrer" aria-label="Abrir informe de nuevos leads y clientes">
          <header className="phead"><div><h2>Nuevos leads y clientes</h2><p>Altas diarias · {periodLabel.toLowerCase()}</p></div><span className="report-hint">Ver informe <ExternalLink /></span></header>
          <div className="chart-legend"><span className="leads">Leads</span><span className="clients">Clientes</span></div>
          {chartHasValues ? <ResponsiveContainer width="100%" height={270}>
            <LineChart data={chartData} margin={{ top: 18, left: -16, right: 18, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} padding={{ top: 12 }} /><Tooltip /><Line type="monotone" dataKey="leads" name="Leads" stroke="#1f416f" strokeWidth={3} dot={{ r: 3, fill: "#1f416f" }} activeDot={{ r: 5 }} /><Line type="monotone" dataKey="clients" name="Clientes" stroke="#d69b3b" strokeWidth={3} dot={{ r: 3, fill: "#d69b3b" }} activeDot={{ r: 5 }} /></LineChart>
          </ResponsiveContainer> : <EmptyChartBar className="dashboard-empty-chart" />}
        </a>

        <section className="panel attention">
          <Head title="Leads calientes" sub={`Heat igual o superior a 80 · ${currentUser}`} />
          <div>{hotLeads.length ? hotLeads.map((lead) => <button key={lead.id} onClick={() => window.location.assign(adminPath("/crm"))}><i className="red" /><div><strong>{lead.name}</strong><small>{leadStages[lead.id] || lead.stage}</small></div><em className="red">Heat {lead.heat}</em></button>) : <p className="empty-copy">No hay leads calientes asignados.</p>}</div>
        </section>
      </div>

      <div className="lower">
        <a className="panel report-chart" href={dashboardReportUrl("embudo", period)} target="_blank" rel="noreferrer" aria-label="Abrir informe del embudo de captación">
          <header className="phead"><div><h2>Embudo de captación</h2><p>Fases reales del CRM</p></div><span className="report-hint">Ver informe <ExternalLink /></span></header>
          <div className="funnel">{funnel.map(([label, value]) => <div key={label}><p><span>{label}</span><strong>{value}</strong></p><div><i style={{ width: `${Math.max(3, value / funnelBase * 100)}%` }} /></div></div>)}</div>
          <div className="conversion"><strong>{contacts.length ? `${(funnel[funnel.length - 1][1] / contacts.length * 100).toFixed(1)}%` : "0%"}</strong><span>Conversión total a cliente</span><b>{funnel[funnel.length - 1][1]} clientes</b></div>
        </a>

        <a className="panel report-chart" href={dashboardReportUrl("facturacion", period)} target="_blank" rel="noreferrer" aria-label="Abrir informe de facturación anual">
          <header className="phead"><div><h2>Ventas anuales</h2><p>Base imponible real de Holded</p></div><span className="report-hint">Ver informe <ExternalLink /></span></header>
          <div className="comparison-legend"><span className="current">Este año</span><span className="previous">Año anterior</span></div><ResponsiveContainer width="100%" height={210}><BarChart data={financeData} layout="vertical" margin={{ left: 24, right: 18 }} barGap={-12}><CartesianGrid horizontal={false} stroke="#e8edf3" /><XAxis type="number" axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={72} /><Tooltip formatter={(value) => `${Number(value).toLocaleString("es-ES")} €`} /><Bar dataKey="previousValue" name="Año anterior" fill="#dfe6ee" radius={[0,5,5,0]} /><Bar dataKey="value" name="Este año" fill="#1f416f" radius={[0,5,5,0]} /></BarChart></ResponsiveContainer>
        </a>
      </div>
    </div>
  );
}

function dailySeries(startDate: Date, days: number, contacts: Contact[], clients: PortalClient[]) {
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(startDate); start.setDate(startDate.getDate() + index);
    const end = new Date(start); end.setDate(start.getDate() + 1);
    const inDay = (value?: string) => Boolean(value && new Date(value) >= start && new Date(value) < end);
    return { day: start.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).replace(".", ""), leads: contacts.filter((lead) => inDay(lead.createdAt)).length, clients: clients.filter((client) => inDay(client.created_at)).length };
  });
}

function monthlySeries(startDate: Date, endDate: Date, contacts: Contact[], clients: PortalClient[]) {
  const first = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const months = (endDate.getFullYear() - first.getFullYear()) * 12 + endDate.getMonth() - first.getMonth() + 1;
  return Array.from({ length: months }, (_, index) => {
    const start = new Date(first.getFullYear(), first.getMonth() + index, 1);
    const end = new Date(first.getFullYear(), first.getMonth() + index + 1, 1);
    const inMonth = (value?: string) => Boolean(value && new Date(value) >= start && new Date(value) < end);
    return { day: start.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }).replace(".", ""), leads: contacts.filter((lead) => inMonth(lead.createdAt)).length, clients: clients.filter((client) => inMonth(client.created_at)).length };
  });
}

function DashboardReport({ snapshot, contacts, leadStages, holded }: { snapshot: PortalSnapshot | null; contacts: Contact[]; leadStages: Record<string, CrmStage>; holded: HoldedSnapshot | null }) {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("tipo") || "altas";
  const rawPeriod = params.get("periodo") || "30";
  const safePeriod = (["7", "15", "30", "all"].includes(rawPeriod) ? rawPeriod : "30") as "7" | "15" | "30" | "all";
  const [acquisition, setAcquisition] = useState<SalesDashboard["acquisition"] | null>(null);
  useEffect(() => {
    let active = true;
    integrationClient.salesDashboard(dashboardAcquisitionPeriod(safePeriod))
      .then((result) => { if (active) setAcquisition(result.acquisition); })
      .catch(() => { if (active) setAcquisition(null); });
    return () => { active = false; };
  }, [safePeriod]);
  const periodDays = rawPeriod === "all" ? null : Number(rawPeriod);
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const start = periodDays ? new Date(today.getTime() - (periodDays - 1) * 86400000) : null;
  if (start) start.setHours(0, 0, 0, 0);
  const inRange = (date?: string | null) => Boolean(date && (!start || new Date(date) >= start) && new Date(date) <= today);
  const clients = snapshot?.clients || [];
  const leadsInRange = contacts.filter((lead) => inRange(lead.createdAt));
  const clientsInRange = clients.filter((client) => inRange(client.created_at));
  const crmClientsInRange = contacts.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente" && inRange(lead.clientAt || lead.createdAt));
  const portalClientEmails = new Set(clientsInRange.map((client) => client.email?.trim().toLowerCase()).filter(Boolean));
  const listedCrmClients = crmClientsInRange.filter((lead) => !lead.email || !portalClientEmails.has(lead.email.trim().toLowerCase()));
  const periodLabel = periodDays ? `Últimos ${periodDays} días` : "Todo el histórico";
  const stages: Array<[string, CrmStage]> = [["Por contactar", "Por contactar"], ["Contactados", "Contactado"], ["Llamadas programadas", "Llamada programada"], ["Propuestas enviadas", "Propuesta enviada"], ["Clientes", "Cliente"]];
  const title = type === "facturacion" ? "Informe de facturación anual" : type === "embudo" ? "Informe del embudo de captación" : "Informe de nuevos leads y clientes";

  return <div className="page report-page">
    <div className="title"><div><span>INFORME DETALLADO</span><h1>{title}</h1><p>Origen, criterio de cálculo y registros que componen el resultado.</p></div><button className="report-close" onClick={() => window.close()}>Cerrar pestaña</button></div>

    {type === "altas" && <>
      <section className="report-summary"><article><span>Leads</span><strong>{acquisition?.leads ?? leadsInRange.length}</strong><small>CRM actual más histórico validado</small></article><article><span>Clientes</span><strong>{acquisition?.newClients ?? clientsInRange.length}</strong><small>Conversiones CRM o firmas registradas</small></article><article><span>Periodo</span><strong>{periodLabel}</strong><small>{start ? `${start.toLocaleDateString("es-ES")} – ${today.toLocaleDateString("es-ES")}` : "Desde mayo de 2025"}</small></article></section>
      <ReportMethod text="El total de leads combina el histórico validado de Notion hasta el 22 de septiembre de 2026 con los leads nativos del CRM desde el 23 de septiembre. Los clientes incluyen las conversiones actuales del CRM —con la fecha de entrada o el evento de conversión— y usuarios con firma registrada, deduplicados. Los registros históricos seudónimos aparecen solo en los totales y gráficos; la tabla muestra filas identificables." />
      <ReportTable headers={["Tipo", "Nombre", "Email", "Fecha"]} rows={[...leadsInRange.map((lead) => ["Lead", lead.name, lead.email, formatReportDate(lead.createdAt)]), ...clientsInRange.map((client) => ["Cliente", [client.nombre, client.apellidos].filter(Boolean).join(" ") || client.username || "—", client.email || "—", formatReportDate(client.created_at)]), ...listedCrmClients.map((lead) => ["Cliente · CRM", lead.name, lead.email, formatReportDate(lead.clientAt || lead.createdAt)])]} />
    </>}

    {type === "embudo" && <>
      <section className="report-summary"><article><span>Base del embudo</span><strong>{contacts.length}</strong><small>Todos los leads del CRM</small></article><article><span>Clientes</span><strong>{contacts.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente").length}</strong><small>Leads en fase Cliente</small></article><article><span>Conversión</span><strong>{contacts.length ? `${(contacts.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente").length / contacts.length * 100).toFixed(1)}%` : "0%"}</strong><small>Clientes ÷ total de leads × 100</small></article></section>
      <ReportMethod text="Cada fila agrupa los leads por su fase actual en el CRM. La conversión se obtiene dividiendo los leads en fase Cliente entre el total de registros del CRM." />
      <ReportTable headers={["Fase", "Registros", "% del total"]} rows={stages.map(([label, stage]) => { const count = contacts.filter((lead) => (leadStages[lead.id] || lead.stage || "Por contactar") === stage).length; return [label, String(count), contacts.length ? `${(count / contacts.length * 100).toFixed(1)}%` : "0%"]; })} />
    </>}

    {type === "facturacion" && <>
      <section className="report-summary"><article><span>Ventas</span><strong>{formatMoney(holded?.currentYear.sales)}</strong><small>{holded?.currentYear.invoices || 0} facturas</small></article><article><span>Cobrado</span><strong>{formatMoney(holded?.currentYear.collected)}</strong><small>Importe pagado acumulado</small></article><article><span>Pendiente</span><strong>{formatMoney(holded?.currentYear.pending)}</strong><small>Total emitido menos cobrado</small></article></section>
      <ReportMethod text="Los importes proceden de Holded para el año natural en curso. Ventas corresponde a la base imponible, sin impuestos; cobrado suma los pagos registrados y pendiente refleja el total emitido todavía no cobrado." />
      <ReportTable headers={["Factura", "Cliente", "Fecha", "Total", "Cobrado", "Pendiente"]} rows={(holded?.recentInvoices || []).map((invoice) => [invoice.number || invoice.id, invoice.customer || "—", formatReportDate(invoice.date), formatMoney(invoice.total), formatMoney(invoice.paid), formatMoney(invoice.pending)])} empty="Holded no ha devuelto facturas recientes para mostrar el desglose." />
      {holded?.syncedAt && <p className="report-sync">Datos sincronizados el {new Date(holded.syncedAt).toLocaleString("es-ES")}.</p>}
    </>}
  </div>;
}

function ReportMethod({ text }: { text: string }) {
  return <section className="report-method"><FileText /><div><strong>Cómo se calcula</strong><p>{text}</p></div></section>;
}

function ReportTable({ headers, rows, empty = "No hay registros para este periodo." }: { headers: string[]; rows: string[][]; empty?: string }) {
  return <section className="panel report-table"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p>{empty}</p>}</section>;
}

function formatReportDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("es-ES") : "—";
}

function formatMoney(value?: number) {
  return value == null ? "—" : `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
