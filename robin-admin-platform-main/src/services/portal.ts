export type PortalAdmin = { id: string; email: string; username?: string; nombre?: string; apellidos?: string };
export type PortalClient = { id: string; email?: string; nombre?: string; apellidos?: string; tipo?: string; assigned_to?: string; application_phase?: number; requires_onboarding?: boolean; pago_completed?: boolean; created_at?: string; country?: string; is_latam?: boolean; contracted_amount?: number };
export type PortalPayment = { id: string; user_id: string; installment: number; amount: number; currency: string; status: string; invoice_number?: string; concept?: string; created_at?: string; paid_at?: string };
export type PortalSnapshot = { admin: PortalAdmin; clients: PortalClient[]; payments: PortalPayment[]; connections: { stripe: boolean; holded: boolean; email: boolean }; portalUrl: string };

const unavailable = async (): Promise<never> => { throw new Error("Función no disponible en la copia frontend"); };
export const portalClient = { login: unavailable, me: unavailable, logout: unavailable, snapshot: unavailable };
