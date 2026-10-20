// Admin feature module for analytics finance; the feature registry connects it to the authenticated shell.
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CircleDollarSign, FileText, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { integrationClient } from "@/services/integrations";
import type { AnalyticsPeriod, FinanceDashboard, FinancePeriod, SalesDashboard } from "@/services/integrations";
import { DashboardLoader } from "@/components/dashboard-loader";
import { EmptyChartBar } from "@/components/empty-chart-bar";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, Pie, PieChart as RechartsPieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
