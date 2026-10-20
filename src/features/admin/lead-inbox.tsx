// Admin feature module for lead inbox; the feature registry connects it to the authenticated shell.
import { useMemo, useState } from "react";
import { Download, Filter, Plus, Search, UserCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/types/domain";
import type { FeatureModuleProps } from './feature-shared';
import { lostReasonLabel, Title, ContactDrawer } from './feature-shared';
import { LeadGroupRow, emptyLeadGroupRow, leadEntryTimestamp, leadDaysWithoutContact, formatLeadEntry, campaignOrOrigin } from "./lead-shared";

export function LeadInbox({ admins, contacts, leadOwners, leadStages, onAssignLead, onDeleteLead, onAddLead, onAddLeads, onSetLeadHeat, onSetLeadContactRole, notify }: FeatureModuleProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [addingLead, setAddingLead] = useState(false);
  const [manualLead, setManualLead] = useState({ name: "", email: "", phone: "", notes: "", owner: "", source: "organic" });
  const [savingLead, setSavingLead] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupRows, setGroupRows] = useState<LeadGroupRow[]>(() => Array.from({ length: 6 }, emptyLeadGroupRow));
  const [savingGroup, setSavingGroup] = useState(false);
  const list = useMemo(() => contacts.filter((contact) => {
    const stage = leadStages[contact.id] || contact.stage || "Por contactar";
    if (stage !== "Por contactar") return false;
    // La bandeja es exclusivamente de entrada: al asignar un responsable, el
    // lead pasa al CRM personal y deja de mostrarse aquí inmediatamente.
    if (leadOwners[contact.id]) return false;
    if (!`${contact.name} ${contact.email} ${contact.phone} ${contact.source} ${contact.campaign} ${contact.formName || ""} ${contact.course || ""} ${contact.country || ""} ${contact.comment || ""}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (sourceFilter !== "all" && contact.source !== sourceFilter) return false;
    if (campaignFilter !== "all" && contact.campaign !== campaignFilter) return false;
    if (courseFilter !== "all" && contact.course !== courseFilter) return false;
    return countryFilter === "all" || (contact.country || "Otros") === countryFilter;
  }).sort((a, b) => leadEntryTimestamp(b.createdAt) - leadEntryTimestamp(a.createdAt) || b.id.localeCompare(a.id)), [contacts, leadOwners, leadStages, query, sourceFilter, campaignFilter, courseFilter, countryFilter]);
  const sources = useMemo(() => [...new Set(contacts.map((contact) => contact.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const campaigns = useMemo(() => [...new Set(contacts.map((contact) => contact.campaign).filter((campaign) => campaign && campaign !== "Pendiente de identificar"))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const courses = useMemo(() => [...new Set(contacts.map((contact) => contact.course?.trim()).filter((course): course is string => Boolean(course)))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })), [contacts]);
  const activeFilters = [sourceFilter, campaignFilter, courseFilter, countryFilter].filter((value) => value !== "all").length;
  async function saveLeadGroup(event: React.FormEvent) {
    event.preventDefault();
    const populated = groupRows.filter((row) => Object.entries(row).some(([key, value]) => key !== "heat" && key !== "taskStatus" && String(value).trim()));
    if (!populated.length) { notify("Añade al menos un lead antes de guardar el grupo"); return; }
    const missingName = populated.find((row) => !row.name.trim());
    if (missingName) { notify(`Completa el nombre del lead en la fila ${groupRows.indexOf(missingName) + 1}`); return; }
    setSavingGroup(true);
    try {
      await onAddLeads(populated.map((row) => ({ name: row.name, email: row.email, phone: row.phone, schoolName: row.schoolName, area: row.area, leadType: row.leadType, lifecycle: row.lifecycle, taskStatus: row.taskStatus, heat: Number.isFinite(Number(row.heat)) ? Number(row.heat) : 50, campaign: row.campaign, notes: row.notes, owner: row.owner, source: row.source || (row.schoolName ? "schools" : "other"), groupName: groupName.trim() })));
      notify(`Grupo guardado: ${populated.length} leads añadidos a la bandeja`);
      setAddingGroup(false); setGroupName(""); setGroupRows(Array.from({ length: 6 }, emptyLeadGroupRow));
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar el grupo de leads"); }
    finally { setSavingGroup(false); }
  }
  function exportLeads() {
    const rows = contacts.filter((contact) => !leadOwners[contact.id] && (leadStages[contact.id] || contact.stage || "Por contactar") !== "Cliente");
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["Nombre", "Email", "Teléfono", "Origen", "Campaña", "Curso", "País", "Interés", "Responsable", "Días sin contactar", "Heat", "Motivo Lost", "Detalle Lost", "Comentario", "Fecha de alta"];
    const body = rows.map((contact) => [contact.name, contact.email, contact.phone, contact.source, contact.campaign, contact.course || "", contact.country || "Otros", contact.interest || "", leadOwners[contact.id] || "Sin asignar", leadDaysWithoutContact(contact, Boolean(leadOwners[contact.id])) ?? "", contact.heat ?? "", lostReasonLabel(contact.lostReason), contact.lostReasonDetail || "", contact.comment || "", contact.createdAt || ""].map(csvCell).join(","));
    const blob = new Blob([`\uFEFF${headers.map(csvCell).join(",")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `leads-robin-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
    notify(`${rows.length} leads exportados a CSV`);
  }
  return (
    <div className="page">
      <Title name="Bandeja de entrada de leads" sub="Asigna cada nuevo lead al administrador que lo gestionará." eyebrow="INICIO · VISTA GLOBAL">
        <Badge variant="outline">{list.length} LEADS</Badge>
      </Title>
      <div className="module-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, email o canal…" /></label>
        <Button variant="outline" onClick={() => setFiltersOpen((open) => !open)}><Filter />Filtros{activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}</Button>
        <Button variant="outline" onClick={exportLeads}><Download />Exportar CSV</Button>
        <Button variant="outline" onClick={() => setAddingGroup(true)}><Plus />Añadir grupo</Button>
        <Button onClick={() => setAddingLead(true)}><Plus />Añadir lead</Button>
      </div>
      {filtersOpen && <section className="lead-filters panel"><label>Origen<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todos los orígenes</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><label>Curso<select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="all">Todos los cursos</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label><label>País<select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="all">Todos los países</option><option value="España">España</option><option value="Portugal">Portugal</option><option value="Otros">Otros</option></select></label><button type="button" onClick={() => { setSourceFilter("all"); setCampaignFilter("all"); setCourseFilter("all"); setCountryFilter("all"); }}>Limpiar filtros</button></section>}
      <section className="panel inbox-panel">
        <div className="data-table">
          <table>
            <thead><tr><th>Lead</th><th>Entrada</th><th>Campaña / origen</th><th>Curso</th><th>País</th><th>Interés</th><th>Asignar a</th><th>Días sin contactar</th></tr></thead>
            <tbody>
              {list.map((contact) => (
                <tr key={contact.id} className="unassigned-lead" onClick={() => setSelected(contact)}>
                  <td><button type="button" className="lead-name-button" onClick={() => setSelected(contact)}>{contact.formName === "colegios" && <small className="school-lead-label">COLEGIOS</small>}<b className={contact.formName === "colegios" ? "school-lead-name" : ""}>{contact.name}</b><small>{contact.email}</small></button></td>
                  <td><time className="lead-entry-time" dateTime={contact.createdAt}>{formatLeadEntry(contact.createdAt)}</time></td>
                  <td><span className="lead-source-readonly">{campaignOrOrigin(contact)}</span>{["Meta Ads", "Página web"].includes(contact.source) && <small className="lead-source-kind">{contact.source}</small>}</td>
                  <td>{contact.course || ""}</td>
                  <td>{contact.country || "Otros"}</td>
                  <td>{contact.interest || ""}</td>
                  <td>
                    <select
                      className="owner-select"
                      value={leadOwners[contact.id] || ""}
                      onChange={(event) => {
                        event.stopPropagation();
                        onAssignLead(contact.id, event.target.value);
                        notify(`${contact.name} asignado a ${event.target.value}`);
                      }}
                    >
                      <option value="">Sin asignar</option>
                      {admins.map((admin) => <option key={admin}>{admin}</option>)}
                    </select>
                  </td>
                  <td><span className="days-without-contact">{leadDaysWithoutContact(contact, Boolean(leadOwners[contact.id])) ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="assignment-note"><UserCheck /> Al asignar un lead, aparecerá inmediatamente en el CRM personal del usuario seleccionado.</p>
      {addingLead && <div className="drawer-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddingLead(false); }}><form className="manual-lead-card" onSubmit={async (event) => { event.preventDefault(); setSavingLead(true); try { await onAddLead(manualLead); notify(`${manualLead.name} añadido correctamente`); setManualLead({ name: "", email: "", phone: "", notes: "", owner: "", source: "organic" }); setAddingLead(false); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el lead"); } finally { setSavingLead(false); } }}><button className="drawer-close" type="button" onClick={() => setAddingLead(false)}>×</button><span>NUEVO LEAD</span><h2>Añadir manualmente</h2><p>El lead quedará en Por contactar.</p><label>Nombre<input required value={manualLead.name} onChange={(event) => setManualLead((lead) => ({ ...lead, name: event.target.value }))} /></label><div className="manual-lead-row"><label>Email<input type="email" value={manualLead.email} onChange={(event) => setManualLead((lead) => ({ ...lead, email: event.target.value }))} /></label><label>Teléfono<input value={manualLead.phone} onChange={(event) => setManualLead((lead) => ({ ...lead, phone: event.target.value }))} /></label></div><label>Origen<select value={manualLead.source} onChange={(event) => setManualLead((lead) => ({ ...lead, source: event.target.value }))}><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="schools">Colegios</option><option value="google_ads">Google Ads</option><option value="tiktok_ads">TikTok Ads</option><option value="email">Email</option><option value="events">Eventos</option><option value="other">Otros</option></select></label><label>Asignar a<select value={manualLead.owner} onChange={(event) => setManualLead((lead) => ({ ...lead, owner: event.target.value }))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></label><label>Notas<textarea value={manualLead.notes} onChange={(event) => setManualLead((lead) => ({ ...lead, notes: event.target.value }))} /></label><div className="manual-lead-actions"><Button type="button" variant="outline" onClick={() => setAddingLead(false)}>Cancelar</Button><Button type="submit" disabled={savingLead}>{savingLead ? "Guardando…" : "Crear lead"}</Button></div></form></div>}
      {addingGroup && <div className="lead-sheet-backdrop"><form className="lead-sheet" onSubmit={saveLeadGroup}>
        <header><div><span>CAPTURA EN GRUPO</span><h2>Añadir grupo de leads</h2><p>Rellena una fila por persona. Los campos corresponden a la ficha CRM de Supabase; las filas vacías se ignoran.</p></div><button type="button" className="drawer-close" aria-label="Cerrar" onClick={() => setAddingGroup(false)}>×</button></header>
        <label className="lead-sheet-group">Nombre del grupo<input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ej. Visita Colegio San José · Madrid" /></label>
        <div className="lead-sheet-scroll"><table><thead><tr><th>Nombre *</th><th>Correo electrónico</th><th>Teléfono</th><th>Centro educativo</th><th>Área</th><th>Tipo</th><th>Ciclo de vida</th><th>Estado de tarea</th><th>Heat</th><th>Origen</th><th>Campaña</th><th>Notas / comentario</th><th>Responsable</th><th></th></tr></thead><tbody>
          {groupRows.map((row, index) => <tr key={index}>
            <td><input aria-label={`Nombre, fila ${index + 1}`} required={Object.entries(row).some(([key, value]) => key !== "heat" && key !== "taskStatus" && String(value).trim())} value={row.name} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder="Nombre del lead" /></td>
            <td><input aria-label="Correo electrónico" type="email" value={row.email} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></td>
            <td><input aria-label="Teléfono" value={row.phone} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} /></td>
            <td><input aria-label="Centro educativo" value={row.schoolName} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, schoolName: event.target.value } : item))} /></td>
            <td><select aria-label="Área" value={row.area} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, area: event.target.value } : item))}><option value="">—</option>{["Concreto", "Psycology", "Engineering", "Health", "International studies", "Business", "chemistry"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Tipo de lead" value={row.leadType} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, leadType: event.target.value } : item))}><option value="">—</option>{["General", "Delft", "Llegada", "Mentoría", "LATAM", "ESPECIAL"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Ciclo de vida" value={row.lifecycle} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, lifecycle: event.target.value } : item))}><option value="">—</option>{["LOST 25-26", "LOST", "26-27", "INSIDE", "28-29", "27-28", "año que viene", "25-26"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><select aria-label="Estado de tarea" value={row.taskStatus} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, taskStatus: event.target.value } : item))}><option value="">—</option>{["Sin empezar", "En progreso", "Listo"].map((option) => <option key={option}>{option}</option>)}</select></td>
            <td><input aria-label="Heat" type="number" min="0" max="100" value={row.heat} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, heat: event.target.value } : item))} /></td>
            <td><select aria-label="Origen" value={row.source} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, source: event.target.value } : item))}><option value="">Auto</option><option value="schools">Colegios</option><option value="organic">Orgánico</option><option value="organic_social">Orgánico RRSS</option><option value="referral">Referidos</option><option value="website">Página web</option><option value="meta">Meta Ads</option><option value="google_ads">Google Ads</option><option value="tiktok_ads">TikTok Ads</option><option value="email">Email</option><option value="events">Eventos</option><option value="other">Otros</option></select></td>
            <td><input aria-label="Campaña" value={row.campaign} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, campaign: event.target.value } : item))} /></td>
            <td><textarea aria-label="Notas o comentario" value={row.notes} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, notes: event.target.value } : item))} /></td>
            <td><select aria-label="Responsable" value={row.owner} onChange={(event) => setGroupRows((rows) => rows.map((item, i) => i === index ? { ...item, owner: event.target.value } : item))}><option value="">Sin asignar</option>{admins.map((admin) => <option key={admin}>{admin}</option>)}</select></td>
            <td><button className="lead-sheet-remove" type="button" aria-label={`Quitar fila ${index + 1}`} onClick={() => setGroupRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyLeadGroupRow()])}><X /></button></td>
          </tr>)}
        </tbody></table></div>
        <footer><Button type="button" variant="outline" onClick={() => setGroupRows((rows) => [...rows, emptyLeadGroupRow()])}><Plus />Añadir fila</Button><span>{groupRows.filter((row) => row.name.trim()).length} leads listos</span><div><Button type="button" variant="outline" onClick={() => setAddingGroup(false)}>Cancelar</Button><Button type="submit" disabled={savingGroup}>{savingGroup ? "Guardando…" : "Guardar grupo"}</Button></div></footer>
      </form></div>}
      {selected && <ContactDrawer contact={{ ...selected, owner: leadOwners[selected.id] || "Sin asignar", stage: leadStages[selected.id] }} admins={admins} heat={selected.heat || 50} onHeatChange={(value) => onSetLeadHeat(selected.id, value)} onOwnerChange={(owner) => { onAssignLead(selected.id, owner); notify(`${selected.name} asignado a ${owner}`); }} onContactRoleChange={(value) => onSetLeadContactRole(selected.id, value)} onDeleteLead={async (id) => { await onDeleteLead(id); notify(`${selected.name} eliminado correctamente`); }} onClose={() => setSelected(null)} leadMode />}
    </div>
  );
}
