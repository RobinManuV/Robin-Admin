import { Badge, Btn, Card, CardContent, CardHeader, Field } from "../../shared/ui.jsx";
import { CheckCircle2, Loader2, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { subAdminMutate } from "../../api/index.js";

function AdminDiscountManager({ codes = [], onChanged }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function blank() { return { code: "", percent_off: "", max_redemptions: "", note: "", duration_months: "", active: true }; }
  function startEdit(c) { setErr(""); setEditing(c ? { ...c, percent_off: c.percent_off ?? "", max_redemptions: c.max_redemptions ?? "", note: c.note || "", duration_months: c.duration_months ?? "" } : blank()); }

  async function save() {
    const code = (editing.code || "").trim().toUpperCase();
    const pct = Number(editing.percent_off);
    if (!code) { setErr("El código es obligatorio."); return; }
    if (!(pct > 0 && pct <= 100)) { setErr("El porcentaje debe estar entre 1 y 100."); return; }
    const durMonths = editing.duration_months === "" || editing.duration_months == null ? null : Number(editing.duration_months);
    if (durMonths != null && !(Number.isInteger(durMonths) && durMonths >= 1 && durMonths <= 12)) { setErr("La duración debe ser de 1 a 12 meses, o vacío para ilimitado."); return; }
    const payload = {
      id: editing.id,
      code,
      percent_off: pct,
      active: editing.active !== false,
      max_redemptions: editing.max_redemptions === "" || editing.max_redemptions == null ? null : Number(editing.max_redemptions),
      duration_months: durMonths,
      note: (editing.note || "").trim() || null,
    };
    setSaving(true); setErr("");
    try {
      await subAdminMutate("discount_code", editing.id ? "update" : "create", payload);
      setEditing(null); await onChanged();
    } catch (e) {
      setErr(e && e.data && e.data.error === "bad_percent" ? "El porcentaje no es válido."
        : e && e.data && e.data.error === "missing_code" ? "El código es obligatorio."
        : (e.message || "No se pudo guardar (¿código duplicado?)."));
    } finally { setSaving(false); }
  }
  async function toggleActive(c) { try { await subAdminMutate("discount_code", "update", { id: c.id, active: !c.active }); await onChanged(); } catch (_) {} }
  async function remove(c) { if (!window.confirm(`¿Eliminar el código "${c.code}"?`)) return; try { await subAdminMutate("discount_code", "delete", { id: c.id }); await onChanged(); } catch (_) {} }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Códigos de descuento" subtitle="Crea códigos con un porcentaje de descuento sobre la suscripción (mensual y anual)" icon={Percent}
          right={<Btn size="sm" onClick={() => startEdit(null)}><Plus className="h-3.5 w-3.5" /> Nuevo código</Btn>} />
        {editing && (
          <CardContent className="space-y-3 border-t border-slate-100">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Código" value={editing.code} onChange={(v) => setEditing((p) => ({ ...p, code: v.toUpperCase() }))} placeholder="Ej. BIENVENIDA" />
              <Field label="Descuento (%)" type="number" value={String(editing.percent_off)} onChange={(v) => setEditing((p) => ({ ...p, percent_off: v }))} placeholder="Ej. 15" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Usos máximos (vacío = ilimitado)" type="number" value={String(editing.max_redemptions)} onChange={(v) => setEditing((p) => ({ ...p, max_redemptions: v }))} placeholder="Ilimitado" />
              <Field label="Nota interna (opcional)" value={editing.note} onChange={(v) => setEditing((p) => ({ ...p, note: v }))} placeholder="Ej. Campaña septiembre" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Duración del descuento (meses · vacío = ilimitado)" type="number" value={String(editing.duration_months ?? "")} onChange={(v) => setEditing((p) => ({ ...p, duration_months: v }))} placeholder="1–12 · vacío = ilimitado" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo
            </label>
            {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <Btn disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </CardContent>
        )}
        <CardContent className="space-y-2">
          {codes.length === 0 && <div className="text-sm text-slate-400 px-2">No hay códigos de descuento todavía.</div>}
          {codes.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 tracking-wide">{c.code}</span>
                  <Badge tone="gold">-{c.percent_off}%</Badge>
                  {c.active ? <Badge tone="green">Activo</Badge> : <Badge tone="slate">Inactivo</Badge>}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Usos: {c.times_redeemed || 0}{c.max_redemptions != null ? ` / ${c.max_redemptions}` : " (ilimitado)"} · {c.duration_months ? `${c.duration_months} ${c.duration_months == 1 ? "mes" : "meses"}` : "descuento ilimitado"}{c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Btn size="sm" variant="secondary" onClick={() => toggleActive(c)}>{c.active ? "Desactivar" : "Activar"}</Btn>
                <Btn size="sm" variant="secondary" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></Btn>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export { AdminDiscountManager };
