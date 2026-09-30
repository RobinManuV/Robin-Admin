export type IntegrationStatus = { holded: boolean; meta: boolean; stripe: boolean; email: boolean; applicationPortal: boolean; adminDatabase: boolean };
export type FinanceTotals = { sales: number; billed: number; base: number; tax: number; collected: number; pending: number; overdue: number; invoices: number; paidInvoices: number; pendingInvoices: number; partialInvoices: number; overdueInvoices: number; drafts: number; averageTicket: number; collectionRate: number };
export type HoldedSnapshot = { syncedAt: string; currency: string; currentMonth: FinanceTotals; currentYear: FinanceTotals; previousYear: FinanceTotals; last12Months: { month: string; label: string; sales: number; previousYearSales: number; billed: number; collected: number; pending: number; invoices: number }[]; recentInvoices: { id: string; number: string; customer: string; date: string | null; dueDate: string | null; subtotal: number; tax: number; total: number; paid: number; pending: number; status: string; currency: string }[] };
export type FinanceSnapshot = HoldedSnapshot;
export type MetaMetrics = { spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; cpm: number; leads: number; purchases: number; revenue: number; cpl: number; cac: number; roas: number };
export type MetaCampaign = MetaMetrics & { id: string; name: string; status: string };
export type MetaSnapshot = { period: string; account: { id: string; name: string; currency: string; timezone: string }; summary: MetaMetrics; campaigns: MetaCampaign[]; daily: { date: string; spend: number; cpm: number }[]; syncedAt: string };
export type PaymentAnalytics = { application: { paid: number; pending: number }; subscriptions: { paid: number; pending: number } | null; subscriptionsError?: string | null };
export type FinancePeriod = '30d' | 'month' | '3m' | '365d' | 'ytd';
export type FinanceDashboard = {
  period: FinancePeriod;
  rangeLabel: string;
  granularity: 'day' | 'week' | 'month';
  syncedAt: string;
  available: boolean;
  kpis: { sales: number | null; invoices: number | null; contracted: number | null; students: number | null; cac: number | null; anomaly: boolean };
  buckets: { key: string; label: string; tick: string; sales: number; collected: number; pending: number; contracted: number; cumulativeContracted: number; cumulativeCollected: number; newClients: number; expenses: number; previousSales: number }[];
  collections: { sales: number | null; collected: number | null; emitted: number | null; contracted: number | null; invoices: number | null; pending: number | null; averageInvoice: number | null; averageTicket: number | null };
  expenses: { operational: number | null; marketing: number | null; taxes: number | null; other: number | null; capex: number | null; payments: number | null; total: number | null };
  invoices: { id: string; number: string; customer: string; clientType: string | null; installment: string | null; date: string | null; base: number; tax: number; total: number; status: string; currency: string }[];
  cash: { available: boolean; points: { date: string; balance: number; source: string }[]; accounts: { id: string; name: string; type: string; currency: string; balance: number; rate_to_eur: number | null; balance_eur: number | null }[] };
  reports: { profitAndLoss: 'wip'; balance: 'wip' };
  sources?: Record<string, boolean>;
  warnings?: string[];
};
export type SalesDashboard = {
  period: FinancePeriod;
  rangeLabel: string;
  granularity: 'day' | 'week' | 'month';
  syncedAt: string;
  kpis: { sales: number; leads: number; conversion: number | null; cac: number | null; lac: number | null };
  buckets: { key: string; label: string; tick: string; leads: number; sales: number; conversion: number | null }[];
  channels: { key: string; label: string; leads: number; sales: number; percentage: number | null }[];
  campaigns: { id: string | null; name: string; leads: number; sales: number; conversion: number | null; spend: number | null; contracted: number; cac: number | null; margin: number | null }[];
  marginsByChannel: { key: string; label: string; status: 'ready' | 'unavailable' | 'wip'; contracted: number | null; spend: number | null; margin: number | null }[];
  agents: { key: string; name: string; leads: number | null; sales: number | null; conversion: number | null }[];
  teamAverage: number | null;
  sources: { portal: boolean; adminCrm: boolean; holdedMarketing: boolean; meta: boolean };
  meta: { currency: string; spend: number | null };
};
const META_CACHE_KEY = 'robin-admin-meta-insights-v1';
const META_CACHE_MS = 30 * 60 * 1000;

