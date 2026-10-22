// Admin interface component for admin app; composed by the shell or a feature module.
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
  Database,
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
import { DashboardReport } from "@/components/dashboard-report";
import { Dashboard } from "@/components/dashboard-home";
import { adminPath } from "@/components/admin-path";
import { dashboardAcquisitionPeriod } from "@/components/dashboard-utils";
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

const workspaceTabs: readonly (readonly [string, string, string, string | null])[] = [
  ["https://project-robin.com/admin", "Inicio", "home", null],
  ["https://robinjr.netlify.app/portal/", "RobinJr", "robinjr", null],
  ["https://project-robin.com/portal/", "Portal del Alumno", "external", null],
  ["https://project-robin.com/therobinplan/", "Robin Community", "subscriptions", null],
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
    ["/base-datos", "Base de datos", Database, "developer.database"],
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
  const isDeveloperAdmin = isDeveloperAdminEmail(permissionProfile.email);
  const visibleTabs = allAdminTabPermissions;
  const canSee = (key: string) => key === "developer.database" ? isDeveloperAdmin : visibleTabs.includes(key);
  const routePermission = path === "/" || path.startsWith("/informes/inicio") ? "home.summary"
    : path === "/bandeja-leads" ? "home.leads"
      : path === "/alumnos-global" || path.startsWith("/alumnos-global/") ? "home.students"
        : path === "/analitica-global" || path === "/pagos" ? "home.analytics"
          : path === "/configuracion" ? "home.settings"
            : path === "/base-datos" ? "developer.database"
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
            {workspaceTabs.map(([href, label, tabArea]) => {
              const external = href.startsWith("https://");
              const destination = external ? href : adminPath(href);
              const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
                if (tabArea === "robinjr") {
                  event.preventDefault();
                  void (async () => {
                    try {
                      const response = await fetch("/portal/api/auth/sso-ticket", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ target: "robinjr" }),
                        cache: "no-store",
                      });
                      const result = await response.json().catch(() => ({}));
                      if (!response.ok || !result.ticket) throw new Error("No se pudo validar la sesión.");
                      window.location.assign(href + "?sso_ticket=" + encodeURIComponent(result.ticket));
                    } catch (_) {
                      setNotice("No se ha podido validar tu acceso a RobinJr.");
                    }
                  })();
                  return;
                }
                if (!external) {
                  event.preventDefault();
                  event.stopPropagation();
                  window.location.assign(destination);
                }
              };
              return <a href={destination} key={href} className={area === tabArea ? "active" : ""} rel={external ? "noreferrer" : undefined} onClick={onClick}>{label}</a>;
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
