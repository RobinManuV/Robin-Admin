import { ADMIN_EVENT_KINDS } from "./ADMIN_EVENT_KINDS.js";
import { Badge, Btn, Card, CardContent, CardHeader, Field, SelectField, TextareaField } from "../../shared/ui.jsx";
import { COMMUNITY_TYPE_LABELS, ROBIN_CITIES } from "../../shared/constants.js";
import { Calendar, CheckCircle2, Clock, Loader2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import React, { useState } from "react";
import { formatDate } from "../../shared/utils.js";
import { subAdminMutate } from "../../api/index.js";
import { toLocalInput } from "./toLocalInput.js";

function AdminEventManager({ kind, events, onChanged }) {
  const cfg = ADMIN_EVENT_KINDS[kind];
  const [cityFilter, setCityFilter] = useState("");
  const [editing, setEditing] = useState(null); // objeto en edición o null
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const list = events
    .filter((e) => cfg.types.includes(e.type))
    .filter((e) => !cityFilter || (cityFilter === "__nac" ? !e.city : String(e.city || "").toLowerCase() === cityFilter.toLowerCase()));

  function blank() {
    return { type: cfg.defaultType, title: "", description: "", city: "", location: "", starts_at: "", expires_at: "", capacity: "", active: true, meta: {} };
  }
  function startEdit(e) {
    setErr("");
    setEditing(e ? { ...e, meta: e.meta || {}, starts_at: toLocalInput(e.starts_at), expires_at: toLocalInput(e.expires_at, true), capacity: e.capacity || "" } : blank());
  }

  async function save() {
    if (!editing.title.trim()) { setErr("El título es obligatorio."); return; }
    setSaving(true); setErr("");
    const meta = { ...(editing.meta || {}) };
    const payload = {
      id: editing.id,
      type: editing.type || cfg.defaultType,
      title: editing.title.trim(),
      description: editing.description || null,
      city: editing.city ? editing.city : null,
      location: editing.location || null,
      active: editing.active !== false,
      meta,
    };
    if (cfg.hasDate) payload.starts_at = editing.starts_at ? new Date(editing.starts_at).toISOString() : null;
    if (cfg.hasCapacity || cfg.hasTrip) payload.capacity = editing.capacity ? Number(editing.capacity) : null;
    if (cfg.hasExpiry) payload.expires_at = editing.expires_at ? new Date(editing.expires_at).toISOString() : null;
    try {
      await subAdminMutate("event", editing.id ? "update" : "create", payload);
      setEditing(null);
      await onChanged();
    } catch (e) { setErr(e.message || "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  async function remove(e) {
    if (!window.confirm(`¿Eliminar "${e.title}"?`)) return;
    try { await subAdminMutate("event", "delete", { id: e.id }); await onChanged(); } catch (_) {}
  }

  function setMeta(k, v) { setEditing((p) => ({ ...p, meta: { ...(p.meta || {}), [k]: v } })); }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={cfg.plural} subtitle={`Crea y edita ${cfg.plural.toLowerCase()} · se personalizan por ciudad`} icon={cfg.icon}
          right={<Btn size="sm" onClick={() => startEdit(null)}><Plus className="h-3.5 w-3.5" /> Nuevo</Btn>} />
        <CardContent>
          <SelectField label="Filtrar por ciudad" value={cityFilter} onChange={setCityFilter}
            options={[{ value: "__nac", label: "Nacional (sin ciudad)" }, ...ROBIN_CITIES]} placeholder="Todas las ciudades" />
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader title={editing.id ? `Editar ${cfg.label}` : `Nuevo ${cfg.label}`} icon={Pencil}
            right={<Btn size="sm" variant="ghost" onClick={() => setEditing(null)}><XCircle className="h-3.5 w-3.5" /> Cerrar</Btn>} />
          <CardContent className="space-y-3">
            <Field label="Título" value={editing.title} onChange={(v) => setEditing((p) => ({ ...p, title: v }))} />
            {cfg.types.length > 1 && (
              <SelectField label="Tipo" value={editing.type} allowEmpty={false} onChange={(v) => setEditing((p) => ({ ...p, type: v }))}
                options={cfg.types.map((t) => ({ value: t, label: (COMMUNITY_TYPE_LABELS[t] || {}).label || t }))} />
            )}
            <TextareaField label="Descripción" rows={3} value={editing.description} onChange={(v) => setEditing((p) => ({ ...p, description: v }))} />
            <div className="grid sm:grid-cols-2 gap-3">
              <SelectField label="Ciudad (vacío = Nacional)" value={editing.city} onChange={(v) => setEditing((p) => ({ ...p, city: v }))} options={ROBIN_CITIES} placeholder="Nacional (todas)" />
              <Field label="Lugar / ubicación" value={editing.location} onChange={(v) => setEditing((p) => ({ ...p, location: v }))} />
            </div>
            {cfg.hasDate && (
              <label className="block">
                <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Fecha y hora</div>
                <input type="datetime-local" value={editing.starts_at || ""} onChange={(e) => setEditing((p) => ({ ...p, starts_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
              </label>
            )}
            {(cfg.hasCapacity || cfg.hasTrip) && (
              <Field label={cfg.hasTrip ? "Plazas" : "Aforo"} type="number" value={editing.capacity} onChange={(v) => setEditing((p) => ({ ...p, capacity: v }))} />
            )}
            {cfg.hasMembers && (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Miembros" type="number" value={editing.meta.members || ""} onChange={(v) => setMeta("members", v ? Number(v) : null)} />
                <Field label="Categoría (Ciudad/Deporte/Estudios…)" value={editing.meta.category || ""} onChange={(v) => setMeta("category", v)} />
              </div>
            )}
            {cfg.hasPartner && (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Partner" value={editing.meta.partner || ""} onChange={(v) => setMeta("partner", v)} />
                <Field label="Etiqueta (Movilidad/Bienestar…)" value={editing.meta.tag || ""} onChange={(v) => setMeta("tag", v)} />
              </div>
            )}
            {cfg.hasAssoc && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Tipo de asociación" value={editing.meta.assoc_type || ""} onChange={(v) => setMeta("assoc_type", v)} placeholder="Ej. Deportiva, Cultural, Estudiantil" />
                  <Field label="Web (URL)" value={editing.meta.url || ""} onChange={(v) => setMeta("url", v)} placeholder="https://..." />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!editing.meta.university} onChange={(e) => setMeta("university", e.target.checked)} /> Pertenece a la universidad
                </label>
              </>
            )}
            {cfg.hasJob && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Empresa" value={editing.meta.company || ""} onChange={(v) => setMeta("company", v)} />
                  <Field label="Tipo (Parttime, Fulltime…)" value={editing.meta.job_type || ""} onChange={(v) => setMeta("job_type", v)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Salario (texto)" value={editing.meta.salary || ""} onChange={(v) => setMeta("salary", v)} placeholder="Ej. 15 €/h" />
                  <Field label="Enlace para aplicar (URL)" value={editing.meta.url || ""} onChange={(v) => setMeta("url", v)} placeholder="https://..." />
                </div>
              </>
            )}
            {cfg.hasExpiry && (
              <label className="block">
                <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Caduca el</div>
                <input type="date" value={editing.expires_at || ""} onChange={(e) => setEditing((p) => ({ ...p, expires_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
              </label>
            )}
            {cfg.hasTrip && (
              <Field label="Precio (texto: 35 €, Gratis…)" value={editing.meta.price || ""} onChange={(v) => setMeta("price", v)} />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo (visible para suscriptores)
            </label>
            {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <Btn disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {list.length === 0 && <div className="text-sm text-slate-400 px-2">No hay {cfg.plural.toLowerCase()} {cityFilter ? "para ese filtro" : "todavía"}.</div>}
        {list.map((e) => (
          <Card key={e.id}>
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-900">{e.title}</div>
                <div className="flex items-center gap-1.5">
                  {e.active === false && <Badge tone="slate">Oculto</Badge>}
                  <Badge tone="navy">{e.city || "Nacional"}</Badge>
                </div>
              </div>
              {e.description && <div className="text-sm text-slate-600 line-clamp-2">{e.description}</div>}
              <div className="text-xs text-slate-400 flex flex-wrap gap-3">
                {e.starts_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(e.starts_at)}</span>}
                {e.expires_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Caduca {formatDate(e.expires_at)}</span>}
                {e.meta && e.meta.members != null && <span>{e.meta.members} miembros</span>}
                {e.meta && e.meta.price && <span>{e.meta.price}</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <Btn size="sm" variant="secondary" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(e)}><Trash2 className="h-3.5 w-3.5" /> Borrar</Btn>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { AdminEventManager };
