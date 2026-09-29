export const ADMIN_CLIENT_SECTIONS = ["estado", "perfil", "carreras", "documentos", "pagos", "chat", "reservas"];
const GLOBAL_SECTIONS = ["inicio", "clientes", "notificaciones", "faqs"];
export const INITIAL_ADMIN_NAVIGATION = { active: "inicio", selectedClientId: null };

// A single transition changes both the visible section and its client context.
export function adminNavigation(state, event) {
  if (event.type === "navigate") {
    if (GLOBAL_SECTIONS.includes(event.section)) return { active: event.section, selectedClientId: null };
    if (ADMIN_CLIENT_SECTIONS.includes(event.section) && state.selectedClientId) return { ...state, active: event.section };
  }
  if (event.type === "open" && event.clientId) return { active: "estado", selectedClientId: event.clientId };
  if (event.type === "switch" && event.clientId && ADMIN_CLIENT_SECTIONS.includes(state.active)) {
    return { active: state.active, selectedClientId: event.clientId };
  }
  return state;
}
