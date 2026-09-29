import { Badge, Btn, Card, CardContent, CardHeader, Field, SelectField, TextareaField } from "../../shared/ui.jsx";
import { CAMPUS_AREAS } from "../../shared/constants.js";
import { CalendarCheck, CheckCircle2, GraduationCap, Loader2, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { NAVY, NAVY_DARK } from "../../shared/theme.js";
import React, { useState } from "react";
import { formatDate, resizeImageFile } from "../../shared/utils.js";
import { subAdminMutate } from "../../api/index.js";

function AdminMentorManager({ events, onChanged }) {
  const mentors = events.filter((e) => e.type === "mentor");
  const slots = events.filter((e) => e.type === "mentor_slot").sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
  const mentorById = {}; mentors.forEach((m) => { mentorById[m.id] = m; });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [slotMentor, setSlotMentor] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotBusy, setSlotBusy] = useState(false);

  function blank() { return { title: "", meta: { sector: "", job: "", linkedin: "", photo: "", description: "" }, active: true }; }
  function startEdit(m) { setErr(""); setEditing(m ? { ...m, meta: { sector: "", job: "", linkedin: "", photo: "", description: "", ...(m.meta || {}) } } : blank()); }
  function setMeta(k, v) { setEditing((p) => ({ ...p, meta: { ...(p.meta || {}), [k]: v } })); }
  async function onPhoto(e) { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return; try { const d = await resizeImageFile(f, 256); setMeta("photo", d); } catch (_) {} }
  async function saveMentor() {
    if (!editing.title.trim()) { setErr("El nombre es obligatorio."); return; }
    setSaving(true); setErr("");
    try {
      await subAdminMutate("event", editing.id ? "update" : "create", { id: editing.id, type: "mentor", title: editing.title.trim(), active: editing.active !== false, meta: editing.meta || {} });
      setEditing(null); await onChanged();
    } catch (e) { setErr(e.message || "No se pudo guardar."); } finally { setSaving(false); }
  }
  async function removeMentor(m) { if (!window.confirm(`¿Eliminar al mentor "${m.title}"? Se borrarán también sus fechas.`)) return; try { for (const sl of slots.filter((x) => x.meta && x.meta.mentor_id === m.id)) { await subAdminMutate("event", "delete", { id: sl.id }); } await subAdminMutate("event", "delete", { id: m.id }); await onChanged(); } catch (_) {} }
  async function addSlot() {
    if (!slotMentor || !slotDate) return;
    setSlotBusy(true);
    try {
      const mm = mentorById[slotMentor];
      await subAdminMutate("event", "create", { type: "mentor_slot", title: `Disponibilidad · ${mm ? mm.title : ""}`, starts_at: new Date(slotDate).toISOString(), active: true, meta: { mentor_id: slotMentor, sector: (mm && mm.meta && mm.meta.sector) || "" } });
      setSlotDate(""); await onChanged();
    } catch (_) {} finally { setSlotBusy(false); }
  }
  async function removeSlot(sl) { try { await subAdminMutate("event", "delete", { id: sl.id }); await onChanged(); } catch (_) {} }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Mentores" subtitle="Crea y edita los perfiles de los mentores" icon={GraduationCap}
          right={<Btn size="sm" onClick={() => startEdit(null)}><Plus className="h-3.5 w-3.5" /> Nuevo mentor</Btn>} />
        {editing && (
          <CardContent className="space-y-3 border-t border-slate-100">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl overflow-hidden border border-slate-200 grid place-items-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
                {editing.meta.photo ? <img src={editing.meta.photo} alt="" className="h-full w-full object-cover" /> : <span className="text-white font-bold text-lg">{(editing.title || "M").charAt(0).toUpperCase()}</span>}
              </div>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white" style={{ background: NAVY }}><UploadCloud className="h-3.5 w-3.5" /> {editing.meta.photo ? "Cambiar foto" : "Subir foto"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              </label>
            </div>
            <Field label="Nombre" value={editing.title} onChange={(v) => setEditing((p) => ({ ...p, title: v }))} />
            <div className="grid sm:grid-cols-2 gap-3">
              <SelectField label="Campus" value={editing.meta.sector} onChange={(v) => setMeta("sector", v)} options={CAMPUS_AREAS} placeholder="Selecciona un campus" allowEmpty={true} />
              <Field label="Trabajo actual" value={editing.meta.job} onChange={(v) => setMeta("job", v)} placeholder="Ej. Product Manager en X" />
            </div>
            <Field label="LinkedIn (URL)" value={editing.meta.linkedin} onChange={(v) => setMeta("linkedin", v)} placeholder="https://linkedin.com/in/..." />
            <TextareaField label="Breve descripción" rows={3} value={editing.meta.description} onChange={(v) => setMeta("description", v)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo (visible para suscriptores)
            </label>
            {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <Btn disabled={saving} onClick={saveMentor}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </CardContent>
        )}
        <CardContent className="grid sm:grid-cols-2 gap-4">
          {mentors.length === 0 && <div className="text-sm text-slate-400 px-2">No hay mentores todavía.</div>}
          {mentors.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-100 p-4 flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl overflow-hidden grid place-items-center text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})` }}>
                {m.meta && m.meta.photo ? <img src={m.meta.photo} alt="" className="h-full w-full object-cover" /> : <span className="font-bold">{(m.title || "M").charAt(0)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{m.title}{m.active === false && <span className="ml-2"><Badge tone="slate">Oculto</Badge></span>}</div>
                <div className="text-xs text-slate-500">{(m.meta && m.meta.sector) || "—"}{m.meta && m.meta.job ? ` · ${m.meta.job}` : ""}</div>
                <div className="flex gap-2 pt-2">
                  <Btn size="sm" variant="secondary" onClick={() => startEdit(m)}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                  <Btn size="sm" variant="danger" onClick={() => removeMentor(m)}><Trash2 className="h-3.5 w-3.5" /> Borrar</Btn>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Disponibilidad de mentores" subtitle="Añade y quita fechas disponibles" icon={CalendarCheck} />
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <SelectField label="Mentor" value={slotMentor} onChange={setSlotMentor} options={mentors.map((m) => ({ value: m.id, label: `${m.title}${m.meta && m.meta.sector ? ` (${m.meta.sector})` : ""}` }))} placeholder="Selecciona mentor" />
            <label className="block">
              <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Fecha</div>
              <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
            </label>
            <Btn disabled={slotBusy || !slotMentor || !slotDate} onClick={addSlot}>{slotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir</Btn>
          </div>
          <div className="space-y-2">
            {slots.length === 0 && <div className="text-sm text-slate-400">No hay fechas de disponibilidad todavía.</div>}
            {slots.map((sl) => {
              const m = sl.meta && mentorById[sl.meta.mentor_id];
              return (
                <div key={sl.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="text-sm text-slate-700">{formatDate(sl.starts_at)} · <span className="font-medium">{m ? m.title : "Mentor eliminado"}</span>{sl.meta && sl.meta.sector ? ` · ${sl.meta.sector}` : ""}</div>
                  <Btn size="sm" variant="danger" onClick={() => removeSlot(sl)}><Trash2 className="h-3.5 w-3.5" /></Btn>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export { AdminMentorManager };
