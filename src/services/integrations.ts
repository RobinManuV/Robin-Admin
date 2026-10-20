import { apiPath } from "@/lib/api-path";

const apiFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(typeof input === "string" ? apiPath(input) : input, init);

export type IntegrationStatus = { holded: boolean; meta: boolean; stripe: boolean; email: boolean; applicationPortal: boolean; adminDatabase: boolean };
export type FinanceTotals = { sales: number; billed: number; base: number; tax: number; collected: number; pending: number; overdue: number; invoices: number; paidInvoices: number; pendingInvoices: number; partialInvoices: number; overdueInvoices: number; drafts: number; averageTicket: number; collectionRate: number };
export type HoldedSnapshot = { syncedAt: string; currency: string; currentMonth: FinanceTotals; currentYear: FinanceTotals; previousYear: FinanceTotals; last12Months: { month: string; label: string; sales: number; previousYearSales: number; billed: number; collected: number; pending: number; invoices: number }[]; recentInvoices: { id: string; number: string; customer: string; date: string | null; dueDate: string | null; subtotal: number; tax: number; total: number; paid: number; pending: number; status: string; currency: string }[] };
export type FinanceSnapshot = HoldedSnapshot;
export type MetaMetrics = { spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; cpm: number; leads: number; purchases: number; revenue: number; cpl: number; cac: number; roas: number };
export type MetaCampaign = MetaMetrics & { id: string; name: string; status: string };
export type MetaSnapshot = { period: string; account: { id: string; name: string; currency: string; timezone: string }; summary: MetaMetrics; campaigns: MetaCampaign[]; daily: { date: string; spend: number; cpm: number }[]; syncedAt: string };
export type PaymentAnalytics = { application: { paid: number; pending: number }; subscriptions: { paid: number; pending: number } | null; subscriptionsError?: string | null };
export type FinancePeriod = '30d' | 'month' | 'last_month' | '3m' | '365d' | 'ytd';
export type AnalyticsDateRange = { from: string; to: string };
export type AnalyticsPeriod = FinancePeriod | AnalyticsDateRange;
export type DashboardPeriod = FinancePeriod | 'custom';
export type ExpenseDiagnostics = {
  status: 'ok' | 'empty' | 'partial' | 'fallback' | 'unavailable';
  code: string | null;
  documentCount: number;
  classifiedDocuments: number;
  unclassifiedDocuments: number;
  entryCount: number;
  primaryError?: string | null;
  fallbackError?: string | null;
};
export type FinanceDashboard = {
  period: DashboardPeriod;
  rangeLabel: string;
  granularity: 'day' | 'week' | 'month';
  syncedAt: string;
  available: boolean;
  kpis: { sales: number | null; invoices: number | null; contracted: number | null; students: number | null; cac: number | null; anomaly: boolean };
  buckets: { key: string; label: string; tick: string; sales: number; collected: number; pending: number; contracted: number; cumulativeContracted: number; cumulativeCollected: number; newClients: number; expenses: number; previousSales: number }[];
  collections: { sales: number | null; collected: number | null; emitted: number | null; contracted: number | null; invoices: number | null; pending: number | null; averageInvoice: number | null; averageTicket: number | null };
  expenses: { operational: number | null; marketing: number | null; taxes: number | null; purchaseTax?: number | null; salesTax?: number | null; netTax?: number | null; other: number | null; capex: number | null; payments: number | null; total: number | null };
  invoices: { id: string; number: string; customer: string; clientType: string | null; installment: string | null; date: string | null; base: number; tax: number; total: number; status: string; currency: string }[];
  cash: { available: boolean; points: { date: string; balance: number; source: string }[]; accounts: { id: string; name: string; type: string; currency: string; balance: number; rate_to_eur: number | null; balance_eur: number | null }[] };
  reports: { profitAndLoss: 'wip'; balance: 'wip' };
  expenseDiagnostics?: ExpenseDiagnostics;
  sources?: Record<string, boolean>;
  warnings?: string[];
};
export type CrmPerformance = {
  history: { eventsAvailable: boolean; sessionsAvailable: boolean; applicationsAvailable: boolean; eventsComplete: boolean; sessionsComplete: boolean; eventsSince: string | null; sessionsSince: string | null };
  summary: { newLeads: number; leadVariation: number | null; contracts: number; contracted: number; averageTicket: number | null; won: number | null; lost: number | null; winRate: number | null; speedMinutes: number | null; collected: number; collectionRate: number | null; qualityIssues: number };
  agents: { key: string; name: string; assigned: number | null; contacted: number | null; contactRate: number | null; speedMinutes: number | null; contracts: number; cohortLeads?: number; cohortClients?: number; won: number | null; lost: number | null; winRate: number | null; contracted: number; revenuePerLead: number | null; portfolio: number; stale: number | null; activeDays: number | null; actionsPerDay: number | null; collected: number; collectionRate: number | null; collectionDays: number | null; admissionRate: number | null; applications: number | null }[];
  stageTimes: { stage: string; values: Record<string, number | null> }[];
  funnel: { stage: string; count: number; conversion: number | null; lost: number }[] | null;
  lostReasons: { key: string; label: string; count: number; percentage: number | null }[];
  alerts: { key: string; severity: string; count: number | null; label: string }[];
  fifo: { key: string; name: string; value: number | null }[];
  quality: { key: string; label: string; count: number }[];
};
export type SalesDashboard = {
  period: DashboardPeriod;
  rangeLabel: string;
  granularity: 'day' | 'week' | 'month';
  syncedAt: string;
  kpis: { contracted: number; contracts: number; leads: number | null; conversion: number | null; cac: number | null; lac: number | null };
  buckets: { key: string; label: string; tick: string; leads: number; contracts: number; conversion: number | null }[];
  acquisition: { leads: number; newClients: number; buckets: { key: string; label: string; tick: string; leads: number; clients: number }[] };
  channels: { key: string; label: string; leads: number; contracts: number; contracted: number; percentage: number | null }[];
  campaigns: { id: string | null; name: string; leads: number; contracts: number; conversion: number | null; spend: number | null; contracted: number; paid: number; contacted: number; matchedCrmLeads: number; contactRate: number | null; cpl: number | null; cac: number | null; roas: number | null; roasCollected: number | null; margin: number | null }[];
  marginsByChannel: { key: string; label: string; status: 'ready' | 'unavailable' | 'wip'; paid: number | null; spend: number | null; margin: number | null }[];
  agents: { key: string; name: string; leads: number | null; sales: number | null; conversion: number | null }[];
  teamAverage: number | null;
  sources: { portal: boolean; adminCrm: boolean; holdedMarketing: boolean; meta: boolean; historical?: boolean };
  meta: { currency: string; spend: number | null };
  team: CrmPerformance;
  scope?: { type: 'global' | 'personal'; userName?: string; metaSpend: 'global' };
};
const META_CACHE_KEY = 'robin-admin-meta-insights-v1';
const META_CACHE_MS = 30 * 60 * 1000;

