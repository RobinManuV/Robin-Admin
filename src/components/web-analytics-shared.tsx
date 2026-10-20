// Admin interface component for web analytics shared; composed by the shell or a feature module.
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export const int = (n: any) => (n == null || Number.isNaN(Number(n)) ? "—" : Math.round(Number(n)).toLocaleString("es-ES"));

export function Empty({ children }: { children: ReactNode }) {
  return <div className="wa-empty">{children}</div>;
}

// ---------- formato ----------
export const pct = (n: any, digits = 1) => (n == null || Number.isNaN(Number(n)) ? "—" : `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: digits })} %`);
export const ratio = (n: any) => (n == null ? "—" : pct(Number(n) * 100));
export const secs = (ms: any) => {
  if (ms == null) return "—";
  const s = Math.round(Number(ms) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
};
export const dur = (s: any) => (s == null ? "—" : secs(Number(s) * 1000));
export const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
export const shortPath = (p: string) => (p && p.length > 48 ? `${p.slice(0, 46)}…` : p || "—");
// Fecha local del navegador (no UTC), para que "hoy" sea hoy también de noche
const toIso = (d: Date) => d.toLocaleDateString("sv-SE");

export function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  return { from: toIso(from), to: toIso(to) };
}

// ---------- piezas comunes ----------
export function Kpi({ icon: Icon, label, value, detail, source }: { icon: any; label: string; value: string; detail?: string; source?: string }) {
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

export function Panel({ title, sub, source, children, wide }: { title: string; sub?: string; source?: string; children: ReactNode; wide?: boolean }) {
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

export function Unavailable({ what, reason }: { what: string; reason?: string }) {
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

// Barra horizontal dentro de una celda (proporción respecto al máximo)
export function Meter({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "gold" | "green" }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <span className={`wa-meter wa-meter-${tone}`}>
      <span style={{ width: `${w}%` }} />
    </span>
  );
}

export function Table({ head, rows, empty = "Sin datos en este periodo." }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string }) {
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
