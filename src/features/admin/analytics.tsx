import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CircleDollarSign, FileText, GraduationCap, Megaphone, ShieldCheck, TrendingUp, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import type { MetaSnapshot } from "@/services/integrations";
import type { PortalSnapshot } from "@/services/portal";
import { DashboardLoader } from "@/components/dashboard-loader";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { Area, AreaChart, Bar, BarChart, Cell, CartesianGrid, ComposedChart, LabelList, Line, LineChart, Pie, PieChart as RechartsPieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsDateRange, AnalyticsPeriod, FinanceDashboard, FinancePeriod, SalesDashboard } from "@/services/integrations";
import { Title } from './feature-shared';

export function GlobalAnalytics({ contacts, leadStages, snapshot, connected }: { contacts: Contact[]; leadStages: Record<string, CrmStage>; snapshot: PortalSnapshot | null; connected: boolean }) {
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

export type SelectedAnalyticsRange = AnalyticsDateRange & { preset: AnalyticsPreset };

export type AnalyticsPreset = "last_month" | "3m" | "ytd" | "custom";

export function analyticsPreset(preset: Exclude<AnalyticsPreset, "custom">, today = new Date()): SelectedAnalyticsRange {
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

export function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftedMonths(date: Date, months: number) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

export function AnalyticsRangeControl({ value, onChange }: { value: SelectedAnalyticsRange; onChange: (range: SelectedAnalyticsRange) => void }) {
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

export function FinanceOverview({ selectedPeriod }: { selectedPeriod?: AnalyticsPeriod } = {}) {
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

    <section className="panel finance-cash"><ChartHeading title="Caja" sub="Saldo conjunto de todas las cuentas de Tesorería, convertido a EUR con el cambio diario del BCE" source="holded" /><div className="finance-cash-cards">{cashCards.map((card) => { const delta = card.point && currentCash != null ? currentCash - card.point.balance : null; return <article key={card.tag} className={card.current ? "current" : ""}><span><b>{card.tag}</b>{card.name}</span><strong>{card.point ? money(card.point.balance) : "—"}</strong><small>{card.point ? `${new Date(`${card.point.date}T12:00:00`).toLocaleDateString("es-ES")} · ${card.current ? "saldo actual" : `${delta != null && delta >= 0 ? "+" : "−"}${money(Math.abs(delta || 0))} hasta hoy`}` : "Sin histórico disponible"}</small></article>; })}</div>{data.cash.available && cashPoints.length ? <ResponsiveContainer width="100%" height={270}><AreaChart data={cashPoints}><defs><linearGradient id="cash-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f5a8a" stopOpacity={0.18} /><stop offset="100%" stopColor="#2f5a8a" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef1f5" /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { month: "short", year: "2-digit" })} axisLine={false} tickLine={false} fontSize={10} /><YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k €`} axisLine={false} tickLine={false} width={55} fontSize={10} domain={["auto", "auto"]} /><Tooltip content={<FinanceTooltip />} />{cashMarkers.map((marker) => <ReferenceLine key={marker.point!.date} x={marker.point!.date} stroke="#9ca9b8" strokeDasharray="3 4" label={{ value: marker.tag, position: "insideTopRight", fill: "#708096", fontSize: 9 }} />)}<Area type="monotone" dataKey="balance" name="Saldo" stroke="#2f5a8a" strokeWidth={2.5} fill="url(#cash-fill)" activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer> : <EmptyChartBar />}</section>
  </div>;
}

export function expenseDiagnosticCopy(data: FinanceDashboard) {
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

export function money(value: number | null | undefined, currency = "EUR") {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function plainNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("es-ES");
}

export const FINANCE_PERIODS: Array<{ value: FinancePeriod; label: string }> = [
  { value: "30d", label: "Últimos 30 días" },
  { value: "month", label: "Mes actual" },
  { value: "last_month", label: "Mes pasado" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "365d", label: "Últimos 365 días" },
  { value: "ytd", label: "Year to date" },
];

export const GRANULARITY_LABEL = { day: "Por día", week: "Por semana", month: "Por mes" } as const;

export function SourceTag({ children, source }: { children: React.ReactNode; source: "holded" | "portal" | "both" | "meta" }) {
  return <span className={`finance-source ${source}`}>{children}</span>;
}

export function ChartHeading({ title, sub, source, granularity, aside }: { title: string; sub: string; source?: "holded" | "portal" | "both"; granularity?: FinanceDashboard["granularity"]; aside?: React.ReactNode }) {
  return <div className="finance-chart-heading"><div><div className="finance-chart-title"><h2>{title}</h2>{source === "both" ? <><SourceTag source="holded">Holded</SourceTag><SourceTag source="portal">Portal</SourceTag></> : source ? <SourceTag source={source}>{source === "holded" ? "Holded" : "Portal"}</SourceTag> : null}{granularity && <span className="finance-granularity">{GRANULARITY_LABEL[granularity]}</span>}</div><p>{sub}</p></div>{aside}</div>;
}

export function FinanceXAxis({ buckets }: { buckets: FinanceDashboard["buckets"] }) {
  return <XAxis dataKey="label" tickFormatter={(_, index) => buckets[index]?.tick || ""} axisLine={false} tickLine={false} fontSize={10} />;
}

export function FinanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="finance-tooltip"><strong>{label}</strong>{payload.map((item: any) => <span key={item.dataKey} style={{ color: item.color }}>{item.name}: {typeof item.value === "number" ? money(item.value) : item.value}</span>)}</div>;
}

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

export function PersonalAnalytics({ path, currentUser, contacts, leadStages, snapshot, isDeveloperAdmin }: { path: string; currentUser: string; contacts: Contact[]; leadStages: Record<string, CrmStage>; snapshot: PortalSnapshot | null; isDeveloperAdmin: boolean }) {
  const key = path.split("/").filter(Boolean)[1] || "ventas";
  if (key === "ventas" || key === "finanzas" || key === "pagos") return <div className="page"><SalesOverview personalUser={currentUser} /></div>;
  const owned = contacts.filter((lead) => isDeveloperAdmin || lead.owner === currentUser);
  const actualAssignees = (values: Array<string | undefined>) => Object.entries(values.reduce<Record<string, number>>((counts, value) => {
    const assignee = value?.trim() || "Sin asignar";
    counts[assignee] = (counts[assignee] || 0) + 1;
    return counts;
  }, {})).sort(([left], [right]) => left.localeCompare(right, "es"));
  const leadAssignmentCounts = actualAssignees(contacts.map((lead) => lead.owner));
  const clientAssignmentCounts = actualAssignees((snapshot?.clients || []).map((client) => client.assigned_to));
  const metrics = [
    { label: isDeveloperAdmin ? "Alumnos del equipo" : "Alumnos del portal", value: String(snapshot?.clients.length || 0), detail: isDeveloperAdmin ? "Global · todos los responsables" : "Datos del portal" },
    { label: isDeveloperAdmin ? "Leads del equipo" : "Leads asignados", value: String(owned.length), detail: isDeveloperAdmin ? "Global · todos los responsables" : currentUser },
    { label: isDeveloperAdmin ? "Clientes cerrados · equipo" : "Clientes cerrados", value: String(owned.filter((lead) => (leadStages[lead.id] || lead.stage) === "Cliente").length), detail: isDeveloperAdmin ? "CRM · todos los responsables" : "CRM" },
    { label: "En onboarding", value: String(snapshot?.clients.filter((client) => client.requires_onboarding).length || 0), detail: isDeveloperAdmin ? "Portal · todos los responsables" : "Requieren seguimiento" },
  ];
  return <div className="page"><Title name="Otras métricas" sub={isDeveloperAdmin ? "Vista global · responsables según la asignación registrada en cada base de datos." : `Carga operativa real · ${currentUser}`} eyebrow="OPERACIONES" /><ReadonlyMetricGrid metrics={metrics} />{isDeveloperAdmin && <section className="assignment-breakdown-grid"><article className="panel"><h2>Asignación real de leads</h2><p>Responsable registrado en el CRM</p>{leadAssignmentCounts.map(([assignee, count]) => <div key={assignee}><span>{assignee}</span><strong>{count}</strong></div>)}</article><article className="panel"><h2>Asignación real de alumnos</h2><p>Asesor registrado en el portal</p>{clientAssignmentCounts.map(([assignee, count]) => <div key={assignee}><span>{assignee}</span><strong>{count}</strong></div>)}</article></section>}</div>;
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
