import React, { useMemo, useState, useEffect, useRef, useReducer } from "react";
import { AdminWorkspace } from "./AdminWorkspace.jsx";
import { AdminFaqManager } from "./Faqs.jsx";
import { adminNavigation, INITIAL_ADMIN_NAVIGATION } from "./admin-navigation.js";
import robinKeys from "../assets/robin-keys.webp";
import robinGraduate from "../assets/robin-graduate.jpg";
import robinSkate from "../assets/robin-skate.png";
import robinBike from "../assets/robin-bike.jpg";
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
  Compass, MessagesSquare, Pencil, Bell, Lock,
} from "lucide-react";
import financialConfig from "../../../shared/financial-config.js";
import { APP_STEPS } from "../application-steps.js";
import { fileToDataURL, uid } from "../browser-utils.js";
import { CREAM, GOLD, NAVY, NAVY_DARK } from "../theme.js";
import { Badge, Btn, Card, CardContent, CardHeader, Divider, Field, SelectField, TextareaField } from "../ui.jsx";
import { daysBetween, eur, PaymentStatusBadge, paymentTitle } from "./payments/payment-utils.jsx";
import { Factura } from "./payments/InvoiceReceipt.jsx";
import { APP_PHASE_LABELS, buildDefaultDocs, newCareerRequirement, normalizeCareerRequirement, statusLabel } from "./documents/document-utils.js";
import { CareerRequirementsTimeline } from "./careers/CareerRequirementsTimeline.jsx";
import { reportClientError, formatTime, formatDate } from "../client-utils.js";
import { KpiCard, NotificationPopup, Row } from "../shared/PortalWidgets.jsx";
import {
  onboardingState, originSave, dniExtract, dniSave, profileSave, livedAbroadSave, contractSave, onboardingCheckout,
  paymentsList, paymentsCheckout, paymentsVerify, adminPaymentsList, adminPaymentsUnlock, adminPaymentsSetAmount, adminPaymentsSetCarreras, adminPaymentsAdd, adminPaymentsDelete,
  adminListClients, adminListAllClients, adminAssignClient,
  careersListMine, adminCareersListAll, adminCareersCreate, adminCareersDelete, adminCareersAssign, adminCareersUnassign,
  documentsList, documentsGet, documentsUpload, adminDocumentsList, adminDocumentsReview, adminDocumentsAdd, adminDocumentsDelete,
  adminPhaseSet, adminDashboard, adminTaskCreate, adminTaskToggle, adminTaskDelete,
  adminAssistant, adminHistorialAdd, bookingsList, bookingsCreate, bookingsAvailability,
  adminCareerSuggestions, adminCareerSuggestionsRegenerate, adminCareerSuggestionFeedback,
  chatAiList, chatAiSend, adminChatList, adminChatSend, adminChatResume,
  adminNotificationsList, adminNotificationCreate, notificationsPending, notificationAck,
} from "../api.js";

const { APPLICATION_TOTALS, FISCAL: ROBIN_FISCAL } = financialConfig;

import { AdminChatIA, LivedAbroadCard } from "./ApplicationPortals.jsx";

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}


function normalizeAdminClient(apiClient, adminId) {
  return {
    ...apiClient,
    nombre: apiClient.nombre || "",
    apellidos: apiClient.apellidos || "",
    direccion: apiClient.direccion || "",
    fecha_nacimiento: apiClient.fecha_nacimiento || "",
    dni_numero: apiClient.dni_numero || "",
    telefono_alumno: apiClient.telefono_alumno || "",
    intereses: apiClient.intereses || [],
    assignedTo: apiClient.assigned_to || adminId,
  };
}

