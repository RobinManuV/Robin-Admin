import { Badge, Btn, Card, CardContent, CardHeader, Field, SelectField, TextareaField } from "../../shared/ui.jsx";
import { CheckCircle2, Handshake, ImageIcon, Loader2, Pencil, Plus, Trash2, UploadCloud, XCircle } from "lucide-react";
import { PARTNER_CATEGORY_LABELS, ROBIN_CITIES } from "../../shared/constants.js";
import React, { useState } from "react";
import { subAdminMutate } from "../../api/index.js";
import { prepareLogoFile } from "../../shared/utils.js";

function AdminPartnerManager({ partners, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preparingLogo, setPreparingLogo] = useState(false);
  const [err, setErr] = useState("");
  const cats = Object.keys(PARTNER_CATEGORY_LABELS);

  function blank() { return { name: "", category: "other", city: "", description: "", benefits: "", discount: "", contact_url: "", eligibility: "", logo_url: "", active: true }; }
  async function onLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPreparingLogo(true); setErr("");
    try {
      const dataUrl = await prepareLogoFile(file);
      setEditing((p) => ({ ...p, logo_data_url: dataUrl }));
    } catch (error) {
      setErr(error.message === "logo_too_large" ? "El logo original no puede superar 5 MB." : error.message === "invalid_logo_type" ? "Usa un archivo PNG, JPG o WebP." : (error.message || "No se pudo subir el logo."));
    } finally { setPreparingLogo(false); }
  }
  async function save() {
    if (!editing.name.trim()) { setErr("El nombre es obligatorio."); return; }
    setSaving(true); setErr("");
    try {
      await subAdminMutate("partner", editing.id ? "update" : "create", {
        id: editing.id, name: editing.name.trim(), category: editing.category || "other", city: editing.city || null,
        description: editing.description || null, benefits: editing.benefits || null, discount: editing.discount || null,
        contact_url: editing.contact_url || null, eligibility: editing.eligibility || null, logo_url: editing.logo_url || null,
        logo_data_url: editing.logo_data_url || null, active: editing.active !== false,
      });
      setEditing(null); await onChanged();
    } catch (e) { setErr(e.message || "No se pudo guardar."); }
    finally { setSaving(false); }
  }
  async function remove(p) { if (!window.confirm(`¿Eliminar "${p.name}"?`)) return; try { await subAdminMutate("partner", "delete", { id: p.id }); await onChanged(); } catch (_) {} }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Partners" subtitle="Directorio de partners y descuentos" icon={Handshake}
          right={<Btn size="sm" onClick={() => { setErr(""); setEditing(blank()); }}><Plus className="h-3.5 w-3.5" /> Nuevo</Btn>} />
      </Card>
      {editing && (
        <Card>
          <CardHeader title={editing.id ? "Editar partner" : "Nuevo partner"} icon={Pencil}
            right={<Btn size="sm" variant="ghost" onClick={() => setEditing(null)}><XCircle className="h-3.5 w-3.5" /> Cerrar</Btn>} />
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
                {(editing.logo_data_url || editing.logo_url) ? <img src={editing.logo_data_url || editing.logo_url} alt={`Logo de ${editing.name || "partner"}`} className="h-full w-full object-contain" /> : <ImageIcon className="h-7 w-7 text-slate-300" />}
              </div>
              <div className="space-y-2">
                <div><div className="text-sm font-semibold text-slate-800">Logotipo</div><div className="text-xs text-slate-500">PNG, JPG o WebP. Se conserva la proporción y se optimiza antes de subir.</div></div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                    {preparingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} {(editing.logo_data_url || editing.logo_url) ? "Cambiar logo" : "Subir logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogo} disabled={preparingLogo} />
                  </label>
                  {(editing.logo_data_url || editing.logo_url) && <Btn size="sm" variant="ghost" onClick={() => setEditing((p) => ({ ...p, logo_url: "", logo_data_url: "" }))}>Quitar</Btn>}
                </div>
                {editing.logo_data_url && <div className="text-xs text-slate-500">El logo se subirá al guardar el partner.</div>}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nombre" value={editing.name} onChange={(v) => setEditing((p) => ({ ...p, name: v }))} />
              <SelectField label="Categoría" allowEmpty={false} value={editing.category} onChange={(v) => setEditing((p) => ({ ...p, category: v }))}
                options={cats.map((c) => ({ value: c, label: PARTNER_CATEGORY_LABELS[c] }))} />
            </div>
            <SelectField label="Ciudad (vacío = Nacional)" value={editing.city} onChange={(v) => setEditing((p) => ({ ...p, city: v }))} options={ROBIN_CITIES} placeholder="Nacional (todas)" />
            <TextareaField label="Descripción" rows={2} value={editing.description} onChange={(v) => setEditing((p) => ({ ...p, description: v }))} />
            <Field label="Beneficios" value={editing.benefits} onChange={(v) => setEditing((p) => ({ ...p, benefits: v }))} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Descuento (texto)" value={editing.discount} onChange={(v) => setEditing((p) => ({ ...p, discount: v }))} />
              <Field label="URL de contacto" value={editing.contact_url} onChange={(v) => setEditing((p) => ({ ...p, contact_url: v }))} />
            </div>
            <Field label="Elegibilidad" value={editing.eligibility} onChange={(v) => setEditing((p) => ({ ...p, eligibility: v }))} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo
            </label>
            {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <Btn disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {partners.length === 0 && <div className="text-sm text-slate-400 px-2">No hay partners todavía.</div>}
        {partners.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-2">
              <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3">
                {p.logo_url ? <img src={p.logo_url} alt={`Logo de ${p.name}`} className="h-full w-full object-contain" /> : <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-200 font-semibold text-slate-500">{p.name.charAt(0).toUpperCase()}</div>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>{p.name}</div>
                {p.active === false && <Badge tone="slate">Oculto</Badge>}
              </div>
              <div className="text-xs text-slate-400">{PARTNER_CATEGORY_LABELS[p.category] || p.category} · {p.city || "Nacional"}</div>
              {p.discount && <div><Badge tone="gold">{p.discount}</Badge></div>}
              <div className="flex gap-2 pt-1">
                <Btn size="sm" variant="secondary" onClick={() => { setErr(""); setEditing({ ...p }); }}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /> Borrar</Btn>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { AdminPartnerManager };
