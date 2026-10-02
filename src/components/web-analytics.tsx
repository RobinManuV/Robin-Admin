"use client";

// ============================================================
// Pestaña "Web" del gestor: analítica de project-robin.com.
//   Tráfico · Páginas · Conversión · Vídeos · Blog · Mapas de calor · Técnica
// Fuentes: Google Analytics 4 y Search Console (lo que ya mide Google) + medición
// propia de la web (solo visitantes que aceptan cookies de analítica) + máquina de blogs.
// Uso: <WebAnalytics notify={notify} />
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Gauge,
  Globe,
  Monitor,
  MousePointerClick,
  PlayCircle,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { webAnalyticsClient } from "@/services/web-analytics";
import type { BlogStatus, HeatmapData, WebAnalytics as WebData } from "@/services/web-analytics";
import "@/styles/web-analytics.css";

type Tab = "traffic" | "pages" | "conversion" | "videos" | "blog" | "heatmaps" | "tech";
const TABS: [Tab, string][] = [
  ["traffic", "Tráfico"],
  ["pages", "Páginas"],
  ["conversion", "Conversión"],
  ["videos", "Vídeos"],
  ["blog", "Blog"],
  ["heatmaps", "Mapas de calor"],
  ["tech", "Técnica"],
];
const RANGES: [number, string][] = [
  [7, "7 días"],
  [28, "28 días"],
  [90, "90 días"],
];