// =====================
//  ADMIN — INICIO (Dashboard) · v1
//  Filtra SIEMPRE por adminId (clientes asignados). NO modifica fases ni datos.
// =====================
function AdminDashboard({ user, onOpenClient, onOpenAssign, onGotoTab }) {
  const adminId = (user.email || user.username || "").toLowerCase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [alertSort, setAlertSort] = useState("urgency"); // 'urgency' | 'name' | 'days'
  const [taskTitle, setTaskTitle] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await adminDashboard();
        if (!cancel) setData(res);
      } catch (e) {
        if (!cancel) setError(e.message || "No se pudo cargar el dashboard.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [refreshKey, adminId]);

  const clients   = (data && data.clients)   || [];
  const payments  = (data && data.payments)  || [];
  const documents = (data && data.documents) || [];
  const activity  = (data && data.activity)  || [];
  const tasks     = (data && data.tasks)     || [];
  const team      = (data && data.team)      || [];
  const onboardingClients = clients.filter((c) => c.requires_onboarding);
  const upcomingBookings = useMemo(() => {
    const arr = (data && data.bookings) || [];
    const now = Date.now() - 30 * 60_000; // tolerancia 30 min hacia atrás
    return arr.filter((b) => b.status !== "cancelled" && new Date(b.start_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }, [data]);

  // ----- Derivados -----
  const phaseCounts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    clients.forEach((cl) => { const p = cl.application_phase || 1; if (c[p] != null) c[p] += 1; });
    return c;
  }, [clients]);

  const avgPhaseDays = useMemo(() => {
    const sums = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    const cnts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    clients.forEach((cl) => {
      const p = cl.application_phase || 1;
      if (cl.days_in_phase != null) { sums[p] += cl.days_in_phase; cnts[p] += 1; }
    });
    const out = {};
    [1,2,3,4,5,6,7,8,9].forEach((k) => { out[k] = cnts[k] ? Math.round(sums[k] / cnts[k]) : null; });
    return out;
  }, [clients]);

  const bottleneck = useMemo(() => {
    let max = -1, key = null;
    Object.entries(phaseCounts).forEach(([k, v]) => { if (v > max) { max = v; key = Number(k); } });
    return max > 0 ? key : null;
  }, [phaseCounts]);

  // Financial
  const fin = useMemo(() => {
    const total     = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const collected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending   = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const clientsWithPayments = new Set(payments.map((p) => p.user_id)).size || 1;
    const pct = total > 0 ? Math.round((collected / total) * 1000) / 10 : 0;
    return { total, collected, pending, pct, avgPerClient: Math.round(total / clientsWithPayments) };
  }, [payments]);

  // Alerts
  const alerts = useMemo(() => {
    const out = [];
    // Fuegos: fase 3 (Upload de documentos) >14 días
    clients.forEach((c) => {
      if (c.application_phase === 3 && (c.days_in_phase || 0) > 14) {
        out.push({
          kind: "fuego",
          urgency: 100 + (c.days_in_phase - 14),
          client: c,
          label: `${c.days_in_phase}d en "Entrega de documentos"`,
        });
      }
    });
    // Impagos: cuotas unlocked >7 días sin pagar
    const now = Date.now();
    payments.forEach((p) => {
      if (p.status === "unlocked" && p.unlocked_at) {
        const d = Math.floor((now - new Date(p.unlocked_at).getTime()) / 86400000);
        if (d > 7) {
          const c = clients.find((cl) => cl.id === p.user_id);
          if (c) out.push({
            kind: "impago",
            urgency: 90 + d,
            client: c,
            label: `Cuota ${p.installment} pendiente · ${d}d (${Number(p.amount).toFixed(0)}€)`,
          });
        }
      }
    });
    // Docs requeridos
    const docsByUser = {};
    documents.forEach((d) => {
      if (d.status === "required" && d.required) {
        docsByUser[d.user_id] = (docsByUser[d.user_id] || 0) + 1;
      }
    });
    Object.entries(docsByUser).forEach(([uid, count]) => {
      const c = clients.find((cl) => cl.id === uid);
      if (c) out.push({
        kind: "docs",
        urgency: 60 + count,
        client: c,
        label: `${count} doc(s) requerido(s) pendiente(s)`,
      });
    });
    // Próximos plazos: fase 4 (Waiting decision) > 30 días
    clients.forEach((c) => {
      if (c.application_phase === 4 && (c.days_in_phase || 0) > 30) {
        out.push({
          kind: "deadline",
          urgency: 40 + Math.floor((c.days_in_phase - 30) / 5),
          client: c,
          label: `${c.days_in_phase}d en "Esperando resultados"`,
        });
      }
    });
    // Ordenar
    if (alertSort === "name") {
      out.sort((a, b) => (a.client.nombre || "").localeCompare(b.client.nombre || ""));
    } else if (alertSort === "days") {
      out.sort((a, b) => (b.client.days_in_phase || 0) - (a.client.days_in_phase || 0));
    } else {
      out.sort((a, b) => b.urgency - a.urgency);
    }
    return out;
  }, [clients, payments, documents, alertSort]);

  // Client mgmt
  const mgmt = useMemo(() => {
    const now = Date.now();
    const ms7  = 7  * 86400000;
    const ms30 = 30 * 86400000;
    const new7  = clients.filter((c) => c.created_at && (now - new Date(c.created_at).getTime()) <= ms7).length;
    const new30 = clients.filter((c) => c.created_at && (now - new Date(c.created_at).getTime()) <= ms30).length;
    const inactive = clients.filter((c) => c.updated_at && (now - new Date(c.updated_at).getTime()) > ms30).length;
    const highPriority = alerts.filter((a) => a.kind === "fuego" || a.kind === "impago")
      .reduce((acc, a) => { acc[a.client.id] = true; return acc; }, {});
    return {
      total: clients.length,
      new7, new30, inactive,
      highPriority: Object.keys(highPriority).length,
    };
  }, [clients, alerts]);

  // ----- Acciones quick -----
  async function quickAddTask() {
    const t = taskTitle.trim();
    if (!t) return;
    setTaskBusy(true);
    try {
      await adminTaskCreate({ title: t });
      setTaskTitle("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert("Error creando tarea: " + (e.message || ""));
    } finally {
      setTaskBusy(false);
    }
  }
  async function toggleTask(id) {
    try { await adminTaskToggle(id); setRefreshKey((k) => k + 1); }
    catch (e) { alert("Error: " + (e.message || "")); }
  }
  async function delTask(id) {
    if (!confirm("¿Eliminar tarea?")) return;
    try { await adminTaskDelete(id); setRefreshKey((k) => k + 1); }
    catch (e) { alert("Error: " + (e.message || "")); }
  }

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando dashboard…
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="text-rose-700 text-sm">
          <AlertCircle className="h-4 w-4 inline-block mr-2" /> {error}
          <div className="mt-3">
            <Btn size="sm" variant="secondary" onClick={() => setRefreshKey((k) => k + 1)}>Reintentar</Btn>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ───── TOP: KPIs ───── */}
      <div className="admin-dashboard-kpis grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Clientes activos" value={mgmt.total} tone="navy"
          sub={`+${mgmt.new7} en 7d · +${mgmt.new30} en 30d`} />
        <KpiCard icon={AlertCircle} label="Requieren atención" value={mgmt.highPriority} tone="rose"
          sub={alerts.filter(a => a.kind==="fuego" || a.kind==="impago").length + " alertas críticas"} />
        <KpiCard icon={CreditCard} label="Cobrado" value={`${Math.round(fin.collected)}€`} tone="gold"
          sub={`${fin.pct}% de ${Math.round(fin.total)}€`} />
        <KpiCard icon={LayoutDashboard} label="Cuello de botella" value={bottleneck ? `Fase ${bottleneck}` : "—"}
          tone="slate" sub={bottleneck ? (APP_PHASE_LABELS.find(p=>p.key===bottleneck)?.label || "") : "Sin datos"} />
      </div>

      {/* ───── MIDDLE: Alerts (left) · Pipeline (center) · Activity+Tasks (right) ───── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr_1fr] gap-5">
        {/* ALERTS */}
        <Card>
          <CardHeader title="Alertas / Prioridades" icon={AlertCircle}
            subtitle={`${alerts.length} elemento(s)`}
            right={
              <select value={alertSort} onChange={(e) => setAlertSort(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1">
                <option value="urgency">Urgencia</option>
                <option value="days">Días en fase</option>
                <option value="name">Nombre</option>
              </select>
            } />
          <CardContent className="space-y-2 max-h-[480px] overflow-auto">
            {alerts.length === 0 && <div className="text-xs text-slate-500">Sin alertas. ¡Buen trabajo!</div>}
            {alerts.map((a, i) => {
              const AlertIcon = a.kind === "impago" ? Receipt : a.kind === "docs" ? FileText : a.kind === "deadline" ? Clock : AlertCircle;
              return <button key={i}
                onClick={() => onOpenClient && onOpenClient(a.client)}
                className="admin-alert-row w-full text-left rounded-xl border border-slate-200 hover:border-slate-300 bg-white px-3 py-2.5 flex items-center gap-3 transition">
                <span className={`admin-alert-icon is-${a.kind}`}><AlertIcon size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {a.client.nombre || a.client.email || a.client.lead_id || "—"} {a.client.apellidos || ""}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{a.label}</div>
                </div>
                <Badge tone={a.kind==="fuego" ? "rose" : a.kind==="impago" ? "amber" : a.kind==="docs" ? "blue" : "slate"}>
                  {a.kind==="fuego" ? "Fuego" : a.kind==="impago" ? "Impago" : a.kind==="docs" ? "Docs" : "Plazo"}
                </Badge>
              </button>;
            })}
          </CardContent>
        </Card>

        {/* PIPELINE */}
        <Card>
          <CardHeader title="Mapa de progreso" icon={LayoutDashboard} subtitle="Clientes por fase" />
          <CardContent className="space-y-2.5">
            {APP_PHASE_LABELS.map((p) => {
              const count = phaseCounts[p.key] || 0;
              const max = Math.max(1, ...Object.values(phaseCounts));
              const pct = Math.round((count / max) * 100);
              const isBottleneck = bottleneck === p.key && count > 0;
              const avg = avgPhaseDays[p.key];
              return (
                <div key={p.key} className="rounded-xl border border-slate-200 px-3 py-2.5 bg-white">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Fase {p.key}</div>
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.label}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {avg != null && <span className="text-[11px] text-slate-500">⌀ {avg}d</span>}
                      {isBottleneck && <Badge tone="amber">Cuello</Badge>}
                      <Badge tone="navy">{count}</Badge>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: isBottleneck ? GOLD : NAVY }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ONBOARDING + ACTIVITY */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Clientes onboarding" icon={Users} subtitle={`${onboardingClients.length} sin terminar`} />
            <CardContent className="space-y-2 max-h-[320px] overflow-auto">
              {onboardingClients.length === 0 && <div className="text-xs text-slate-500">Nadie en onboarding ahora mismo.</div>}
              {onboardingClients.map((c) => {
                const nm = [c.nombre, c.apellidos].filter(Boolean).join(" ") || c.email || c.lead_id || "—";
                const step = !c.dni_completed ? "DNI" : !c.profile_completed ? "Perfil" : !c.pago_completed ? "Pago" : "Onboarding";
                const days = c.created_at ? Math.max(0, Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000)) : null;
                return (
                  <button key={c.id}
                    onClick={() => onOpenClient && onOpenClient(c)}
                    className="w-full text-left rounded-xl border border-slate-200 hover:border-slate-300 bg-white px-3 py-2.5 flex items-center gap-3 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{nm}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {days != null ? `${days}d en onboarding` : "En onboarding"}{c.lead_id ? ` · ${c.lead_id}` : ""}
                      </div>
                    </div>
                    <Badge tone="amber">{step}</Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Actividad reciente" icon={MessageCircle} subtitle="Últimos 40 eventos" />
            <CardContent className="space-y-2 max-h-[300px] overflow-auto">
              {activity.length === 0 && <div className="text-xs text-slate-500">Sin actividad reciente.</div>}
              {activity.map((ev, i) => {
                const cl = clients.find((c) => c.id === ev.user_id);
                return (
                  <button key={i}
                    onClick={() => cl && onOpenClient && onOpenClient(cl)}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-slate-50 flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full mt-2 flex-shrink-0"
                      style={{ background:
                        ev.type==="document_upload"   ? "#0ea5e9" :
                        ev.type==="document_validate" ? "#10b981" :
                        ev.type==="document_reject"   ? "#f43f5e" :
                        ev.type==="payment_paid"      ? "#10b981" :
                        ev.type==="payment_unlock"    ? "#f59e0b" :
                        "#94a3b8" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-700 truncate">
                        <span className="font-semibold">{ev.title}</span>
                        {cl && <span className="text-slate-500"> · {cl.nombre || cl.email}</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {ev.detail} · {new Date(ev.at).toLocaleDateString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ───── PRÓXIMAS LLAMADAS ───── */}
      {/* Bookings dashboard card v1 */}
      <Card>
        <CardHeader title="Próximas llamadas" icon={Calendar} subtitle={`${upcomingBookings.length} reserva(s) con tus alumnos`} />
        <CardContent className="space-y-2">
          {upcomingBookings.length === 0 && (
            <div className="text-xs text-slate-500">Ningún alumno tuyo ha reservado llamada todavía.</div>
          )}
          {upcomingBookings.map((b) => {
            const cl = clients.find((c) => c.id === b.user_id);
            const when = new Date(b.start_at);
            return (
              <button key={b.id} onClick={() => cl && onOpenClient && onOpenClient(cl)}
                className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white px-3 py-2.5 transition">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {cl ? `${cl.nombre || ""} ${cl.apellidos || ""}`.trim() : (b.topic || "Alumno")}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "2-digit", month: "long" }).format(when)} · {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(when)} · {b.duration_min} min
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {b.meet_join_url && (
                    <a href={b.meet_join_url} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold underline" style={{ color: NAVY }}>
                      Entrar
                    </a>
                  )}
                  <Badge tone="green">Confirmada</Badge>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* ───── QUICK ACTIONS ───── */}
      <Card>
        <CardHeader title="Acciones rápidas" icon={Plus} />
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="primary" onClick={onOpenAssign}>
              <Plus className="h-3.5 w-3.5" /> Añadir cliente
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => { setTaskTitle("Nueva tarea"); }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Crear tarea
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => onGotoTab && onGotoTab("clientes")}>
              <Users className="h-3.5 w-3.5" /> Ver lista clientes
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setRefreshKey((k) => k + 1)}>
              <Loader2 className="h-3.5 w-3.5" /> Recargar
            </Btn>
          </div>
        </CardContent>
      </Card>

      {/* ───── BOTTOM: detailed metrics ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Financial detail */}
        <Card>
          <CardHeader title="Resumen financiero" icon={CreditCard} />
          <CardContent className="space-y-2 text-sm">
            <Row label="Total generado"   value={`${Math.round(fin.total)} €`} />
            <Row label="Cobrado"          value={`${Math.round(fin.collected)} €`} tone="green" />
            <Row label="Pendiente"        value={`${Math.round(fin.pending)} €`} tone="amber" />
            <Row label="% cobrado"        value={`${fin.pct}%`} />
            <Row label="Media por cliente" value={`${fin.avgPerClient} €`} />
          </CardContent>
        </Card>

        {/* Client mgmt detail */}
        <Card>
          <CardHeader title="Gestión de clientes" icon={Users} />
          <CardContent className="space-y-2 text-sm">
            <Row label="Activos"             value={mgmt.total} />
            <Row label="Nuevos (7 días)"     value={mgmt.new7} tone="green" />
            <Row label="Nuevos (30 días)"    value={mgmt.new30} tone="green" />
            <Row label="Inactivos (>30d)"    value={mgmt.inactive} tone="amber" />
            <Row label="Alta prioridad"      value={mgmt.highPriority} tone="rose" />
          </CardContent>
        </Card>

        {/* Team productivity */}
        <Card>
          <CardHeader title="Productividad del equipo" icon={Shield} />
          <CardContent className="space-y-2 text-sm">
            {team.length === 0 && <div className="text-xs text-slate-500">Sin datos de equipo.</div>}
            {team.map((t) => (
              <div key={t.email} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <div className="text-sm font-medium text-slate-700 truncate">{t.email}</div>
                <Badge tone={t.email===adminId ? "navy" : "slate"}>{t.clientCount} cliente(s)</Badge>
              </div>
            ))}
            <Divider />
            <Row label="Tareas abiertas (tú)" value={tasks.filter(t=>t.status==="open").length} />
            <Row label="Tareas completadas (tú)" value={tasks.filter(t=>t.status==="done").length} tone="green" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================
//  ADMIN — CHAT ASSISTANT (floating bottom-left)
//  Filtra por admin (backend hace assigned_to=email). Expandible.
// =====================
function AdminChatAssistant({ user, activeClientId, clients, mascot }) {
  const [mode, setMode] = useState("closed"); // 'closed' | 'panel' | 'full'
  const [messages, setMessages] = useState(() => [
    { role: "assistant", content: "Hola 👋 Soy el asistente de tu panel. Pregúntame por un alumno (\"¿En qué fase está Lucía?\"), pagos, documentos, carreras, o dudas sobre universidades en Holanda. También puedes pegar notas de una reunión y las añadiré al historial." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesUserId, setNotesUserId] = useState(activeClientId || "");
  const [notesTitle, setNotesTitle] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const scrollRef = useRef(null);
  const panelRef = useRef(null);
  const launcherRef = useRef(null);
  const focusedClient = clients.find(c => c.id === activeClientId);
  const contextLabel = focusedClient ? `${focusedClient.nombre} ${focusedClient.apellidos || ""} · ID: ${focusedClient.lead_id || focusedClient.id}` : "Vista general · Tus clientes asignados";
  useEffect(() => {
    if (mode === "closed") return;
    panelRef.current?.querySelector("button")?.focus();
    function escape(event) { if (event.key === "Escape") setMode("closed"); }
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); launcherRef.current?.focus(); };
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, mode]);

  async function send() {
    const t = draft.trim();
    if (!t || busy) return;
    setError("");
    const next = [...messages, { role: "user", content: t }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await adminAssistant(next.map((m) => ({ role: m.role, content: m.content })), activeClientId || null);
      setMessages([...next, { role: "assistant", content: res.reply || "Sin respuesta." }]);
    } catch (e) {
      setError(e.message || "Error en la IA.");
      setMessages([...next, { role: "assistant", content: "(error al contactar el asistente)" }]);
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!notesUserId || !notesText.trim()) {
      setError("Selecciona alumno y pega notas.");
      return;
    }
    setNotesBusy(true); setError("");
    try {
      const res = await adminHistorialAdd({
        user_id: notesUserId,
        raw_notes: notesText,
        meeting_title: notesTitle || "Reunión",
        meeting_date: new Date().toISOString().slice(0, 10),
      });
      setNotesText(""); setNotesTitle("");
      setNotesOpen(false);
      setMessages((m) => [
        ...m,
        { role: "user", content: `(Pegué notas de reunión para ${(clients.find(c=>c.id===notesUserId) || {}).nombre || "alumno"})` },
        { role: "assistant", content: "Historial actualizado ✅\n\n" + (res.historial || "").slice(0, 600) + ((res.historial || "").length > 600 ? "…" : "") },
      ]);
    } catch (e) {
      setError(e.message || "Error guardando historial.");
    } finally {
      setNotesBusy(false);
    }
  }

  // ---------- COLLAPSED ----------
  if (mode === "closed") {
    return (
      <button ref={launcherRef} aria-label="Abrir asistente del equipo" aria-haspopup="dialog"
        onClick={() => setMode("panel")}
        className="admin-assistant-launcher">
        <span>Tu copiloto de equipo</span><img src={mascot} alt="" />
      </button>
    );
  }

  const isFull = mode === "full";
  const panelClass = isFull
    ? "fixed inset-4 z-50"
    : "fixed bottom-5 left-5 z-40 w-[400px] max-w-[95vw] h-[560px] max-h-[80vh]";

  return (
    <div ref={panelRef} role="dialog" aria-label="Asistente del equipo Robin" className={`${panelClass} ${isFull ? "" : "admin-assistant-panel"}`}>
      <div className="h-full w-full bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 text-white" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
          <img src={mascot} alt="" className="h-9 w-9 rounded-full bg-white object-contain p-1" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Copiloto del equipo</div>
            <div className="text-[11px] text-white/80 break-words">
              {contextLabel}
            </div>
          </div>
          <button onClick={() => setNotesOpen((v) => !v)}
            title="Pegar notas de reunión"
            className="text-white/80 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-white/10">
            <UploadCloud className="h-3.5 w-3.5 inline-block mr-1" /> Notas
          </button>
          <button onClick={() => setMode(isFull ? "panel" : "full")}
            title={isFull ? "Reducir" : "Expandir"}
            className="text-white/80 hover:text-white text-xs px-1.5 py-1 rounded-md hover:bg-white/10">
            {isFull ? "⤢" : "⤡"}
          </button>
          <button onClick={() => setMode("closed")} aria-label="Cerrar asistente del equipo" className="text-white/80 hover:text-white text-xs px-1.5 py-1 rounded-md hover:bg-white/10">✕</button>
        </div>

        {/* Notas panel */}
        {notesOpen && (
          <div className="px-3 py-2 border-b border-slate-100 bg-amber-50/40 space-y-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-800">Añadir notas de reunión</div>
            <select aria-label="Alumno destinatario de las notas" disabled={!!activeClientId} value={notesUserId} onChange={(e) => setNotesUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              <option value="">— Selecciona alumno —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} {c.apellidos} · {c.email}</option>
              ))}
            </select>
            <input value={notesTitle} onChange={(e) => setNotesTitle(e.target.value)}
              placeholder="Título / contexto (ej. 'Sesión orientación carreras')"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
            <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={4}
              placeholder="Pega aquí el resumen o la transcripción de la reunión…"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs resize-none" />
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="primary" onClick={saveNotes} disabled={notesBusy || !notesUserId || !notesText.trim()}>
                {notesBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Resumir y añadir al historial
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setNotesOpen(false); setNotesText(""); }}>Cancelar</Btn>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.role === "user" ? "text-white" : "bg-white border border-slate-200 text-slate-800"
                }`}
                style={m.role === "user" ? { background: NAVY } : {}}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
              </div>
            </div>
          )}
        </div>

        {error && <div className="px-3 py-1.5 text-[11px] text-rose-700 bg-rose-50 border-t border-rose-100">{error}</div>}

        {/* Input */}
        <div className="border-t border-slate-200 p-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            aria-label="Mensaje al asistente del equipo" placeholder="Pregunta por un alumno, pago, documento…"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white"
          />
          <Btn size="sm" variant="primary" onClick={send} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />} Enviar
          </Btn>
        </div>
      </div>
    </div>
  );
}

// =====================
//  ADMIN — PORTAL SHELL
// =====================
export function AdminPortal({ user, onLogout, embedded = false }) {
  const adminId = (user.email || user.username || "").toLowerCase();
  const adminName = (user.nombre ? `${user.nombre} ${user.apellidos || ""}` : (user.email || user.username)).trim();
  const [data, setData] = useState({ clients: [] });
  const [{ active, selectedClientId }, dispatchNavigation] = useReducer(adminNavigation, INITIAL_ADMIN_NAVIGATION);
  const [mascot] = useState(() => [robinKeys, robinGraduate, robinSkate, robinBike][Math.floor(Math.random() * 4)]);
  const [searchQ, setSearchQ] = useState("");
  const debouncedQ = useDebounced(searchQ, 250);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Cargar clientes reales desde la API: filtra por admin (Notion -> assigned_to)
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingClients(true); setLoadError("");
      try {
        const res = await adminListClients();
        if (cancel) return;
        const fromApi = (res.clients || []).map((c) => normalizeAdminClient(c, adminId));
        setData((prev) => ({ ...prev, clients: fromApi }));
      } catch (e) {
        if (cancel) return;
        // Limpiar lista para no mostrar contadores erróneos
        setData((prev) => ({ ...prev, clients: [] }));
        setLoadError(e.status === 401 || e.status === 403 ? "" : (e.message || "No se pudo cargar la lista de clientes."));
      } finally {
        if (!cancel) setLoadingClients(false);
      }
    })();
    return () => { cancel = true; };
  }, [adminId]);

  useEffect(() => {
    try { localStorage.removeItem(`pr_admin_v1_${adminId}`); } catch (error) { reportClientError("optional_operation", error); }
  }, [adminId]);
  const selectedClient = useMemo(
    () => (data.clients || []).find((c) => c.id === selectedClientId) || null,
    [data.clients, selectedClientId]
  );

  function updateClient(clientId, mut) {
    setData((d) => ({
      ...d,
      clients: (d.clients || []).map((c) => (c.id === clientId ? { ...mut(c), updatedAt: new Date().toISOString() } : c)),
    }));
  }

  function selectClient(c) {
    dispatchNavigation({ type: "open", clientId: c.id });
  }

  function navigate(section) {
    dispatchNavigation({ type: "navigate", section });
  }

  useEffect(() => {
    if (!embedded) return undefined;
    const handleExternalNavigation = (event) => {
      const section = event.detail?.section;
      if (section) dispatchNavigation({ type: "navigate", section });
    };
    window.addEventListener("robin:portal-navigate", handleExternalNavigation);
    return () => window.removeEventListener("robin:portal-navigate", handleExternalNavigation);
  }, [embedded]);

  useEffect(() => {
    if (!embedded) return;
    const section = ["estado", "perfil", "carreras", "documentos", "pagos", "chat", "reservas"].includes(active) ? "clientes" : active;
    window.dispatchEvent(new CustomEvent("robin:portal-state", { detail: { section } }));
  }, [active, embedded]);

  function switchClient(client) {
    dispatchNavigation({ type: "switch", clientId: client.id });
  }

  // ----- Asignación manual -----
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignList, setAssignList] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignBusyId, setAssignBusyId] = useState(null);

  async function reloadAssigned() {
    try {
      const res = await adminListClients();
      const fromApi = (res.clients || []).map((c) => normalizeAdminClient(c, adminId));
      setData((prev) => ({ ...prev, clients: fromApi }));
    } catch (error) { reportClientError("optional_operation", error); }
  }
  async function openAssignModal() {
    setAssignOpen(true); setAssignLoading(true); setAssignError("");
    try {
      const res = await adminListAllClients();
      setAssignList(res.clients || []);
    } catch (e) {
      setAssignError(e.message || "No se pudo cargar la lista de clientes.");
    } finally {
      setAssignLoading(false);
    }
  }
  async function doAssign(userId) {
    setAssignBusyId(userId); setAssignError("");
    try {
      await adminAssignClient(userId);
      // Refrescar lista del modal y la lista principal
      const res = await adminListAllClients();
      setAssignList(res.clients || []);
      await reloadAssigned();
    } catch (e) {
      setAssignError(e.message || "No se pudo asignar.");
    } finally {
      setAssignBusyId(null);
    }
  }

  // Filter (debounce)
  const visibleClients = useMemo(() => {
    const q = (debouncedQ || "").trim().toLowerCase();
    const list = data.clients || [];
    if (!q) return list;
    return list.filter((c) => {
      const hay = `${c.nombre || ""} ${c.apellidos || ""} ${c.email || ""} ${c.username || ""} ${c.lead_id || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data.clients, debouncedQ]);

  return (
    <AdminWorkspace embedded={embedded} adminName={adminName} active={active} client={selectedClient} clients={data.clients || []}
      loading={loadingClients} error={loadError} onNavigate={navigate} onSwitchClient={switchClient} onLogout={onLogout}>

          <main key={active + (selectedClient?.id || "list")}
            className="admin-content space-y-5 min-w-0" id="admin-content" tabIndex={-1}>

            {active === "inicio" && (
              <AdminDashboard
                user={user}
                onOpenClient={(c) => selectClient(c)}
                onOpenAssign={openAssignModal}
                onGotoTab={navigate}
              />
            )}

            {active === "clientes" && (
              <AdminClientesList
                clients={visibleClients}
                totalCount={(data.clients || []).length}
                searchQ={searchQ}
                onSearch={setSearchQ}
                onSelect={selectClient}
                loading={loadingClients}
                loadError={loadError}
                onOpenAssign={openAssignModal}
              />
            )}

            {active === "estado" && selectedClient && (
              <AdminEstadoFases client={selectedClient} onChangedPhase={(n) => updateClient(selectedClient.id, (c) => ({ ...c, application_phase: n }))} />
            )}
            {active === "perfil" && selectedClient && (
              <AdminPerfil client={selectedClient} onRefresh={reloadAssigned} />
            )}
            {active === "carreras" && selectedClient && (
              <AdminCarrerasNew client={selectedClient} />
            )}
            {active === "documentos" && selectedClient && (
              <AdminDocumentosNew client={selectedClient} />
            )}
            {active === "chat" && selectedClient && (
              <AdminChatIA client={selectedClient} />
            )}
            {active === "reservas" && selectedClient && (
              <AdminReservas client={selectedClient} />
            )}
            {active === "pagos" && selectedClient && (
              <AdminPagos client={selectedClient} />
            )}
            {active === "notificaciones" && (
              <AdminNotificaciones adminId={adminId} clients={data.clients || []} />
            )}
            {active === "faqs" && <AdminFaqManager />}

            <div className="text-center text-xs text-slate-400 py-2">
              Project Robin · Panel de administración
            </div>
          </main>
      <AdminChatAssistant key={selectedClient?.id || "general"} user={user} activeClientId={selectedClient?.id || null} clients={data.clients || []} mascot={mascot} />

      {assignOpen && (
        <AssignClientModal
          adminEmail={adminId}
          list={assignList}
          loading={assignLoading}
          error={assignError}
          busyId={assignBusyId}
          onAssign={doAssign}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </AdminWorkspace>
  );
}

// =====================
//  ADMIN — NOTIFICACIONES
// =====================
function AdminNotificaciones({ adminId, clients }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("info"); // 'info' | 'terms'
  const [scope, setScope] = useState("assigned"); // 'assigned' | 'all'
  const [selected, setSelected] = useState(() => new Set());
  const [allClients, setAllClients] = useState(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [q, setQ] = useState("");

  const pool = scope === "all" ? (allClients || []) : (clients || []);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return pool;
    return pool.filter((c) => `${c.nombre || ""} ${c.apellidos || ""} ${c.email || ""} ${c.lead_id || ""}`.toLowerCase().includes(t));
  }, [pool, q]);

  useEffect(() => { reloadSent(); }, []);
  async function reloadSent() {
    setLoadingSent(true);
    try { const r = await adminNotificationsList(); setSent(r.notifications || []); }
    catch (_) { setSent([]); }
    finally { setLoadingSent(false); }
  }

  async function switchScope(next) {
    setScope(next); setSelected(new Set());
    if (next === "all" && allClients === null) {
      setLoadingAll(true);
      try { const r = await adminListAllClients(); setAllClients(r.clients || []); }
      catch (_) { setAllClients([]); }
      finally { setLoadingAll(false); }
    }
  }

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAllVisible() {
    const ids = filtered.map((c) => c.id);
    setSelected((s) => {
      const allSel = ids.length && ids.every((id) => s.has(id));
      const n = new Set(s);
      if (allSel) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
      return n;
    });
  }

  async function submit() {
    setError(""); setFeedback("");
    if (!title.trim()) { setError("Añade un título."); return; }
    if (!content.trim()) { setError("Añade un contenido."); return; }
    if (!selected.size) { setError("Selecciona al menos un cliente."); return; }
    setBusy(true);
    try {
      const r = await adminNotificationCreate({ title: title.trim(), content: content.trim(), type, user_ids: Array.from(selected) });
      setFeedback(`Notificación enviada a ${r.recipients} cliente(s).`);
      setTitle(""); setContent(""); setSelected(new Set());
      await reloadSent();
    } catch (e) {
      setError(e.message || "No se pudo crear la notificación.");
    } finally { setBusy(false); }
  }

  function statusLabel(rec, ntype) {
    if (rec.status === "accepted") return <Badge tone="green">Aceptada</Badge>;
    if (rec.status === "seen") return <Badge tone="blue">Vista</Badge>;
    return <Badge tone="amber">Pendiente</Badge>;
  }

  return (
    <div className="space-y-5">
      {/* Crear notificación */}
      <Card>
        <CardHeader title="Nueva notificación" subtitle="Aparece como pop-up al cliente la próxima vez que inicie sesión" icon={Bell} />
        <CardContent className="space-y-4">
          {/* Tipo */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Tipo de notificación</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setType("info")}
                className="text-left rounded-xl border px-4 py-3 transition"
                style={type === "info" ? { borderColor: NAVY, background: "#f5f8ff" } : { borderColor: "#e2e8f0" }}>
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-800"><Bell className="h-4 w-4" style={{ color: NAVY }} /> Informativa</div>
                <div className="text-xs text-slate-500 mt-1">El cliente solo la lee y confirma. Se muestra una vez.</div>
              </button>
              <button type="button" onClick={() => setType("terms")}
                className="text-left rounded-xl border px-4 py-3 transition"
                style={type === "terms" ? { borderColor: NAVY, background: "#f5f8ff" } : { borderColor: "#e2e8f0" }}>
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-800"><FileText className="h-4 w-4" style={{ color: NAVY }} /> Cambio de términos</div>
                <div className="text-xs text-slate-500 mt-1">Implica un cambio en los términos del contrato. El cliente debe aceptarlo y recibe email de confirmación.</div>
              </button>
            </div>
          </div>

          <Field label="Título" value={title} onChange={setTitle} placeholder="p. ej. Actualización de tu proceso" />
          <TextareaField label="Contenido" value={content} onChange={setContent} rows={5}
            placeholder={type === "terms" ? "Describe el cambio en los términos y condiciones que el cliente debe aceptar…" : "Escribe el mensaje que verá el cliente…"} />

          {type === "terms" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800">
              Al ser un cambio de términos, el cliente deberá pulsar <strong>«Acepto los nuevos términos»</strong>. La aceptación queda registrada con fecha y hora y se envía una confirmación por correo (al cliente y al equipo), aplicándose sobre el contrato firmado originalmente.
            </div>
          )}

          {/* Destinatarios */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Destinatarios ({selected.size} seleccionado(s))</div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                <button type="button" onClick={() => switchScope("assigned")}
                  className="px-3 py-1 rounded-md text-xs font-medium transition"
                  style={scope === "assigned" ? { background: NAVY, color: "white" } : { color: "#475569" }}>Mis clientes</button>
                <button type="button" onClick={() => switchScope("all")}
                  className="px-3 py-1 rounded-md text-xs font-medium transition"
                  style={scope === "all" ? { background: NAVY, color: "white" } : { color: "#475569" }}>Todos</button>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:bg-white transition" />
              </div>
              <button type="button" onClick={toggleAllVisible} className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50" style={{ color: NAVY }}>
                Seleccionar visibles
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {loadingAll && scope === "all" ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Cargando clientes…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">No hay clientes.</div>
              ) : filtered.map((c) => {
                const on = selected.has(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => toggle(c.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition">
                    <div className="h-5 w-5 rounded-md border flex items-center justify-center flex-shrink-0"
                      style={on ? { background: NAVY, borderColor: NAVY } : { borderColor: "#cbd5e1" }}>
                      {on && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{c.nombre || "—"} {c.apellidos || ""}</div>
                      <div className="text-[11px] text-slate-400 truncate">{c.email || ""}{c.lead_id ? " · " + c.lead_id : ""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="text-sm text-rose-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
          {feedback && <div className="text-sm text-emerald-600 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{feedback}</div>}

          <div className="flex justify-end">
            <Btn variant="primary" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar notificación
            </Btn>
          </div>
        </CardContent>
      </Card>

      {/* Notificaciones enviadas + seguimiento */}
      <Card>
        <CardHeader title="Notificaciones enviadas" subtitle="Estado de lectura y aceptación por cliente" icon={Clock}
          right={<button onClick={reloadSent} className="text-xs font-semibold flex items-center gap-1" style={{ color: NAVY }}><RefreshCw className="h-3.5 w-3.5" />Actualizar</button>} />
        <CardContent className="space-y-3">
          {loadingSent ? (
            <div className="py-6 text-center text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Cargando…</div>
          ) : sent.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">Aún no has enviado notificaciones.</div>
          ) : sent.map((n) => {
            const open = expanded === n.id;
            return (
              <div key={n.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <button onClick={() => setExpanded(open ? null : n.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition">
                  {n.type === "terms" ? <FileText className="h-4 w-4 flex-shrink-0" style={{ color: NAVY }} /> : <Bell className="h-4 w-4 flex-shrink-0" style={{ color: NAVY }} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 truncate">{n.title}</div>
                    <div className="text-[11px] text-slate-400">{formatDate(n.created_at)} · {n.type === "terms" ? "Cambio de términos" : "Informativa"}</div>
                  </div>
                  <Badge tone={n.done >= n.total && n.total > 0 ? "green" : "amber"}>{n.done}/{n.total}</Badge>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-2">
                    <div className="text-[13px] text-slate-600 whitespace-pre-wrap mb-2">{n.content}</div>
                    <div className="divide-y divide-slate-100">
                      {(n.recipients || []).map((r) => (
                        <div key={r.user_id} className="flex items-center gap-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-700 truncate">{r.nombre || "—"} {r.apellidos || ""}</div>
                            <div className="text-[10px] text-slate-400 truncate">{r.email || r.lead_id || ""}</div>
                          </div>
                          {statusLabel(r, n.type)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientAvatar({ nombre, apellidos, size = "md" }) {
  const initials = ((nombre || "").charAt(0) + (apellidos || "").charAt(0)).toUpperCase() || "R";
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-base" };
  return (
    <div className={`${sizes[size]} rounded-xl grid place-items-center font-bold flex-shrink-0 text-white`}
      style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})` }}>
      {initials}
    </div>
  );
}

// =====================
//  ADMIN — LISTA DE CLIENTES
// =====================
function AdminClientesList({ clients, totalCount, searchQ, onSearch, onSelect, loading, loadError, onOpenAssign }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Tus clientes" subtitle={`${totalCount} cliente(s) asignado(s)`} icon={Users}
          right={
            <div className="flex items-center gap-2">
              <Badge tone="navy">{clients.length} mostrando</Badge>
              <Btn size="sm" variant="secondary" onClick={onOpenAssign}>
                <Plus className="h-3.5 w-3.5" /> Asignar cliente
              </Btn>
            </div>
          }
        />
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar por nombre, email, username o Lead ID…"
              aria-label="Buscar en mis clientes"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition"
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 text-center py-10 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus clientes…
            </div>
          ) : loadError ? (
            <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-3 text-center">{loadError}</div>
          ) : clients.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-10">
              {totalCount === 0
                ? "Aún no tienes clientes asignados."
                : "Sin resultados para tu búsqueda."}
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => {
                const isOnb = c.requires_onboarding;
                return (
                  <button key={c.id} onClick={() => onSelect(c)}
                    className="admin-client-row w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50 transition text-left">
                    <ClientAvatar nombre={c.nombre} apellidos={c.apellidos} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {c.nombre} {c.apellidos}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {c.email || c.username} · {c.lead_id}
                      </div>
                    </div>
                    <Badge tone={isOnb ? "amber" : "green"}>{isOnb ? "Registro pendiente" : `Paso ${c.application_phase || 1}`}</Badge>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function AssignClientModal({ adminEmail, list, loading, error, busyId, onAssign, onClose }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const visibles = useMemo(() => {
    const s = (dq || "").trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => `${c.nombre || ""} ${c.apellidos || ""} ${c.email || ""} ${c.username || ""} ${c.lead_id || ""} ${c.assigned_to || ""}`.toLowerCase().includes(s));
  }, [list, dq]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>Asignar cliente</div>
            <div className="text-xs text-slate-500">Selecciona un cliente para asignártelo (assigned_to = {adminEmail})</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, email, username, Lead ID o asignado…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
          </div>
          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 mb-3">{error}</div>
          )}
          <div className="max-h-[60vh] overflow-auto space-y-2">
            {loading ? (
              <div className="text-sm text-slate-400 text-center py-10 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : visibles.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-10">Sin resultados.</div>
            ) : visibles.map((c) => {
              const mine = (c.assigned_to || "").toLowerCase() === (adminEmail || "").toLowerCase();
              const other = !!c.assigned_to && !mine;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                  <ClientAvatar nombre={c.nombre} apellidos={c.apellidos} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {c.nombre || "—"} {c.apellidos || ""}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {c.email || c.username} · {c.lead_id}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {c.assigned_to ? `Asignado a: ${c.assigned_to}` : "Sin asignar"}
                    </div>
                  </div>
                  {mine ? (
                    <Badge tone="green">Tuyo</Badge>
                  ) : (
                    <Btn size="sm" variant={other ? "secondary" : "primary"}
                      onClick={() => onAssign(c.id)} disabled={busyId === c.id}>
                      {busyId === c.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> …</> : (other ? "Reasignar a mí" : "Asignar")}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================
//  ADMIN — PERFIL
// =====================
function AdminPerfil({ client, onRefresh }) {
  // --- Sugerencias de carreras (IA) ---
  const [sugg, setSugg] = useState(null);
  const [suggLoading, setSuggLoading] = useState(true);
  const [suggErr, setSuggErr] = useState("");
  const [regening, setRegening] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState("");
  const [showQ, setShowQ] = useState(false);

  useEffect(() => {
    let cancel = false;
    setSuggLoading(true); setSuggErr(""); setSugg(null); setShowQ(false);
    (async () => {
      try {
        const r = await adminCareerSuggestions(client.id);
        if (!cancel) setSugg(r);
      } catch (e) {
        if (!cancel) setSuggErr(e.message || "No se pudieron cargar las sugerencias.");
      } finally {
        if (!cancel) setSuggLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [client.id]);

  async function regenerate() {
    setRegening(true); setSuggErr("");
    try {
      const r = await adminCareerSuggestionsRegenerate(client.id);
      setSugg(r);
    } catch (e) {
      setSuggErr(e.message || "No se pudo regenerar.");
    } finally {
      setRegening(false);
    }
  }

  async function saveCareerFeedback(programCode, decision) {
    setFeedbackBusy(programCode); setSuggErr("");
    try {
      const r = await adminCareerSuggestionFeedback(client.id, programCode, decision);
      setSugg(r);
    } catch (e) {
      setSuggErr(e.message || "No se pudo guardar la decisión.");
    } finally {
      setFeedbackBusy("");
    }
  }

  const opts = [
    { value: "ciencias", label: "Ciencias" },
    { value: "tecnologia_y_programacion", label: "Tecnología y programación" },
    { value: "business", label: "Business" },
    { value: "ciencias_de_la_salud", label: "Ciencias de la salud" },
    { value: "ingenierias", label: "Ingenierías" },
    { value: "ciencias_sociales", label: "Ciencias sociales" },
    { value: "artes", label: "Artes" },
  ];

  const AREA_ES = {
    "Technology & Computer Science": "Tecnología",
    "Engineering": "Ingeniería",
    "Business & Economics": "Business",
    "Sciences": "Ciencias",
    "Health Sciences": "Ciencias de la salud",
    "Social Sciences": "Ciencias sociales",
    "Arts & Liberal Arts": "Artes",
  };
  function compColor(v) {
    return v >= 78 ? "#10b981" : v >= 58 ? "#F5A623" : "#94a3b8";
  }
  function fmtDate(x) {
    if (!x) return "";
    try { return new Date(x).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }
    catch (_) { return ""; }
  }

  const esPasaporte = (client.origin === "otros") && (client.has_eu_id === false);
  const docLabel = esPasaporte ? "Pasaporte" : "DNI";
  const items = (sugg && sugg.suggestions && Array.isArray(sugg.suggestions.items)) ? sugg.suggestions.items : [];
  const feedbackByCode = Object.fromEntries(((sugg && sugg.feedback) || []).map((entry) => [entry.program_code, entry.decision]));
  const hasQ = sugg && sugg.has_questionnaire;
  const aiDisabled = !!(sugg && sugg.ai_disabled);
  const qBlocks = (hasQ && sugg.questionnaire && Array.isArray(sugg.questionnaire.blocks)) ? sugg.questionnaire.blocks : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Datos personales" subtitle="Solo lectura · datos persistidos en Supabase" icon={User} />
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["Nombre", client.nombre],
            ["Apellidos", client.apellidos],
            ["Email", client.email],
            ["Número de " + docLabel.toLowerCase(), client.dni_numero],
            ["Dirección", client.direccion],
            ["Fecha de nacimiento", client.fecha_nacimiento],
            ["Teléfono del alumno", client.telefono_alumno],
          ].map(([label, value]) => (
            <div key={label} className={label === "Dirección" ? "md:col-span-2" : ""}>
              <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 min-h-10">{value || "—"}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Intereses de carrera" subtitle="Sólo lectura · los marca el alumno en su onboarding" icon={BookOpen} />
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(client.intereses || []).length === 0
              ? <span className="text-sm text-slate-400">El alumno aún no ha indicado intereses.</span>
              : client.intereses.map((v) => {
                  const lbl = (opts.find((o) => o.value === v) || {}).label || v;
                  return (
                    <span key={v} className="rounded-full px-3 py-1.5 text-xs font-medium border"
                      style={{ background: NAVY, color: "white", borderColor: NAVY }}>{lbl}</span>
                  );
                })}
          </div>
        </CardContent>
      </Card>

      <LivedAbroadCard
        value={client}
        editable={true}
        userId={client.id}
        onSaved={() => onRefresh && onRefresh()}
      />

      {/* === SUGERENCIAS DE CARRERAS (IA) === */}
      <Card>
        <CardHeader title="Sugerencias de carreras (IA)" icon={Sparkles}
          subtitle="Las 10 carreras más compatibles según el cuestionario del alumno"
          right={!aiDisabled && hasQ && (
            <Btn variant="secondary" size="sm" onClick={regenerate} disabled={regening || suggLoading}>
              {regening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerar
            </Btn>
          )} />
        <CardContent>
          {suggLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Generando recomendaciones con IA…
            </div>
          )}

          {!suggLoading && suggErr && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{suggErr}</span>
            </div>
          )}

          {!suggLoading && !suggErr && aiDisabled && (
            <div className="text-sm text-slate-500 py-6 text-center">
              <Sparkles className="h-5 w-5 mx-auto mb-2 text-slate-300" />
              Recomendación por IA <strong>desactivada</strong> para clientes internacionales.
              {hasQ
                ? <><br />El cuestionario del alumno se muestra más abajo para tu consulta.</>
                : <><br />El alumno aún no ha completado el cuestionario de orientación.</>}
            </div>
          )}

          {!suggLoading && !suggErr && !aiDisabled && !hasQ && (
            <div className="text-sm text-slate-400 py-6 text-center">
              El alumno aún no ha completado el cuestionario de orientación en su onboarding.
              <br />Las sugerencias se generarán automáticamente cuando lo termine.
            </div>
          )}

          {!suggLoading && !suggErr && !aiDisabled && hasQ && (
            <>
              {regening && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerando…
                </div>
              )}
              <div className="space-y-2.5">
                {items.map((it, i) => (
                  <div key={it.program_code || i} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-7 w-7 rounded-lg grid place-items-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: NAVY }}>{i + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-slate-900 text-sm leading-tight">{it.career_name}</div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button type="button" title="Aprobar recomendación" aria-label={`Aprobar ${it.career_name}`}
                              disabled={feedbackBusy === it.program_code}
                              onClick={() => saveCareerFeedback(it.program_code, "approved")}
                              className={`h-7 w-7 rounded-lg border grid place-items-center transition-colors disabled:opacity-50 ${feedbackByCode[it.program_code] === "approved" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"}`}>
                              {feedbackBusy === it.program_code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            </button>
                            <button type="button" title="Descartar recomendación" aria-label={`Descartar ${it.career_name}`}
                              disabled={feedbackBusy === it.program_code}
                              onClick={() => saveCareerFeedback(it.program_code, "rejected")}
                              className={`h-7 w-7 rounded-lg border grid place-items-center transition-colors disabled:opacity-50 ${feedbackByCode[it.program_code] === "rejected" ? "bg-rose-600 border-rose-600 text-white" : "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"}`}>
                              {feedbackBusy === it.program_code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            </button>
                            <span className="text-sm font-bold ml-1" style={{ color: compColor(it.compatibility) }}>
                              {it.compatibility}%
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <GraduationCap className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{it.university} · {it.city}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: it.compatibility + "%", background: compColor(it.compatibility) }} />
                        </div>
                        {it.reason && <div className="text-xs text-slate-600 mt-2 leading-relaxed">{it.reason}</div>}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {it.area && <Badge tone="navy">{AREA_ES[it.area] || it.area}</Badge>}
                          {it.degree_type && <Badge tone="slate">{it.degree_type}</Badge>}
                          {it.numerus_fixus && <Badge tone="amber">Numerus Fixus</Badge>}
                          {it.strengths && <span className="text-[11px] text-slate-400">{it.strengths}</span>}
                          {it.website_url && (
                            <a href={it.website_url} target="_blank" rel="noreferrer"
                              className="text-[11px] inline-flex items-center gap-1 ml-auto" style={{ color: NAVY }}>
                              <ExternalLink className="h-3 w-3" /> Ver web
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {sugg.suggestions && (
                <div className="text-[11px] text-slate-400 mt-3">
                  Generado {fmtDate(sugg.suggestions.generated_at)}
                  {sugg.suggestions.source === "fallback"
                    ? " · estimación automática (IA no disponible)"
                    : " · selección por IA"}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* === CUESTIONARIO DEL ALUMNO === */}
      {hasQ && (
        <Card>
          <CardHeader title="Cuestionario de orientación" icon={FileText}
            subtitle="Respuestas del alumno en el onboarding"
            right={
              <Btn variant="ghost" size="sm" onClick={() => setShowQ((x) => !x)}>
                {showQ ? "Ocultar" : "Ver respuestas"}
                <ChevronDown className="h-3.5 w-3.5" style={{ transform: showQ ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </Btn>
            } />
          {showQ && (
            <CardContent className="space-y-4">
              {qBlocks.map((blk, bi) => (
                <div key={bi}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: NAVY }}>{blk.title}</div>
                  <div className="space-y-2">
                    {(blk.items || []).map((it, ii) => (
                      <div key={ii} className="text-sm">
                        <div className="text-slate-500 text-xs">{it.q}</div>
                        <div className="text-slate-800">{Array.isArray(it.a) ? it.a.join(", ") : String(it.a)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// =====================
//  ADMIN — CARRERAS
// =====================
function AdminReservas({ client }) {
  /* AdminReservas v2 — lee bookings reales de la API (filtradas por user_id del cliente) */
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await bookingsList(client.id);
        if (!cancel) setBookings(res.bookings || []);
      } catch (e) {
        if (!cancel) setError(e.message || "No se pudieron cargar las reservas.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [client.id]);

  const upcoming = bookings.filter((b) => b.status !== "cancelled" && new Date(b.start_at) >= new Date(Date.now() - 60 * 60_000))
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const past = bookings.filter((b) => new Date(b.start_at) < new Date(Date.now() - 60 * 60_000))
    .sort((a, b) => new Date(b.start_at) - new Date(a.start_at));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Próximas llamadas" subtitle={`Con ${client.nombre || ""} ${client.apellidos || ""}`} icon={Calendar} />
        <CardContent>
          {loading && <div className="text-xs text-slate-500">Cargando…</div>}
          {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          {!loading && upcoming.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">Aún no hay reservas. El alumno puede reservar desde su portal.</div>
          )}
          {upcoming.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 mb-2">
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
                    Entrar a Meet
                  </a>
                )}
                <Badge tone="green">Confirmada</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader title="Histórico" subtitle={`${past.length} llamada(s) pasadas`} icon={Calendar} />
          <CardContent className="space-y-2">
            {past.slice(0, 10).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-slate-700 truncate">
                    {new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(b.start_at))} · {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(b.start_at))}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{b.topic}</div>
                </div>
                <Badge tone="slate">{b.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================
//  PAGOS — COMUNES
// =====================
// =====================
//  JUSTIFICANTE LOCAL (la factura fiscal oficial es el PDF de Holded)
// =====================
// Etiqueta de un pago: concepto (pagos extra) o "Cuota N de 3" (cuotas estándar).
function AdminPagos({ client }) {
  const [data, setData] = useState({ user: client, payments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [facturaOpen, setFacturaOpen] = useState(false);
  const [facturaPayment, setFacturaPayment] = useState(null);
  const [now, setNow] = useState(new Date());
  const [xConcept, setXConcept] = useState("");
  const [xAmount, setXAmount] = useState("");
  const [xDue, setXDue] = useState("");
  const [xBusy, setXBusy] = useState(false);
  const [xErr, setXErr] = useState("");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const res = await adminPaymentsList(client.id);
      setData(res);
    } catch (e) {
      setError(e.message || "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, [client?.id]);

  async function unlock(p) {
    setBusyId(p.id); setError("");
    try {
      await adminPaymentsUnlock(client.id, p.installment);
      await refresh();
    } catch (e) {
      setError(e.message || "No se pudo desbloquear.");
    } finally { setBusyId(null); }
  }
  async function setCarreras(n) {
    setBusyId("carreras"); setError("");
    try {
      await adminPaymentsSetCarreras(client.id, n);
      await refresh();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
    } finally { setBusyId(null); }
  }
  async function addExtra() {
    const amt = Number(String(xAmount).replace(",", "."));
    if (!xConcept.trim()) { setXErr("Indica el concepto del pago."); return; }
    if (!isFinite(amt) || amt <= 0) { setXErr("Indica un importe válido."); return; }
    setXBusy(true); setXErr("");
    try {
      await adminPaymentsAdd(client.id, xConcept.trim(), amt, xDue || null);
      setXConcept(""); setXAmount(""); setXDue("");
      await refresh();
    } catch (e) {
      setXErr(e.message || "No se pudo añadir el pago.");
    } finally { setXBusy(false); }
  }
  async function delExtra(p) {
    if (!window.confirm("¿Eliminar este pago extra? Esta acción no se puede deshacer.")) return;
    setBusyId(p.id); setError("");
    try {
      await adminPaymentsDelete(client.id, p.id);
      await refresh();
    } catch (e) {
      setError(e.message || "No se pudo eliminar el pago.");
    } finally { setBusyId(null); }
  }
  async function saveAmount(p) {
    const amt = Number(String(editVal).replace(",", "."));
    if (!isFinite(amt) || amt <= 0) { setError("Indica un importe válido."); return; }
    setEditBusy(true); setError("");
    try {
      await adminPaymentsSetAmount(client.id, p.installment, amt);
      setEditId(null); setEditVal("");
      await refresh();
    } catch (e) {
      setError(e.message || "No se pudo guardar el importe.");
    } finally { setEditBusy(false); }
  }

  const tipo = (data.user?.tipo || client.tipo || "general").toLowerCase();
  const origin = (data.user?.origin || client.origin || "").toLowerCase();
  const esOtros = origin === "otros";
  const num = data.user?.num_carreras || client.num_carreras || 1;

  return (
    <div className="space-y-5">
      {tipo === "general" && !esOtros && (
        <Card>
          <CardHeader title="Paquete contratado" subtitle="Solo para Pack General · ajusta el número de carreras" icon={BookOpen} />
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => {
                const sel = num === n;
            const prices = Object.fromEntries(Object.entries(APPLICATION_TOTALS.general).map(([key, value]) => [key, `${Number(value).toLocaleString("es-ES")} €`]));
                return (
                  <button key={n} onClick={() => setCarreras(n)}
                    disabled={busyId === "carreras"}
                    className="rounded-xl border px-3 py-3 text-sm text-left transition disabled:opacity-50"
                    style={sel ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
                    <div className="font-bold">{n} {n === 1 ? "carrera" : "carreras"}</div>
                    <div className={`text-xs ${sel ? "text-white/70" : "text-slate-400"}`}>{prices[n]} · total</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="Cuotas del cliente" subtitle={esOtros ? `Internacional · ${Number(APPLICATION_TOTALS.international).toLocaleString("es-ES")} €` : `Tipo de paquete: ${tipo}${tipo === "general" ? ` · ${num} carrera(s)` : ""}`} icon={CreditCard} />
        <CardContent>
          {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 mb-3">{error}</div>}
          {loading ? (
            <div className="text-sm text-slate-400 text-center py-10 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="space-y-3">
              {data.payments.map((p) => {
                const isPaid     = p.status === "paid";
                const isUnlocked = p.status === "unlocked";
                const isLocked   = p.status === "locked";
                const daysSinceUnlock = isUnlocked && p.unlocked_at ? daysBetween(p.unlocked_at, now.toISOString()) : null;
                const overdue = daysSinceUnlock !== null && daysSinceUnlock > 3;
                return (
                  <div key={p.id} className="admin-payment-row rounded-xl border border-slate-100 bg-white px-4 py-3 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl grid place-items-center flex-shrink-0"
                      style={isPaid ? { background: "#10b981", color: "white" }
                        : isUnlocked ? { background: GOLD, color: "white" }
                        : { background: "#e2e8f0", color: "#94a3b8" }}>
                      {isPaid ? <CheckCircle2 className="h-5 w-5" /> : isLocked ? <Shield className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">{paymentTitle(p, data.payments.filter((x) => x.installment <= 3).length)} · {eur(p.amount)}</div>
                      <div className="text-xs text-slate-400">
                        {isPaid && p.paid_at && `Pagado el ${new Date(p.paid_at).toLocaleDateString("es-ES")}`}
                        {isUnlocked && p.unlocked_at && `Desbloqueado el ${new Date(p.unlocked_at).toLocaleDateString("es-ES")}`}
                        {isLocked && `Bloqueado`}
                      </div>
                      {isUnlocked && daysSinceUnlock !== null && (
                        <div className="mt-1">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={overdue
                              ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
                              : { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                            {daysSinceUnlock} día{daysSinceUnlock === 1 ? "" : "s"} desde el desbloqueo {overdue ? "· vencido" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    {editId === p.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input autoFocus value={editVal}
                          onChange={(e) => setEditVal(e.target.value.replace(/[^\d.,]/g, ""))}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right tabular-nums"
                          placeholder="€" />
                        <Btn size="sm" onClick={() => saveAmount(p)} disabled={editBusy}>
                          {editBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                        </Btn>
                        <Btn size="sm" variant="secondary" onClick={() => { setEditId(null); setEditVal(""); }} disabled={editBusy}>Cancelar</Btn>
                      </div>
                    ) : (
                    <>
                    <PaymentStatusBadge status={p.status} />
                    <div className="flex gap-1 flex-shrink-0">
                      {(p.installment === 2 || p.installment === 3) && !isPaid && (
                        <Btn size="sm" variant="secondary" onClick={() => { setEditId(p.id); setEditVal(String(p.amount)); }} title="Editar importe de la cuota">
                          <Pencil className="h-3.5 w-3.5" /> Importe
                        </Btn>
                      )}
                      {isPaid && (
                        <Btn variant="secondary" size="sm" onClick={() => { setFacturaPayment(p); setFacturaOpen(true); }}>
                          <FileText className="h-3.5 w-3.5" /> Justificante
                        </Btn>
                      )}
                      {isLocked && p.installment !== 1 && (
                        <Btn size="sm" onClick={() => unlock(p)} disabled={busyId === p.id}>
                          {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Desbloquear"}
                        </Btn>
                      )}
                      {p.installment >= 4 && (
                        <Btn size="sm" variant="danger" onClick={() => delExtra(p)} disabled={busyId === p.id} title="Eliminar pago extra">
                          {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Btn>
                      )}
                    </div>
                    </>
                    )}
                  </div>
                );
              })}
              <div className="text-[11px] text-slate-400 mt-2">
                Al desbloquear, el cliente recibirá un email a <strong>{data.user?.email || "—"}</strong> indicándole que ya puede pagar la cuota.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Añadir pago extra" subtitle="Para servicios adicionales que contrate el cliente" icon={Plus} />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_170px] gap-3">
            <Field label="Concepto" value={xConcept} onChange={setXConcept} placeholder="Revisión de candidaturas" />
            <Field label="Importe (€)" value={xAmount} onChange={(v) => setXAmount(v.replace(/[^\d.,]/g, ""))} placeholder="150" />
            <Field label="Fecha a pagar" type="date" value={xDue} onChange={setXDue} />
          </div>
          {xErr && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 mt-3">{xErr}</div>}
          <div className="flex justify-end mt-3">
            <Btn onClick={addExtra} disabled={xBusy || !xConcept.trim() || !xAmount}>
              {xBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Añadiendo…</> : <><Plus className="h-3.5 w-3.5" /> Añadir pago</>}
            </Btn>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">El pago extra quedará disponible para el cliente de inmediato.</div>
        </CardContent>
      </Card>

      <Factura open={facturaOpen} onClose={() => setFacturaOpen(false)} user={data.user} payment={facturaPayment} />
    </div>
  );
}

// =====================
//  CONSTANTES FASES Y DOCS POR DEFECTO
// =====================
// =====================
//  CARRERAS — CLIENTE (read-only)
// =====================
function AdminCarrerasNew({ client }) {
  const [library, setLibrary] = useState([]);
  const [assigned, setAssigned] = useState([]); // career_template_ids asignados a este cliente
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // formulario crear carrera
  const [cName, setCName] = useState("");
  const [cUni, setCUni] = useState("");
  const [cCity, setCCity] = useState("");
  const initLevel = client?.application_level === "maestria" ? "maestria" : "grado";
  const [cLevel, setCLevel] = useState(initLevel);
  const [cDocs, setCDocs] = useState(() => buildDefaultDocs(initLevel));
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  function changeLevel(lv) {
    setCLevel(lv);
    setCDocs(buildDefaultDocs(lv));
  }

  async function refresh() {
    setLoading(true); setError("");
    try {
      const all = await adminCareersListAll(client.id);
      setLibrary(all.templates || []);
      setAssigned(all.assigned_template_ids || []);
    } catch (e) {
      setError(e.message || "Error al cargar.");
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [client?.id]);

  function setDocField(i, k, v) {
    setCDocs((arr) => arr.map((d, idx) => idx === i ? { ...d, [k]: v } : d));
  }
  function setRequirementType(i, type) {
    setCDocs((arr) => arr.map((d, idx) => idx === i ? {
      ...d, type, required: type === "document",
      ...(type === "event" ? { template_file: null, template_path: null, template_filename: null, template_mime: null } : {}),
    } : d));
  }
  function addDoc() {
    setCDocs((arr) => [...arr, newCareerRequirement("document")]);
  }
  function addEvent() {
    setCDocs((arr) => [...arr, newCareerRequirement("event")]);
  }
  function removeDoc(i) {
    setCDocs((arr) => arr.filter((_, idx) => idx !== i));
  }
  function attachTemplate(i, file) {
    if (!file) return;
    setCDocs((arr) => arr.map((d, idx) => idx === i ? {
      ...d, template_file: file, template_filename: file.name, template_mime: file.type || "application/octet-stream",
    } : d));
  }
  function clearTemplate(i) {
    setCDocs((arr) => arr.map((d, idx) => idx === i ? { ...d, template_file: null, template_path: null, template_filename: null, template_mime: null } : d));
  }
  function resetForm() {
    setEditingId(null); setCName(""); setCUni(""); setCCity("");
    setCDocs(buildDefaultDocs(cLevel));
  }
  function editTemplate(template) {
    setEditingId(template.id);
    setCName(template.name || ""); setCUni(template.university || ""); setCCity(template.city || "");
    setCDocs((template.required_docs || []).map(normalizeCareerRequirement));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function create() {
    if (!cName.trim() || !cUni.trim()) return;
    if (cDocs.some((item) => !item.name.trim() || !item.deadline)) {
      setError("Cada documento o evento necesita nombre y deadline.");
      return;
    }
    setBusy(true); setError("");
    try {
      const payload = {
        id: editingId || undefined,
        name: cName, university: cUni, city: cCity,
        required_docs: cDocs.filter((d) => d.name && d.name.trim()),
      };
      await adminCareersCreate(payload);
      resetForm();
      await refresh();
    } catch (e) { setError(e.message || "Error al crear."); }
    finally { setBusy(false); }
  }
  async function assign(tplId) {
    setBusy(true); setError("");
    try {
      await adminCareersAssign(client.id, tplId);
      setAssigned((arr) => [...new Set([...arr, tplId])]);
    } catch (e) { setError(e.message || "Error al asignar."); }
    finally { setBusy(false); }
  }
  async function unassign(tplId) {
    setBusy(true); setError("");
    try {
      await adminCareersUnassign(client.id, tplId);
      setAssigned((arr) => arr.filter((x) => x !== tplId));
    } catch (e) { setError(e.message || "Error al quitar."); }
    finally { setBusy(false); }
  }
  async function deleteTpl(tplId) {
    if (!confirm("¿Eliminar esta carrera de la biblioteca? No quita las ya asignadas.")) return;
    setBusy(true);
    try {
      await adminCareersDelete(tplId);
      await refresh();
    } catch (e) { setError(e.message || "Error."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={editingId ? "Editar carrera" : "Crear nueva carrera"} subtitle="Define documentos y eventos con su deadline; los cambios se sincronizan con los alumnos asignados" icon={editingId ? Pencil : Plus}
          right={editingId && <Btn variant="secondary" size="sm" onClick={resetForm}>Cancelar edición</Btn>} />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Nombre" value={cName} onChange={setCName} placeholder="International Business" />
            <Field label="Universidad" value={cUni} onChange={setCUni} placeholder="Maastricht University" />
            <Field label="Ciudad (opcional)" value={cCity} onChange={setCCity} placeholder="Maastricht" />
          </div>
          <Divider />
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Nivel del programa</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => changeLevel("grado")}
                className="px-4 py-2 rounded-xl border text-sm font-medium transition"
                style={cLevel === "grado" ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
                Grado
              </button>
              <button type="button" onClick={() => changeLevel("maestria")}
                className="px-4 py-2 rounded-xl border text-sm font-medium transition"
                style={cLevel === "maestria" ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
                Máster
              </button>
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5">Carga la lista de documentos por defecto según el nivel. Puedes editarlos igualmente debajo.</div>
          </div>
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Requerimientos de la carrera</div>
          <div className="space-y-2">
            {cDocs.map((d, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-[130px_1fr_170px_auto] gap-2 items-center">
                  <select value={d.type || "document"} onChange={(e) => setRequirementType(i, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <option value="document">Documento</option>
                    <option value="event">Evento</option>
                  </select>
                  <input value={d.name} onChange={(e) => setDocField(i, "name", e.target.value)}
                    placeholder={d.type === "event" ? "Nombre del evento" : "Nombre del documento"}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm" />
                  <input type="date" value={d.deadline || ""} onChange={(e) => setDocField(i, "deadline", e.target.value)}
                    aria-label={`Deadline de ${d.name || "requerimiento"}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm" />
                  <button onClick={() => removeDoc(i)} title="Quitar" className="text-slate-300 hover:text-rose-500 justify-self-end">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {d.type !== "event" && <div className="flex items-center gap-3 pl-1">
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={!!d.required} onChange={(e) => setDocField(i, "required", e.target.checked)} />
                    Obligatorio
                  </label>
                  {d.template_file ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-2">
                      📎 Plantilla: {d.template_filename}
                      <button onClick={() => clearTemplate(i)} className="text-slate-400 hover:text-rose-500 underline text-[11px]">Quitar</button>
                    </span>
                  ) : (
                    <label className="cursor-pointer text-xs text-slate-500 underline">
                      Adjuntar plantilla (opcional)
                      <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachTemplate(i, f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>}
              </div>
            ))}
            <div className="flex flex-wrap gap-4">
              <button onClick={addDoc} className="text-xs text-slate-500 hover:text-slate-800 underline">+ Añadir documento</button>
              <button onClick={addEvent} className="text-xs text-slate-500 hover:text-slate-800 underline">+ Añadir evento</button>
            </div>
          </div>
          <div className="flex justify-end">
            <Btn onClick={create} disabled={busy || !cName.trim() || !cUni.trim() || cDocs.some((item) => !item.name.trim() || !item.deadline)}>
              {editingId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {editingId ? "Guardar cambios" : "Crear carrera"}
            </Btn>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Biblioteca de carreras" subtitle="Asígnaselas al alumno desde aquí" icon={BookOpen} />
        <CardContent>
          {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 mb-3">{error}</div>}
          {loading ? (
            <div className="text-sm text-slate-400 text-center py-6 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : library.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">Crea la primera carrera arriba.</div>
          ) : (
            <div className="space-y-2">
              {library.map((t) => {
                const sel = assigned.includes(t.id);
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                    style={sel ? { background: CREAM, borderColor: NAVY } : { background: "white", borderColor: "#e2e8f0" }}>
                    <div className="h-8 w-8 rounded-lg flex-shrink-0 grid place-items-center"
                      style={sel ? { background: NAVY, color: "white" } : { background: "#f8fafc", color: "#94a3b8" }}>
                      {sel ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                      <div className="text-xs text-slate-400 truncate">{t.university}{t.city ? ` · ${t.city}` : ""} · {(t.required_docs || []).filter(r => r.type !== "event").length} documento(s) · {(t.required_docs || []).filter(r => r.type === "event").length} evento(s)</div>
                    </div>
                    <Btn variant="secondary" size="sm" onClick={() => editTemplate(t)} disabled={busy}><Pencil className="h-3.5 w-3.5" /> Editar</Btn>
                    {sel ? (
                      <Btn variant="secondary" size="sm" onClick={() => unassign(t.id)} disabled={busy}>Quitar asignación</Btn>
                    ) : (
                      <Btn size="sm" onClick={() => assign(t.id)} disabled={busy}>Asignar al alumno</Btn>
                    )}
                    <button onClick={() => deleteTpl(t.id)} className="text-slate-300 hover:text-rose-500" title="Eliminar de la biblioteca">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <CareerRequirementsTimeline careers={library.filter((template) => assigned.includes(template.id))} title="Timeline del alumno" />
    </div>
  );
}

// =====================
//  DOCUMENTOS — CLIENTE
// =====================
function AdminDocumentosNew({ client }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [newName, setNewName] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [newTemplate, setNewTemplate] = useState(null);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const res = await adminDocumentsList(client.id);
      setDocs(res.documents || []);
    } catch (e) { setError(e.message || "Error."); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [client?.id]);

  async function review(d, decision, reason) {
    setBusyId(d.id);
    try { await adminDocumentsReview(d.id, decision, reason); await refresh(); }
    catch (e) { setError(e.message || "Error."); }
    finally { setBusyId(null); }
  }
  async function addCustom() {
    if (!newName.trim()) return;
    setBusyId("new");
    try {
      const payload = { user_id: client.id, name: newName.trim(), required: newRequired };
      await adminDocumentsAdd(payload, newTemplate);
      setNewName(""); setNewRequired(true); setNewTemplate(null);
      await refresh();
    } catch (e) { setError(e.message || "Error."); }
    finally { setBusyId(null); }
  }
  async function delDoc(d) {
    if (!confirm("¿Eliminar este documento?")) return;
    setBusyId(d.id);
    try { await adminDocumentsDelete(d.id); await refresh(); }
    catch (e) { setError(e.message || "Error."); }
    finally { setBusyId(null); }
  }
  async function viewFile(d) {
    const full = await documentsGet(d.id);
    if (full.document?.file_url) window.open(full.document.file_url, "_blank");
  }
  async function viewTpl(d) {
    const full = await documentsGet(d.id);
    if (!full.document?.template_url) return;
    const a = document.createElement("a");
    a.href = full.document.template_url;
    a.download = full.document.template_filename || (d.name + ".file");
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Pedir documento al alumno" subtitle="Opcionalmente adjunta una plantilla" icon={UploadCloud} />
        <CardContent className="space-y-3">
          <Field label="Nombre del documento" value={newName} onChange={setNewName} placeholder="Carta de motivación" />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} /> Obligatorio
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plantilla (opcional)</span>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 mt-1 cursor-pointer hover:bg-slate-100">
              {newTemplate ? `📎 ${newTemplate.name}` : "Selecciona un archivo…"}
              <input type="file" className="hidden" onChange={(e) => setNewTemplate(e.target.files?.[0] || null)} />
            </div>
          </label>
          <Btn size="sm" onClick={addCustom} disabled={busyId === "new" || !newName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Añadir solicitud
          </Btn>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Documentos del alumno" subtitle={`${docs.length} total`} icon={FileText} />
        <CardContent>
          {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 mb-3">{error}</div>}
          {loading ? (
            <div className="text-sm text-slate-400 text-center py-6 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">Aún sin documentos.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => {
                const info = statusLabel(d.status);
                return (
                  <div key={d.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                        <div className="text-xs text-slate-400">
                          {d.required ? "Obligatorio" : "Opcional"}
                          {d.uploaded_at && ` · subido ${new Date(d.uploaded_at).toLocaleDateString("es-ES")} por ${d.uploaded_by === "admin" ? "ti" : "el alumno"}`}
                          {d.source === "career_template" && " · de carrera asignada"}
                          {d.source === "admin_custom" && " · custom"}
                        </div>
                      </div>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {d.has_template && (
                        <Btn variant="secondary" size="sm" onClick={() => viewTpl(d)}>
                          <Download className="h-3.5 w-3.5" /> Plantilla
                        </Btn>
                      )}
                      {d.has_file && (
                        <Btn variant="secondary" size="sm" onClick={() => viewFile(d)}>
                          <Eye className="h-3.5 w-3.5" /> Ver archivo
                        </Btn>
                      )}
                      {d.status === "pending_review" && (
                        <>
                          <Btn size="sm" onClick={() => review(d, "validate")} disabled={busyId === d.id}>Validar</Btn>
                          <Btn variant="secondary" size="sm" onClick={() => review(d, "reject")} disabled={busyId === d.id}>No validado</Btn>
                        </>
                      )}
                      {d.status === "validated" && (
                        <Btn variant="secondary" size="sm" onClick={() => review(d, "reject")} disabled={busyId === d.id}>Marcar no válido</Btn>
                      )}
                      <button onClick={() => delDoc(d)} title="Eliminar" className="text-slate-300 hover:text-rose-500 ml-auto">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
//  ESTADO — ADMIN (5 fases)
// =====================
function AdminEstadoFases({ client, onChangedPhase }) {
  const [phase, setPhase] = useState(client.application_phase || 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setPhase(client.application_phase || 1); }, [client?.id, client?.application_phase]);

  async function setP(n) {
    setBusy(true); setError("");
    try {
      await adminPhaseSet(client.id, n);
      setPhase(n);
      if (onChangedPhase) onChangedPhase(n);
    } catch (e) { setError(e.message || "Error."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
        <div className="relative flex items-center gap-4">
          <ClientAvatar nombre={client.nombre} apellidos={client.apellidos} size="lg" />
          <div className="min-w-0">
            <div className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">Fase actual de la aplicación</div>
            <div className="text-white text-xl font-bold truncate" style={{ fontFamily: "'Georgia', serif" }}>
              {APP_PHASE_LABELS.find((p) => p.key === phase)?.label}
            </div>
            <div className="text-white/60 text-sm truncate">{APP_PHASE_LABELS.find((p) => p.key === phase)?.desc}</div>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</div>}

      <Card>
        <CardHeader title="Selecciona la fase del alumno" subtitle="El alumno verá esta fase reflejada en su portal" icon={LayoutDashboard} />
        <CardContent className="space-y-2">
          {APP_PHASE_LABELS.map((p) => {
            const done = p.key < phase;
            const act = p.key === phase;
            return (
              <button key={p.key} onClick={() => setP(p.key)} disabled={busy}
                className="w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition"
                style={act ? { borderColor: NAVY, background: CREAM } : { borderColor: "#f1f5f9", background: "white" }}>
                <div className="h-8 w-8 rounded-full flex-shrink-0 grid place-items-center font-bold text-sm border-2"
                  style={done ? { background: "#10b981", borderColor: "#10b981", color: "white" }
                    : act ? { background: GOLD, borderColor: GOLD, color: "white" }
                    : { background: "white", borderColor: "#e2e8f0", color: "#94a3b8" }}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : p.key}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${act ? "text-slate-900" : done ? "text-slate-400" : "text-slate-500"}`}>{p.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{p.desc}</div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
