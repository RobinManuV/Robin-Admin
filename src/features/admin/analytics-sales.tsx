// Admin feature module for analytics sales; the feature registry connects it to the authenticated shell.
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Megaphone, TrendingUp, UserCheck } from "lucide-react";
import { integrationClient } from "@/services/integrations";
import type { AnalyticsPeriod, FinancePeriod, SalesDashboard } from "@/services/integrations";
import { DashboardLoader } from "@/components/dashboard-loader";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { Bar, BarChart, Cell, CartesianGrid, ComposedChart, LabelList, Line, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FINANCE_PERIODS, GRANULARITY_LABEL, SourceTag, money, plainNumber } from "./analytics-finance";

export function SalesOverview({ personalUser, selectedPeriod }: { personalUser?: string; selectedPeriod?: AnalyticsPeriod } = {}) {
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
      <section className="panel finance-chart sales-channel-chart"><SalesHeading title="Contratado por canal" sub="Importe contratado en Portal según el canal del lead" sources={["portal"]} />{totalContracted > 0 && channelPie.length ? <><ResponsiveContainer width="100%" height={210}><RechartsPieChart><Pie data={channelPie} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={2}>{channelPie.map((channel) => <Cell key={channel.key} fill={SALES_CHANNEL_COLORS[channel.key]} />)}<LabelList dataKey="value" position="outside" formatter={(value: any) => money(Number(value))} /></Pie><Tooltip formatter={(value: any, _name: any, item: any) => [`${money(Number(value))} · ${percent(item?.payload?.percentage)}`, item?.payload?.label]} /></RechartsPieChart></ResponsiveContainer><div className="sales-donut-total"><strong>{money(channelPie.reduce((total, channel) => total + channel.value, 0))}</strong><span>contratado con canal</span></div><div className="sales-channel-legend">{visibleChannels.map((channel) => <div key={channel.key}><span><i style={{ background: SALES_CHANNEL_COLORS[channel.key] }} />{channel.label}</span><strong>{percent(channel.percentage)}</strong></div>)}</div></> : <EmptyChartBar />}</section>
    </div>

      <section className="panel finance-chart sales-campaign-wide"><SalesHeading title="Leads vs clientes por campaña" sub="Cohortes de CRM + histórico; Meta aporta la inversión y Portal el importe contratado" sources={["meta", "portal"]} />{data.campaigns.length ? <ResponsiveContainer width="100%" height={310}><BarChart data={data.campaigns} margin={{ top: 42, right: 12, left: 0, bottom: 46 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" axisLine={false} tickLine={false} height={62} fontSize={10} /><YAxis hide domain={[0, campaignMax * 1.3]} /><Tooltip formatter={(value: any, name: any, item: any) => [name === "Conversión" ? percent(Number(value)) : Number(value).toLocaleString("es-ES"), name]} /><Bar dataKey="leads" name="Leads CRM + histórico" fill="#b9c9df" radius={[4,4,0,0]}><LabelList dataKey="leads" position="top" fill="#65758a" fontSize={10} /><LabelList dataKey="conversion" name="Conversión" position="top" offset={20} fill="#c8742a" fontSize={9} formatter={(value: any) => percent(Number(value))} /></Bar><Bar dataKey="contracts" name="Clientes de cohorte" fill="#2f5a8a" radius={[4,4,0,0]}><LabelList dataKey="contracts" position="top" fill="#1f3d63" fontSize={10} /></Bar></BarChart></ResponsiveContainer> : <EmptyChartBar />}</section>

    <div className="sales-secondary-grid">
      <section className="panel finance-chart"><SalesHeading title="CAC por campaña" sub="Inversión de Meta Ads ÷ contratos firmados en Portal atribuidos a la campaña" sources={["meta", "portal"]} />{cacCampaigns.length ? <ResponsiveContainer width="100%" height={275}><BarChart data={cacCampaigns} margin={{ top: 28, right: 10, left: 0, bottom: 42 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" axisLine={false} tickLine={false} height={58} fontSize={9} /><YAxis hide /><Tooltip formatter={(value: any) => money(Number(value))} /><Bar dataKey="cac" name="CAC" fill="#c8742a" radius={[5,5,0,0]}><LabelList dataKey="cac" position="top" fill="#1f3d63" fontSize={9} formatter={(value: any) => money(Number(value))} /></Bar></BarChart></ResponsiveContainer> : <EmptyChartBar />}</section>
      <section className="panel finance-chart"><SalesHeading title="Margen por canal" sub="(Pagado por los clientes del canal − coste del canal) ÷ pagado" sources={["portal", "meta"]} /><ResponsiveContainer width="100%" height={225}><BarChart data={data.marginsByChannel} margin={{ top: 28, right: 10, left: 0, bottom: 14 }}><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="label" interval={0} axisLine={false} tickLine={false} fontSize={9} /><YAxis hide domain={["auto", "auto"]} /><Tooltip formatter={(value: any) => percent(Number(value))} /><Bar dataKey="margin" name="Margen" fill="#5f9c86" radius={[5,5,0,0]}><LabelList dataKey="margin" position="top" fill="#2d6150" fontSize={10} formatter={(value: any) => percent(Number(value))} /></Bar></BarChart></ResponsiveContainer></section>
    </div>

    <CrmTeamOverview team={scopedTeam} campaigns={data.campaigns} personalUser={viewerName} />
  </div>;
}

export function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export function SalesHeading({ title, sub, sources, granularity }: { title: string; sub: string; sources: Array<"portal" | "holded" | "meta">; granularity?: SalesDashboard["granularity"] }) {
  return <div className="finance-chart-heading"><div><div className="finance-chart-title"><h2>{title}</h2>{sources.map((source) => <SourceTag key={source} source={source}>{source === "portal" ? "Portal" : source === "holded" ? "Holded" : "Meta Ads"}</SourceTag>)}{granularity && <span className="finance-granularity">{GRANULARITY_LABEL[granularity]}</span>}</div><p>{sub}</p></div></div>;
}

export const SALES_CHANNEL_COLORS: Record<string, string> = {
  meta: "#2f5a8a",
  organic: "#c8742a",
  organic_social: "#5f9c86",
  referral: "#9274a8",
  other: "#aab4c2",
  schools: "#d4a84f",
};

export function CrmTeamOverview({ team, campaigns, personalUser }: { team: SalesDashboard["team"]; campaigns: SalesDashboard["campaigns"]; personalUser?: string }) {
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

export function crmDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours} h${rest ? ` ${rest} min` : ""}`;
}

export function nullableNumber(value: number | null | undefined) {
  return value == null ? "—" : plainNumber(value);
}
