import type { AnalyticsDateRange } from "@/services/integrations";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dashboardAcquisitionPeriod(period: "7" | "15" | "30" | "all"): AnalyticsDateRange {
  const end = new Date();
  const start = period === "all" ? new Date(2025, 4, 1) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - Number(period) + 1);
  return { from: localDateKey(start), to: localDateKey(end) };
}
