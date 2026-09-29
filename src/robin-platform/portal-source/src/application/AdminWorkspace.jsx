import React, { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users, Bell, LogOut, Shield, Search, X, ArrowLeft, ArrowLeftRight, ChevronRight, User, BookOpen, FileText, CreditCard, Sparkles, Calendar, Compass, HelpCircle } from "lucide-react";
import robinWordmark from "../assets/robin-wordmark.png";
import { APP_STEPS } from "../application-steps.js";
import "./admin-portal.css";

export const CLIENT_TABS = [
  { key: "estado", label: "Progreso", icon: Compass },
  { key: "perfil", label: "Perfil", icon: User },
  { key: "carreras", label: "Carreras", icon: BookOpen },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "chat", label: "Chat del alumno", icon: Sparkles },
  { key: "reservas", label: "Llamadas", icon: Calendar },
];
const GLOBAL_TABS = [
  { key: "inicio", label: "Resumen", icon: LayoutDashboard },
  { key: "clientes", label: "Mis clientes", icon: Users },
  { key: "notificaciones", label: "Notificaciones", icon: Bell },
  { key: "faqs", label: "FAQs", icon: HelpCircle },
];
const fullName = c => `${c.nombre || ""} ${c.apellidos || ""}`.trim() || c.email || c.username || "Alumno";

export function AdminWorkspace({ embedded = false, adminName, active, client, clients, loading, error, onNavigate, onSwitchClient, onLogout, children }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const switchRef = useRef(null);
  const tabRef = useRef(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    tabRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, client?.id]);
  const page = GLOBAL_TABS.find(t => t.key === active);
  const clientPage = CLIENT_TABS.some(t => t.key === active);
  return <div className={`admin-workspace${embedded ? " is-embedded" : ""}`}>
    <a className="admin-skip" href="#admin-content">Saltar al contenido</a>
    {!embedded && <header className="admin-header">
      <button className="admin-brand" onClick={() => onNavigate("inicio")} aria-label="Robin, ir al resumen"><img src={robinWordmark} alt="ROBIN" /><span>TEAM WORKSPACE</span></button>
      <div className="admin-account"><span><Shield size={15} />{adminName}</span>{onLogout && <button onClick={onLogout}><LogOut size={16} />Salir</button>}</div>
    </header>}
    <div className="admin-layout">
      {!embedded && <aside className="admin-sidebar">
        <div className="admin-team"><span className="admin-team-icon"><Shield size={21} /></span><div><strong>Equipo Robin</strong><span>Administración</span></div></div>
        <p className="admin-eyebrow admin-nav-caption">VISTA GENERAL</p>
        <nav className="admin-global-nav" aria-label="Administración">
          {GLOBAL_TABS.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => onNavigate(key)} aria-current={active === key || (key === "clientes" && clientPage) ? "page" : undefined}><Icon size={19} /><span>{label}</span>{key === "clientes" && !loading && !error && <small>{clients.length}</small>}</button>)}
        </nav>
        <div className="admin-sidebar-note"><Compass size={23} /><h3>Cada camino cuenta.</h3><p>Abre un expediente para gestionar el progreso, los documentos y las conversaciones de ese alumno.</p></div>
      </aside>}
      <div className="admin-workarea">
        {clientPage ? client ? <div className="admin-client-context">
          <div className="admin-breadcrumb"><button onClick={() => onNavigate("clientes")}><ArrowLeft size={14} />Mis clientes</button><ChevronRight size={13} /><span>Expediente del alumno</span></div>
          <div className="admin-client-heading">
            <div className="admin-client-avatar" aria-hidden="true">{(client.nombre || fullName(client)).charAt(0)}{(client.apellidos || "").charAt(0)}</div>
            <div className="admin-client-identity"><span className="admin-eyebrow">ESTÁS GESTIONANDO A</span><h1>{fullName(client)}</h1><p>{client.email || client.username || "Sin email"}<span> · ID: {client.lead_id || client.username || client.id}</span></p></div>
            <button ref={switchRef} className="admin-switch" onClick={() => setPickerOpen(true)}><ArrowLeftRight size={16} />Cambiar cliente</button>
          </div>
          <div className="admin-client-phase"><span className={client.requires_onboarding ? "is-onboarding" : ""}>{client.requires_onboarding ? "Registro pendiente" : "Expediente activo"}</span><p>Paso {client.application_phase || 1} · {APP_STEPS.find(s => s.key === (client.application_phase || 1))?.label || "Proceso de admisión"}</p></div>
          <nav ref={tabRef} className="admin-client-tabs" aria-label="Expediente del alumno">{CLIENT_TABS.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => onNavigate(key)} aria-current={active === key ? "page" : undefined}><Icon size={16} />{label}</button>)}</nav>
        </div> : <div className="admin-empty-context" role="status"><h1>{loading ? "Cargando expediente…" : "Este expediente no está disponible"}</h1><p>{error || "Vuelve a tus clientes y selecciona un alumno asignado."}</p><button onClick={() => onNavigate("clientes")}>Ir a mis clientes</button></div>
        : <div className="admin-page-heading"><h1 className="admin-eyebrow admin-page-title">{page?.label}</h1></div>}
        {children}
      </div>
    </div>
    {pickerOpen && <ClientPicker clients={clients} selectedId={client?.id} onClose={() => setPickerOpen(false)} returnRef={switchRef} onSelect={c => { onSwitchClient(c); setPickerOpen(false); }} />}
  </div>;
}

function ClientPicker({ clients, selectedId, onSelect, onClose, returnRef }) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('input')?.focus();
    return () => { dialog.close(); returnRef.current?.focus(); };
  }, [returnRef]);
  const filtered = clients.filter(c => `${fullName(c)} ${c.email || ""} ${c.username || ""} ${c.lead_id || ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  return <dialog ref={dialogRef} className="admin-client-picker" aria-labelledby="client-picker-title" onCancel={onClose}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <div className="admin-picker-header"><div><span className="admin-eyebrow">MIS CLIENTES</span><h2 id="client-picker-title">Cambiar de expediente</h2></div><button onClick={onClose} aria-label="Cerrar selector de clientes"><X size={20} /></button></div>
    <p className="admin-picker-hint">Abrirás la misma sección para el alumno que selecciones. Los borradores sin guardar no se trasladan y el asistente iniciará un contexto nuevo.</p>
    <label className="admin-picker-search"><Search size={18} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, email o identificador" aria-label="Buscar cliente" /></label>
    <div className="admin-picker-results">{filtered.length === 0 ? <p>No hay clientes que coincidan con tu búsqueda.</p> : filtered.map(c => <button key={c.id} onClick={() => onSelect(c)} aria-current={c.id === selectedId ? "true" : undefined}><span><strong>{fullName(c)}</strong><small>{c.email || c.username} · ID: {c.lead_id || c.id}</small></span><span>{c.id === selectedId ? "Actual" : <ChevronRight size={18} />}</span></button>)}</div>
  </dialog>;
}
