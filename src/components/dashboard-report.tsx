"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { Contact, CrmStage } from "@/types/domain";
import type { PortalSnapshot } from "@/services/portal";
import { integrationClient } from "@/services/integrations";
import type { HoldedSnapshot, SalesDashboard } from "@/services/integrations";
import { dashboardAcquisitionPeriod } from "@/components/dashboard-utils";

export function DashboardReport({ snapshot, contacts, leadStages, holded }: { snapshot: PortalSnapshot | null; contacts: Contact[]; leadStages: Record<string, CrmStage>; holded: HoldedSnapshot | null }) {
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
