import type { WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, shortPath, Panel, Table } from "./web-analytics-shared";

// TÉCNICA: velocidad real y errores
// ============================================================
function vitalTone(kind: "lcp" | "inp" | "cls", v: number | null) {
  if (v == null) return "";
  const [good, poor] = kind === "lcp" ? [2500, 4000] : kind === "inp" ? [200, 500] : [0.1, 0.25];
  return v <= good ? "wa-good" : v <= poor ? "wa-warn" : "wa-bad";
}

export function TechTab({ data }: { data: WebData }) {
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
