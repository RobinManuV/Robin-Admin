export type PortalAdmin = { id: string; email: string; username?: string; nombre?: string; apellidos?: string; avatar_url?: string | null; is_pro_admin?: boolean; visible_tabs?: string[] };
export type PortalAccessUser = { id: string; display_id?: string; email?: string; username?: string; nombre?: string; apellidos?: string; role?: string; avatar_url?: string | null; is_pro?: boolean; visible_tabs?: string[] };
export type PortalClient = { id: string; display_id?: string; email?: string; username?: string; nombre?: string; apellidos?: string; tipo?: string; origin?: string; assigned_to?: string; application_phase?: number; application_level?: string; requires_onboarding?: boolean; dni_completed?: boolean; profile_completed?: boolean; contract_signed?: boolean; pago_completed?: boolean; pais?: string; telefono_alumno?: string; intereses?: string[]; created_at?: string; updated_at?: string };
export type PortalPayment = { id: string; user_id: string; installment: number; amount: number; currency: string; status: string; invoice_number?: string; concept?: string };
export type PortalSnapshot = { admin: PortalAdmin; clients: PortalClient[]; payments: PortalPayment[]; connections: { stripe: boolean; holded: boolean; email: boolean }; portalUrl: string };

import { apiPath } from "@/lib/api-path";

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiPath(path), {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error
      ? `${payload.error}${payload.detail ? `: ${payload.detail}` : ""}`
      : `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, data: payload });
  }
  return payload as T;
}

const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
};

async function login(username: string, password: string) {
  return api.post<{ user?: PortalAdmin }>("/api/auth/login", { username, password });
}

async function logout() {
  try {
    await api.post("/api/auth/logout");
  } catch (error) {
    console.warn("[api] optional logout failed", error instanceof Error ? error.message : error);
  }
}

async function me() {
  return api.get<PortalAdmin>("/api/me");
}

async function downloadClientDatabase() {
  const response = await fetch(apiPath("/api/admin/clients/export"), { credentials: "same-origin" });
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
  snapshot: () => api.get<PortalSnapshot>("/api/admin/integration-snapshot"),
  downloadClientDatabase,
  adminUsers: () => api.get<{ users: PortalAccessUser[]; current_is_pro: boolean }>("/api/admin/users"),
  createAdmin: (payload: { name: string; email: string; username: string; password: string }) => api.post<{ user: PortalAccessUser }>("/api/admin/users", { action: "create", ...payload }),
  deleteAdmin: (id: string) => api.post<{ ok: boolean }>("/api/admin/users", { action: "delete", id }),
  setAdminPermissions: (id: string, visibleTabs: string[]) => api.post<{ ok: boolean; visible_tabs: string[] }>("/api/admin/users", { action: "permissions", id, visible_tabs: visibleTabs }),
  runDeveloperSql: (database: "portal" | "admin" | "robinplan", statement: string) => api.post<{ database: string; result: unknown }>("/api/admin/database", { database, statement }),
  changePassword: (currentPassword: string, newPassword: string) => api.post<{ ok: boolean }>("/api/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
  async uploadAvatar(file: File) {
    const ticket = await api.post<{ upload?: { signed_url?: string; path?: string } }>("/api/profile/avatar", { action: "upload_ticket", file_filename: file.name, file_mime: file.type, file_size: file.size });
    const upload = ticket?.upload;
    if (!upload?.signed_url || !upload?.path) throw new Error("No se pudo preparar la subida de la foto");
    const response = await fetch(upload.signed_url, { method: "PUT", headers: { "Content-Type": file.type, "cache-control": "no-store", "x-upsert": "false" }, body: file });
    if (!response.ok) throw new Error("No se pudo subir la foto");
    return api.post<{ ok: boolean; avatar_url: string }>("/api/profile/avatar", { action: "commit", file_path: upload.path, file_filename: file.name, file_mime: file.type, file_size: file.size });
  },
};
