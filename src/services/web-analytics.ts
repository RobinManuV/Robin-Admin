// Cliente de la pestaña "Web": habla con las funciones /api/admin/web/* del propio gestor.
export type WebRange = { from: string; to: string; days: number };
export type WebAnalytics = {
  range: WebRange;
  own: any; // medición propia (web_stats) · available=false si falta la tabla
  ga4: any; // Google Analytics 4 · available=false + reason si no está configurado
  gsc: any; // Search Console · available=false + reason si no está configurado
  generatedAt: string;
};
export type HeatmapData = {
  path: string;
  device: string;
  siteUrl: string;
  views: number;
  total_clicks: number;
  clicks: { sel?: string; rx?: number; ry?: number; x?: number; y?: number; pw?: number; n: number }[];
  top_elements: { label: string; clicks: number }[];
  scroll: { depth: number; pct: number }[];
};
export type BlogStatus = { available: boolean; reason?: string; currentWeek?: string; current?: any; history?: any[]; publishDates?: any; config?: any };

async function getJson<T>(url: string, fallbackError: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.reason || fallbackError);
  return payload as T;
}

const qs = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');

export const webAnalyticsClient = {
  analytics: (from: string, to: string, force = false) =>
    getJson<WebAnalytics>(`/api/admin/web/analytics?${qs({ from, to, refresh: force ? '1' : undefined })}`, 'No se pudieron cargar las analíticas de la web'),
  heatmapPages: (from: string, to: string) =>
    getJson<{ siteUrl: string; pages: { path: string; clicks: number; views: number }[] }>(`/api/admin/web/heatmap?${qs({ pages: '1', from, to })}`, 'No se pudieron cargar las páginas'),
  heatmap: (path: string, device: string, from: string, to: string) =>
    getJson<HeatmapData>(`/api/admin/web/heatmap?${qs({ path, device, from, to })}`, 'No se pudo cargar el mapa de calor'),
  blog: () => getJson<BlogStatus>('/api/admin/web/blog', 'No se pudo cargar la máquina de blogs'),
  blogAction: async (accion: 'investigar' | 'forzar' | 'redactar') => {
    const response = await fetch('/api/admin/web/blog', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.available === false) throw new Error(payload.reason || payload.error || 'No se pudo lanzar la acción');
    return payload as { msg?: string };
  },
};
