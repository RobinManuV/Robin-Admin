import { ArrowRight, MousePointerClick, Target, TrendingUp } from "lucide-react";
import type { WebAnalytics as WebData } from "@/services/web-analytics";
import { Empty, int, pct, ratio, Panel, Unavailable, Table } from "./web-analytics-shared";

// CONVERSIÓN: formularios, botones y recorrido hasta cada contacto
// ============================================================
export function ConversionTab({ data }: { data: WebData }) {
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
