// Admin interface component for web analytics pages; composed by the shell or a feature module.
import type { WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, pct, shortPath, Panel, Unavailable, Meter, Table } from "./web-analytics-shared";

// PÁGINAS: qué hacen dentro y por dónde salen
// ============================================================
export function PagesTab({ data }: { data: WebData }) {
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
