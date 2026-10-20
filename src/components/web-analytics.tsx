"use client";

// ============================================================
// Pestaña "Web" del gestor: analítica de project-robin.com.
//   Tráfico · Páginas · Conversión · Vídeos · Blog · Mapas de calor · Técnica
// Fuentes: Google Analytics 4 y Search Console (lo que ya mide Google) + medición
// propia de la web (solo visitantes que aceptan cookies de analítica) + máquina de blogs.
// Uso: <WebAnalytics notify={notify} />
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { webAnalyticsClient } from "@/services/web-analytics";
import { HeatmapsTab } from "./web-analytics-heatmaps";
import { rangeFor } from "./web-analytics-shared";
import { TrafficTab } from "./web-analytics-traffic";
import { PagesTab } from "./web-analytics-pages";
import { ConversionTab } from "./web-analytics-conversion";
import { VideosTab } from "./web-analytics-videos";
import { BlogTab } from "./web-analytics-blog";
import { TechTab } from "./web-analytics-tech";
import type { WebAnalytics as WebData } from "@/services/web-analytics";
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
export default WebAnalytics;
