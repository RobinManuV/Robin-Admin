// Admin interface component for dashboard home; composed by the shell or a feature module.
import { useEffect, useState } from "react";
import {
  CalendarDays, ChevronDown, CircleDollarSign, ExternalLink, GraduationCap,
  Sparkles, TrendingUp, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { integrationClient } from "@/services/integrations";
import type { HoldedSnapshot, SalesDashboard } from "@/services/integrations";
import type { Contact, CrmStage } from "@/types/domain";
import type { PortalClient, PortalSnapshot } from "@/services/portal";
import { adminPath } from "@/components/admin-path";
import { dashboardAcquisitionPeriod } from "@/components/dashboard-utils";

function Head({ title, sub, action }: { title: string; sub: string; action?: string }) {
  return <header className="phead"><div><h2>{title}</h2><p>{sub}</p></div>{action && <button>{action}</button>}</header>;
}

function dashboardReportUrl(type: "altas" | "embudo" | "facturacion", period: string) {
  return `${adminPath("/informes/inicio")}?tipo=${type}&periodo=${period}`;
}


export function Dashboard({ snapshot, contacts, leadStages, currentUser, holded, isDeveloperAdmin }: { snapshot: PortalSnapshot | null; contacts: Contact[]; leadStages: Record<string, CrmStage>; currentUser: string; holded: HoldedSnapshot | null; isDeveloperAdmin: boolean }) {
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
