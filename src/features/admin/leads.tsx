import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Database, Download, Filter, Flame, GraduationCap, LayoutGrid, List, Mail, PhoneCall, Search, UserCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact, CrmStage, LeadCategory, LeadContactRole, LostReason } from "@/types/domain";
import { integrationClient } from "@/services/integrations";
import type { FutureAcademicYear } from "@/services/admin-data";
import { portalClient } from "@/services/portal";
import type { FeatureModuleProps } from './feature-shared';
import { lostReasonLabel, Title, ContactDrawer, contactRoleOptions, contactRoleLabels, lostReasonOptions } from './feature-shared';
import { EmailComposer } from "./email-composer";

export { LeadInbox } from "./lead-inbox";
import { leadDaysWithoutContact, formatLeadEntry, campaignOrOrigin } from "./lead-shared";
export type { LeadGroupRow } from "./lead-shared";
export { emptyLeadGroupRow, leadEntryTimestamp, leadDaysWithoutContact, formatLeadEntry, campaignOrOrigin, webFormLabel } from "./lead-shared";

export function Crm({ path, currentUser, admins, contacts, leadOwners, onAssignLead, leadStages, onMoveLead, onMoveLeadToFuture, onQualifyLead, onDeleteLead, leadCategories: categories, onCategorizeLead, leadHeat, onSetLeadHeat, onSetLeadContactRole, leadNotes, onSetLeadNotes, leadLostDates, portalSnapshot, portalConnected, onPortalRefresh, notify, isDeveloperAdmin }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [leadView, setLeadView] = useState<"cards" | "table">("cards");
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [exportingClients, setExportingClients] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [lostCategory, setLostCategory] = useState("");
  const [lostHeat, setLostHeat] = useState("0");
  const [lostFrom, setLostFrom] = useState("");
  const [lostTo, setLostTo] = useState("");
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState("");
  const [pendingLostId, setPendingLostId] = useState<string | null>(null);
  const [lostDestination, setLostDestination] = useState<"lost" | "future">("lost");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [futureAcademicYear, setFutureAcademicYear] = useState<FutureAcademicYear | "">("");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");
  const [pendingQualificationId, setPendingQualificationId] = useState<string | null>(null);
  const [qualificationContactRole, setQualificationContactRole] = useState<LeadContactRole | "">("");
  const [qualificationHeat, setQualificationHeat] = useState(50);
  const [qualificationInitialHeat, setQualificationInitialHeat] = useState(50);
  const [qualificationDuration, setQualificationDuration] = useState("");
  const [qualificationNotes, setQualificationNotes] = useState("");
  const [qualifying, setQualifying] = useState(false);
  const [qualificationError, setQualificationError] = useState("");
  const [stageReminderOpen, setStageReminderOpen] = useState(false);
  const [stageReminderClosable, setStageReminderClosable] = useState(false);
  const [stageReminderVersion, setStageReminderVersion] = useState(0);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const owned = useMemo(() => contacts.filter((contact) => (isDeveloperAdmin || leadOwners[contact.id] === currentUser) && `${contact.name} ${contact.email} ${contact.source}`.toLowerCase().includes(query.toLowerCase())), [contacts, currentUser, isDeveloperAdmin, leadOwners, query]);
  const campaigns = useMemo(() => Array.from(new Set(contacts
    .filter((contact) => (isDeveloperAdmin || leadOwners[contact.id] === currentUser) && (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar")
    .map((contact) => leadCampaignLabel(contact.campaign))))
    .sort((a, b) => a.localeCompare(b, "es")), [contacts, currentUser, isDeveloperAdmin, leadOwners, leadStages]);
  const porContactarLeads = owned.filter((contact) => {
    if ((leadStages[contact.id] || contact.stage || "Por contactar") !== "Por contactar") return false;
    if (categoryFilter !== "all" && categories[contact.id] !== categoryFilter) return false;
    const campaign = leadCampaignLabel(contact.campaign);
    return campaignFilter === "all" || campaign === campaignFilter;
  });
  const activeCrmFilters = Number(categoryFilter !== "all") + Number(campaignFilter !== "all");

  useEffect(() => {
    if (!stageReminderOpen) return;
    setStageReminderClosable(false);
    const timer = window.setTimeout(() => setStageReminderClosable(true), 5000);
    return () => window.clearTimeout(timer);
  }, [stageReminderOpen, stageReminderVersion]);

  function openContact(contact: Contact) {
    setSelected({ ...contact, owner: leadOwners[contact.id] || contact.owner || (isDeveloperAdmin ? "" : currentUser), category: categories[contact.id] || undefined, heat: leadHeat[contact.id], notes: leadNotes[contact.id] });
  }

  function showStageReminder() {
    setStageReminderOpen(true);
    setStageReminderVersion((version) => version + 1);
  }

  function beginQualification(contact: Contact) {
    const currentHeat = leadHeat[contact.id] ?? contact.heat ?? 50;
    setPendingQualificationId(contact.id);
    setQualificationContactRole(contact.contactRole || "");
    setQualificationHeat(currentHeat);
    setQualificationInitialHeat(currentHeat);
    setQualificationDuration("");
    setQualificationNotes("");
    setQualificationError("");
  }

  async function confirmQualification() {
    const leadId = pendingQualificationId;
    const durationMinutes = Number(qualificationDuration);
    if (!leadId || !qualificationContactRole) return;
    if (qualificationHeat === qualificationInitialHeat) { setQualificationError("Ajusta el heat antes de continuar."); return; }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) { setQualificationError("Introduce la duración de la llamada en minutos."); return; }
    setQualifying(true);
    setQualificationError("");
    try {
      await onQualifyLead(leadId, { contactRole: qualificationContactRole, heat: qualificationHeat, durationMinutes, notes: qualificationNotes.trim() });
      const contact = contacts.find((item) => item.id === leadId);
      setPendingQualificationId(null);
      notify(`${contact?.name || "El lead"} ha pasado a Contactado`);
      showStageReminder();
    } catch (error) {
      setQualificationError(error instanceof Error ? error.message : "No se pudo completar el cambio a Contactado");
    } finally { setQualifying(false); }
  }

  async function exportClientDatabase() {
    setExportingClients(true);
    try {
      const { blob, filename } = await portalClient.downloadClientDatabase();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Base de datos de clientes descargada");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo descargar la base de datos de clientes");
    } finally {
      setExportingClients(false);
    }
  }

  function dropLead(stage: CrmStage) {
    const leadId = draggingId;
    if (!leadId) return;
    setDraggingId(null);
    const contact = contacts.find((item) => item.id === leadId);
    const currentStage = leadStages[leadId] || contact?.stage || "Por contactar";
    if (stage === currentStage) return;
    if (currentStage === "Por contactar" && stage === "Contactado") {
      if (!contact || !categories[leadId]) {
        notify("Selecciona antes el tipo de contrato del lead");
        return;
      }
      beginQualification(contact);
      return;
    }
    if (stage === "Lost") {
      setLostDestination("lost");
      setLostReason("");
      setLostReasonDetail("");
      setFutureAcademicYear("");
      setOutcomeError("");
      setPendingLostId(leadId);
      return;
    }
    if (stage !== "Cliente") {
      onMoveLead(leadId, stage);
      notify(`Lead movido a ${stage}`);
      showStageReminder();
      return;
    }
    const clientType = categories[leadId];
    if (!contact?.email || !clientType) {
      notify("No se puede crear el cliente sin email y tipo de contrato");
      return;
    }
    setSelectedAdvisor("");
    setPendingClientId(leadId);
  }

  async function confirmClientConversion() {
    const leadId = pendingClientId;
    const contact = contacts.find((item) => item.id === leadId);
    const clientType = leadId ? categories[leadId] : "";
    if (!leadId || !contact || !clientType || !selectedAdvisor) return;
    setConvertingId(leadId);
    notify(`Creando la cuenta de ${contact.name} en el portal…`);
    try {
      const result = await integrationClient.convertLead({ leadId, name: contact.name, email: contact.email, advisor: selectedAdvisor, clientType });
      onMoveLead(leadId, "Cliente");
      await onPortalRefresh();
      setPendingClientId(null);
      if (result.result === "exists") notify(`${contact.name} ya existía; ahora su asesor es ${selectedAdvisor}`);
      else if (result.emailSent) notify(`Cuenta creada, asignada a ${selectedAdvisor} y correo de acceso enviado`);
      else notify(`Cuenta creada y asignada a ${selectedAdvisor}; el correo queda pendiente`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo crear la cuenta en el portal");
    } finally { setConvertingId(null); }
  }

  async function confirmLost() {
    const leadId = pendingLostId;
    if (!leadId) return;
    if (lostDestination === "future") {
      if (!futureAcademicYear) return;
      setSavingOutcome(true);
      setOutcomeError("");
      try {
        await onMoveLeadToFuture(leadId, futureAcademicYear);
        setPendingLostId(null);
        notify(`Lead enviado a próximos cursos · ${futureAcademicYear}`);
      } catch (error) {
        setOutcomeError(error instanceof Error ? error.message : "No se pudo mover el lead");
      } finally { setSavingOutcome(false); }
      return;
    }
    if (!lostReason || (lostReason === "other" && !lostReasonDetail.trim())) return;
    onMoveLead(leadId, "Lost", { lostReason, lostReasonDetail: lostReason === "other" ? lostReasonDetail.trim() : "" });
    setPendingLostId(null);
    notify("Lead marcado como perdido con motivo registrado");
  }

  function startDragging(leadId: string) {
    setDraggingId(leadId);
    window.requestAnimationFrame(() => boardWrapRef.current?.scrollTo({ left: boardWrapRef.current.scrollWidth, behavior: "smooth" }));
  }

  const title = path === "/crm/contactados" ? "Pipeline de contactados" : path === "/crm/clientes" ? "Clientes" : path === "/crm/lost" ? "Lost" : "Por contactar";
  return (
    <div className="page">
      <Title name={title} sub={isDeveloperAdmin ? "Acceso global de desarrollo · todos los leads." : `Cartera comercial de ${currentUser}.`} eyebrow="CRM PERSONAL"><Badge variant="outline">{owned.length} REGISTROS</Badge></Title>
      <div className="module-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en mi cartera…" /></label>{path === "/crm" && <><Button variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{activeCrmFilters > 0 && <span className="filter-count">{activeCrmFilters}</span>}</Button><Button variant="outline" aria-pressed={leadView === "table"} onClick={() => setLeadView((view) => view === "cards" ? "table" : "cards")}>{leadView === "cards" ? <List /> : <LayoutGrid />}{leadView === "cards" ? "Vista tabla" : "Vista tarjetas"}</Button><Button className="crm-email-button" variant="outline" onClick={() => setEmailComposerOpen(true)}><Mail />Correo electrónico</Button></>}{isDeveloperAdmin && <a className="ui-button outline" href={`${window.location.pathname.startsWith("/admin") ? "/admin" : ""}/base-datos`}><Database />Base de datos</a>}{path === "/crm/clientes" && <Button variant="outline" disabled={exportingClients} onClick={() => void exportClientDatabase()}><Download />{exportingClients ? "Preparando…" : "Descargar base de datos"}</Button>}</div>

      {path === "/crm" && (
        <>
        {filtersOpen && <section className="lead-filters panel crm-lead-filters"><label>Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as LeadCategory | "all")}><option value="all">Todas las categorías</option>{leadCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Limpiar filtros</button></section>}
        {leadView === "cards" ? <div className="qualification-grid">
          {porContactarLeads.map((contact) => (
            <article className={`qualification-card ${contact.formName === "colegios" ? "school-lead" : ""}`} key={contact.id}>
              <span className={`lead-age-dot ${leadContactAgeTone(leadDaysWithoutContact(contact))}`} title={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} aria-label={`${leadDaysWithoutContact(contact) ?? 0} días sin contactar`} />
              <button className="card-main" onClick={() => openContact(contact)}><small className={contact.formName === "colegios" ? "school-lead-label" : ""}>{contact.formName === "colegios" ? "COLEGIOS" : contact.source}</small><h3>{contact.name}</h3><p>{contact.email}</p><span><Flame /> Heat {leadHeat[contact.id]}</span></button>
              <label>Categoría obligatoria<CategoryPicker value={categories[contact.id] || ""} onChange={(category) => onCategorizeLead(contact.id, category)} /></label>
              <Button disabled={!categories[contact.id]} onClick={() => beginQualification(contact)}>Pasar a contactado<ArrowRight /></Button>
            </article>
          ))}
          {porContactarLeads.length === 0 && <div className="empty compact"><UserCheck /><h2>{owned.some((contact) => (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar") ? "No hay resultados con esos filtros" : "No hay leads por contactar"}</h2><p>{activeCrmFilters ? <button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Quitar filtros</button> : `Los nuevos leads asignados a ${currentUser} aparecerán aquí.`}</p></div>}
        </div> : <section className="panel inbox-panel crm-lead-table">
          <div className="data-table">
            <table>
              <thead><tr><th>Lead</th><th>Entrada</th><th>Campaña / origen</th><th>Curso</th><th>Interés</th><th>Días sin contactar</th><th className="crm-age-column">Estado</th></tr></thead>
              <tbody>
                {porContactarLeads.map((contact) => {
                  const daysWithoutContact = leadDaysWithoutContact(contact);
                  return <tr key={contact.id} onClick={() => openContact(contact)}>
                    <td><button type="button" className="lead-name-button" onClick={() => openContact(contact)}>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<b className={contact.formName === "colegios" ? "school-lead-name" : ""}>{contact.name}</b><small>{contact.email}</small></button></td>
                    <td><time className="lead-entry-time" dateTime={contact.createdAt}>{formatLeadEntry(contact.createdAt)}</time></td>
                    <td><span className="lead-source-readonly">{campaignOrOrigin(contact)}</span>{["Meta Ads", "Página web"].includes(contact.source) && <small className="lead-source-kind">{contact.source}</small>}</td>
                    <td>{contact.course || ""}</td>
                    <td>{contact.interest || ""}</td>
                    <td><span className="days-without-contact">{daysWithoutContact ?? "—"}</span></td>
                    <td className="crm-age-column"><span className={`crm-age-dot ${leadContactAgeTone(daysWithoutContact)}`} title={`${daysWithoutContact ?? 0} días sin contactar`} aria-label={`${daysWithoutContact ?? 0} días sin contactar`} /></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          {porContactarLeads.length === 0 && <div className="empty compact"><UserCheck /><h2>{owned.some((contact) => (leadStages[contact.id] || contact.stage || "Por contactar") === "Por contactar") ? "No hay resultados con esos filtros" : "No hay leads por contactar"}</h2><p>{activeCrmFilters ? <button type="button" onClick={() => { setCategoryFilter("all"); setCampaignFilter("all"); }}>Quitar filtros</button> : `Los nuevos leads asignados a ${currentUser} aparecerán aquí.`}</p></div>}
        </section>}
        </>
      )}

      {path === "/crm/contactados" && (
        <div className="crm-board-wrap" ref={boardWrapRef}>
          <div className="crm-board show-outcomes">
            {salesStages.map((stage) => (
              <section key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead(stage)}>
                <header><strong>{stage}</strong><span>{owned.filter((contact) => leadStages[contact.id] === stage).length}</span></header>
                {owned.filter((contact) => leadStages[contact.id] === stage).map((contact) => (
                  <button draggable={!convertingId} disabled={convertingId === contact.id} className="pipeline-card" key={contact.id} onDragStart={() => startDragging(contact.id)} onDragEnd={() => setDraggingId(null)} onClick={() => openContact(contact)}>
                    <div><Badge variant="outline">{categories[contact.id] || "Sin categoría"}</Badge>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<span className={`heat-pill heat-${Math.ceil((leadHeat[contact.id] || 0) / 25)}`}><Flame />{leadHeat[contact.id]}</span></div>
                    <h3>{contact.name}</h3><p>{contact.source} · {contact.email}</p><small>{contact.lastContact}</small>
                  </button>
                ))}
              </section>
            ))}
            <aside className={`outcome-dropzones ${draggingId ? "active" : "inactive"}`}><div className="in-zone" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead("Cliente")}><strong>IN</strong><span>{draggingId ? "Suelta para crear el cliente" : "Arrastra aquí para convertir"}</span></div><div className="lost-zone" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropLead("Lost")}><strong>LOST</strong><span>{draggingId ? "Suelta para marcar la pérdida" : "Arrastra aquí para descartar"}</span></div></aside>
          </div>
          <p className="drag-hint">Arrastra las tarjetas entre columnas o hasta las zonas IN y LOST situadas después de En espera.</p>
        </div>
      )}

      {path === "/crm/clientes" && <div className="personal-leads">{portalConnected && !portalSnapshot ? <div className="empty compact"><GraduationCap /><h2>Cargando clientes…</h2></div> : portalSnapshot ? portalSnapshot.clients.filter((client) => isDeveloperAdmin || client.assigned_to === portalSnapshot.admin.email).map((client) => <a className="lead-card" key={client.id} href={`${portalSnapshot.portalUrl}/portal/`} target="_blank" rel="noreferrer"><small>{client.tipo || "general"}</small><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email}</p><div><span>Fase {client.application_phase || 1}</span><strong>{client.pago_completed ? "Al corriente" : "Onboarding"}</strong></div><footer>Abrir portal<ChevronRight /></footer></a>) : owned.filter((contact) => leadStages[contact.id] === "Cliente").map((contact) => <button className="lead-card" key={contact.id} onClick={() => openContact(contact)}><small>{categories[contact.id]}</small><h3>{contact.name}</h3><p>{contact.email}</p><div><span>Agente de venta: {leadOwners[contact.id] || currentUser}</span><strong>{contact.value.toLocaleString("es-ES")} €</strong></div><footer>Ver portal del cliente<ChevronRight /></footer></button>)}</div>}

      {path === "/crm/lost" && <><div className="lost-filters"><label>Desde<input type="date" value={lostFrom} onChange={(event) => setLostFrom(event.target.value)} /></label><label>Hasta<input type="date" value={lostTo} onChange={(event) => setLostTo(event.target.value)} /></label><label>Categoría<select value={lostCategory} onChange={(event) => setLostCategory(event.target.value)}><option value="">Todas</option>{leadCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Heat mínimo<input type="number" min="0" max="100" value={lostHeat} onChange={(event) => setLostHeat(event.target.value)} /></label></div><div className="data-table panel"><table><thead><tr><th>Lead</th><th>Categoría</th><th>Heat final</th><th>Origen</th><th>Motivo</th><th>Fecha Lost</th></tr></thead><tbody>{owned.filter((contact) => { const lostDate = (leadLostDates[contact.id] || "").slice(0, 10); return leadStages[contact.id] === "Lost" && (!lostCategory || categories[contact.id] === lostCategory) && leadHeat[contact.id] >= Number(lostHeat || 0) && (!lostFrom || lostDate >= lostFrom) && (!lostTo || lostDate <= lostTo); }).map((contact) => <tr key={contact.id} onClick={() => openContact(contact)}><td><b>{contact.name}</b><small>{contact.email}</small></td><td>{categories[contact.id]}</td><td>{leadHeat[contact.id]}</td><td>{contact.source}</td><td>{lostReasonLabel(contact.lostReason)}{contact.lostReasonDetail && <small>{contact.lostReasonDetail}</small>}</td><td>{leadLostDates[contact.id]?.slice(0, 10) || "—"}</td></tr>)}</tbody></table></div></>}

      {selected && <ContactDrawer contact={selected} admins={admins} leadMode heat={leadHeat[selected.id]} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onOwnerChange={(owner) => { onAssignLead(selected.id, owner); notify(`${selected.name} asignado a ${owner}`); }} onContactRoleChange={(value) => onSetLeadContactRole(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} />}
      {emailComposerOpen && path === "/crm" && <EmailComposer contacts={porContactarLeads} notify={notify} onClose={() => setEmailComposerOpen(false)} />}
      {pendingQualificationId && <div className="drawer-wrap outcome-dialog-wrap"><form className="manual-lead-card crm-outcome-card qualification-dialog" onSubmit={(event) => { event.preventDefault(); void confirmQualification(); }}><button className="drawer-close" type="button" disabled={qualifying} onClick={() => setPendingQualificationId(null)}>×</button><span>PASAR A CONTACTADO</span><h2>Completa el primer contacto</h2><p>Antes de continuar debes identificar a la persona, ajustar el heat y registrar la primera llamada.</p><label>Contacto principal<select required autoFocus value={qualificationContactRole} onChange={(event) => setQualificationContactRole(event.target.value as LeadContactRole | "")}><option value="">Seleccionar…</option>{contactRoleOptions.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label><label>Nuevo heat <strong className="qualification-heat-value">{qualificationHeat}</strong><input type="range" min="0" max="100" value={qualificationHeat} onChange={(event) => setQualificationHeat(Number(event.target.value))} /></label><small className={qualificationHeat === qualificationInitialHeat ? "qualification-pending" : "qualification-complete"}>{qualificationHeat === qualificationInitialHeat ? `Debes cambiar el valor actual (${qualificationInitialHeat}).` : `Heat ajustado de ${qualificationInitialHeat} a ${qualificationHeat}.`}</small><label>Duración de la llamada (minutos)<input type="number" min="1" max="1440" step="1" required value={qualificationDuration} onChange={(event) => setQualificationDuration(event.target.value)} placeholder="Ej. 20" /></label><label>Notas de la llamada<textarea maxLength={4000} value={qualificationNotes} onChange={(event) => setQualificationNotes(event.target.value)} placeholder="Opcional" /></label>{qualificationError && <small className="team-note-error" role="alert">{qualificationError}</small>}<div className="manual-lead-actions"><Button type="button" variant="outline" disabled={qualifying} onClick={() => setPendingQualificationId(null)}>Cancelar</Button><Button type="submit" disabled={qualifying || !qualificationContactRole || qualificationHeat === qualificationInitialHeat || !qualificationDuration}>{qualifying ? "Guardando…" : "Guardar y pasar a Contactado"}</Button></div></form></div>}
      {pendingClientId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget && !convertingId) setPendingClientId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); void confirmClientConversion(); }}><button className="drawer-close" type="button" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>×</button><span>PASAR A IN</span><h2>Asignar asesor del cliente</h2><p>El agente de venta será <b>{leadOwners[pendingClientId] || contacts.find((contact) => contact.id === pendingClientId)?.owner || (isDeveloperAdmin ? "Sin asignar" : currentUser)}</b>. El asesor elegido será quien reciba al alumno en el Portal del Alumno.</p><label>Asesor<select required autoFocus value={selectedAdvisor} onChange={(event) => setSelectedAdvisor(event.target.value)}><option value="">Seleccionar asesor…</option>{admins.map((admin) => <option key={admin} value={admin}>{admin}</option>)}</select></label><div className="outcome-role-summary"><span>Agente de venta<strong>{leadOwners[pendingClientId] || contacts.find((contact) => contact.id === pendingClientId)?.owner || (isDeveloperAdmin ? "Sin asignar" : currentUser)}</strong></span><span>Asesor del cliente<strong>{selectedAdvisor || "Pendiente"}</strong></span></div><div className="manual-lead-actions"><Button type="button" variant="outline" disabled={!!convertingId} onClick={() => setPendingClientId(null)}>Cancelar</Button><Button type="submit" disabled={!selectedAdvisor || !!convertingId}>{convertingId ? "Creando cliente…" : "Crear cliente"}</Button></div></form></div>}
      {pendingLostId && <div className="drawer-wrap outcome-dialog-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingOutcome) setPendingLostId(null); }}><form className="manual-lead-card crm-outcome-card" onSubmit={(event) => { event.preventDefault(); void confirmLost(); }}><button className="drawer-close" type="button" disabled={savingOutcome} onClick={() => setPendingLostId(null)}>×</button><span>RETIRAR DEL PIPELINE</span><h2>{lostDestination === "future" ? "Lead de próximo curso" : "Motivo obligatorio"}</h2><p>{lostDestination === "future" ? "El lead saldrá del CRM activo y se guardará únicamente en la tabla de próximos cursos." : "Selecciona por qué se ha perdido este lead. Este dato quedará guardado para el análisis comercial."}</p><label>Destino<select autoFocus value={lostDestination} onChange={(event) => { const destination = event.target.value as "lost" | "future"; setLostDestination(destination); setOutcomeError(""); }}><option value="lost">Lost definitivo</option><option value="future">Lead de próximo curso</option></select></label>{lostDestination === "lost" ? <><label>Motivo<select required value={lostReason} onChange={(event) => { setLostReason(event.target.value as LostReason | ""); if (event.target.value !== "other") setLostReasonDetail(""); }}><option value="">Seleccionar motivo…</option>{lostReasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{lostReason === "other" && <label>Explicación breve<input required maxLength={120} value={lostReasonDetail} onChange={(event) => setLostReasonDetail(event.target.value)} placeholder="Escribe el motivo" /></label>}</> : <label>Curso académico<select required value={futureAcademicYear} onChange={(event) => setFutureAcademicYear(event.target.value as FutureAcademicYear | "")}><option value="">Seleccionar curso…</option><option value="2027-28">2027-28</option><option value="2028-29">2028-29</option></select></label>}{outcomeError && <small className="team-note-error" role="alert">{outcomeError}</small>}<div className="manual-lead-actions"><Button type="button" variant="outline" disabled={savingOutcome} onClick={() => setPendingLostId(null)}>Cancelar</Button><Button type="submit" disabled={savingOutcome || (lostDestination === "lost" ? !lostReason || (lostReason === "other" && !lostReasonDetail.trim()) : !futureAcademicYear)}>{savingOutcome ? "Moviendo…" : lostDestination === "future" ? "Enviar a próximos cursos" : "Marcar como Lost"}</Button></div></form></div>}
      {stageReminderOpen && <div className="crm-stage-reminder" role="alertdialog" aria-modal="true" aria-labelledby="crm-stage-reminder-title"><section><div className="crm-stage-reminder-icon"><PhoneCall /></div><h2 id="crm-stage-reminder-title">¿Has registrado todas las llamadas?</h2><p>¿Has añadido todas las notas?</p>{stageReminderClosable ? <button type="button" aria-label="Cerrar aviso" onClick={() => setStageReminderOpen(false)}><X /></button> : <small>Podrás cerrar este aviso en 5 segundos.</small>}</section></div>}
    </div>
  );
}

export const leadCampaignLabel = (campaign?: string) => {
  const value = campaign?.trim();
  return value && value.toLowerCase() !== "pendiente de identificar" ? value : "Sin campaña identificada";
};

export const leadCategories: LeadCategory[] = ["delft", "Llegada", "Mentoría", "General", "LATAM", "ESPECIAL"];

export function leadContactAgeTone(days: number | null) {
  if (days == null || days < 1) return "neutral";
  if (days >= 3) return "red";
  if (days >= 2) return "orange";
  return "yellow";
}

export function CategoryPicker({ value, onChange }: { value: LeadCategory | ""; onChange: (value: LeadCategory) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={`category-picker ${open ? "open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button type="button" className="category-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{value || "Seleccionar…"}</span><ChevronDown /></button>
    {open && <div className="category-options" role="listbox">{leadCategories.map((category) => <button type="button" role="option" aria-selected={value === category} key={category} onClick={() => { onChange(category); setOpen(false); }}>{category}</button>)}</div>}
  </div>;
}

export const salesStages: CrmStage[] = ["Contactado", "Propuesta enviada", "Llamada programada", "Llamada tenida", "En espera"];
