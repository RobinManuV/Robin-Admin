export type IntegrationStatus = { holded: boolean; meta: boolean; stripe: boolean; email: boolean; applicationPortal: boolean; adminDatabase: boolean };
export type FinanceSnapshot = { mrr: number; arr: number; nrr: number; gmv: number; takeRate: number; effectiveCommission: number; churnRate: number; aov: number; transactionFrequency: number; invoices: number; payments: number };
export type MetaSnapshot = { spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; cpm: number; leads: number; purchases: number; revenue: number; cpl: number; cac: number; roas: number };
export const integrationClient = {
  status: async (): Promise<IntegrationStatus> => ({ holded: false, meta: false, stripe: false, email: false, applicationPortal: false, adminDatabase: false }),
  holded: async (): Promise<FinanceSnapshot> => ({ mrr: 12450, arr: 149400, nrr: 108, gmv: 38600, takeRate: 32.3, effectiveCommission: 3.7, churnRate: 2.8, aov: 1840, transactionFrequency: 1.4, invoices: 32, payments: 29 }),
  meta: async (): Promise<MetaSnapshot> => ({ spend: 3262, impressions: 184200, clicks: 4210, reach: 102600, ctr: 2.29, cpc: .77, cpm: 17.71, leads: 127, purchases: 18, revenue: 14027, cpl: 25.69, cac: 181.22, roas: 4.3 }),
  sendWhatsApp: async () => ({ messageId: "demo" }),
  convertLead: async () => ({ result: "created" as const, userId: "demo", emailSent: false, loginUrl: "#" }),
};
