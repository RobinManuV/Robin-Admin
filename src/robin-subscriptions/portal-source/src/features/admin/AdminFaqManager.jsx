import React, { useEffect, useState } from "react";
import { HelpCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { adminFaqMutate, faqsList } from "../../api/index.js";
import { Badge, Btn, Card, CardContent, CardHeader, Field, TextareaField } from "../../shared/ui.jsx";

function AdminFaqManager() {
  const blank = { question: '', answer: '', category: 'General', published: true, sort_order: 0 };
  const [faqs, setFaqs] = useState([]), [editing, setEditing] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load() { setLoading(true); setError(''); try { const r = await faqsList(); setFaqs(r.faqs || []); } catch (e) { setError(e.message || 'No se pudieron cargar las FAQs.'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function save() { if (!editing?.question.trim() || !editing?.answer.trim()) return; setBusy(true); try { await adminFaqMutate(editing.id ? 'update' : 'create', editing); setEditing(null); await load(); } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setBusy(false); } }
  async function remove(id) { if (!window.confirm('¿Eliminar esta pregunta?')) return; setBusy(true); try { await adminFaqMutate('delete', { id }); await load(); } catch (e) { setError(e.message || 'No se pudo eliminar.'); } finally { setBusy(false); } }
  return <div className="space-y-5"><div className="flex justify-end"><Btn onClick={() => setEditing(blank)}><Plus size={16} />Nueva pregunta</Btn></div>
    {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {editing && <Card><CardHeader title={editing.id ? 'Editar pregunta' : 'Nueva pregunta'} icon={HelpCircle} /><CardContent className="space-y-4"><Field label="Pregunta" value={editing.question} onChange={v => setEditing(p => ({...p, question:v}))} /><TextareaField label="Respuesta" value={editing.answer} onChange={v => setEditing(p => ({...p, answer:v}))} rows={6} /><div className="grid gap-3 md:grid-cols-2"><Field label="Categoría" value={editing.category} onChange={v => setEditing(p => ({...p, category:v}))} /><Field label="Orden" type="number" value={String(editing.sort_order ?? 0)} onChange={v => setEditing(p => ({...p, sort_order:Number(v)}))} /></div><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={editing.published !== false} onChange={e => setEditing(p => ({...p, published:e.target.checked}))} />Visible para suscriptores</label><div className="flex gap-2"><Btn onClick={save} disabled={busy || !editing.question.trim() || !editing.answer.trim()}>{busy && <Loader2 size={15} className="animate-spin" />}Guardar</Btn><Btn variant="secondary" onClick={() => setEditing(null)}>Cancelar</Btn></div></CardContent></Card>}
    {loading ? <div className="dashboard-loader" role="status"><span className="dashboard-loader-icon"><Loader2 /></span><span>Cargando dashboard…</span></div> : <div className="space-y-3">{faqs.map(f => <Card key={f.id}><CardContent className="flex items-start justify-between gap-4"><div><div className="mb-2 flex gap-2"><Badge tone="gold">{f.category}</Badge>{!f.published && <Badge>Oculta</Badge>}<Badge>Orden {f.sort_order}</Badge></div><h3 className="font-semibold text-slate-900">{f.question}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{f.answer}</p></div><div className="flex shrink-0 gap-1"><Btn size="sm" variant="secondary" onClick={() => setEditing({...f})}><Pencil size={14} /></Btn><Btn size="sm" variant="danger" onClick={() => remove(f.id)}><Trash2 size={14} /></Btn></div></CardContent></Card>)}</div>}
  </div>;
}
export { AdminFaqManager };
