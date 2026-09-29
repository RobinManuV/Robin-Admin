import { Btn, Card, CardContent, CardHeader, Divider, Field, SelectField } from "../../shared/ui.jsx";
import { CheckCircle2, Loader2, User, XCircle } from "lucide-react";
import { NAVY } from "../../shared/theme.js";
import { ROBIN_CITIES, SUB_STATUS_LABELS } from "../../shared/constants.js";
import React, { useState } from "react";
import { RobinProgressBar } from "../levels/RobinProgressBar.jsx";
import { SUB_REQ_STATUS } from "./SUB_REQ_STATUS.js";
import { formatDate, getRobinLevel, robinLevelDef } from "../../shared/utils.js";
import { subAdminMutate } from "../../api/index.js";

function AdminUserDetail({ u, requests, onChanged, onClose }) {
  const [ciudad, setCiudad] = useState(u.ciudad || "");
  const [status, setStatus] = useState(u.subscription_status || "none");
  const [nombre, setNombre] = useState(u.nombre || "");
  const [apellidos, setApellidos] = useState(u.apellidos || "");
  const [rlOverride, setRlOverride] = useState(u.robin_level_override || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const mine = requests.filter((r) => r.user_id === u.id);
  const rp = getRobinLevel({ ...u, robin_level_override: rlOverride || null });
  const rpDef = robinLevelDef(rp.level);

  async function saveUser() {
    setSaving(true); setMsg("");
    try { await subAdminMutate("user", "update", { id: u.id, ciudad, subscription_status: status, nombre, apellidos, robin_level_override: rlOverride || null }); setMsg("Guardado."); await onChanged(); }
    catch (e) { setMsg(e.message || "Error al guardar."); }
    finally { setSaving(false); }
  }
  async function setReqStatus(r, s) { try { await subAdminMutate("request", "update", { id: r.id, status: s }); await onChanged(); } catch (_) {} }

  return (
    <Card>
      <CardHeader title={u.name} subtitle={u.email} icon={User}
        right={<Btn size="sm" variant="ghost" onClick={onClose}><XCircle className="h-3.5 w-3.5" /> Cerrar</Btn>} />
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={nombre} onChange={setNombre} />
          <Field label="Apellidos" value={apellidos} onChange={setApellidos} />
          <SelectField label="Ciudad" value={ciudad} onChange={setCiudad} options={ROBIN_CITIES} placeholder="Sin ciudad" />
          <SelectField label="Estado de suscripción" allowEmpty={false} value={status} onChange={setStatus}
            options={Object.keys(SUB_STATUS_LABELS).map((k) => ({ value: k, label: SUB_STATUS_LABELS[k].label }))} />
        </div>
        {msg && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{msg}</div>}
        <Btn disabled={saving} onClick={saveUser}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar cambios</Btn>

        <Divider />
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Robin Progress</div>
        <div className="rounded-xl border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">{rpDef.emoji} {rpDef.label}{rlOverride ? <span className="ml-2 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: "#EEF3FC", color: NAVY, border: "1px solid #D7E1F4" }}>Override</span> : null}</div>
            <div className="text-xs text-slate-400">Alta: {formatDate(u.created_at)}</div>
          </div>
          <div className="text-xs text-slate-500">{rp.daysActive} días acumulados · {rp.nextLevel ? `faltan ${rp.daysRemaining} para ${robinLevelDef(rp.nextLevel).label}` : "nivel máximo alcanzado"}</div>
          <RobinProgressBar value={rp.progress} />
        </div>
        <SelectField label="Override manual de nivel" allowEmpty={false} value={rlOverride || "auto"}
          onChange={(v) => setRlOverride(v === "auto" ? "" : v)}
          options={[{ value: "auto", label: "Automático (por antigüedad)" }, { value: "nest", label: "🪺 Nest" }, { value: "fly", label: "🕊️ Fly" }, { value: "rocket", label: "🚀 Rocket" }]} />
        <div className="text-[11px] text-slate-400 -mt-1">Con override manual se ignora el cálculo automático. Recuerda pulsar «Guardar cambios».</div>

        <Divider />
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicios solicitados ({mine.length})</div>
        {mine.length === 0 && <div className="text-sm text-slate-400">Este usuario no ha solicitado servicios.</div>}
        {mine.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
            <div className="min-w-0">
              <div className="text-sm text-slate-800 truncate">{r.title}</div>
              <div className="text-xs text-slate-400">{formatDate(r.created_at)}{r.category ? ` · ${r.category}` : ""}</div>
            </div>
            <select value={r.status} onChange={(e) => setReqStatus(r, e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none">
              {SUB_REQ_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export { AdminUserDetail };
