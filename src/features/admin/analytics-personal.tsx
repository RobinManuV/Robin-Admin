import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import type { MetaSnapshot } from "@/services/integrations";
import type { PortalSnapshot } from "@/services/portal";
import { DashboardLoader } from "@/components/dashboard-loader";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { Title } from './feature-shared';
import { SalesOverview } from "./analytics-sales";

export function PersonalAnalytics({ path, currentUser, contacts, leadStages, snapshot, isDeveloperAdmin }: { path: string; currentUser: string; contacts: Contact[]; leadStages: Record<string, CrmStage>; snapshot: PortalSnapshot | null; isDeveloperAdmin: boolean }) {
  const key = path.split("/").filter(Boolean)[1] || "ventas";
  if (key === "ventas" || key === "finanzas" || key === "pagos") return <div className="page"><SalesOverview personalUser={currentUser} /></div>;
  const owned = contacts.filter((lead) => isDeveloperAdmin || lead.owner === currentUser);
  const metrics = [
    { label: "Alumnos del portal", value: String(snapshot?.clients.length || 0), detail: "Datos del portal" },
    { label: "Leads asignados", value: String(owned.length), detail: currentUser },
    { label: "Clientes cerrados", value: String(owned.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente").length), detail: "CRM" },
    { label: "En onboarding", value: String(snapshot?.clients.filter((client) => client.requires_onboarding).length || 0), detail: "Requieren seguimiento" },
  ];
  return <div className="page"><Title name="Otras métricas" sub={`Carga operativa real · ${currentUser}`} eyebrow="OPERACIONES" /><ReadonlyMetricGrid metrics={metrics} /></div>;
}

export function ReadonlyMetricGrid({ metrics }: { metrics: { label: string; value: string; detail: string }[] }) {
  return <section className="ads-kpi-grid">{metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section>;
}

export function Campaigns({ currentUser, notify }: { currentUser: string; notify: (message: string) => void }) {
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
  const summary = snapshot?.summary;
  const maxSpend = Math.max(...(snapshot?.daily.map((day) => day.spend) ?? [0]), 1);
  const maxCpm = Math.max(...(snapshot?.daily.map((day) => day.cpm) ?? [0]), 1);
  const statusLabel: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", ARCHIVED: "Archivada", DELETED: "Eliminada", CAMPAIGN_PAUSED: "Pausada", ADSET_PAUSED: "Pausada", IN_PROCESS: "En revisión", WITH_ISSUES: "Con incidencias" };
  if (syncing && !snapshot) return <div className="page"><DashboardLoader /></div>;
  return (
    <div className="page">
      <Title name="Meta Ads" sub={`Resultados reales de la cuenta publicitaria · acceso de ${currentUser}.`} eyebrow="CAMPAÑAS"><Button variant="outline" onClick={() => void syncMeta(true)} disabled={syncing}><Megaphone />{syncing ? "Sincronizando…" : "Actualizar datos"}</Button></Title>
      <div className="meta-banner"><ShieldCheck /><div><strong>{connection}</strong><p>Periodo: últimos 30 días · importes en {snapshot?.account.currency || "EUR"} · zona horaria {snapshot?.account.timezone || "de la cuenta"}</p></div><Badge variant="outline">DATOS REALES</Badge></div>
      <section className="ads-kpi-grid">{[
        ["Inversión", summary ? euro(summary.spend) : "—", "Gasto total"], ["Impresiones", summary ? summary.impressions.toLocaleString("es-ES") : "—", summary ? `${(summary.impressions / 1000).toFixed(1)}k` : "—"], ["Clics", summary ? summary.clicks.toLocaleString("es-ES") : "—", summary ? `${summary.ctr.toFixed(2)}% CTR` : "—"], ["CTR", summary ? `${summary.ctr.toFixed(2)}%` : "—", "Clics / impresiones"],
        ["CPC medio", summary ? euro(summary.cpc) : "—", "Coste por clic"], ["CPM", summary ? euro(summary.cpm) : "—", "Coste por mil"], ["Alcance", summary ? summary.reach.toLocaleString("es-ES") : "—", "Personas únicas"], ["Leads", summary ? summary.leads.toLocaleString("es-ES") : "—", "Conversiones atribuidas"],
        ["CPL real", summary ? euro(summary.cpl) : "—", "Inversión / leads"], ["Ventas", summary ? summary.purchases.toLocaleString("es-ES") : "—", "Compras atribuidas"], ["CAC", summary ? euro(summary.cac) : "—", "Inversión / ventas"], ["ROAS", summary ? `${summary.roas.toFixed(2)}×` : "—", summary ? euro(summary.revenue) : "—"],
      ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
      <div className="sales-analysis-grid"><section className="panel clean-chart"><h2>Inversión diaria</h2>{snapshot?.daily.length ? <div className="metric-bars">{snapshot.daily.map((day) => <div key={day.date} title={`${day.date}: ${euro(day.spend)}`}><span style={{ height: `${day.spend > 0 ? Math.max(2, day.spend / maxSpend * 100) : 0}%` }} /><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit" })}</small></div>)}</div> : <EmptyChartBar />}</section><section className="panel clean-chart"><h2>CPM diario</h2>{snapshot?.daily.length ? <div className="metric-bars gold-bars">{snapshot.daily.map((day) => <div key={day.date} title={`${day.date}: ${euro(day.cpm)}`}><span style={{ height: `${day.cpm > 0 ? Math.max(2, day.cpm / maxCpm * 100) : 0}%` }} /><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit" })}</small></div>)}</div> : <EmptyChartBar />}</section></div>
      <section className="panel campaign-panel"><div className="panel-heading"><div><h2>Campañas</h2><p>Datos reales · últimos 30 días</p></div></div><div className="data-table"><table><thead><tr><th>Campaña</th><th>Estado</th><th>Inversión</th><th>Leads</th><th>CPL</th><th>ROAS</th></tr></thead><tbody>{snapshot?.campaigns.map((row) => <tr key={row.id}><td><b>{row.name}</b><small>ID: {row.id}</small></td><td><Badge variant="outline">{statusLabel[row.status] || row.status}</Badge></td><td>{euro(row.spend)}</td><td>{row.leads.toLocaleString("es-ES")}</td><td>{euro(row.cpl)}</td><td>{row.roas.toFixed(2)}×</td></tr>)}{snapshot && snapshot.campaigns.length === 0 && <tr><td colSpan={6}>No hay campañas con entrega en los últimos 30 días.</td></tr>}</tbody></table></div></section>
    </div>
  );
}
