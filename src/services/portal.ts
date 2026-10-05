export type PortalAdmin = { id: string; email: string; username?: string; nombre?: string; apellidos?: string; avatar_url?: string | null };
export type PortalAccessUser = { id: string; email?: string; username?: string; nombre?: string; apellidos?: string; role?: string; avatar_url?: string | null };
export type PortalClient = { id: string; email?: string; username?: string; nombre?: string; apellidos?: string; tipo?: string; origin?: string; assigned_to?: string; application_phase?: number; application_level?: string; requires_onboarding?: boolean; dni_completed?: boolean; profile_completed?: boolean; contract_signed?: boolean; pago_completed?: boolean; pais?: string; telefono_alumno?: string; intereses?: string[]; created_at?: string; updated_at?: string };
export type PortalPayment = { id: string; user_id: string; installment: number; amount: number; currency: string; status: string; invoice_number?: string; concept?: string };
export type PortalSnapshot = { admin: PortalAdmin; clients: PortalClient[]; payments: PortalPayment[]; connections: { stripe: boolean; holded: boolean; email: boolean }; portalUrl: string };
export type SalesTestStatus = { active: boolean; test_run?: string; launched_at?: string; leads?: number; clients?: number; removed?: { leads: number; users: number } };

import { api, login, logout, me } from "@/robin-platform/portal-source/src/api.js";

function portalApiUrl(path: string) {
  if (typeof window !== "undefined" && /(^|\.)project-robin\.com$/i.test(window.location.hostname) && path.startsWith("/api/")) {
    return `/portal${path}`;
  }
  return path;
}

async function downloadClientDatabase() {
  const response = await fetch(portalApiUrl("/api/admin/clients/export"), { credentials: "same-origin" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || payload.error || `No se pudo descargar la base de datos (HTTP ${response.status})`);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `base-datos-clientes-robin-${new Date().toISOString().slice(0, 10)}.csv`;
  return { blob: await response.blob(), filename };
}

export const portalClient = {
  login,
  me: me as () => Promise<PortalAdmin>,
  logout,
  snapshot: () => api.get("/api/admin/integration-snapshot") as Promise<PortalSnapshot>,
  downloadClientDatabase,
  adminUsers: () => api.get("/api/admin/users") as Promise<{ users: PortalAccessUser[] }>,
  createAdmin: (payload: { name: string; email: string; password: string }) => api.post("/api/admin/users", { action: "create", ...payload }) as Promise<{ user: PortalAccessUser }>,
  deleteAdmin: (id: string) => api.post("/api/admin/users", { action: "delete", id }) as Promise<{ ok: boolean }>,
  changePassword: (currentPassword: string, newPassword: string) => api.post("/api/auth/change-password", { current_password: currentPassword, new_password: newPassword }) as Promise<{ ok: boolean }>,
  salesTestStatus: () => api.get("/api/admin/sales/test") as Promise<SalesTestStatus>,
  launchSalesTest: () => api.post("/api/admin/sales/test", { action: "launch" }) as Promise<SalesTestStatus>,
  stopSalesTest: () => api.post("/api/admin/sales/test", { action: "stop" }) as Promise<SalesTestStatus>,
  async uploadAvatar(file: File) {
    const ticket = await api.post("/api/profile/avatar", { action: "upload_ticket", file_filename: file.name, file_mime: file.type, file_size: file.size });
    const upload = ticket?.upload;
    if (!upload?.signed_url || !upload?.path) throw new Error("No se pudo preparar la subida de la foto");
    const response = await fetch(upload.signed_url, { method: "PUT", headers: { "Content-Type": file.type, "cache-control": "no-store", "x-upsert": "false" }, body: file });
    if (!response.ok) throw new Error("No se pudo subir la foto");
    return api.post("/api/profile/avatar", { action: "commit", file_path: upload.path, file_filename: file.name, file_mime: file.type, file_size: file.size }) as Promise<{ ok: boolean; avatar_url: string }>;
  },
};
