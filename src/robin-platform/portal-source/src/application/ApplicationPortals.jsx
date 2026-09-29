import React, { useMemo, useState, useEffect, useRef } from "react";
import "./student-portal.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, MessageCircle, Calendar, FileText, LayoutDashboard,
  LogOut, Shield, CheckCircle2, UploadCloud, Search,
  Users, Download, Eye, Plus, Trash2, ChevronRight,
  BookOpen, MapPin, CreditCard, Loader2, Mail, AlertCircle,
  ChevronLeft, Sparkles, RefreshCw, ExternalLink, GraduationCap, ChevronDown,
  Home, Building2, Briefcase, Plane, PartyPopper, Dumbbell,
  LifeBuoy, Settings, Star, Percent, Clock, PauseCircle, HelpCircle, Send,
  Tag, Wallet, Receipt, Handshake, CalendarCheck, XCircle, HeartHandshake,
  Compass, MessagesSquare, Pencil, Bell, Lock, X, ArrowUpRight, ArrowRight,
} from "lucide-react";
import robinWordmark from "../assets/robin-wordmark.png";
import robinKeys from "../assets/robin-keys.webp";
import robinGraduate from "../assets/robin-graduate.jpg";
import robinSkate from "../assets/robin-skate.png";
import robinBike from "../assets/robin-bike.jpg";
import financialConfig from "../../../shared/financial-config.js";
import { APP_STEPS } from "../application-steps.js";
import { uid } from "../browser-utils.js";
import { CREAM, GOLD, NAVY, NAVY_DARK } from "../theme.js";
import { Badge, Btn, Card, CardContent, CardHeader, Divider, Field, SelectField, TextareaField } from "../ui.jsx";
import { daysBetween, eur, PaymentStatusBadge, paymentTitle } from "./payments/payment-utils.jsx";
import { reportClientError, formatTime, formatDate } from "../client-utils.js";
import { KpiCard, NotificationPopup, Row } from "../shared/PortalWidgets.jsx";
import { CarrerasCliente, DocumentosCliente, PagosCliente } from "./ClientSections.jsx";
import { FaqsPage } from "./Faqs.jsx";
import {
  onboardingState, originSave, dniExtract, dniSave, profileSave, livedAbroadSave, contractSave, onboardingCheckout,
  paymentsList, paymentsCheckout, paymentsVerify, adminPaymentsList, adminPaymentsUnlock, adminPaymentsSetAmount, adminPaymentsSetCarreras, adminPaymentsAdd, adminPaymentsDelete,
  adminListClients, adminListAllClients, adminAssignClient,
  careersListMine, adminCareersListAll, adminCareersCreate, adminCareersDelete, adminCareersAssign, adminCareersUnassign,
  documentsList, documentsGet, documentsUpload, adminDocumentsList, adminDocumentsReview, adminDocumentsAdd, adminDocumentsDelete,
  adminPhaseSet, adminDashboard, adminTaskCreate, adminTaskToggle, adminTaskDelete,
  adminAssistant, adminHistorialAdd, bookingsList, bookingsCreate, bookingsAvailability,
  adminCareerSuggestions, adminCareerSuggestionsRegenerate,
  chatAiList, chatAiSend, adminChatList, adminChatSend, adminChatResume,
  adminNotificationsList, adminNotificationCreate, notificationsPending, notificationAck,
  profileAvatarUpload,
} from "../api.js";

const { APPLICATION_TOTALS, FISCAL: ROBIN_FISCAL } = financialConfig;

