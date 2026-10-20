// Admin feature module for analytics; the feature registry connects it to the authenticated shell.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Contact, CrmStage } from "@/types/domain";
import type { PortalSnapshot } from "@/services/portal";
import type { AnalyticsDateRange } from "@/services/integrations";
import { Title } from './feature-shared';
import { FinanceOverview } from "./analytics-finance";
import { SalesOverview } from "./analytics-sales";
export * from "./analytics-finance";
export * from "./analytics-sales";
export * from "./analytics-personal";

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
