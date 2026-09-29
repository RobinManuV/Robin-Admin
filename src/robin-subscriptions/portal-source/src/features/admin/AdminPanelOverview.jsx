import { Badge, Card, CardContent, CardHeader, KpiCard } from "../../shared/ui.jsx";
import { CalendarCheck, Clock, LifeBuoy, MapPin, Star, Users } from "lucide-react";
import { NAVY } from "../../shared/theme.js";
import React from "react";
import { SUB_REQ_STATUS } from "./SUB_REQ_STATUS.js";
import { formatDate } from "../../shared/utils.js";

function AdminPanelOverview({ users, events, partners, requests, setSection }) {
  const activeSubs = users.filter((u) => u.subscription_status === "active" || u.subscription_status === "trialing").length;
  const openReq = requests.filter((r) => r.status === "open" || r.status === "in_progress").length;
  const byCity = {};
  users.forEach((u) => { const c = u.ciudad || "Sin ciudad"; byCity[c] = (byCity[c] || 0) + 1; });
  const cityRows = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
  const recent = requests.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Suscriptores" value={users.length} tone="navy" />
        <KpiCard icon={Star} label="Activos" value={activeSubs} tone="gold" />
        <KpiCard icon={LifeBuoy} label="Solicitudes abiertas" value={openReq} tone={openReq ? "rose" : "navy"} />
        <KpiCard icon={CalendarCheck} label="Contenido comunidad" value={events.length} tone="navy" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Suscriptores por ciudad" icon={MapPin} />
          <CardContent className="space-y-2">
            {cityRows.length === 0 && <div className="text-sm text-slate-400">Sin datos.</div>}
            {cityRows.map(([c, n]) => (
              <div key={c} className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-700">{c}</div>
                <Badge tone="navy">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Solicitudes recientes" icon={Clock} right={<button onClick={() => setSection("usuarios")} className="text-xs font-semibold" style={{ color: NAVY }}>Ver usuarios</button>} />
          <CardContent className="space-y-2">
            {recent.length === 0 && <div className="text-sm text-slate-400">Sin solicitudes.</div>}
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-slate-800 truncate">{r.title}</div>
                  <div className="text-xs text-slate-400">{r.user_name || "—"} · {formatDate(r.created_at)}</div>
                </div>
                <Badge tone={r.status === "done" ? "green" : r.status === "in_progress" ? "blue" : r.status === "cancelled" ? "slate" : "amber"}>
                  {(SUB_REQ_STATUS.find((s) => s.value === r.status) || {}).label || r.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { AdminPanelOverview };
