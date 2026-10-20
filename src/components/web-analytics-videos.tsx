// Admin interface component for web analytics videos; composed by the shell or a feature module.
import { PlayCircle } from "lucide-react";
import type { WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, Panel } from "./web-analytics-shared";

// VÍDEOS
// ============================================================
export function VideosTab({ data }: { data: WebData }) {
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
