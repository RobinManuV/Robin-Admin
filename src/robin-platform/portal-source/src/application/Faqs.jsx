import React, { useEffect, useMemo, useState } from "react";
import { HelpCircle, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { faqsList, adminFaqMutate } from "../api.js";
import { Badge, Btn, Card, CardContent, CardHeader, Field, TextareaField } from "../ui.jsx";

export function FaqsPage() {
  const [faqs, setFaqs] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState('');
  useEffect(() => { faqsList().then(r => setFaqs(r.faqs || [])).catch(e => setError(e.message || 'No se pudieron cargar las FAQs.')).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (loading || !faqs.length || typeof window === 'undefined' || !window.location.hash.startsWith('#faq-')) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    });
  }, [loading, faqs]);
  const visible = useMemo(() => { const q = query.trim().toLowerCase(); return q ? faqs.filter(f => `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(q)) : faqs; }, [faqs, query]);
  return <div className="space-y-5">
    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"><Search size={18} className="text-slate-400" /><input className="w-full bg-transparent text-sm outline-none" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar una pregunta…" /></label>
    {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Cargando preguntas…</p>}
    {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {!loading && !error && visible.length === 0 && <Card><CardContent><p className="text-sm text-slate-500">{faqs.length ? 'No hay resultados para esa búsqueda.' : 'Todavía no hay preguntas publicadas.'}</p></CardContent></Card>}
    <div className="space-y-3">{visible.map(f => <article id={f.builtin ? `faq-${f.sort_order}` : `faq-custom-${f.id}`} key={f.id} tabIndex={0} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg focus-visible:-translate-y-0.5 focus-visible:border-amber-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200/50 target:border-amber-400 target:ring-4 target:ring-amber-200/50"><small className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-amber-600">{f.category}</small><h2 className="text-sm font-semibold leading-6 text-slate-900">{f.question}</h2><p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-7 text-slate-600">{f.answer}</p></article>)}</div>
  </div>;
}

export function AdminFaqManager() {
  const blank = { question: '', answer: '', category: 'General', published: true, sort_order: 0 };
  const [faqs, setFaqs] = useState([]), [editing, setEditing] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load() { setLoading(true); setError(''); try { const r = await faqsList(); setFaqs(r.faqs || []); } catch (e) { setError(e.message || 'No se pudieron cargar las FAQs.'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function save() { if (!editing?.question.trim() || !editing?.answer.trim()) return; setBusy(true); setError(''); try { await adminFaqMutate(editing.id ? 'update' : 'create', editing); setEditing(null); await load(); } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setBusy(false); } }
  async function remove(id) { if (!window.confirm('¿Eliminar esta pregunta?')) return; setBusy(true); try { await adminFaqMutate('delete', { id }); await load(); } catch (e) { setError(e.message || 'No se pudo eliminar.'); } finally { setBusy(false); } }
  return <div className="space-y-5">
    <div className="flex justify-end"><Btn onClick={() => setEditing(blank)}><Plus size={16} />Nueva pregunta</Btn></div>
    {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    {editing && <Card><CardHeader title={editing.id ? 'Editar pregunta' : 'Nueva pregunta'} icon={HelpCircle} /><CardContent className="space-y-4"><Field label="Pregunta" value={editing.question} onChange={v => setEditing(p => ({...p, question:v}))} /><TextareaField label="Respuesta" value={editing.answer} onChange={v => setEditing(p => ({...p, answer:v}))} rows={6} /><div className="grid gap-3 md:grid-cols-2"><Field label="Categoría" value={editing.category} onChange={v => setEditing(p => ({...p, category:v}))} /><Field label="Orden" type="number" value={String(editing.sort_order ?? 0)} onChange={v => setEditing(p => ({...p, sort_order:Number(v)}))} /></div><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={editing.published !== false} onChange={e => setEditing(p => ({...p, published:e.target.checked}))} />Visible para alumnos</label><div className="flex gap-2"><Btn onClick={save} disabled={busy || !editing.question.trim() || !editing.answer.trim()}>{busy && <Loader2 size={15} className="animate-spin" />}Guardar</Btn><Btn variant="secondary" onClick={() => setEditing(null)}>Cancelar</Btn></div></CardContent></Card>}
    {loading ? <p className="text-sm text-slate-500">Cargando…</p> : <div className="space-y-3">{faqs.map(f => <Card key={f.id}><CardContent className="flex items-start justify-between gap-4"><div><div className="mb-2 flex flex-wrap gap-2"><Badge tone="gold">{f.category}</Badge>{f.builtin && <Badge>Base Robin</Badge>}{!f.published && <Badge>Oculta</Badge>}<Badge>Orden {f.sort_order}</Badge></div><h3 className="font-semibold text-slate-900">{f.question}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{f.answer}</p></div>{!f.builtin && <div className="flex shrink-0 gap-1"><Btn size="sm" variant="secondary" onClick={() => setEditing({...f})}><Pencil size={14} /></Btn><Btn size="sm" variant="danger" onClick={() => remove(f.id)}><Trash2 size={14} /></Btn></div>}</CardContent></Card>)}</div>}
  </div>;
}