function isLocalAdminPreview() {
  if (import.meta.env?.VITE_ENABLE_LOCAL_PREVIEW !== '1'
    || typeof window === 'undefined'
    || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  const requestedRole = new URLSearchParams(window.location.search).get('preview');
  if (requestedRole === 'admin') {
    try { window.sessionStorage.setItem('robin-local-preview-role', 'admin'); } catch (_) {}
    return true;
  }
  try { return window.sessionStorage.getItem('robin-local-preview-role') !== 'client'; } catch (_) { return true; }
}

const emptyFinanceTotals = (): FinanceTotals => ({ sales: 0, billed: 0, base: 0, tax: 0, collected: 0, pending: 0, overdue: 0, invoices: 0, paidInvoices: 0, pendingInvoices: 0, partialInvoices: 0, overdueInvoices: 0, drafts: 0, averageTicket: 0, collectionRate: 0 });

function previewHolded(): HoldedSnapshot {
  const currentYear = new Date().getFullYear();
  return {
    syncedAt: new Date().toISOString(), currency: 'EUR',
    currentMonth: emptyFinanceTotals(), currentYear: emptyFinanceTotals(), previousYear: emptyFinanceTotals(),
    last12Months: Array.from({ length: 12 }, (_, index) => ({ month: `${currentYear}-${String(index + 1).padStart(2, '0')}`, label: new Date(currentYear, index, 1).toLocaleDateString('es-ES', { month: 'short' }), sales: 0, previousYearSales: 0, billed: 0, collected: 0, pending: 0, invoices: 0 })),
    recentInvoices: [],
  };
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
    if (isLocalAdminPreview()) return previewHolded();
    const response = await fetch('/api/admin/holded/snapshot', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar los datos de Holded');
    return payload as HoldedSnapshot;
  },
  meta: async (force = false): Promise<MetaSnapshot> => {
    if (isLocalAdminPreview()) return { period: 'preview', account: { id: 'preview', name: 'Cuenta demo', currency: 'EUR', timezone: 'Europe/Madrid' }, summary: { spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpc: 0, cpm: 0, leads: 0, purchases: 0, revenue: 0, cpl: 0, cac: 0, roas: 0 }, campaigns: [], daily: [], syncedAt: new Date().toISOString() };
    const cached = !force ? cachedMeta() : null;
    if (cached) return cached;
    const response = await fetch(`/api/admin/meta/insights${force ? '?refresh=1' : ''}`, { credentials: 'include' });
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
    if (isLocalAdminPreview()) return { application: { paid: 0, pending: 0 }, subscriptions: { paid: 0, pending: 0 } };
    const response = await fetch('/api/admin/payment-analytics', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar los pagos de Supabase');
    return payload as PaymentAnalytics;
  },
  financeDashboard: async (period: FinancePeriod): Promise<FinanceDashboard> => {
    if (isLocalAdminPreview()) {
      const now = new Date();
      const labels = Array.from({ length: period === '30d' ? 30 : period === '3m' ? 13 : Math.max(1, now.getMonth() + 1) }, (_, index) => ({ key: `preview-${index}`, label: '', tick: '', sales: 0, collected: 0, pending: 0, contracted: 0, cumulativeContracted: 0, cumulativeCollected: 0, newClients: 0, expenses: 0, previousSales: 0 }));
      return { period, rangeLabel: 'Vista previa local', granularity: period === '30d' || period === 'month' ? 'day' : period === '3m' ? 'week' : 'month', syncedAt: now.toISOString(), available: false, kpis: { sales: null, invoices: null, contracted: null, students: null, cac: null, anomaly: false }, buckets: labels, collections: { sales: null, collected: null, emitted: null, contracted: null, invoices: null, pending: null, averageInvoice: null, averageTicket: null }, expenses: { operational: null, marketing: null, taxes: null, other: null, capex: null, payments: null, total: null }, invoices: [], cash: { available: false, points: [], accounts: [] }, reports: { profitAndLoss: 'wip', balance: 'wip' }, sources: { holdedInvoices: false, holdedAccounting: false, portal: false, treasury: false, ecb: false }, warnings: [] };
    }
    const response = await fetch(`/api/admin/finance/dashboard?period=${encodeURIComponent(period)}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar las finanzas');
    return payload as FinanceDashboard;
  },
  salesDashboard: async (period: FinancePeriod): Promise<SalesDashboard> => {
    if (isLocalAdminPreview()) {
      const now = new Date();
      const length = period === '30d' ? 30 : period === '3m' ? 13 : Math.max(1, now.getMonth() + 1);
      const channels = [
        { key: 'meta', label: 'Meta' },
        { key: 'organic', label: 'Orgánico' },
        { key: 'organic_social', label: 'Orgánico RRSS' },
        { key: 'referral', label: 'Referidos' },
        { key: 'other', label: 'Otros' },
        { key: 'schools', label: 'Colegios' },
      ];
      return { period, rangeLabel: 'Vista previa local', granularity: period === '30d' || period === 'month' ? 'day' : period === '3m' ? 'week' : 'month', syncedAt: now.toISOString(), kpis: { sales: 0, leads: 0, conversion: null, cac: null, lac: null }, buckets: Array.from({ length }, (_, index) => ({ key: `preview-${index}`, label: '', tick: '', leads: 0, sales: 0, conversion: null })), channels: channels.map((channel) => ({ ...channel, leads: 0, sales: 0, percentage: null })), campaigns: [], marginsByChannel: channels.map((channel) => ({ ...channel, status: channel.key === 'meta' ? 'unavailable' as const : 'wip' as const, contracted: null, spend: null, margin: null })), agents: ['Noel', 'Manuel', 'María'].map((name) => ({ key: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), name, leads: 0, sales: 0, conversion: null })).concat([{ key: 'team', name: 'Media del equipo', leads: null, sales: null, conversion: null }]), teamAverage: null, sources: { portal: false, adminCrm: false, holdedMarketing: false, meta: false }, meta: { currency: 'EUR', spend: null } };
    }
    const response = await fetch(`/api/admin/sales/dashboard?period=${encodeURIComponent(period)}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'No se pudieron cargar las ventas');
    return payload as SalesDashboard;
  },
  sendWhatsApp: async () => ({ messageId: "demo" }),
  convertLead: async (lead: { leadId: string; name: string; email: string; advisor: string; clientType: string }) => {
    const response = await fetch("/api/internal/crm/convert", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages: Record<string, string> = { lead_email_required: "El lead necesita un email antes de pasar a IN", advisor_required: "Debes elegir el asesor del cliente", advisor_invalid: "El asesor elegido no tiene acceso activo al portal", identity_collision: "Ya existe un usuario con ese email o identificador", invalid_bootstrap_password_configuration: "Falta configurar una contraseña inicial válida" };
      throw new Error(messages[payload.error] || payload.detail || "No se pudo crear el alumno en el portal");
    }
    return payload as { result: "created" | "exists"; userId: string; emailSent: boolean; loginUrl: string; assignedTo: string; salesAgent: string | null };
  },
};
