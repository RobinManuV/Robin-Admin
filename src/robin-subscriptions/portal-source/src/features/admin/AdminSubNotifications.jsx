import { Bell, Loader2, Search, Send, Trash2 } from "lucide-react";
import { Btn, Card, CardContent, CardHeader, Field, TextareaField } from "../../shared/ui.jsx";
import { NAVY } from "../../shared/theme.js";
import React, { useState } from "react";
import { formatDate } from "../../shared/utils.js";
import { subAdminMutate } from "../../api/index.js";

function AdminSubNotifications({ notifications = [], users = [], onChanged }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState("all"); // all | select
  const [selected, setSelected] = useState(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const filtered = users.filter((u) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(t);
  });
  function toggle(id) { setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function submit() {
    setErr(""); setMsg("");
    if (!title.trim()) { setErr("Añade un título."); return; }
    if (!content.trim()) { setErr("Añade un contenido."); return; }
    if (scope === "select" && selected.size === 0) { setErr("Selecciona al menos un suscriptor."); return; }
    setBusy(true);
    try {
      const payload = scope === "all"
        ? { title: title.trim(), content: content.trim(), all: true }
        : { title: title.trim(), content: content.trim(), user_ids: Array.from(selected) };
      const r = await subAdminMutate("notification", "create", payload);
      setMsg(`Notificación enviada a ${r.recipients} suscriptor(es). Aparecerá al iniciar sesión.`);
      setTitle(""); setContent(""); setSelected(new Set()); setScope("all");
      await onChanged();
    } catch (e) { setErr(e.message || "No se pudo enviar la notificación."); }
    finally { setBusy(false); }
  }
  async function remove(n) { if (!window.confirm(`¿Eliminar la notificación "${n.title}"?`)) return; try { await subAdminMutate("notification", "delete", { id: n.id }); await onChanged(); } catch (_) {} }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Nueva notificación" subtitle="Aparece como pop-up informativo al suscriptor la próxima vez que inicie sesión" icon={Bell} />
        <CardContent className="space-y-4">
          <Field label="Título" value={title} onChange={setTitle} placeholder="p. ej. Nueva actividad disponible" />
          <TextareaField label="Contenido" value={content} onChange={setContent} rows={4} placeholder="Escribe el mensaje que verá el suscriptor…" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Destinatarios</div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                <button type="button" onClick={() => setScope("all")} className="px-3 py-1 rounded-md text-xs font-medium transition"
                  style={scope === "all" ? { background: NAVY, color: "white" } : { color: "#475569" }}>Todos</button>
                <button type="button" onClick={() => setScope("select")} className="px-3 py-1 rounded-md text-xs font-medium transition"
                  style={scope === "select" ? { background: NAVY, color: "white" } : { color: "#475569" }}>Seleccionar</button>
              </div>
            </div>
            {scope === "all" ? (
              <div className="text-xs text-slate-500">Se enviará a todos los suscriptores ({users.length}).</div>
            ) : (
              <div className="rounded-xl border border-slate-100 p-2">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar suscriptor…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:bg-white transition" />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filtered.length === 0 && <div className="text-xs text-slate-400 px-2 py-1">Sin suscriptores.</div>}
                  {filtered.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                      <span className="text-sm text-slate-700 truncate">{u.name || u.email}</span>
                      {u.email && <span className="text-xs text-slate-400 truncate">· {u.email}</span>}
                    </label>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 px-1">{selected.size} seleccionado(s)</div>
              </div>
            )}
          </div>
          {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{err}</div>}
          {msg && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{msg}</div>}
          <Btn disabled={busy} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar notificación</Btn>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Notificaciones enviadas" subtitle="Vistas por los suscriptores" icon={Bell} />
        <CardContent className="space-y-2">
          {notifications.length === 0 && <div className="text-sm text-slate-400 px-2">Todavía no has enviado notificaciones.</div>}
          {notifications.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{n.title}</div>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap mt-0.5">{n.content}</div>
                  <div className="text-xs text-slate-400 mt-1.5">{formatDate(n.created_at)} · Vistas {n.seen}/{n.total}</div>
                </div>
                <Btn size="sm" variant="danger" onClick={() => remove(n)}><Trash2 className="h-3.5 w-3.5" /></Btn>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export { AdminSubNotifications };
