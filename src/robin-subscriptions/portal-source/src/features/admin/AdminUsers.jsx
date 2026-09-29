import { AdminUserDetail } from "./AdminUserDetail.jsx";
import { Badge, Btn, Card, CardContent, CardHeader, Field, SelectField } from "../../shared/ui.jsx";
import { ChevronRight, Users } from "lucide-react";
import { ROBIN_CITIES, SUB_STATUS_LABELS } from "../../shared/constants.js";
import React, { useState } from "react";

function AdminUsers({ users, requests, onChanged }) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [openId, setOpenId] = useState(null);
  const filtered = users
    .filter((u) => !city || String(u.ciudad || "").toLowerCase() === city.toLowerCase())
    .filter((u) => { const t = (q || "").toLowerCase(); return !t || `${u.name} ${u.email}`.toLowerCase().includes(t); });
  const open = users.find((u) => u.id === openId);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Usuarios" subtitle={`${users.length} suscriptores`} icon={Users} />
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Buscar" value={q} onChange={setQ} placeholder="Nombre o correo…" />
          <SelectField label="Ciudad" value={city} onChange={setCity} options={ROBIN_CITIES} placeholder="Todas" />
        </CardContent>
      </Card>

      {open && <AdminUserDetail u={open} requests={requests} onChanged={onChanged} onClose={() => setOpenId(null)} />}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Ciudad</th><th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Solicitudes</th><th className="px-4 py-3">Eventos</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const st = SUB_STATUS_LABELS[u.subscription_status] || SUB_STATUS_LABELS.none;
                return (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">{u.ciudad || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="px-4 py-3">{u.requests_open}<span className="text-slate-300"> / {u.requests_total}</span></td>
                    <td className="px-4 py-3">{u.rsvps_count}</td>
                    <td className="px-4 py-3 text-right">
                      <Btn size="sm" variant="secondary" onClick={() => setOpenId(u.id === openId ? null : u.id)}>
                        {u.id === openId ? "Cerrar" : "Gestionar"} <ChevronRight className="h-3.5 w-3.5" />
                      </Btn>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export { AdminUsers };