export function PortalShell({ user, clientName, onLogout, active, setActive, onUserRefresh }) {
  const [profilePhoto, setProfilePhoto] = useState(user.avatar_url || null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [mascot] = useState(() => [robinKeys, robinGraduate, robinSkate, robinBike][Math.floor(Math.random() * 4)]);
  const [summary, setSummary] = useState({ documents: null, bookings: null });
  useEffect(() => { setProfilePhoto(user.avatar_url || null); }, [user.avatar_url]);
  useEffect(() => {
    if (active !== "estado") return;
    let cancelled = false;
    Promise.allSettled([documentsList(), bookingsList()]).then(([docs, calls]) => {
      if (cancelled) return;
      setSummary({
        documents: docs.status === "fulfilled" ? (docs.value.documents || []).filter(d => ["required", "rejected"].includes(d.status)).length : null,
        bookings: calls.status === "fulfilled" ? (calls.value.bookings || []).filter(b => b.status !== "cancelled" && new Date(b.start_at) > new Date()).length : null,
      });
    });
    return () => { cancelled = true; };
  }, [active, user.id]);
  const navigation = [
    { key: "estado", label: "Mi camino", icon: LayoutDashboard },
    { key: "carreras", label: "Mis carreras", icon: BookOpen },
    { key: "documentos", label: "Documentos", icon: FileText },
    { key: "reservas", label: "Mis llamadas", icon: Calendar },
    { key: "pagos", label: "Pagos", icon: CreditCard },
    { key: "faqs", label: "FAQs", icon: HelpCircle },
    { key: "perfil", label: "Mi perfil", icon: User },
  ];

  function openFaqCitation(number) {
    const hash = `#faq-${number}`;
    try { window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${hash}`); }
    catch (_error) { window.location.hash = hash; }
    setActive("faqs");
  }

  async function changePhoto(file) {
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const result = await profileAvatarUpload(file);
      setProfilePhoto(result.avatar_url || null);
      await onUserRefresh?.();
    } catch (error) {
      setPhotoError(error.message || "No se pudo guardar la foto.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const intereses = (user.intereses || []).map((k) => {
    const map = {
      ciencias: "Ciencias", tecnologia_y_programacion: "Tecnología", business: "Business",
      ciencias_de_la_salud: "Salud", ingenierias: "Ingeniería", ciencias_sociales: "Sociales", artes: "Artes",
    };
    return map[k] || k;
  });

  return (
    <div className="student-portal">
      <NotificationPopup />
      <a className="student-skip" href="#student-content">Saltar al contenido</a>
      <header className="student-header">
        <button className="student-brand" onClick={() => setActive("estado")} aria-label="Robin, ir a Mi camino">
          <img src={robinWordmark} alt="ROBIN" />
          <span>Tu camino a Holanda</span>
        </button>
        <div className="student-header-account">
          <span className="student-header-name">Hola, {user.nombre || "Robin"}</span>
          <button className="student-signout" onClick={onLogout}><LogOut size={16} /><span>Salir</span></button>
        </div>
      </header>
      <div className="student-layout">
        <nav className="student-sidebar" aria-label="Navegación del alumno">
          <div className="student-identity">
            <div className="student-avatar">{profilePhoto ? <img src={profilePhoto} alt="Tu foto de perfil" /> : (clientName || "R").charAt(0).toUpperCase()}</div>
            <div><strong>{clientName}</strong><span>Estudiante Robin</span></div>
          </div>
          <p className="student-nav-caption">TU ESPACIO</p>
          <div className="student-nav-items">
            {navigation.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setActive(key)} aria-current={active === key ? "page" : undefined} className={`student-nav-item ${active === key ? "is-active" : ""}`}><Icon size={19} /><span>{label}</span>{active === key && <span className="student-nav-dot" />}</button>)}
          </div>
          <div className="student-support"><span className="student-eyebrow">VAMOS CONTIGO</span><h3>Un equipo detrás de cada paso.</h3><p>Habla con tu asesor y prepara lo que viene.</p><button onClick={() => setActive("reservas")}>Reservar una llamada <ArrowUpRight size={16} /></button></div>
        </nav>

        <AnimatePresence mode="wait">
          <motion.main key={active}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }} className="student-main" id="student-content" tabIndex={-1}>
            {active !== "estado" && <div className="student-page-heading"><h1 className="student-eyebrow student-page-title">{navigation.find(item => item.key === active)?.label || "Mi camino"}</h1></div>}

            {active === "estado" && (
              <Estado step={user.application_phase || 1} onNavigate={setActive} docsPendingCount={summary.documents} bookingsCount={summary.bookings} />
            )}
            {active === "perfil" && (
              <Perfil user={user} clientName={clientName} profilePhoto={profilePhoto} onPhotoChange={changePhoto} photoBusy={photoBusy} photoError={photoError} intereses={intereses} onUserRefresh={onUserRefresh} />
            )}
            {active === "carreras" && (
              <CarrerasCliente />
            )}
            {active === "documentos" && (
              <DocumentosCliente />
            )}
            {active === "reservas" && (
              <Reservas />
            )}
            {active === "pagos" && (
              <PagosCliente />
            )}
            {active === "faqs" && <FaqsPage />}

            <footer className="student-footer"><span>PROJECT ROBIN</span><span>The world is your campus.</span></footer>
          </motion.main>
        </AnimatePresence>
      </div>
      <StudentAssistant open={chatOpen} onOpenChange={setChatOpen} mascot={mascot} onOpenFaq={openFaqCitation} />
    </div>
  );
}

// =====================
//  ESTADO
// =====================
function StudentAssistant({ open, onOpenChange, mascot, onOpenFaq }) {
  const launcherRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const panel = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.querySelector('button')?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") { event.preventDefault(); onOpenChange(false); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), textarea, a[href]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; launcherRef.current?.focus(); };
  }, [open, onOpenChange]);
  return <>
    {open && <div className="student-chat-scrim" onClick={() => onOpenChange(false)} aria-hidden="true" />}
    <section ref={dialogRef} hidden={!open} className="student-chat-panel" role="dialog" aria-modal="true" aria-labelledby="robin-assistant-title">
      <header className="student-chat-header"><img src={mascot} alt="" /><div><h2 id="robin-assistant-title">Tu copiloto Robin</h2><p><span />Asistente IA · Tu asesor puede unirse</p></div><button onClick={() => onOpenChange(false)} aria-label="Cerrar asistente"><X size={20} /></button></header>
      <ChatIA active={open} mascot={mascot} onOpenFaq={(number) => { onOpenChange(false); onOpenFaq(number); }} />
    </section>
    <button ref={launcherRef} className="student-chat-launcher" onClick={() => onOpenChange(!open)} aria-label={open ? "Cerrar asistente Robin" : "Abrir asistente Robin"} aria-expanded={open} aria-haspopup="dialog" hidden={open}>
      <span className="student-chat-label"><strong>¿Te echamos una mano?</strong><span>Pregunta a Robin</span></span><span className="student-chat-mascot"><img src={mascot} alt="" /><span className="student-chat-spark"><Sparkles size={12} /></span></span>
    </button>
  </>;
}

function Estado({ step, onNavigate, docsPendingCount, bookingsCount }) {
  const current = APP_STEPS.find((s) => s.key === step);
  const pct = Math.round(((step - 1) / (APP_STEPS.length - 1)) * 100);

  return (
    <div className="space-y-5 student-overview">
      <div className="student-page-heading"><h1 className="student-eyebrow student-page-title">Mi camino</h1></div>
      <div className="student-progress-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-[0.07] pointer-events-none select-none">
          <div className="text-[140px] font-black text-white leading-none" style={{ fontFamily: "'Georgia', serif" }}>R</div>
        </div>
        <div className="relative">
          <div className="student-step-pill"><span />PASO {step} DE {APP_STEPS.length} · EN CURSO</div>
          <h2 className="text-white text-2xl font-bold mb-2">{current?.label}</h2>
          <div className="text-white/60 text-sm">{current?.desc}</div>
          <div className="mt-5">
            <div className="flex justify-between text-white/80 text-xs mb-2"><span>Tu progreso hasta el destino</span><strong>{pct}%</strong></div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: GOLD }}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: 0.1 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="student-quick-actions">
        {[
          { label: "Documentos pendientes", value: docsPendingCount ?? "—", hint: "Revisar mis documentos", key: "documentos", icon: FileText },
          { label: "Próximas llamadas", value: bookingsCount ?? "—", hint: "Ver disponibilidad", key: "reservas", icon: Calendar },
          { label: "Tu futuro académico", value: "Mis carreras", hint: "Explorar mis opciones", key: "carreras", icon: GraduationCap },
        ].map(({ label, value, hint, key, icon: Icon }) => (
          <button key={key} onClick={() => onNavigate(key)} className="student-quick-action"><span className="student-quick-icon"><Icon size={20} /></span><span className="student-quick-label">{label}</span><strong>{value}</strong><span className="student-quick-link">{hint}<ArrowUpRight size={16} /></span></button>
        ))}
      </div>

      <Card className="student-roadmap">
        <CardHeader title="Tu hoja de ruta" subtitle="Un paso a la vez. Nosotros te acompañamos." icon={Compass} />
        <CardContent className="space-y-2">
          {APP_STEPS.map((s) => {
            const done = s.key < step;
            const act = s.key === step;
            return (
              <div key={s.key} className={`student-roadmap-step flex items-center gap-4 rounded-xl border px-4 py-3 ${act ? "is-current" : ""}`} aria-current={act ? "step" : undefined}
                style={act ? { borderColor: NAVY, background: CREAM } : { borderColor: "#f1f5f9", background: "white" }}>
                <div className="h-8 w-8 rounded-full flex-shrink-0 grid place-items-center font-bold text-sm border-2"
                  style={done ? { background: "#10b981", borderColor: "#10b981", color: "white" }
                    : act ? { background: GOLD, borderColor: GOLD, color: "white" }
                    : { background: "white", borderColor: "#e2e8f0", color: "#94a3b8" }}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.key}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${act ? "text-slate-900" : done ? "text-slate-400 line-through" : "text-slate-500"}`}>{s.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>
                </div>
                {act && <span className="student-current-label">Estás aquí</span>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
//  PERFIL
// =====================
export function LivedAbroadCard({ value, editable, onSaved, userId }) {
  const COUNTRIES = ["UK", "US", "Francia", "otros"];
  const [lived, setLived] = useState(!!(value && value.lived_abroad));
  const [country, setCountry] = useState((value && value.lived_abroad_country) || "");
  const [other, setOther] = useState((value && value.lived_abroad_other) || "");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLived(!!(value && value.lived_abroad));
    setCountry((value && value.lived_abroad_country) || "");
    setOther((value && value.lived_abroad_other) || "");
  }, [value && value.lived_abroad, value && value.lived_abroad_country, value && value.lived_abroad_other, value && value.id]);

  const countryLabel = (c) => (c === "otros" ? "Otros" : c);

  async function save() {
    setError("");
    if (lived && !country) { setError("Indica el país."); return; }
    if (lived && country === "otros" && !other.trim()) { setError("Indica dónde."); return; }
    setBusy(true);
    try {
      const patch = {
        lived_abroad: lived,
        lived_abroad_country: lived ? country : null,
        lived_abroad_other: lived && country === "otros" ? other.trim() : null,
        lived_abroad_set: true,
      };
      const payload = { ...patch };
      if (userId) payload.user_id = userId;
      await livedAbroadSave(payload);
      setSavedAt(new Date());
      if (onSaved) await onSaved(patch);
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader title="Experiencia internacional" icon={MapPin}
        subtitle="¿Ha vivido fuera de España en alguno de los 3 últimos años?"
        right={savedAt && <span className="text-xs text-emerald-600">Guardado · {formatTime(savedAt)}</span>} />
      <CardContent className="space-y-4">
        {editable ? (
          <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={lived} onChange={(e) => setLived(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm text-slate-700">Ha vivido fuera de España en alguno de los 3 últimos años</span>
            </label>
            {lived && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">País</div>
                  <select value={country} onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <option value="">Selecciona…</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{countryLabel(c)}</option>)}
                  </select>
                </div>
                {country === "otros" && (
                  <Field label="¿Dónde?" value={other} onChange={setOther} />
                )}
              </div>
            )}
            {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</div>}
            <div className="flex justify-end">
              <Btn onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar</Btn>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-700">
            {value && value.lived_abroad
              ? <>Sí · {value.lived_abroad_country === "otros" ? (value.lived_abroad_other || "Otros") : (value.lived_abroad_country || "—")}</>
              : <>No ha vivido fuera de España en los últimos 3 años.</>}
            {value && value.lived_abroad_set && (
              <div className="text-xs text-slate-400 mt-2">Para modificarlo, contacta con tu asesor.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Perfil({ user, clientName, profilePhoto, onPhotoChange, photoBusy, photoError, intereses, onUserRefresh }) {
  const photoInputRef = useRef(null);
  return (
    <div className="space-y-5">
      <Card>
        <div className="relative h-24 rounded-t-2xl" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
          <div className="absolute bottom-0 left-6 translate-y-1/2">
            <div className="h-16 w-16 rounded-2xl border-4 border-white overflow-hidden shadow-lg bg-white grid place-items-center">
              {profilePhoto
                ? <img src={profilePhoto} alt="" className="h-full w-full object-cover" />
                : <span className="text-2xl font-bold" style={{ color: NAVY }}>{(clientName || "R").charAt(0).toUpperCase()}</span>}
            </div>
          </div>
          <div className="absolute bottom-3 right-4">
            <input ref={photoInputRef} aria-label="Seleccionar foto de perfil" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotoChange(f); e.target.value = ""; }} />
            <button type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()} className="text-xs text-white hover:text-white bg-white/10 rounded-lg px-3 py-2.5 transition cursor-pointer">
              {photoBusy ? <Loader2 className="h-3 w-3 inline mr-1 animate-spin" /> : <UploadCloud className="h-3 w-3 inline mr-1" />}
              {photoBusy ? "Guardando…" : "Cambiar foto"}
            </button>
          </div>
        </div>
        <div className="pt-12 px-6 pb-2">
          <div className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>{clientName}</div>
          <div className="text-sm text-slate-500">{user.email || user.username}</div>
        </div>
        {photoError && <div className="mx-6 mb-3 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{photoError}</div>}
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Nombre</div>
            <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{user.nombre || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Apellidos</div>
            <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{user.apellidos || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Email</div>
            <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{user.email || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Usuario</div>
            <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">{user.username || "—"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Áreas de interés</div>
            <div className="flex flex-wrap gap-2">
              {intereses.length === 0
                ? <span className="text-sm text-slate-400">Aún no has indicado intereses.</span>
                : intereses.map((it) => (
                    <span key={it} className="rounded-full px-3 py-1.5 text-xs font-medium border"
                      style={{ background: NAVY, color: "white", borderColor: NAVY }}>{it}</span>
                  ))}
            </div>
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">Tus datos de DNI están confirmados</span>
            <Badge tone="green">✓ Identidad verificada</Badge>
          </div>
        </CardContent>
      </Card>

      <LivedAbroadCard
        value={user}
        editable={!user.lived_abroad_set}
        onSaved={() => onUserRefresh && onUserRefresh()}
      />
    </div>
  );
}

// =====================
//  CARRERAS
// =====================
function Carreras({ templates, selectedIds, onSetSelected }) {
  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Mis carreras" subtitle="Marca las que estés considerando — tu asesor las verá en su panel" icon={BookOpen} />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-5">
            {templates.map((t) => {
              const sel = selectedSet.has(t.id);
              return (
                <button key={t.id} onClick={() => {
                  const ns = new Set(selectedIds);
                  if (ns.has(t.id)) ns.delete(t.id); else ns.add(t.id);
                  onSetSelected(Array.from(ns));
                }} className="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition"
                  style={sel ? { background: CREAM, borderColor: NAVY } : { background: "white", borderColor: "#e2e8f0" }}>
                  <div className="h-7 w-7 rounded-lg flex-shrink-0 grid place-items-center"
                    style={sel ? { background: NAVY, color: "white" } : { background: "#f8fafc", color: "#94a3b8" }}>
                    {sel ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                    <div className="text-xs text-slate-400 truncate">{t.university} · {t.city}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <Divider />
          <div className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">Tus carreras ({selectedIds.length})</div>
          {selectedIds.length === 0
            ? <div className="text-sm text-slate-400 text-center py-8">Aún no has seleccionado ninguna.</div>
            : <div className="space-y-2">
              {selectedIds.map((id) => {
                const t = templates.find((x) => x.id === id);
                if (!t) return null;
                return (
                  <div key={id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <div className="h-9 w-9 rounded-xl grid place-items-center flex-shrink-0" style={{ background: CREAM }}>
                      <BookOpen className="h-4 w-4" style={{ color: NAVY }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                      <div className="text-xs text-slate-400 truncate">{t.university} · <MapPin className="h-3 w-3 inline" /> {t.city}</div>
                    </div>
                    <Badge tone="green">Seleccionada</Badge>
                  </div>
                );
              })}
            </div>}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
//  DOCUMENTOS
// =====================
function Documentos({ requests, pending, done, uploadedDocs, onUpload, onView, onDownload }) {
  const [file, setFile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [selectedReqId, setSelectedReqId] = useState(null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Documentos pendientes" subtitle={`${pending.length} por subir`} icon={UploadCloud} />
          <CardContent className="space-y-3">
            <div className="space-y-2 pb-3 border-b border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subir documento</div>
              <label className="block cursor-pointer">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-100 transition">
                  {file ? `📎 ${file.name}` : "Haz clic para seleccionar archivo…"}
                </div>
                <input type="file" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
              </label>
              {file && (
                <>
                  <Field label="Nombre a mostrar (opcional)" value={displayName} onChange={setDisplayName} placeholder={file.name} />
                  {pending.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vincular a solicitud (opcional)</div>
                      <div className="flex flex-wrap gap-1">
                        {pending.map((r) => (
                          <button key={r.id} onClick={() => setSelectedReqId(selectedReqId === r.id ? null : r.id)}
                            className="rounded-lg px-2 py-1 text-xs font-medium border transition"
                            style={selectedReqId === r.id ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", borderColor: "#e2e8f0", color: "#475569" }}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <Btn size="sm" onClick={async () => {
                    const req = requests.find((r) => r.id === selectedReqId);
                    await onUpload({ requestId: selectedReqId, requestName: req?.name || displayName || file.name, displayName: displayName || file.name, file });
                    setFile(null); setDisplayName(""); setSelectedReqId(null);
                  }}>
                    <UploadCloud className="h-3.5 w-3.5" /> Subir documento
                  </Btn>
                </>
              )}
            </div>
            {pending.length === 0
              ? <div className="text-sm text-slate-400 text-center py-4">✅ Sin documentos pendientes</div>
              : pending.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                    <div className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString("es-ES")}</div>
                  </div>
                  <Badge tone={r.required ? "amber" : "slate"}>{r.required ? "Obligatorio" : "Opcional"}</Badge>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Carpeta de documentos" subtitle={`${uploadedDocs.length} archivo(s) subido(s)`} icon={FileText} />
          <CardContent>
            {uploadedDocs.length === 0
              ? <div className="text-sm text-slate-400 text-center py-8">Aún no hay archivos subidos.</div>
              : <div className="space-y-2">
                {uploadedDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.displayName || d.originalName}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {d.requestName ? `${d.requestName} · ` : ""}
                        {new Date(d.uploadedAt).toLocaleDateString("es-ES")}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Btn variant="secondary" size="sm" onClick={() => onView(d)}><Eye className="h-3.5 w-3.5" /></Btn>
                      <Btn variant="secondary" size="sm" onClick={() => onDownload(d)}><Download className="h-3.5 w-3.5" /></Btn>
                    </div>
                  </div>
                ))}
              </div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================
//  CHAT CON IA — ALUMNO  (habla con la IA; un asesor puede intervenir)
// =====================
function ChatIA({ active, mascot, onOpenFaq }) {
  const [messages, setMessages] = useState([]);
  const [aiPaused, setAiPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const scrollToEnd = () => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; };

  async function load(initial) {
    try {
      const r = await chatAiList();
      setMessages(r.messages || []);
      setAiPaused(!!r.ai_paused);
    } catch (e) {
      if (initial) setError("No se pudo cargar el chat.");
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    load(true);
    const t = setInterval(() => load(false), 15000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(scrollToEnd, [messages, loading]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError("");
    const optimistic = { id: "tmp_" + Date.now(), role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    try {
      const r = await chatAiSend(text);
      setMessages(r.messages || []);
      setAiPaused(!!r.ai_paused);
    } catch (e) {
      setMessages((m) => m.filter(item => item.id !== optimistic.id));
      setDraft(text);
      setError("No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="student-chat-body">
        {aiPaused && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            style={{ background: "#FFF7E6", borderColor: "#F5C97B", color: "#8a5a00" }}>
            <Shield className="h-4 w-4 flex-shrink-0" /> Tu asesor/a está atendiendo esta conversación en persona.
          </div>
        )}
        <div ref={scrollRef} className="student-chat-messages" role="log" aria-label="Conversación con Robin" aria-live="polite" aria-busy={loading}>
          {loading && <div className="text-sm text-slate-400 text-center py-8 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>}
          {!loading && messages.length === 0 && (
            <div className="student-chat-welcome"><img src={mascot} alt="La mascota de Robin" /><span className="student-eyebrow">UN POCO DE AYUDA, UN GRAN PASO</span><h3>¡Hola! Soy tu copiloto.</h3><p>Pregúntame sobre tu proceso, documentos o la vida universitaria.</p><div>{["¿Qué documentos necesito?", "¿Cómo preparo mi llegada?"].map(question => <button key={question} onClick={() => setDraft(question)}>{question}<ArrowUpRight size={15} /></button>)}</div></div>
          )}
          {messages.map((m) => {
            const mine = m.role === "user";
            const isAdvisor = m.role === "advisor";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  <div className="h-7 w-7 rounded-full flex-shrink-0 mr-2 grid place-items-center text-white"
                    style={{ background: isAdvisor ? "#0F6E56" : NAVY }}>
                    {isAdvisor ? <Shield className="h-3.5 w-3.5" /> : <img src={mascot} alt="" className="h-7 w-7 rounded-full object-contain bg-white" />}
                  </div>
                )}
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words min-w-0"
                  style={mine ? { background: NAVY, color: "white" } : { background: "white", color: "#1e293b", border: "1px solid #e2e8f0" }}>
                  {!mine && <div className="text-[11px] font-semibold mb-0.5" style={{ color: isAdvisor ? "#0F6E56" : NAVY }}>{isAdvisor ? "Tu asesor/a" : "Asistente IA"}</div>}
                  <div>{m.content}</div>
                  {!mine && !isAdvisor && m.faq_citations?.length > 0 && <div className="student-chat-faq-links">{m.faq_citations.map(citation => <button key={citation.number} onClick={() => onOpenFaq(citation.number)} title={citation.question}>FAQ {citation.number}<ArrowRight size={12} /></button>)}</div>}
                  <div className={`text-[11px] mt-1 ${mine ? "text-white/50" : "text-slate-400"}`}>{formatTime(new Date(m.created_at))}</div>
                </div>
              </div>
            );
          })}
          {sending && <div className="student-chat-typing" role="status"><Loader2 size={14} className="animate-spin" />{aiPaused ? "Enviando a tu asesor…" : "Robin está pensando…"}</div>}
        </div>
        {error && <div className="student-chat-error" role="alert">{error}</div>}
        <div className="student-chat-compose">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            rows={2} placeholder="Escribe tu pregunta…" aria-label="Tu mensaje para Robin"
            className="flex-1 min-w-0 resize-none" />
          <button onClick={send} disabled={!draft.trim() || sending || loading} aria-label="Enviar mensaje">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="student-chat-disclaimer">Robin usa IA y puede equivocarse. Confirma lo importante con tu asesor.</p>
    </div>
  );
}

// =====================
//  CHAT CON IA — ASESOR  (ve la conversación del alumno con la IA e interviene)
// =====================
export function AdminChatIA({ client }) {
  const [messages, setMessages] = useState([]);
  const [aiPaused, setAiPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const scrollToEnd = () => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; };

  async function load(initial) {
    try {
      const r = await adminChatList(client.id);
      setMessages(r.messages || []);
      setAiPaused(!!r.ai_paused);
    } catch (e) {
      if (initial) setError("No se pudo cargar la conversación.");
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load(true);
    const t = setInterval(() => load(false), 15000);
    return () => clearInterval(t);
  }, [client.id]);
  useEffect(scrollToEnd, [messages, loading]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError("");
    setDraft("");
    try {
      const r = await adminChatSend(client.id, text);
      setMessages(r.messages || []);
      setAiPaused(!!r.ai_paused);
    } catch (e) {
      setError("No se pudo enviar el mensaje.");
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await adminChatResume(client.id);
      setMessages(r.messages || []);
      setAiPaused(!!r.ai_paused);
    } catch (e) {
      setError("No se pudo devolver el control a la IA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={`Chat IA · ${client.nombre || ""} ${client.apellidos || ""}`.trim()}
        subtitle="Lees la conversación del alumno con la IA. Si escribes, la IA se pausa y atiendes tú." icon={Sparkles} />
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
          style={aiPaused
            ? { background: "#FFF7E6", borderColor: "#F5C97B", color: "#8a5a00" }
            : { background: "#EAF7F1", borderColor: "#9FE1CB", color: "#0F6E56" }}>
          <span className="flex items-center gap-2">
            {aiPaused ? <PauseCircle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {aiPaused ? "La IA está en pausa: le respondes tú al alumno." : "La IA está atendiendo al alumno automáticamente."}
          </span>
          {aiPaused && (
            <Btn size="sm" variant="secondary" onClick={resume} disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" /> Devolver a la IA
            </Btn>
          )}
        </div>
        <div ref={scrollRef} className="h-96 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3 mb-4">
          {loading && <div className="text-sm text-slate-400 text-center py-8 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>}
          {!loading && messages.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-8">El alumno aún no ha escrito nada.</div>
          )}
          {messages.map((m) => {
            const mine = m.role === "advisor";     // perspectiva del asesor
            const isStudent = m.role === "user";
            const label = mine ? "Tú (asesor)" : isStudent ? `${client.nombre || "Alumno"}` : "Asistente IA";
            const avatarBg = mine ? "#0F6E56" : isStudent ? NAVY : "#534AB7";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  <div className="h-7 w-7 rounded-full flex-shrink-0 mr-2 grid place-items-center text-white text-xs font-bold" style={{ background: avatarBg }}>
                    {isStudent ? (client.nombre || "A").charAt(0).toUpperCase() : <Sparkles className="h-3.5 w-3.5" />}
                  </div>
                )}
                <div className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
                  style={mine ? { background: "#0F6E56", color: "white" } : { background: "white", color: "#1e293b", border: "1px solid #e2e8f0" }}>
                  {!mine && <div className="text-[11px] font-semibold mb-0.5" style={{ color: isStudent ? NAVY : "#534AB7" }}>{label}</div>}
                  <div>{m.content}</div>
                  <div className={`text-[11px] mt-1 ${mine ? "text-white/50" : "text-slate-400"}`}>{formatTime(new Date(m.created_at))}</div>
                </div>
              </div>
            );
          })}
        </div>
        {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
        <div className="flex gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2} placeholder="Escribe para intervenir (esto pausa la IA)… (Enter para enviar)"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white transition resize-none" />
          <Btn onClick={send} disabled={!draft.trim() || busy} className="self-end">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Btn>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================
//  CHAT
// =====================
function Reservas() {
  const [serverBookings, setServerBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastCreated, setLastCreated] = useState(null);

  // Disponibilidad real del asesor (Google Calendar free/busy)
  const [avDays, setAvDays] = useState([]);
  const [avLoading, setAvLoading] = useState(true);
  const [advisorName, setAdvisorName] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [slotMin, setSlotMin] = useState(30);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await bookingsList();
        if (!cancel) setServerBookings(res.bookings || []);
      } catch (e) {
        if (!cancel) setError(e.message || "No se pudieron cargar las reservas.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setAvLoading(true);
      try {
        const res = await bookingsAvailability({ days: 14 });
        if (cancel) return;
        const days = res.days || [];
        setAvDays(days);
        setAdvisorName(res.advisor || "");
        setCalendarConnected(res.calendar_connected !== false);
        if (res.slot_min) setSlotMin(res.slot_min);
        const firstWithSlots = days.find((d) => (d.slots || []).length > 0);
        setSelectedDate((prev) => prev || (firstWithSlots ? firstWithSlots.date : (days[0] ? days[0].date : "")));
      } catch (e) {
        if (!cancel) setAvDays([]);
      } finally {
        if (!cancel) setAvLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [refreshKey]);

  async function reserve() {
    setError("");
    if (!selectedSlot) { setError("Selecciona un hueco disponible."); return; }
    setBusy(true);
    try {
      const res = await bookingsCreate({ start_at: selectedSlot, duration_min: slotMin });
      setLastCreated(res.booking || null);
      setSelectedSlot("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message || "No se pudo crear la reserva.");
    } finally {
      setBusy(false);
    }
  }

  const upcoming = serverBookings.filter((b) => b.status !== "cancelled")
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const dayObj = avDays.find((d) => d.date === selectedDate) || null;
  const daySlots = dayObj ? (dayObj.slots || []) : [];
  const fmtDayBtn = (dstr) => {
    const dd = new Date(dstr + "T12:00:00");
    return {
      wd: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(dd),
      dm: new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(dd),
    };
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Reservar llamada" subtitle={advisorName ? ("Con tu asesor " + advisorName + " · vía Google Meet") : "Con tu asesor Robin · vía Google Meet"} icon={Calendar} />
        <CardContent>
          {avLoading && <div className="text-xs text-slate-500 mb-3">Cargando disponibilidad…</div>}
          {!avLoading && !calendarConnected && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Mostrando horario orientativo. Confirmaremos el hueco con tu asesor.
            </div>
          )}

          {!avLoading && avDays.length > 0 && (
            <>
              <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Día</div>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {avDays.map((d) => {
                  const f = fmtDayBtn(d.date);
                  const has = (d.slots || []).length > 0;
                  const sel = d.date === selectedDate;
                  return (
                    <button key={d.date} type="button" disabled={!has}
                      onClick={() => { setSelectedDate(d.date); setSelectedSlot(""); }}
                      className={"flex-shrink-0 rounded-xl border px-3 py-2 text-center min-w-[68px] " + (sel ? "border-transparent text-white" : has ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300" : "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed")}
                      style={sel ? { background: NAVY } : undefined}>
                      <div className="text-[10px] uppercase tracking-wide">{f.wd}</div>
                      <div className="text-sm font-semibold">{f.dm}</div>
                    </button>
                  );
                })}
              </div>

              <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Hora ({slotMin} min)</div>
              {daySlots.length === 0 ? (
                <div className="text-xs text-slate-500 mb-4">Sin huecos disponibles este día.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {daySlots.map((sl) => {
                    const sel = sl.start === selectedSlot;
                    return (
                      <button key={sl.start} type="button"
                        onClick={() => setSelectedSlot(sl.start)}
                        className={"rounded-lg border px-2 py-2 text-sm font-medium " + (sel ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")}
                        style={sel ? { background: NAVY } : undefined}>
                        {sl.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!avLoading && avDays.length === 0 && (
            <div className="text-xs text-slate-500 mb-4">No hay disponibilidad para mostrar ahora mismo.</div>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</div>
          )}
          <div className="flex items-center gap-3">
            <Btn variant="primary" onClick={reserve} disabled={busy || !selectedSlot}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reservando…</> : <><Calendar className="h-3.5 w-3.5" /> Reservar Meet</>}
            </Btn>
            <div className="text-[11px] text-slate-400">Zona horaria Europe/Madrid · te llegará un email con el enlace.</div>
          </div>

          {lastCreated && (
            <div className="mt-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
              <div className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> ¡Reserva creada!
              </div>
              {lastCreated.meet_join_url && (
                <div className="mt-2">
                  <a href={lastCreated.meet_join_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold underline" style={{ color: NAVY }}>
                    Abrir Google Meet
                  </a>
                </div>
              )}
              {lastCreated.start_at && (
                <div className="text-xs text-slate-600 mt-1">
                  {new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(lastCreated.start_at))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Llamadas confirmadas" subtitle={`${upcoming.length} reserva(s)`} icon={Calendar} />
        <CardContent className="space-y-2">
          {loading && <div className="text-xs text-slate-500">Cargando…</div>}
          {!loading && upcoming.length === 0 && (
            <div className="text-xs text-slate-500">Aún no tienes llamadas reservadas.</div>
          )}
          {upcoming.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(b.start_at))} · {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(b.start_at))}
                </div>
                <div className="text-xs text-slate-400 truncate">{b.topic} · {b.duration_min} min</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {b.meet_join_url && (
                  <a href={b.meet_join_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold underline" style={{ color: NAVY }}>
                    Entrar
                  </a>
                )}
                <Badge tone="green">Confirmada</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
//  ADMIN — HOOK debounce
// =====================
