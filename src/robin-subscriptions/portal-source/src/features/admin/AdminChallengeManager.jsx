import { Badge, Btn, Card, CardContent, CardHeader, Field, TextareaField } from "../../shared/ui.jsx";
import { CheckCircle2, Clock, Download, Loader2, Pencil, Plus, Sparkles, Trash2, UploadCloud, XCircle } from "lucide-react";
import { NAVY } from "../../shared/theme.js";
import React, { useState } from "react";
import { fileToDataUrl } from "../community/fileToDataUrl.js";
import { formatDate, uid } from "../../shared/utils.js";
import { subAdminMutate } from "../../api/index.js";

function AdminChallengeManager({ challenges = [], submissions = [], onChanged }) {
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [newQ, setNewQ] = useState("");

  function blank() { return { title: "", description: "", advance_days: 7, files: [], questions: [], active: true, sort_order: 0 }; }
  function startEdit(c) { setErr(""); setNewQ(""); setEditing(c ? { ...c, files: c.files || [], questions: c.questions || [] } : blank()); }

  async function onPickFiles(e) {
    const list = Array.from(e.target.files || []); e.target.value = "";
    const out = [];
    for (const f of list) { if (f.size > 2_000_000) { setErr(`"${f.name}" supera 2 MB.`); continue; } try { out.push({ name: f.name, data_url: await fileToDataUrl(f) }); } catch (_) {} }
    setEditing((p) => ({ ...p, files: [...(p.files || []), ...out] }));
  }
  function addQuestion() { const q = newQ.trim(); if (!q) return; setEditing((p) => ({ ...p, questions: [...(p.questions || []), { id: uid("q"), q }] })); setNewQ(""); }

  async function save() {
    if (!editing.title.trim()) { setErr("El título es obligatorio."); return; }
    setSaving(true); setErr("");
    try {
      await subAdminMutate("challenge", editing.id ? "update" : "create", {
        id: editing.id, title: editing.title.trim(), description: editing.description || null,
        advance_days: Number(editing.advance_days) || 0, files: editing.files || [], questions: editing.questions || [],
        active: editing.active !== false, sort_order: Number(editing.sort_order) || 0,
      });
      setEditing(null); await onChanged();
    } catch (e) { setErr(e.message || "No se pudo guardar."); } finally { setSaving(false); }
  }
  async function remove(c) { if (!window.confirm(`¿Eliminar el reto "${c.title}"? Se borrarán también sus entregas.`)) return; try { await subAdminMutate("challenge", "delete", { id: c.id }); await onChanged(); } catch (_) {} }

  const pending = submissions.filter((s) => s.status === "pending");
  const others = submissions.filter((s) => s.status !== "pending");
  const chById = {}; challenges.forEach((c) => { chById[c.id] = c; });
  async function validate(sm, status) {
    let note = null;
    if (status === "rejected") { note = window.prompt("Motivo del rechazo (opcional):") || null; }
    try { await subAdminMutate("submission", "update", { id: sm.id, status, note }); await onChanged(); } catch (_) {}
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Retos" subtitle="Crea retos que adelantan días al validarse" icon={Sparkles}
          right={<Btn size="sm" onClick={() => startEdit(null)}><Plus className="h-3.5 w-3.5" /> Nuevo reto</Btn>} />
        {editing && (
          <CardContent className="space-y-3 border-t border-slate-100">
            <Field label="Título" value={editing.title} onChange={(v) => setEditing((p) => ({ ...p, title: v }))} placeholder="p. ej. Completa tu perfil" />
            <TextareaField label="Descripción" rows={3} value={editing.description} onChange={(v) => setEditing((p) => ({ ...p, description: v }))} placeholder="Explica qué debe hacer el suscriptor…" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Días de adelanto" type="number" value={String(editing.advance_days)} onChange={(v) => setEditing((p) => ({ ...p, advance_days: v }))} placeholder="7" />
              <Field label="Orden" type="number" value={String(editing.sort_order)} onChange={(v) => setEditing((p) => ({ ...p, sort_order: v }))} placeholder="0" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Archivos descargables</div>
              {(editing.files || []).length > 0 && (
                <div className="space-y-1 mb-2">
                  {editing.files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <span className="truncate text-slate-700">{f.name}</span>
                      <button type="button" onClick={() => setEditing((p) => ({ ...p, files: p.files.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-rose-600"><XCircle className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white" style={{ background: NAVY }}>
                <UploadCloud className="h-3.5 w-3.5" /> Subir archivo <input type="file" multiple className="hidden" onChange={onPickFiles} />
              </label>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Cuestionario</div>
              {(editing.questions || []).length > 0 && (
                <div className="space-y-1 mb-2">
                  {editing.questions.map((qq, i) => (
                    <div key={qq.id || i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                      <span className="truncate text-slate-700">{qq.q}</span>
                      <button type="button" onClick={() => setEditing((p) => ({ ...p, questions: p.questions.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-rose-600"><XCircle className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuestion(); } }}
                  placeholder="Añade una pregunta…" className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:bg-white transition" />
                <Btn size="sm" variant="secondary" onClick={addQuestion}><Plus className="h-3.5 w-3.5" /></Btn>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))} /> Activo (visible para suscriptores)
            </label>
            {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
            <div className="flex gap-2">
              <Btn disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </CardContent>
        )}
        <CardContent className="space-y-2">
          {challenges.length === 0 && <div className="text-sm text-slate-400 px-2">No hay retos todavía.</div>}
          {challenges.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900">{c.title}</span>
                  <Badge tone="gold">+{c.advance_days} días</Badge>
                  {c.active === false && <Badge tone="slate">Oculto</Badge>}
                </div>
                <div className="text-xs text-slate-400 mt-1">{(c.questions || []).length} pregunta(s) · {(c.files || []).length} archivo(s)</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Btn size="sm" variant="secondary" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></Btn>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Validaciones pendientes" subtitle={`${pending.length} entrega(s) por revisar`} icon={CheckCircle2} />
        <CardContent className="space-y-3">
          {pending.length === 0 && <div className="text-sm text-slate-400 px-1">No hay entregas pendientes.</div>}
          {pending.map((sm) => (
            <div key={sm.id} className="rounded-xl border border-slate-100 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold text-slate-900">{sm.user_name || "Suscriptor"} · <span className="text-slate-600 font-normal">{sm.challenge_title}</span></div>
                <div className="text-xs text-slate-400">{formatDate(sm.created_at)}</div>
              </div>
              {sm.answers && Object.keys(sm.answers).length > 0 && (
                <div className="space-y-1.5">
                  {(chById[sm.challenge_id] && chById[sm.challenge_id].questions || []).map((qq) => (
                    <div key={qq.id} className="text-sm"><span className="text-slate-500">{qq.q}:</span> <span className="text-slate-800">{sm.answers[qq.id] || "—"}</span></div>
                  ))}
                </div>
              )}
              {(sm.files || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sm.files.map((f, i) => (
                    <a key={i} href={f.data_url} download={f.name} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> {f.name}</a>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Btn size="sm" onClick={() => validate(sm, "validated")}><CheckCircle2 className="h-3.5 w-3.5" /> Validar (+{(chById[sm.challenge_id] || {}).advance_days || 0} días)</Btn>
                <Btn size="sm" variant="danger" onClick={() => validate(sm, "rejected")}><XCircle className="h-3.5 w-3.5" /> Rechazar</Btn>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader title="Historial de entregas" subtitle="Validadas y rechazadas" icon={Clock} />
          <CardContent className="space-y-2">
            {others.map((sm) => (
              <div key={sm.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{sm.user_name} · <span className="font-normal text-slate-600">{sm.challenge_title}</span></div>
                  <div className="text-xs text-slate-400">{formatDate(sm.validated_at || sm.created_at)}</div></div>
                {sm.status === "validated" ? <Badge tone="green">Validada</Badge> : <Badge tone="rose">Rechazada</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { AdminChallengeManager };
