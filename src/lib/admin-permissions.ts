export const adminTabPermissions = [
  { key: "home.summary", label: "Inicio · Resumen", group: "Inicio" },
  { key: "home.leads", label: "Inicio · Bandeja de leads", group: "Inicio" },
  { key: "home.students", label: "Inicio · Vista de alumnos", group: "Inicio" },
  { key: "home.analytics", label: "Inicio · Analíticas generales", group: "Inicio" },
  { key: "home.settings", label: "Inicio · Configuración", group: "Inicio" },
  { key: "crm.to_contact", label: "CRM · Por contactar", group: "CRM" },
  { key: "crm.contacted", label: "CRM · Contactados", group: "CRM" },
  { key: "crm.clients", label: "CRM · Clientes", group: "CRM" },
  { key: "crm.lost", label: "CRM · Lost", group: "CRM" },
  { key: "platform.student_portal", label: "Portal del Alumno", group: "Portales" },
  { key: "platform.robin_plan", label: "The Robin Plan", group: "Portales" },
  { key: "analytics.sales", label: "Otras métricas · Ventas", group: "Otras métricas" },
  { key: "analytics.campaigns", label: "Otras métricas · Campañas", group: "Otras métricas" },
  { key: "analytics.web", label: "Otras métricas · Web", group: "Otras métricas" },
  { key: "analytics.operations", label: "Otras métricas · Operaciones", group: "Otras métricas" },
] as const;

export type AdminTabPermission = (typeof adminTabPermissions)[number]["key"];
export const allAdminTabPermissions = adminTabPermissions.map(({ key }) => key) as AdminTabPermission[];

export function isProAdminEmail(email?: string) {
  return ["noel@project-robin.com", "maria@project-robin.com", "manuel@project-robin.com", "santiago.martin.ab@gmail.com"]
    .includes(String(email || "").trim().toLowerCase());
}
