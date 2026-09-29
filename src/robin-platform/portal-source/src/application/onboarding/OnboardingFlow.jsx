import React, { useMemo, useState, useEffect, useRef } from "react";
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
import logoRBlanco from "../../assets/logo-r-blanco.png";
import contractContent from "../../../../shared/contract-content.cjs";
import { fileToDataURL } from "../../browser-utils.js";
import { Q_AREAS, Q_GENERAL, Q_MASTER_BLOCKS, Q_VOCACIONAL } from "../../questionnaire-data.js";
import { CREAM, GOLD, NAVY, NAVY_DARK } from "../../theme.js";
import { Btn, Field } from "../../ui.jsx";
import { reportClientError } from "../../client-utils.js";
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
} from "../../api.js";

const { VARIANTS: CONTRACT_TEMPLATES, variantKey: contractVariantKey } = contractContent;

export function OnboardingOrigin({ user, onLogout, onDone }) {
  const [origin, setOrigin] = useState(user.origin || "");
  const [level, setLevel]   = useState(user.application_level || "");
  const [pais, setPais]     = useState(user.pais || "");
  const [hasEu, setHasEu]   = useState(user.has_eu_id == null ? null : !!user.has_eu_id);
  const [screen, setScreen] = useState(0);
  const [error, setError]   = useState("");
  const [busy, setBusy]     = useState(false);

  const esOtros = origin === "otros";
  const totalScreens = esOtros ? 4 : 1;
  const isLast = screen === totalScreens - 1;

  async function save() {
    setBusy(true); setError("");
    try {
      const payload = esOtros
        ? { origin, application_level: level, pais: pais.trim(), has_eu_id: hasEu }
        : { origin };
      await originSave(payload);
      await onDone();
    } catch (e) {
      setError(e.message || "No se pudo guardar. Inténtalo de nuevo.");
      setBusy(false);
    }
  }

  function next() {
    setError("");
    if (screen === 0) {
      if (!origin) { setError("Selecciona una opción para continuar."); return; }
      if (origin === "espana") { save(); return; }
      setScreen(1); return;
    }
    if (screen === 1) {
      if (!level) { setError("Indica a qué tipo de programa vas a aplicar."); return; }
      setScreen(2); return;
    }
    if (screen === 2) {
      if (!pais.trim()) { setError("Indica tu país."); return; }
      setScreen(3); return;
    }
    if (hasEu == null) { setError("Indica si posees un documento de identidad europeo."); return; }
    save();
  }
  function back() { setError(""); setScreen((s) => Math.max(0, s - 1)); }

  const Choice = ({ active, onClick, title, desc, icon: Ic }) => (
    <button type="button" onClick={onClick}
      className="flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition w-full"
      style={active ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
      <span className="h-9 w-9 rounded-lg grid place-items-center flex-shrink-0"
        style={active ? { background: GOLD } : { background: "#f1f5f9" }}>
        {Ic && <Ic className="h-4 w-4" style={{ color: active ? NAVY : "#64748b" }} />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm">{title}</span>
        {desc && <span className={"block text-xs mt-0.5 " + (active ? "text-white/70" : "text-slate-400")}>{desc}</span>}
      </span>
    </button>
  );

  const subtitle = screen === 0
    ? "Cuéntanos desde dónde realizas tu solicitud."
    : "Solicitud internacional · " + screen + " de 3";

  return (
    <OnboardingShell title="Bienvenido a Robin" subtitle={subtitle} stepNumber={1} totalSteps={5}
      icon={<MapPin className="h-4 w-4" />} onLogout={onLogout}>
      <div className="space-y-5">
        {screen === 0 && (
          <>
            <div className="text-sm text-slate-500">¿Desde dónde realizas tu solicitud de acceso a la universidad?</div>
            <div className="grid grid-cols-1 gap-2.5">
              <Choice active={origin === "espana"} onClick={() => { setOrigin("espana"); setError(""); }}
                title="España" desc="Resido en España y solicito plaza desde aquí." icon={MapPin} />
              <Choice active={origin === "otros"} onClick={() => { setOrigin("otros"); setError(""); }}
                title="Otro país" desc="Solicito desde fuera de España (estudiante internacional)." icon={MapPin} />
            </div>
          </>
        )}

        {screen === 1 && (
          <>
            <div className="text-sm text-slate-500">¿A qué tipo de programa universitario vas a aplicar?</div>
            <div className="grid grid-cols-1 gap-2.5">
              <Choice active={level === "grado"} onClick={() => { setLevel("grado"); setError(""); }}
                title="Grado" desc="Estudios universitarios de grado (Bachelor's)." icon={GraduationCap} />
              <Choice active={level === "maestria"} onClick={() => { setLevel("maestria"); setError(""); }}
                title="Maestría" desc="Programa de máster (Master's)." icon={GraduationCap} />
            </div>
          </>
        )}

        {screen === 2 && (
          <>
            <div className="text-sm text-slate-500">¿Desde qué país realizas tu solicitud?</div>
            <Field label="País" value={pais} onChange={setPais} placeholder="Ej. México, Colombia, Argentina…" />
          </>
        )}

        {screen === 3 && (
          <>
            <div className="text-sm text-slate-500">¿Posees un documento de identidad europeo (DNI o NIE de un país de la UE)?</div>
            <div className="grid grid-cols-1 gap-2.5">
              <Choice active={hasEu === true} onClick={() => { setHasEu(true); setError(""); }}
                title="Sí" desc="Dispongo de un documento de identidad europeo." icon={CheckCircle2} />
              <Choice active={hasEu === false} onClick={() => { setHasEu(false); setError(""); }}
                title="No" desc="Verificaremos tu identidad con el pasaporte." icon={FileText} />
            </div>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {screen > 0 && (
            <Btn variant="secondary" onClick={back} disabled={busy}>
              <ChevronLeft className="h-4 w-4" /> Atrás
            </Btn>
          )}
          <Btn className="flex-1" size="lg" onClick={next} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              : isLast ? <>Continuar <ChevronRight className="h-4 w-4" /></>
              : <>Siguiente <ChevronRight className="h-4 w-4" /></>}
          </Btn>
        </div>
      </div>
    </OnboardingShell>
  );
}

export function OnboardingDNI({ user, onLogout, onDone }) {
  const esPasaporte = user.origin === "otros" && user.has_eu_id === false;
  const docType = esPasaporte ? "passport" : "dni";
  const docLabel = esPasaporte ? "pasaporte" : "DNI";

  const [anverso, setAnverso] = useState(null);
  const [reverso, setReverso] = useState(null);
  const [aPreview, setAPreview] = useState(null);
  const [rPreview, setRPreview] = useState(null);
  const [phase, setPhase] = useState("upload");   // 'upload' | 'review'
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({ nombre: "", apellidos: "", direccion: "", fecha_nacimiento: "", dni_numero: "", telefono_alumno: user.telefono_alumno || "" });

  const canExtract = !!anverso && (esPasaporte || !!reverso);

  async function pick(side, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (side === "anverso") { setAnverso(file); setAPreview(url); }
    else { setReverso(file); setRPreview(url); }
  }

  async function extract() {
    if (!canExtract) return;
    setBusy(true); setError("");
    try {
      const res = await dniExtract(anverso, esPasaporte ? null : reverso, docType);
      setFields({
        nombre: res.fields?.nombre || "",
        apellidos: res.fields?.apellidos || "",
        direccion: res.fields?.direccion || "",
        fecha_nacimiento: res.fields?.fecha_nacimiento || "",
        dni_numero: res.fields?.dni_numero || "",
        telefono_alumno: fields.telefono_alumno || user.telefono_alumno || "",
      });
      setPhase("review");
    } catch (e) {
      setError("No se pudo leer el " + docLabel + ". " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true); setError("");
    try {
      await dniSave({
        nombre: fields.nombre.trim(),
        apellidos: fields.apellidos.trim(),
        direccion: fields.direccion.trim(),
        fecha_nacimiento: fields.fecha_nacimiento,
        dni_numero: fields.dni_numero.trim().toUpperCase(),
        telefono_alumno: fields.telefono_alumno.trim(),
      });
      await onDone();
    } catch (e) {
      setError("Error al guardar: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      title="Verifica la identidad del alumno"
      subtitle={esPasaporte
        ? "Necesitamos una foto del pasaporte del alumno para activar la cuenta."
        : "Necesitamos dos fotos del DNI del alumno para activar la cuenta."}
      stepNumber={2}
      icon={<Shield className="h-4 w-4" />}
      onLogout={onLogout}
    >
      {phase === "upload" ? (
        <div className="space-y-5">
          <div className="text-sm text-slate-500">
            {esPasaporte
              ? <>Sube la <strong>página de datos del pasaporte del alumno</strong>. Foto clara, sin reflejos, con todos los bordes visibles. Sólo la usamos para extraer los datos personales del alumno.</>
              : <>Sube el <strong>DNI del alumno</strong>. Foto clara, sin reflejos, con todos los bordes visibles. Sólo lo usamos para extraer los datos personales del alumno.</>}
          </div>

          {esPasaporte ? (
            <div className="grid grid-cols-1 gap-3">
              <UploadSlot label="Página de datos del pasaporte" preview={aPreview} onPick={(f) => pick("anverso", f)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UploadSlot label="Anverso del DNI del alumno" preview={aPreview} onPick={(f) => pick("anverso", f)} />
              <UploadSlot label="Reverso del DNI del alumno" preview={rPreview} onPick={(f) => pick("reverso", f)} />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          <Btn className="w-full" size="lg" disabled={!canExtract || busy} onClick={extract}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo {docLabel}…</> : <>Continuar <ChevronRight className="h-4 w-4" /></>}
          </Btn>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm bg-sky-50 text-sky-700 rounded-xl px-3 py-2 border border-sky-100">
            Revisa los datos del <strong>alumno</strong> extraídos del {docLabel} y corrige lo que haga falta antes de confirmar.
            {esPasaporte && " El pasaporte no incluye dirección: complétala manualmente."}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre" value={fields.nombre} onChange={(v) => setFields((f) => ({ ...f, nombre: v }))} />
            <Field label="Apellidos" value={fields.apellidos} onChange={(v) => setFields((f) => ({ ...f, apellidos: v }))} />
            <div className="sm:col-span-2"><Field label="Dirección" value={fields.direccion} onChange={(v) => setFields((f) => ({ ...f, direccion: v }))} /></div>
            <Field label="Fecha de nacimiento" type="date" value={fields.fecha_nacimiento} onChange={(v) => setFields((f) => ({ ...f, fecha_nacimiento: v }))} />
            <Field label={esPasaporte ? "Número de pasaporte" : "Número de DNI"} value={fields.dni_numero} onChange={(v) => setFields((f) => ({ ...f, dni_numero: v.toUpperCase() }))} />
            <div className="sm:col-span-2"><Field label="Teléfono del alumno" type="tel" value={fields.telefono_alumno} onChange={(v) => setFields((f) => ({ ...f, telefono_alumno: v }))} placeholder="+34 600 000 000" /></div>
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => setPhase("upload")} disabled={busy}>Volver</Btn>
            <Btn className="flex-1" size="lg" onClick={save} disabled={busy || !fields.nombre || !fields.apellidos || !fields.dni_numero || !fields.direccion || !fields.telefono_alumno}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <>Confirmar y continuar <ChevronRight className="h-4 w-4" /></>}
            </Btn>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}

function UploadSlot({ label, preview, onPick }) {
  return (
    <label className="relative block rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition cursor-pointer overflow-hidden min-h-[180px]">
      {preview ? (
        <img src={preview} alt="" className="w-full h-[180px] object-cover" />
      ) : (
        <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="h-10 w-10 rounded-full grid place-items-center text-white" style={{ background: NAVY }}>
            <UploadCloud className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold text-slate-700">{label}</div>
          <div className="text-xs text-slate-400">Foto clara, sin reflejos</div>
        </div>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </label>
  );
}

// =====================
//  ONBOARDING — CONTRATO (variantes por tipo)
// =====================
const CONTRACT_VARIANTS = {
  general: {
    titulo: "Contrato — Consultoría académica",
    short: "General · aplicación a universidades en Países Bajos",
    extras: [],
  },
  llegada: {
    titulo: "Contrato — Pack Llegada",
    short: "Acompañamiento e instalación en Países Bajos",
    extras: [
      { id: "revision_candidaturas", label: "Revisión de candidaturas", price: 150 },
      { id: "housing_piso",          label: "Housing en piso",           price: 450 },
    ],
  },
  delft: {
    titulo: "Contrato — TU Delft",
    short: "Aplicación + preparación específica para Aeroespaciales en TU Delft",
    extras: [],
  },
  mentoria: {
    titulo: "Contrato — Mentoría",
    short: "Mentoría y adaptación durante el curso académico",
    extras: [
      { id: "revision_candidaturas", label: "Revisión de candidaturas", price: 150 },
    ],
  },
};

// Renderiza un texto con placeholders {{X}} envolviendo cada match en <Hl>.
function renderContractText(text, values) {
  const parts = String(text || "").split(/(\{\{[A-Z_]+\}\})/);
  return parts.map((p, i) => {
    const m = p.match(/^\{\{([A-Z_]+)\}\}$/);
    if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
    const v = values[m[1]];
    return <Hl key={i}>{v == null || v === "" ? m[1] : v}</Hl>;
  });
}

// Renderiza un bloque del contrato (h2/h3/p/ul/spacer).
function renderContractBlock(b, i, values) {
  switch (b.type) {
    case "h2":
      return <p key={i} className="font-bold text-slate-900 mt-3" style={{ fontFamily: "'Georgia', serif" }}>{b.text}</p>;
    case "h3":
      return <p key={i} className="font-semibold text-slate-800 mt-2">{b.text}</p>;
    case "p":
      return <p key={i}>{renderContractText(b.text, values)}</p>;
    case "ul":
      return (
        <ul key={i} className="list-disc pl-5 space-y-1">
          {(b.items || []).map((it, j) => <li key={j}>{renderContractText(it, values)}</li>)}
        </ul>
      );
    case "spacer":
      return <div key={i} className="h-2" />;
    default:
      return null;
  }
}

export function OnboardingContract({ user, onLogout, onDone }) {
  const today = new Date();
  const todayStr = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "long", year: "numeric" }).format(today);

  const tipo = (user.tipo || "general").toLowerCase();
  const variant = CONTRACT_VARIANTS[tipo] || CONTRACT_VARIANTS.general;
  const esOtros = (user.origin || "") === "otros";
  const esMaestria = esOtros && (user.application_level || "") === "maestria";
  const esPasaporte = esOtros && user.has_eu_id === false;
  const docLabel = esPasaporte ? "Pasaporte" : "DNI";
  const contractTitulo = esMaestria
    ? "Contrato — Consultoría académica (Máster)"
    : esOtros
      ? "Contrato — Consultoría académica (Internacional)"
      : variant.titulo;
  const contractSubtitle = esOtros
    ? (esMaestria
        ? "Internacional · admisión a programas de máster en Países Bajos"
        : "Internacional · aplicación a universidades en Países Bajos")
    : variant.short;

  const alumnoNombre = `${user.nombre || ""} ${user.apellidos || ""}`.trim() || "—";
  const alumnoDni = user.dni_numero || "—";
  const alumnoDireccion = user.direccion || "—";

  const contractVariant = CONTRACT_TEMPLATES[contractVariantKey(tipo, esOtros)] || CONTRACT_TEMPLATES.general;

  const [nombreCliente, setNombreCliente] = useState("");
  const [dniCliente, setDniCliente] = useState("");
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [agree, setAgree] = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleExtra(id) {
    setSelectedExtras((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  async function submit() {
    if (!nombreCliente.trim() || !dniCliente.trim()) {
      setError("Rellena nombre y DNI del cliente."); return;
    }
    if (!agree) { setError("Debes aceptar los términos y condiciones."); return; }
    if (!sigDataUrl) { setError("Es necesario firmar el contrato."); return; }
    setBusy(true); setError("");
    try {
      await contractSave({
        nombre_cliente: nombreCliente.trim(),
        dni_cliente: dniCliente.trim().toUpperCase(),
        extras: selectedExtras,
        signature_content: sigDataUrl,
      });
      await onDone();
    } catch (e) {
      if (e.data?.error === "dni_not_completed") setError("Antes debes completar la verificación del DNI.");
      else setError(e.message || "No se pudo guardar el contrato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      title={contractTitulo}
      subtitle={contractSubtitle}
      stepNumber={3}
      icon={<FileText className="h-4 w-4" />}
      onLogout={onLogout}
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-sky-50 text-sky-700 border border-sky-100 px-3 py-2 text-sm">
          {esMaestria
            ? "Tus datos personales se han extraído automáticamente de tu documento de identidad. Revisa el contrato y fírmalo para continuar."
            : <>Los datos del <strong>alumno</strong> (nombre, DNI y dirección) se han extraído automáticamente del DNI. El <strong>cliente</strong> (tutor legal) sólo introduce su nombre y su propio DNI.</>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-slate-800" style={{ fontFamily: "'Georgia', serif" }}>
              {contractTitulo}
            </div>
            <div className="text-[11px] text-slate-400">Fecha: {todayStr}</div>
          </div>
          <div className="px-4 py-4 max-h-[520px] overflow-auto text-[13px] leading-relaxed text-slate-700 space-y-2.5">
            {(() => {
              const values = {
                CLIENTE_NOMBRE: nombreCliente || "NOMBRE DEL CLIENTE",
                CLIENTE_DOC: dniCliente || (docLabel + " DEL CLIENTE").toUpperCase(),
                CLIENTE_DOC_LABEL: docLabel,
                ALUMNO_NOMBRE: alumnoNombre,
                ALUMNO_DOC: alumnoDni,
                ALUMNO_DOC_LABEL: docLabel,
                DIRECCION: alumnoDireccion,
                NUM_CARRERAS: "1, 2 o 3",
                FECHA: todayStr,
              };
              return contractVariant.blocks.map((b, i) => renderContractBlock(b, i, values));
            })()}

            <div className="pt-3 mt-3 border-t border-slate-100 space-y-2.5">
              <p className="font-bold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>Firmas</p>
              <p>
                Por PROJECT ROBIN STUDENTS MOBILITY S.L.<br />
                Administrador: Noel Cortes Cordoba — NIF B75355057<br />
                Fecha: <Hl>{todayStr}</Hl>
              </p>
              <p>
                Por El Cliente:<br />
                {esMaestria
                  ? <><Hl>{nombreCliente || "NOMBRE DEL CLIENTE"}</Hl><br />{docLabel} del firmante: <Hl>{dniCliente || "—"}</Hl><br /></>
                  : <><Hl>{nombreCliente || "NOMBRE DEL CLIENTE"}</Hl>, tutor legal de <Hl>{alumnoNombre}</Hl> con {docLabel} <Hl>{alumnoDni}</Hl><br />{docLabel} del firmante (tutor legal): <Hl>{dniCliente || "—"}</Hl><br /></>}
                Fecha: <Hl>{todayStr}</Hl>
              </p>
              <p className="text-[12px] font-semibold text-slate-700 pt-2">
                {contractVariant.acceptanceFooter}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Datos del alumno (extraídos del DNI)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldReadOnly label="Nombre del alumno" value={alumnoNombre} />
            <FieldReadOnly label="DNI del alumno" value={alumnoDni} />
            <div className="sm:col-span-2">
              <FieldReadOnly label="Dirección del alumno" value={alumnoDireccion} />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Datos del cliente{esMaestria ? "" : " (tutor legal)"}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre completo del cliente" value={nombreCliente} onChange={setNombreCliente} placeholder="Nombre y apellidos" />
            <Field label="DNI del cliente" value={dniCliente} onChange={(v) => setDniCliente(v.toUpperCase())} placeholder="12345678A" />
          </div>
        </div>

        {variant.extras.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Extras opcionales</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {variant.extras.map((x) => {
                const on = selectedExtras.includes(x.id);
                return (
                  <label key={x.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition"
                    style={on ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={on} onChange={() => toggleExtra(x.id)} className="hidden" />
                      <span className="h-4 w-4 rounded grid place-items-center flex-shrink-0"
                        style={on ? { background: GOLD } : { background: "transparent", border: "1.5px solid #cbd5e1" }}>
                        {on && <CheckCircle2 className="h-3 w-3" style={{ color: NAVY }} />}
                      </span>
                      <span className="font-medium">{x.label}</span>
                    </span>
                    <span className={`text-xs font-semibold ${on ? "text-white/80" : "text-slate-500"}`}>+{x.price} €</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Firma digital</div>
          <SignaturePad onChange={setSigDataUrl} />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
          <span>He leído y acepto los términos y condiciones del contrato.</span>
        </label>

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <Btn className="w-full" size="lg"
          onClick={submit}
          disabled={busy || !agree || !sigDataUrl || !nombreCliente.trim() || !dniCliente.trim()}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <>Firmar y continuar <ChevronRight className="h-4 w-4" /></>}
        </Btn>
      </div>
    </OnboardingShell>
  );
}

function Hl({ children }) {
  return (
    <span style={{ background: "rgba(245,166,35,0.25)", padding: "0 4px", borderRadius: 4, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function FieldReadOnly({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</div>
      <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700 border border-slate-100">{value || "—"}</div>
    </div>
  );
}

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2;
    ctx.strokeStyle = "#0e1c45";
  }, []);

  function pointerXY(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) { e.preventDefault(); const { x, y } = pointerXY(e); const ctx = canvasRef.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(x, y); setDrawing(true); }
  function move(e) { if (!drawing) return; e.preventDefault(); const { x, y } = pointerXY(e); const ctx = canvasRef.current.getContext("2d"); ctx.lineTo(x, y); ctx.stroke(); setEmpty(false); }
  function end() { if (!drawing) return; setDrawing(false); onChange(canvasRef.current.toDataURL("image/png")); }
  function clear() { const c = canvasRef.current; const ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(""); }

  return (
    <div>
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden relative" style={{ height: 180 }}>
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair touch-none"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        {empty && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-xs text-slate-400">Firma aquí con el ratón o el dedo</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-400">La firma queda registrada con fecha y hora.</span>
        <button type="button" onClick={clear} className="text-xs text-slate-500 hover:text-slate-800 underline">Borrar firma</button>
      </div>
    </div>
  );
}

// =====================
//  ONBOARDING — PAGO (Stripe)
// =====================
export function OnboardingPayment({ user, onLogout, onDone }) {
  const amount = Number(user.first_payment_amount);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  // Si volvemos de Stripe con session_id, el gate principal ya dispara la
  // verificación; aquí mostramos "confirmando" para evitar parpadeo.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    try {
      const sid = new URLSearchParams(window.location.search).get("session_id");
      if (sid) setConfirming(true);
    } catch (error) { reportClientError("optional_operation", error); }
  }, []);

  async function pay() {
    setBusy(true); setError("");
    try {
      const r = await onboardingCheckout();
      if (r && r.url) { window.location.href = r.url; return; }
      setError("No se pudo iniciar el pago."); setBusy(false);
    } catch (e) {
      if (e.data?.error === "contract_not_signed") setError("Antes debes firmar el contrato.");
      else if (e.data?.error === "already_paid") { await onDone(); return; }
      else if (e.data?.error === "stripe_not_configured") setError("La pasarela de pago no está configurada todavía. Contacta con tu asesor.");
      else setError(e.message || "No se pudo iniciar el pago.");
      setBusy(false);
    }
  }

  const amountStr = Number.isFinite(amount)
    ? amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  return (
    <OnboardingShell
      title="Realiza el primer pago"
      subtitle={amountStr ? `Pago seguro con tarjeta · Importe: ${amountStr} €` : "Pago seguro con tarjeta"}
      stepNumber={5}
      icon={<CreditCard className="h-4 w-4" />}
      onLogout={onLogout}
    >
      <div className="space-y-5">
        {confirming ? (
          <div className="rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-3 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirmando tu pago…
          </div>
        ) : (
          <div className="rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-2 text-xs">
            🔒 El pago se procesa de forma segura en <strong>Stripe</strong>. Project Robin no almacena los datos de tu tarjeta.
          </div>
        )}

        <div className="rounded-2xl p-5 relative overflow-hidden text-white"
          style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-white/50">Project Robin · Pago</div>
            <CreditCard className="h-5 w-5 text-white/70" />
          </div>
          <div className="text-3xl font-bold mt-4 tracking-tight">{amountStr ? `${amountStr} €` : "Importe calculado al continuar"}</div>
          <div className="mt-2 text-xs text-white/60">Primera cuota del programa</div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <Btn className="w-full" size="lg" variant="gold" onClick={pay} disabled={busy || confirming}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirigiendo a pago seguro…</> : <>Continuar a Stripe{amountStr ? ` · ${amountStr} €` : ""} <ChevronRight className="h-4 w-4" /></>}
        </Btn>

        <div className="text-[11px] text-slate-400 text-center">
          Serás redirigido a la pasarela segura de Stripe. Al completar el pago quedará registrada la primera cuota; las siguientes las gestionará tu asesor.
        </div>
      </div>
    </OnboardingShell>
  );
}

// =====================
//  ONBOARDING — PROFILE
// =====================
// =====================
//  CUESTIONARIO DE ONBOARDING (areas de interes)
//  Datos -> users.questionnaire (Supabase) -> IA -> sugerencias de carreras.
// =====================
function initQuestionnaireAnswers() {
  const a = {};
  const all = [Q_GENERAL, Q_VOCACIONAL, ...Object.keys(Q_AREAS).map((k) => Q_AREAS[k]), ...Q_MASTER_BLOCKS];
  all.forEach((blk) => blk.questions.forEach((q) => {
    if (q.type === "slider") a[q.id] = q.def;
  }));
  return a;
}
function qOptLabel(options, v) {
  const o = (options || []).find((x) => (typeof x === "string" ? x : x.value) === v);
  if (!o) return v;
  return typeof o === "string" ? o : o.label;
}
function qFmtSlider(def, val) {
  if (def.suffix) return String(val) + def.suffix;
  if (def.left && def.right) return val + "/" + def.max + " (" + def.left + " ↔ " + def.right + ")";
  return val + "/" + def.max;
}

function QSlider({ value, min, max, step, left, right, suffix, onChange }) {
  const v = value == null ? min : value;
  return (
    <div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: NAVY }} />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-slate-400">{left}</span>
        <span className="text-sm font-bold" style={{ color: NAVY }}>{v}{suffix || ""}</span>
        <span className="text-[11px] text-slate-400">{right}</span>
      </div>
    </div>
  );
}

function QChoiceGrid({ options, value, multi, max, onChange }) {
  const arr = multi ? (Array.isArray(value) ? value : []) : [];
  function pick(val) {
    if (multi) {
      if (arr.includes(val)) onChange(arr.filter((x) => x !== val));
      else { if (max && arr.length >= max) return; onChange([...arr, val]); }
    } else {
      onChange(val);
    }
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {(options || []).map((o) => {
        const ov = typeof o === "string" ? o : o.value;
        const ol = typeof o === "string" ? o : o.label;
        const on = multi ? arr.includes(ov) : value === ov;
        return (
          <button key={ov} type="button" onClick={() => pick(ov)}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium text-left transition"
            style={on ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
            <span className="h-4 w-4 rounded grid place-items-center flex-shrink-0"
              style={on ? { background: GOLD } : { background: "transparent", border: "1.5px solid #cbd5e1" }}>
              {on && <CheckCircle2 className="h-3 w-3" style={{ color: NAVY }} />}
            </span>
            <span className="leading-tight">{ol}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuestionField({ def, value, onChange }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-slate-700 mb-2">
        {def.q}
        {def.optional && <span className="text-slate-400 font-normal"> (opcional)</span>}
        {def.type === "multi" && def.max && <span className="text-slate-400 font-normal"> · máx. {def.max}</span>}
      </div>
      {def.type === "text" && (
        <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
      )}
      {def.type === "textarea" && (
        <textarea rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition resize-none" />
      )}
      {def.type === "slider" && (
        <QSlider value={value} min={def.min} max={def.max} step={def.step}
          left={def.left} right={def.right} suffix={def.suffix} onChange={onChange} />
      )}
      {(def.type === "single" || def.type === "multi") && (
        <QChoiceGrid options={def.options} value={value} multi={def.type === "multi"} max={def.max} onChange={onChange} />
      )}
    </div>
  );
}

export function OnboardingProfile({ user, onLogout, onDone }) {
  const [email, setEmail] = useState(user.email || "");
  const [intereses, setIntereses] = useState(user.intereses || []);
  const [answers, setAnswers] = useState(initQuestionnaireAnswers);
  const [screen, setScreen] = useState(0); // 0 = correo + intereses
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "ciencias", label: "Ciencias" },
    { value: "tecnologia_y_programacion", label: "Tecnología y programación" },
    { value: "business", label: "Business" },
    { value: "ciencias_de_la_salud", label: "Ciencias de la salud" },
    { value: "ingenierias", label: "Ingenierías" },
    { value: "ciencias_sociales", label: "Ciencias sociales" },
    { value: "artes", label: "Artes" },
  ];

  const esMaestria = user.origin === "otros" && user.application_level === "maestria";
  const blocks = useMemo(
    () => esMaestria
      ? Q_MASTER_BLOCKS
      : [Q_GENERAL, ...intereses.map((i) => Q_AREAS[i]).filter(Boolean), Q_VOCACIONAL],
    [intereses, esMaestria]
  );
  const totalScreens = 1 + blocks.length;

  function toggle(v) {
    setIntereses((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
    setError("");
  }
  function setAns(id, val) { setAnswers((a) => ({ ...a, [id]: val })); setError(""); }

  function validateScreen(idx) {
    if (idx === 0) {
      if (!email.trim()) return "Falta el correo electrónico.";
      if (intereses.length === 0) return "Selecciona al menos un área de interés.";
      return "";
    }
    const blk = blocks[idx - 1];
    if (!blk) return "";
    for (let k = 0; k < blk.questions.length; k++) {
      const q = blk.questions[k];
      if (q.optional || q.type === "slider") continue;
      const v = answers[q.id];
      const ok = q.type === "multi"
        ? Array.isArray(v) && v.length > 0
        : v != null && String(v).trim() !== "";
      if (!ok) return "Por favor, completa todas las preguntas obligatorias de esta sección.";
    }
    return "";
  }

  function buildQuestionnaire() {
    const outBlocks = blocks.map((blk) => ({
      title: blk.title,
      items: blk.questions
        .map((q) => {
          let a = answers[q.id];
          if (q.type === "multi") {
            a = (Array.isArray(a) ? a : []).map((v) => qOptLabel(q.options, v));
          } else if (q.type === "slider") {
            a = qFmtSlider(q, a == null ? q.def : a);
          } else {
            a = a == null ? "" : String(a);
          }
          return { q: q.q, a };
        })
        .filter((it) => (Array.isArray(it.a) ? it.a.length : String(it.a).trim())),
    }));
    const signals = {
      nota_media: answers.g_nota,
      estilo_aprendizaje: answers.g_estilo,
      independencia: answers.g_independencia,
      presupuesto_mensual: answers.g_presupuesto,
      nivel_ingles: answers.g_ingles || "",
      asignaturas_fav: answers.g_fav || [],
      asignaturas_menos: answers.g_menos || [],
      rasgos: answers.g_rasgos || [],
      valora: answers.g_valora || [],
      prioridad: answers.v_prioridad || "",
      paises: answers.v_paises || [],
      areas: intereses,
    };
    return { version: 1, blocks: outBlocks, signals };
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      await profileSave({ email: email.trim(), intereses, questionnaire: buildQuestionnaire() });
      await onDone();
    } catch (e) {
      if (e.status === 409) setError("Ese correo ya está en uso por otra cuenta.");
      else if (e.data?.error === "invalid_email") setError("El correo no es válido.");
      else if (e.data?.error === "missing_questionnaire") setError("Faltan respuestas del cuestionario.");
      else setError(e.message || "No hemos podido guardar.");
      setBusy(false);
    }
  }

  function next() {
    const err = validateScreen(screen);
    if (err) { setError(err); return; }
    setError("");
    if (screen < totalScreens - 1) {
      setScreen((s) => s + 1);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      submit();
    }
  }
  function back() {
    setError("");
    setScreen((s) => Math.max(0, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const curBlock = screen > 0 ? blocks[screen - 1] : null;
  const subtitle = screen === 0
    ? "Tu correo será tu usuario para entrar al portal."
    : "Cuestionario de orientación · sección " + screen + " de " + (totalScreens - 1);
  const isLast = screen === totalScreens - 1;

  return (
    <OnboardingShell title="Tu perfil académico" subtitle={subtitle} stepNumber={4} icon={<Mail className="h-4 w-4" />} onLogout={onLogout}>
      <div className="space-y-5">
        {/* Progreso interno del cuestionario */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalScreens }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-full flex-1 transition"
              style={{ background: i <= screen ? NAVY : "#e2e8f0" }} />
          ))}
        </div>

        {screen === 0 && (
          <>
            <Field label="Correo electrónico" value={email} onChange={setEmail} placeholder="tu@correo.com" type="email" />
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Áreas de interés para tu carrera</div>
              <div className="text-xs text-slate-400 mb-3">{esMaestria ? "Selecciona al menos una: las áreas en las que te gustaría especializarte." : "Selecciona al menos una. Puedes elegir varias — adaptaremos el cuestionario a tus elecciones."}</div>
              <div className="grid grid-cols-2 gap-2">
                {options.map((o) => {
                  const on = intereses.includes(o.value);
                  return (
                    <button key={o.value} type="button" onClick={() => toggle(o.value)}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition text-left"
                      style={on ? { background: NAVY, color: "white", borderColor: NAVY } : { background: "white", color: "#475569", borderColor: "#e2e8f0" }}>
                      <span className="h-4 w-4 rounded grid place-items-center flex-shrink-0"
                        style={on ? { background: GOLD } : { background: "transparent", border: "1.5px solid #cbd5e1" }}>
                        {on && <CheckCircle2 className="h-3 w-3" style={{ color: NAVY }} />}
                      </span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {screen > 0 && curBlock && (
          <>
            <div className="rounded-xl px-4 py-3" style={{ background: "#f1f4fb" }}>
              <div className="text-sm font-bold" style={{ color: NAVY, fontFamily: "'Georgia', serif" }}>{curBlock.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {esMaestria
                  ? "Estas respuestas ayudan a tu asesor a preparar tu candidatura al máster."
                  : screen === 1
                    ? "Estas respuestas ayudan a tu asesor y a nuestra IA a recomendarte las carreras más compatibles."
                    : "Cuanto más concreto seas, mejores serán las recomendaciones."}
              </div>
            </div>
            <div className="space-y-5">
              {curBlock.questions.map((q) => (
                <QuestionField key={q.id} def={q} value={answers[q.id]} onChange={(v) => setAns(q.id, v)} />
              ))}
            </div>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {screen > 0 && (
            <Btn variant="secondary" onClick={back} disabled={busy}>
              <ChevronLeft className="h-4 w-4" /> Atrás
            </Btn>
          )}
          <Btn className="flex-1" size="lg" onClick={next}
            disabled={busy || (screen === 0 && (!email.trim() || intereses.length === 0))}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              : isLast ? <>Finalizar <CheckCircle2 className="h-4 w-4" /></>
              : <>Continuar <ChevronRight className="h-4 w-4" /></>}
          </Btn>
        </div>
      </div>
    </OnboardingShell>
  );
}

function OnboardingShell({ title, subtitle, stepNumber, totalSteps = 5, icon, onLogout, children }) {
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'system-ui', sans-serif" }}>
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10 relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${NAVY_DARK} 0%, ${NAVY} 60%, #2a4a8e 100%)` }}>
        <div className="absolute inset-0 opacity-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-white"
              style={{ width: (i + 1) * 180, height: (i + 1) * 180, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
          ))}
        </div>
        <div className="relative">
          <img src={logoRBlanco} alt="Robin" className="h-16 w-auto" />
        </div>
        <div className="relative">
          <div className="text-white/60 text-xs uppercase tracking-widest mb-2">Paso {stepNumber} de {totalSteps} · Onboarding</div>
          <div className="text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Georgia', serif", lineHeight: 1.2 }}>
            Activamos<br />tu cuenta<br />Robin.
          </div>
          <div className="text-white/60 text-sm leading-relaxed">Solo unos minutos y ya podrás acceder a documentos, llamadas y el chat con tu asesor.</div>
        </div>
        <button onClick={onLogout} className="relative text-white/40 text-xs hover:text-white/80 underline self-start">Cerrar sesión</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 overflow-y-auto">
        <div className="w-full max-w-xl">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl grid place-items-center text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})` }}>
                  {icon || (stepNumber === 1 ? <CreditCard className="h-4 w-4" />
                    : stepNumber === 2 ? <FileText className="h-4 w-4" />
                    : stepNumber === 3 ? <Mail className="h-4 w-4" />
                    : <CreditCard className="h-4 w-4" />)}
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-slate-900 truncate" style={{ fontFamily: "'Georgia', serif" }}>{title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>
                </div>
              </div>
              <Stepper current={stepNumber} total={totalSteps} />
            </div>
            <div className="p-6">{children}</div>
          </div>
          <button onClick={onLogout} className="mt-4 text-xs text-slate-400 hover:text-slate-700 underline w-full text-center lg:hidden">Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, total = 3 }) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="hidden sm:flex items-center gap-1.5">
      {steps.map((n) => (
        <div key={n} className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full grid place-items-center text-[11px] font-bold"
            style={n < current ? { background: "#10b981", color: "white" } : n === current ? { background: NAVY, color: "white" } : { background: "#e2e8f0", color: "#64748b" }}>
            {n < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
          </div>
          {n < total && <div className="h-px w-6" style={{ background: "#e2e8f0" }} />}
        </div>
      ))}
    </div>
  );
}

// =====================
//  PORTAL SHELL
// =====================
