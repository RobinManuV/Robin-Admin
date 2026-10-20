import { useMemo } from "react";
import { Clock, Eye, Monitor, Search, Smartphone, Users } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, pct, ratio, dur, dayLabel, shortPath, Kpi, Panel, Unavailable, Meter, Table } from "./web-analytics-shared";

// TRÁFICO: por dónde entran
// ============================================================
export function TrafficTab({ data }: { data: WebData }) {
  const { ga4, gsc, own } = data;
  const daily = useMemo(() => {
    const map = new Map<string, any>();
    (ga4?.daily || []).forEach((d: any) => map.set(d.date, { date: d.date, sessions: d.sessions, users: d.totalUsers }));
    (own?.daily || []).forEach((d: any) => map.set(d.day, { ...(map.get(d.day) || { date: d.day }), leads: (d.leads || 0) + (d.bookings || 0), measured: d.sessions }));
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [ga4, own]);
  const t = ga4?.totals;

  return (
    <>
      <section className="wa-kpis">
        <Kpi icon={Users} label="Visitas (sesiones)" value={int(t?.sessions ?? own?.kpis?.sessions)} detail={t ? `${int(t.users)} personas · ${int(t.newUsers)} nuevas` : "Medición propia"} source={t ? "ga4" : "own"} />
        <Kpi icon={Eye} label="Páginas vistas" value={int(t?.pageViews ?? own?.kpis?.page_views)} detail={own?.kpis?.pages_per_session ? `${own.kpis.pages_per_session} páginas por visita` : undefined} source={t ? "ga4" : "own"} />
        <Kpi icon={Clock} label="Duración media" value={t ? dur(t.avgSessionDuration) : secs(own?.kpis?.avg_active_ms)} detail={t ? `Interacción ${ratio(t.engagementRate)}` : "Tiempo activo por página"} source={t ? "ga4" : "own"} />
        <Kpi icon={Search} label="Clics desde Google" value={int(gsc?.totals?.clicks)} detail={gsc?.available ? `${int(gsc.totals.impressions)} apariciones · posición ${Number(gsc.totals.position || 0).toFixed(1)}` : "Search Console sin conectar"} source="gsc" />
      </section>

      <div className="wa-grid">
        <Panel title="Visitas y contactos por día" sub="Sesiones (Google Analytics) y formularios + reservas enviados (web)" wide>
          {daily.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={daily}>
                <CartesianGrid vertical={false} stroke="#eef1f5" />
                <XAxis dataKey="date" tickFormatter={dayLabel} axisLine={false} tickLine={false} fontSize={10} minTickGap={18} />
                <YAxis yAxisId="s" axisLine={false} tickLine={false} fontSize={10} width={36} />
                <YAxis yAxisId="l" orientation="right" axisLine={false} tickLine={false} fontSize={10} width={28} allowDecimals={false} />
                <Tooltip labelFormatter={(d: any) => dayLabel(String(d))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="s" type="monotone" dataKey={ga4?.available ? "sessions" : "measured"} name={ga4?.available ? "Sesiones" : "Sesiones medidas"} stroke="#2f5a8a" fill="#dce7f3" strokeWidth={2} />
                <Bar yAxisId="l" dataKey="leads" name="Contactos" fill="#d9a448" radius={[3, 3, 0, 0]} barSize={10} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Todavía no hay datos de visitas.</Empty>
          )}
        </Panel>

        <Panel title="Canales" sub="Por dónde llega la gente" source="ga4">
          {ga4?.available ? (
            <Table
              head={["Canal", "Sesiones", "", "Interacción", "Eventos clave"]}
              rows={(ga4.channels || []).map((c: any) => [c.sessionDefaultChannelGroup, int(c.sessions), <Meter value={c.sessions} max={ga4.channels[0]?.sessions || 1} />, ratio(c.engagementRate), int(c.keyEvents)])}
            />
          ) : (
            <OwnSources own={own} reason={ga4?.reason} />
          )}
        </Panel>

        <Panel title="Fuente / medio" sub="Detalle de cada origen" source="ga4">
          {ga4?.available ? (
            <Table head={["Fuente / medio", "Sesiones", "Eventos clave"]} rows={(ga4.sourceMedium || []).map((s: any) => [s.sessionSourceMedium, int(s.sessions), int(s.keyEvents)])} />
          ) : (
            <Unavailable what="Google Analytics" reason={ga4?.reason} />
          )}
        </Panel>

        <Panel title="Páginas de entrada" sub="La primera página que ven" source="ga4">
          {ga4?.available ? (
            <Table head={["Página", "Sesiones", "Interacción", "Duración"]} rows={(ga4.landingPages || []).map((p: any) => [<span className="wa-path">{shortPath(p.landingPage)}</span>, int(p.sessions), ratio(p.engagementRate), dur(p.averageSessionDuration)])} />
          ) : (
            <Table head={["Página", "Entradas"]} rows={[...(own?.pages || [])].sort((a: any, b: any) => b.entries - a.entries).slice(0, 15).map((p: any) => [<span className="wa-path">{shortPath(p.path)}</span>, int(p.entries)])} />
          )}
        </Panel>

        <Panel title="Campañas" sub="Enlaces con utm_campaign y campañas de Meta" source="ga4">
          {ga4?.available ? (
            <Table head={["Campaña", "Sesiones", "Eventos clave"]} rows={(ga4.campaigns || []).filter((c: any) => c.sessionCampaignName && c.sessionCampaignName !== "(not set)").map((c: any) => [c.sessionCampaignName, int(c.sessions), int(c.keyEvents)])} empty="Sin visitas de campañas en este periodo." />
          ) : (
            <Unavailable what="Google Analytics" reason={ga4?.reason} />
          )}
        </Panel>

        <Panel title="Qué buscan en Google" sub="Búsquedas por las que aparecéis y os hacen clic" source="gsc" wide>
          {gsc?.available ? (
            <Table
              head={["Búsqueda", "Clics", "", "Apariciones", "CTR", "Posición"]}
              rows={(gsc.queries || []).slice(0, 40).map((q: any) => [q.query, int(q.clicks), <Meter value={q.clicks} max={gsc.queries[0]?.clicks || 1} tone="gold" />, int(q.impressions), ratio(q.ctr), Number(q.position).toFixed(1)])}
            />
          ) : (
            <Unavailable what="Search Console" reason={gsc?.reason} />
          )}
        </Panel>

        <Panel title="Dispositivo" source={ga4?.available ? "ga4" : "own"}>
          <Devices ga4={ga4} own={own} />
        </Panel>

        <Panel title="Países y ciudades" source={ga4?.available ? "ga4" : "own"}>
          {ga4?.available ? (
            <div className="wa-two">
              <Table head={["País", "Sesiones"]} rows={(ga4.countries || []).slice(0, 8).map((c: any) => [c.country, int(c.sessions)])} />
              <Table head={["Ciudad", "Sesiones"]} rows={(ga4.cities || []).slice(0, 8).map((c: any) => [c.city, int(c.sessions)])} />
            </div>
          ) : (
            <Table head={["País", "Sesiones medidas"]} rows={(own?.countries || []).map((c: any) => [c.country, int(c.sessions)])} />
          )}
        </Panel>
      </div>
    </>
  );
}

function OwnSources({ own, reason }: { own: any; reason?: string }) {
  return (
    <>
      <Unavailable what="Google Analytics" reason={reason} />
      <Table head={["Origen (medición propia)", "Medio", "Sesiones"]} rows={(own?.sources || []).slice(0, 12).map((s: any) => [s.source, s.medium, int(s.sessions)])} />
    </>
  );
}

function Devices({ ga4, own }: { ga4: any; own: any }) {
  const rows: { name: string; value: number }[] = ga4?.available
    ? (ga4.devices || []).map((d: any) => ({ name: d.deviceCategory, value: d.sessions }))
    : Object.entries(own?.devices || {}).map(([name, value]) => ({ name, value: Number(value) }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  const label: Record<string, string> = { mobile: "Móvil", desktop: "Ordenador", tablet: "Tableta" };
  if (!total) return <Empty>Sin datos.</Empty>;
  return (
    <div className="wa-devices">
      {rows.map((r) => (
        <div key={r.name}>
          {r.name === "mobile" ? <Smartphone /> : <Monitor />}
          <strong>{pct((r.value / total) * 100, 0)}</strong>
          <span>{label[r.name] || r.name}</span>
          <Meter value={r.value} max={total} />
        </div>
      ))}
    </div>
  );
}

// ============================================================
