import { useEffect, useRef, useState } from "react";
import { Flame, Gauge, Globe, Monitor, Smartphone } from "lucide-react";
import { webAnalyticsClient } from "@/services/web-analytics";
import type { HeatmapData } from "@/services/web-analytics";
import { Empty, int } from "./web-analytics-shared";

// ============================================================
// MAPAS DE CALOR (dentro del panel)
// ============================================================
const FRAME_WIDTH: Record<string, number> = { desktop: 1280, mobile: 390 };

export function HeatmapsTab({ from, to }: { from: string; to: string }) {
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
  const siteOrigin = useRef("");
  siteOrigin.current = siteUrl ? new URL(siteUrl).origin : "";

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
    setErr("");
    setHeat(null);
    webAnalyticsClient
      .heatmap(path, device, from, to)
      .then((h) => {
        setHeat(h);
        setSiteUrl(h.siteUrl || "");
      })
      .catch((e) => setErr(e.message));
  }, [path, device, from, to]);

  // Escucha desde el montaje: la página del iframe puede informar su altura
  // antes de que termine el efecto que actualiza siteUrl.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!siteOrigin.current || siteOrigin.current !== e.origin) return;
      const height = Number(e.data?.h);
      if (e.data?.type === "robin-heatmap-size" && Number.isFinite(height) && height > 0) setFrameH(Math.min(40000, height));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

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
  const pageUrl = siteUrl ? new URL(path, `${siteUrl}/`) : null;
  pageUrl?.searchParams.set("robin_heatmap", "1");
  const src = pageUrl?.toString() || "";
  const openPageUrl = siteUrl ? new URL(path, `${siteUrl}/`).toString() : "";

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
          <a className="wa-open" href={openPageUrl} target="_blank" rel="noreferrer">
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