function periodQuery(period: AnalyticsPeriod) {
  if (typeof period === 'string') return `period=${encodeURIComponent(period)}`;
  return `period=custom&from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`;
}

function cachedMeta(): MetaSnapshot | null {
  try {
    const stored = JSON.parse(localStorage.getItem(META_CACHE_KEY) || 'null');
    return stored?.savedAt && Date.now() - stored.savedAt < META_CACHE_MS ? stored.data : null;
  } catch (_) { return null; }
}
export const integrationClient = {
  status: async (): Promise<IntegrationStatus> => ({ holded: false, meta: false, stripe: false, email: false, applicationPortal: false, adminDatabase: false }),
  holded: async (): Promise<HoldedSnapshot> => {
    const response = await apiFetch('/api/admin/holded/snapshot', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar los datos de Holded');
    return payload as HoldedSnapshot;
  },
  meta: async (force = false): Promise<MetaSnapshot> => {
    const cached = !force ? cachedMeta() : null;
    if (cached) return cached;
    const response = await apiFetch(`/api/admin/meta/insights${force ? '?refresh=1' : ''}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback = cachedMeta();
      if (fallback) return fallback;
      const detail = String(payload.detail || '');
      if (response.status === 429 || /too many calls|rate limit/i.test(detail)) throw new Error('Meta ha limitado temporalmente las consultas. Espera unos minutos antes de actualizar de nuevo.');
      throw new Error(detail || 'No se pudieron cargar las estadísticas de Meta');
    }
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: payload })); } catch (_) {}
    return payload as MetaSnapshot;
  },
  paymentAnalytics: async (): Promise<PaymentAnalytics> => {
    const response = await apiFetch('/api/admin/payment-analytics', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar los pagos de Supabase');
    return payload as PaymentAnalytics;
  },
  financeDashboard: async (period: AnalyticsPeriod): Promise<FinanceDashboard> => {
    const response = await apiFetch(`/api/admin/finance/dashboard?${periodQuery(period)}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar las finanzas');
    return payload as FinanceDashboard;
  },
  salesDashboard: async (period: AnalyticsPeriod, scope: 'global' | 'personal' = 'global'): Promise<SalesDashboard> => {
    const response = await apiFetch(`/api/admin/sales/dashboard?${periodQuery(period)}&scope=${scope}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar las ventas');
    return payload as SalesDashboard;
  },
  sendWhatsApp: async () => { throw new Error("La integración de WhatsApp no está conectada"); },
  convertLead: async (lead: { leadId: string; name: string; email: string; advisor: string; clientType: string }) => {
    const response = await apiFetch("/api/internal/crm/convert", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages: Record<string, string> = { lead_email_required: "El lead necesita un email antes de pasar a IN", advisor_required: "Debes elegir el asesor del cliente", advisor_invalid: "El asesor elegido no tiene acceso activo al portal", identity_collision: "Ya existe un usuario con ese email o identificador", invalid_bootstrap_password_configuration: "Falta configurar una contraseña inicial válida" };
      throw new Error(messages[payload.error] || payload.detail || "No se pudo crear el alumno en el portal");
    }
    return payload as { result: "created" | "exists"; userId: string; emailSent: boolean; loginUrl: string; assignedTo: string; salesAgent: string | null };
  },
};