// ---------- formato ----------
const int = (n: any) => (n == null || Number.isNaN(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("es-ES"));
const pct = (n: any, digits = 1) => (n == null || Number.isNaN(Number(n)) ? "—" : `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: digits })} %`);
const ratio = (n: any) => (n == null ? "—" : pct(Number(n) * 100));
const secs = (ms: any) => {
  if (ms == null) return "—";
  const s = Math.round(Number(ms) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
};
const dur = (s: any) => (s == null ? "—" : secs(Number(s) * 1000));
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const shortPath = (p: string) => (p && p.length > 48 ? `${p.slice(0, 46)}…` : p || "—");
// Fecha local del navegador (no UTC), para que "hoy" sea hoy también de noche
const toIso = (d: Date) => d.toLocaleDateString("sv-SE");

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  return { from: toIso(from), to: toIso(to) };
}

// ---------- piezas comunes ----------
function Kpi({ icon: Icon, label, value, detail, source }: { icon: any; label: string; value: string; detail?: string; source?: string }) {
  return (
    <article className="wa-kpi">
      <i>
        <Icon />
      </i>
      <div>
        <span>
          {label}
          {source && <em className={`wa-source wa-source-${source}`}>{SOURCE_LABEL[source] || source}</em>}
        </span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}
const SOURCE_LABEL: Record<string, string> = { ga4: "Google Analytics", gsc: "Search Console", own: "Medición propia", web: "Web" };

function Panel({ title, sub, source, children, wide }: { title: string; sub?: string; source?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`panel wa-panel ${wide ? "wa-wide" : ""}`}>
      <header>
        <div>
          <h2>
            {title}
            {source && <em className={`wa-source wa-source-${source}`}>{SOURCE_LABEL[source] || source}</em>}
          </h2>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Unavailable({ what, reason }: { what: string; reason?: string }) {
  return (
    <div className="wa-unavailable">
      <AlertTriangle />
      <div>
        <strong>{what} no está conectado todavía</strong>
        <span>{reason || "Revisa la configuración en Netlify."}</span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="wa-empty">{children}</div>;
}

// Barra horizontal dentro de una celda (proporción respecto al máximo)
function Meter({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "gold" | "green" }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <span className={`wa-meter wa-meter-${tone}`}>
      <span style={{ width: `${w}%` }} />
    </span>
  );
}

function Table({ head, rows, empty = "Sin datos en este periodo." }: { head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="wa-table-wrap">
      <table className="wa-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
export function WebAnalytics({ notify }: { notify?: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>("traffic");
  const [days, setDays] = useState(28);
  const [data, setData] = useState<WebData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => rangeFor(days), [days]);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      setData(await webAnalyticsClient.analytics(range.from, range.to, force));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  return (
    <div className="page web-analytics">
      <div className="title">
        <div>
          <span>INICIO · WEB</span>
          <h1>Web project-robin.com</h1>
          <p>Tráfico, comportamiento, conversión y contenido. Solo se mide en detalle a quien acepta las cookies de analítica.</p>
        </div>
        <div className="wa-toolbar">
          <div className="analytics-tabs" role="tablist" aria-label="Periodo">
            {RANGES.map(([d, label]) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw />
            {loading ? "Cargando…" : "Actualizar"}
          </Button>
        </div>
      </div>

      <div className="analytics-tabs wa-tabs" role="tablist" aria-label="Secciones de la web">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="wa-error">
          <AlertTriangle />
          {error}
        </div>
      )}
      {loading && !data && <div className="wa-loading">Cargando datos de la web…</div>}

      {data && tab === "traffic" && <TrafficTab data={data} />}
      {data && tab === "pages" && <PagesTab data={data} />}
      {data && tab === "conversion" && <ConversionTab data={data} />}
      {data && tab === "videos" && <VideosTab data={data} />}
      {tab === "blog" && <BlogTab data={data} notify={notify} />}
      {tab === "heatmaps" && <HeatmapsTab from={range.from} to={range.to} />}
      {data && tab === "tech" && <TechTab data={data} />}
    </div>
  );
}

// ============================================================
// TRÁFICO: por dónde entran
// ============================================================
function TrafficTab({ data }: { data: WebData }) {
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
// PÁGINAS: qué hacen dentro y por dónde salen
// ============================================================
function PagesTab({ data }: { data: WebData }) {
  const { own, ga4 } = data;
  const pages = own?.pages || [];
  const maxViews = pages[0]?.views || 1;
  return (
    <div className="wa-grid">
      <Panel title="Páginas" sub="Vistas, tiempo real de lectura, hasta dónde bajan y cuánta gente se va desde cada una" source="own" wide>
        {own?.available === false ? (
          <Unavailable what="La medición propia" reason={own.reason} />
        ) : (
          <Table
            head={["Página", "Vistas", "", "Entradas", "Salidas", "% salida", "Tiempo activo", "Scroll medio", "Contactos"]}
            rows={pages.map((p: any) => [
              <span className="wa-path" title={p.path}>{shortPath(p.path)}</span>,
              int(p.views),
              <Meter value={p.views} max={maxViews} />,
              int(p.entries),
              int(p.exits),
              <span className={p.exit_rate > 60 ? "wa-bad" : p.exit_rate > 40 ? "wa-warn" : ""}>{pct(p.exit_rate, 0)}</span>,
              secs(p.avg_active_ms),
              p.avg_depth == null ? "—" : `${p.avg_depth} %`,
              p.conversions ? <strong className="wa-good">{int(p.conversions)}</strong> : "0",
            ])}
          />
        )}
      </Panel>

      <Panel title="Recorridos más habituales" sub="Las primeras 4 páginas de cada visita" source="own">
        <div className="wa-journeys">
          {(own?.journeys || []).length ? (
            own.journeys.map((j: any, i: number) => (
              <div key={i}>
                <span className="wa-route">
                  {String(j.route)
                    .split(" → ")
                    .map((p, k, all) => (
                      <span key={k}>
                        <code>{shortPath(p)}</code>
                        {k < all.length - 1 && <ArrowRight />}
                      </span>
                    ))}
                </span>
                <strong>{int(j.sessions)}</strong>
              </div>
            ))
          ) : (
            <Empty>Sin recorridos todavía.</Empty>
          )}
        </div>
      </Panel>

      <Panel title="Páginas más vistas (todas las visitas)" sub="Incluye a quien no acepta cookies" source="ga4">
        {ga4?.available ? (
          <Table head={["Página", "Vistas", "Personas", "Tiempo por persona"]} rows={(ga4.pages || []).map((p: any) => [<span className="wa-path">{shortPath(p.pagePath)}</span>, int(p.screenPageViews), int(p.activeUsers), dur(p.activeUsers ? p.userEngagementDuration / p.activeUsers : null)])} />
        ) : (
          <Unavailable what="Google Analytics" reason={ga4?.reason} />
        )}
      </Panel>
    </div>
  );
}

// ============================================================
// CONVERSIÓN: formularios, botones y recorrido hasta cada contacto
// ============================================================
function ConversionTab({ data }: { data: WebData }) {
  const { own, ga4 } = data;
  const k = own?.kpis || {};
  const contacts = (k.leads || 0) + (k.bookings || 0);
  const sessions = ga4?.totals?.sessions || k.sessions || 0;
  const forms = own?.forms || [];
  const ctas = own?.ctas || [];
  return (
    <>
      <section className="wa-kpis">
        <Kpi icon={FileText} label="Formularios enviados" value={int(k.leads)} detail="Todos los envíos (anónimo)" source="web" />
        <Kpi icon={Target} label="Reservas de consulta" value={int(k.bookings)} detail="Calendario de la web" source="web" />
        <Kpi icon={TrendingUp} label="Tasa de conversión" value={sessions ? pct((contacts / sessions) * 100, 2) : "—"} detail={`${int(contacts)} contactos / ${int(sessions)} visitas`} />
        <Kpi icon={MousePointerClick} label="Clics en botones" value={int(ctas.reduce((a: number, c: any) => a + c.clicks, 0))} detail="Botones y llamadas a la acción" source="own" />
      </section>
      <div className="wa-grid">
        <Panel title="Qué formularios se usan más" sub="Reparto de envíos por formulario y lugar de la web. «Empezados → enviados» solo cuenta a quien acepta cookies" source="web" wide>
          <Table
            head={["Formulario", "Dónde", "Envíos", "Cuota", "", "Empezados → enviados"]}
            rows={forms.map((f: any) => [
              <strong>{FORM_LABEL[f.form] || f.form}</strong>,
              f.form_tag || "—",
              int(f.sent),
              pct(f.share_pct),
              <Meter value={f.sent} max={forms[0]?.sent || 1} tone="gold" />,
              f.started_measured ? `${int(f.started_measured)} → ${int(f.submitted_measured)} (${pct((f.submitted_measured / f.started_measured) * 100, 0)})` : "—",
            ])}
            empty="Todavía no se ha enviado ningún formulario en este periodo."
          />
        </Panel>

        <Panel title="Botones más pulsados" sub="Llamadas a la acción por página" source="own">
          <Table head={["Botón", "Página", "Clics", "Visitas"]} rows={ctas.slice(0, 25).map((c: any) => [c.label, <span className="wa-path">{shortPath(c.path)}</span>, int(c.clicks), int(c.sessions)])} />
        </Panel>

        <Panel title="Páginas que más contactos generan" sub="Página desde la que se envió el formulario o la reserva" source="web">
          <Table
            head={["Página", "Contactos", "Vistas medidas"]}
            rows={[...(own?.pages || [])]
              .filter((p: any) => p.conversions > 0)
              .sort((a: any, b: any) => b.conversions - a.conversions)
              .map((p: any) => [<span className="wa-path">{shortPath(p.path)}</span>, <strong className="wa-good">{int(p.conversions)}</strong>, int(p.views)])}
          />
        </Panel>

        <Panel title="Recorrido hasta cada contacto" sub="Solo contactos de quien aceptó cookies: de dónde vino, cuántas visitas hizo y qué leyó antes (60 días)" source="own" wide>
          <div className="wa-paths">
            {(own?.conversion_paths || []).length ? (
              own.conversion_paths.map((c: any, i: number) => (
                <article key={i}>
                  <header>
                    <strong>{c.type === "booking" ? "Reserva" : FORM_LABEL[c.form] || c.form}</strong>
                    <span>{new Date(c.at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </header>
                  <p>
                    <em>Origen:</em> {c.first_source || "—"} · <em>Visitas:</em> {int(c.visits)} · <em>Enviado desde:</em> {shortPath(c.page)}
                  </p>
                  <div className="wa-route">
                    {String(c.pages || "")
                      .split(" → ")
                      .filter(Boolean)
                      .map((p, k, all) => (
                        <span key={k}>
                          <code>{shortPath(p)}</code>
                          {k < all.length - 1 && <ArrowRight />}
                        </span>
                      ))}
                  </div>
                </article>
              ))
            ) : (
              <Empty>Aún no hay contactos de visitantes medidos.</Empty>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
const FORM_LABEL: Record<string, string> = { contacto: "Contacto", colegios: "Colegios", newsletter: "Newsletter", reserva: "Reserva de consulta" };

// ============================================================
// VÍDEOS
// ============================================================
function VideosTab({ data }: { data: WebData }) {
  const videos = data.own?.videos || [];
  const max = videos[0]?.plays || 1;
  return (
    <div className="wa-grid">
      <Panel title="Vídeos" sub="Reproducciones y cuánto se ve de cada vídeo (de quien acepta cookies)" source="own" wide>
        {videos.length ? (
          <div className="wa-videos">
            {videos.map((v: any) => (
              <article key={v.video}>
                <a href={`https://youtube.com/shorts/${v.video}`} target="_blank" rel="noreferrer" className="wa-thumb">
                  <img src={`https://i.ytimg.com/vi/${v.video}/hqdefault.jpg`} alt="" loading="lazy" />
                  <PlayCircle />
                </a>
                <div>
                  <strong>{v.title || v.video}</strong>
                  <span>{(v.places || []).filter(Boolean).join(" · ") || "—"}</span>
                  <div className="wa-video-stats">
                    <span>
                      <b>{int(v.plays)}</b> reproducciones
                    </span>
                    <span>
                      <b>{int(v.viewers)}</b> visitas distintas
                    </span>
                  </div>
                  <Meter value={v.plays} max={max} />
                  <div className="wa-funnel">
                    {[
                      ["25 %", v.p25],
                      ["50 %", v.p50],
                      ["75 %", v.p75],
                      ["Final", v.p100],
                    ].map(([label, n]) => (
                      <div key={label as string}>
                        <span style={{ height: `${v.plays ? Math.max(4, (Number(n) / v.plays) * 100) : 0}%` }} />
                        <small>{label}</small>
                        <b>{v.plays ? pct((Number(n) / v.plays) * 100, 0) : "—"}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>Todavía nadie ha reproducido un vídeo en este periodo.</Empty>
        )}
      </Panel>
    </div>
  );
}

// ============================================================
// BLOG: métricas de los artículos + máquina de blogs
// ============================================================
function BlogTab({ data, notify }: { data: WebData | null; notify?: (m: string) => void }) {
  const [blog, setBlog] = useState<BlogStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function loadBlog() {
    setErr("");
    try {
      setBlog(await webAnalyticsClient.blog());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    void loadBlog();
  }, []);
  async function act(accion: "investigar" | "forzar" | "redactar") {
    setBusy(accion);
    try {
      const out = await webAnalyticsClient.blogAction(accion);
      notify?.(out.msg || "Acción lanzada");
      setTimeout(() => void loadBlog(), 4000);
    } catch (e) {
      notify?.(e instanceof Error ? e.message : "No se pudo lanzar");
    } finally {
      setBusy("");
    }
  }

  const posts = (data?.own?.pages || []).filter((p: any) => p.path.startsWith("/blog/") && p.path !== "/blog/");
  const gscBlog = (data?.gsc?.pages || []).filter((p: any) => /\/blog\/.+/.test(p.page));
  const queriesByPage = useMemo(() => {
    const m = new Map<string, any[]>();
    (data?.gsc?.pageQueries || []).forEach((r: any) => {
      const path = (() => {
        try {
          return new URL(r.page).pathname;
        } catch {
          return r.page;
        }
      })();
      if (!path.startsWith("/blog/")) return;
      m.set(path, [...(m.get(path) || []), r]);
    });
    return m;
  }, [data]);

  const cur = blog?.current;
  return (
    <div className="wa-grid">
      <Panel title="Máquina de blogs" sub={blog?.currentWeek ? `Semana del ${blog.currentWeek} · publica miércoles y viernes` : "Investigación los lunes, publicación miércoles y viernes"} wide>
        {err && <Unavailable what="La máquina de blogs" reason={err} />}
        {blog && blog.available === false && <Unavailable what="La máquina de blogs" reason={blog.reason} />}
        {blog?.available && (
          <div className="wa-blog">
            <div className="wa-blog-status">
              <span className={`wa-status wa-status-${cur?.status || "none"}`}>{STATUS_LABEL[cur?.status] || cur?.status || "Sin datos esta semana"}</span>
              {cur?.error && <span className="wa-bad">{cur.error}</span>}
              <div className="wa-blog-actions">
                {!cur || cur.status === "error" ? (
                  <Button onClick={() => void act("investigar")} disabled={!!busy}>
                    <Sparkles />
                    {busy === "investigar" ? "Lanzando…" : "Lanzar investigación"}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => void act("forzar")} disabled={!!busy}>
                    <RefreshCw />
                    {busy === "forzar" ? "Lanzando…" : "Repetir investigación"}
                  </Button>
                )}
                {cur?.selection && (
                  <Button variant="outline" onClick={() => void act("redactar")} disabled={!!busy}>
                    <FileText />
                    {busy === "redactar" ? "Lanzando…" : "Volver a redactar"}
                  </Button>
                )}
                {cur?.chooseUrl && (
                  <a className="ui-button outline" href={cur.chooseUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Elegir ideas
                  </a>
                )}
              </div>
            </div>
            <div className="wa-two">
              <div>
                <h3>Ideas de la semana</h3>
                {cur?.ideas?.length ? (
                  <ol className="wa-ideas">
                    {cur.ideas.map((i: any) => (
                      <li key={i.n} className={cur.selection && Object.values(cur.selection).includes(i.n) ? "chosen" : ""}>
                        <strong>{i.title}</strong>
                        <span>{i.angle}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>Todavía no hay ideas esta semana.</Empty>
                )}
              </div>
              <div>
                <h3>Borradores</h3>
                {Object.entries(cur?.drafts || {}).length ? (
                  <ul className="wa-drafts">
                    {Object.entries(cur.drafts).map(([slot, d]: any) => (
                      <li key={slot}>
                        <span className={`wa-status wa-status-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</span>
                        <strong>{d.title || "—"}</strong>
                        <small>
                          {slot === "miercoles" ? "Miércoles" : "Viernes"} {d.publishOn || ""}
                        </small>
                        <span className="wa-links">
                          {d.previewUrl && (
                            <a href={d.previewUrl} target="_blank" rel="noreferrer">
                              Ver borrador
                            </a>
                          )}
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noreferrer">
                              Publicado
                            </a>
                          )}
                        </span>
                        {d.error && <small className="wa-bad">{d.error}</small>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Sin borradores.</Empty>
                )}
                {(blog.history || []).some((h: any) => h.week !== blog.currentWeek) && <h3>Semanas anteriores</h3>}
                <ul className="wa-history">
                  {(blog.history || [])
                    .filter((h: any) => h.week !== blog.currentWeek)
                    .map((h: any) => (
                      <li key={h.week}>
                        <span>{h.week}</span>
                        <span className={`wa-status wa-status-${h.status}`}>{STATUS_LABEL[h.status] || h.status}</span>
                        <span>
                          {Object.values(h.drafts || {})
                            .map((d: any) => (d.url ? "✓" : "·"))
                            .join(" ")}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Artículos: lectura" sub="Vistas, tiempo real de lectura, hasta dónde leen y contactos generados" source="own" wide>
        <Table
          head={["Artículo", "Vistas", "Tiempo activo", "Leen hasta", "Salidas", "Contactos", "Búsquedas de Google que lo traen"]}
          rows={posts.map((p: any) => [
            <span className="wa-path" title={p.path}>{shortPath(p.path.replace("/blog/", ""))}</span>,
            int(p.views),
            secs(p.avg_active_ms),
            p.avg_depth == null ? "—" : `${p.avg_depth} %`,
            pct(p.exit_rate, 0),
            p.conversions ? <strong className="wa-good">{int(p.conversions)}</strong> : "0",
            <span className="wa-queries">
              {(queriesByPage.get(p.path) || [])
                .slice(0, 3)
                .map((q: any) => `${q.query} (${Number(q.position).toFixed(0)}º)`)
                .join(" · ") || "—"}
            </span>,
          ])}
          empty="Todavía no hay lecturas medidas de artículos."
        />
      </Panel>

      <Panel title="Artículos en Google" sub="Clics, apariciones y posición media de cada artículo" source="gsc" wide>
        {data?.gsc?.available ? (
          <Table head={["Artículo", "Clics", "Apariciones", "CTR", "Posición"]} rows={gscBlog.map((p: any) => [<span className="wa-path">{shortPath(p.page.replace(/^https?:\/\/[^/]+\/blog\//, ""))}</span>, int(p.clicks), int(p.impressions), ratio(p.ctr), Number(p.position).toFixed(1)])} empty="Google aún no muestra artículos del blog." />
        ) : (
          <Unavailable what="Search Console" reason={data?.gsc?.reason} />
        )}
      </Panel>
    </div>
  );
}
const STATUS_LABEL: Record<string, string> = {
  investigando: "Investigando",
  ideas: "Ideas enviadas · falta elegir",
  redactando: "Redactando",
  borradores: "Borradores listos",
  error: "Error",
  pendiente: "Pendiente de publicar",
  parado: "Parado",
  publicado: "Publicado",
};

// ============================================================
// MAPAS DE CALOR (dentro del panel)
// ============================================================
const FRAME_WIDTH: Record<string, number> = { desktop: 1280, mobile: 390 };

function HeatmapsTab({ from, to }: { from: string; to: string }) {
  const [pages, setPages] = useState<{ path: string; clicks: number; views: number }[]>([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [path, setPath] = useState("/");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<"clicks" | "scroll">("clicks");
  const [heat, setHeat] = useState<HeatmapData | null>(null);
  const [frameH, setFrameH] = useState(2000);
  const [err, setErr] = useState("");
  const [boxW, setBoxW] = useState(900);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    webAnalyticsClient
      .heatmapPages(from, to)
      .then((r) => {
        const nextPages = Array.isArray(r.pages) ? r.pages : [];
        setPages(nextPages);
        setSiteUrl(r.siteUrl || "");
        if (nextPages[0] && !nextPages.find((p) => p.path === path)) setPath(nextPages[0].path);
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    setHeat(null);
    webAnalyticsClient
      .heatmap(path, device, from, to)
      .then((h) => {
        setHeat(h);
        setSiteUrl(h.siteUrl || "");
      })
      .catch((e) => setErr(e.message));
  }, [path, device, from, to]);

  // Tamaño real de la página que informa la web desde dentro del iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!siteUrl || new URL(siteUrl).origin !== e.origin) return;
      if (e.data?.type === "robin-heatmap-size" && e.data.h) setFrameH(Math.min(40000, Number(e.data.h)));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [siteUrl]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Envía los datos a la página cuando carga o cambian
  const send = () => {
    if (!heat || !frame.current?.contentWindow || !siteUrl) return;
    frame.current.contentWindow.postMessage({ type: "robin-heatmap", mode, clicks: heat.clicks, scroll: heat.scroll }, new URL(siteUrl).origin);
  };
  useEffect(() => {
    send();
    const t = setTimeout(send, 800); // por si la página tarda en pintar imágenes
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heat, mode]);

  const width = FRAME_WIDTH[device];
  const scale = Math.min(1, (boxW - 2) / width);
  const src = siteUrl ? `${siteUrl}${path}${path.includes("?") ? "&" : "?"}robin_heatmap=1` : "";

  return (
    <div className="wa-heat">
      <aside className="panel">
        <label>
          Página
          <select value={path} onChange={(e) => setPath(e.target.value)}>
            {!pages.find((p) => p.path === path) && <option value={path}>{path}</option>}
            {pages.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} · {p.clicks} clics
              </option>
            ))}
          </select>
        </label>
        <div className="analytics-tabs" role="tablist" aria-label="Dispositivo">
          <button type="button" className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>
            <Monitor /> Ordenador
          </button>
          <button type="button" className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>
            <Smartphone /> Móvil
          </button>
        </div>
        <div className="analytics-tabs" role="tablist" aria-label="Tipo de mapa">
          <button type="button" className={mode === "clicks" ? "active" : ""} onClick={() => setMode("clicks")}>
            <Flame /> Clics
          </button>
          <button type="button" className={mode === "scroll" ? "active" : ""} onClick={() => setMode("scroll")}>
            <Gauge /> Scroll
          </button>
        </div>
        <dl>
          <div>
            <dt>Vistas medidas</dt>
            <dd>{int(heat?.views)}</dd>
          </div>
          <div>
            <dt>Clics</dt>
            <dd>{int(heat?.total_clicks)}</dd>
          </div>
        </dl>
        <h3>Elementos más pulsados</h3>
        <ol className="wa-top">
          {(heat?.top_elements || []).map((t, i) => (
            <li key={i}>
              <span>{t.label}</span>
              <b>{int(t.clicks)}</b>
            </li>
          ))}
        </ol>
        {src && (
          <a className="wa-open" href={`${siteUrl}${path}`} target="_blank" rel="noreferrer">
            <Globe /> Abrir la página
          </a>
        )}
        <p className="wa-note">Solo se cuentan visitas que aceptaron las cookies de analítica. Rojo = más clics · azul = menos.</p>
        {err && <p className="wa-bad">{err}</p>}
      </aside>

      <div className="wa-heat-stage panel" ref={box}>
        {src ? (
          <div className="wa-heat-scaler" style={{ width: width * scale, height: frameH * scale }}>
            <iframe
              key={`${path}-${device}`}
              ref={frame}
              title="Mapa de calor"
              src={src}
              onLoad={send}
              scrolling="no"
              style={{ width, height: frameH, transform: `scale(${scale})` }}
            />
          </div>
        ) : (
          <Empty>Cargando página…</Empty>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TÉCNICA: velocidad real y errores
// ============================================================
function vitalTone(kind: "lcp" | "inp" | "cls", v: number | null) {
  if (v == null) return "";
  const [good, poor] = kind === "lcp" ? [2500, 4000] : kind === "inp" ? [200, 500] : [0.1, 0.25];
  return v <= good ? "wa-good" : v <= poor ? "wa-warn" : "wa-bad";
}

function TechTab({ data }: { data: WebData }) {
  const own = data.own || {};
  return (
    <div className="wa-grid">
      <Panel title="Velocidad real por página" sub="Percentil 75 de visitantes reales. Verde = bien · ámbar = mejorable · rojo = lento (criterios de Google)" source="own" wide>
        <Table
          head={["Página", "Dispositivo", "Muestras", "Carga (LCP)", "Respuesta (INP)", "Estabilidad (CLS)"]}
          rows={(own.vitals || []).map((v: any) => [
            <span className="wa-path">{shortPath(v.path)}</span>,
            v.device === "mobile" ? "Móvil" : v.device === "tablet" ? "Tableta" : "Ordenador",
            int(v.samples),
            <span className={vitalTone("lcp", v.lcp_p75)}>{v.lcp_p75 == null ? "—" : `${(v.lcp_p75 / 1000).toFixed(1)} s`}</span>,
            <span className={vitalTone("inp", v.inp_p75)}>{v.inp_p75 == null ? "—" : `${int(v.inp_p75)} ms`}</span>,
            <span className={vitalTone("cls", v.cls_p75)}>{v.cls_p75 == null ? "—" : Number(v.cls_p75).toFixed(3)}</span>,
          ])}
          empty="Aún no hay suficientes muestras (mínimo 3 por página)."
        />
      </Panel>
      <Panel title="Páginas que no existen (404)" sub="Enlaces rotos o direcciones antiguas que la gente sigue visitando" source="own">
        <Table head={["Dirección", "Visitas", "Viene de"]} rows={(own.not_found || []).map((n: any) => [<span className="wa-path">{shortPath(n.path)}</span>, int(n.hits), n.example_ref ? shortPath(n.example_ref) : "—"])} empty="Ninguna visita a páginas inexistentes." />
      </Panel>
      <Panel title="Errores de JavaScript" sub="Fallos en el navegador de los visitantes" source="own">
        <Table head={["Error", "Página", "Veces"]} rows={(own.js_errors || []).map((e: any) => [<code className="wa-code">{e.message}</code>, <span className="wa-path">{shortPath(e.example_path)}</span>, int(e.hits)])} empty="Sin errores registrados." />
      </Panel>
    </div>
  );
}

export default WebAnalytics;
