import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { webAnalyticsClient } from "@/services/web-analytics";
import type { BlogStatus, WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, pct, ratio, secs, shortPath, Panel, Unavailable, Table } from "./web-analytics-shared";

// BLOG: métricas de los artículos + máquina de blogs
// ============================================================
export function BlogTab({ data, notify }: { data: WebData | null; notify?: (m: string) => void }) {
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
