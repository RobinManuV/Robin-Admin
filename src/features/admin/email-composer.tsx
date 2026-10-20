import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/types/domain";
import { adminDataClient, type CrmEmailTemplate } from "@/services/admin-data";
import { portalClient } from "@/services/portal";

export function EmailComposer({ contacts, notify, onClose }: { contacts: Contact[]; notify: (message: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fieldQuery, setFieldQuery] = useState<string | null>(null);
  const [fieldRange, setFieldRange] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [gmailReady, setGmailReady] = useState(false);
  const [gmailReason, setGmailReason] = useState("Comprobando acceso a Gmail…");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceReason, setWorkspaceReason] = useState("Comprobando base de datos…");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const campaigns = useMemo(() => [...new Set(contacts.map((contact) => contact.campaign).filter((campaign) => campaign && campaign !== "—" && campaign !== "Pendiente de identificar"))].sort((a, b) => a.localeCompare(b, "es")), [contacts]);
  const filtered = useMemo(() => contacts.filter((contact) => (campaignFilter === "all" || contact.campaign === campaignFilter) && `${contact.name} ${contact.email} ${contact.phone}`.toLowerCase().includes(query.trim().toLowerCase())), [contacts, campaignFilter, query]);
  const selectedContacts = contacts.filter((contact) => selectedIds.includes(contact.id));
  const mergeKeys = [...new Set([...emailMergeColumnKeys, ...contacts.flatMap((contact) => Object.keys(contact.databaseFields || {}))])];
  const mergeOptions = mergeKeys.map((key) => ({ key, label: emailMergeColumnLabels[key] || key.replace(/_/g, " ") })).filter((item) => fieldQuery == null || `${item.key} ${item.label}`.toLowerCase().includes(fieldQuery.toLowerCase()));

  useEffect(() => {
    let active = true;
    adminDataClient.getCrmEmailWorkspace().then(({ draft, templates: savedTemplates }) => {
      if (!active) return;
      setWorkspaceReady(true);
      setWorkspaceReason("");
      setTemplates(savedTemplates);
      if (draft) { setSubject(draft.subject); setBody(draft.body); setSelectedIds(draft.recipientIds); setCampaignFilter(draft.campaignFilter || "all"); }
    }).catch((error) => { if (active) { setWorkspaceReady(false); setWorkspaceReason(error instanceof Error ? error.message : "No se pudo cargar el espacio de correo."); notify(error instanceof Error ? error.message : "No se pudo cargar el espacio de correo"); } })
      .finally(() => { if (active) setLoading(false); });
    adminDataClient.getCrmGmailStatus().then((status) => {
      if (!active) return;
      setGmailReady(status.ready);
      setGmailReason(status.ready ? `Conectado a Gmail${status.sender ? ` · ${status.sender}` : ""}` : status.reason || "Gmail no está disponible.");
    }).catch((error) => { if (active) { setGmailReady(false); setGmailReason(error instanceof Error ? error.message : "No se pudo comprobar Gmail."); } });
    return () => { active = false; };
  }, []);

  function insertField(key: string) {
    const start = fieldRange?.start ?? bodyRef.current?.selectionStart ?? body.length;
    const end = fieldRange?.end ?? bodyRef.current?.selectionEnd ?? body.length;
    const insertion = `#${key}`;
    setBody((current) => `${current.slice(0, start)}${insertion}${current.slice(end)}`);
    setFieldQuery(null); setFieldRange(null);
    requestAnimationFrame(() => { bodyRef.current?.focus(); bodyRef.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
  }

  function changeBody(value: string, cursor: number) {
    setBody(value);
    const match = value.slice(0, cursor).match(/#([\p{L}\p{N}_-]*)$/u);
    if (match) { setFieldQuery(match[1]); setFieldRange({ start: cursor - match[0].length, end: cursor }); }
    else { setFieldQuery(null); setFieldRange(null); }
  }

  async function saveDraft() {
    setSaving(true);
    try { await adminDataClient.saveCrmEmailDraft({ subject, body, recipientIds: selectedIds, campaignFilter }); notify("Borrador guardado en la base de datos"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar el borrador"); }
    finally { setSaving(false); }
  }

  async function sendEmail() {
    const recipients = selectedContacts.filter((contact) => contact.email);
    if (!gmailReady || !workspaceReady || !recipients.length || !subject.trim() || !body.trim()) return;
    if (!window.confirm(`¿Enviar este correo a ${recipients.length} destinatarios? Cada persona recibirá un mensaje individual.`)) return;
    setSending(true);
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    try {
      const batches = Array.from({ length: Math.ceil(recipients.length / 10) }, (_, index) => recipients.slice(index * 10, (index + 1) * 10));
      for (let index = 0; index < batches.length; index += 1) {
        setSendProgress(`Enviando lote ${index + 1} de ${batches.length}…`);
        const result = await adminDataClient.sendCrmEmail({ recipientIds: batches[index].map((contact) => contact.id), subject, body });
        sentCount += result.sent.length;
        skippedCount += result.skipped.length;
        failedCount += result.failed.length;
        if (result.failed.some((item) => /permiso|autorizar|Gmail API/i.test(item.reason))) break;
      }
      if (sentCount) {
        try {
          const matchingTemplate = templates.find((template) => template.subject === subject && template.body === body);
          if (!matchingTemplate) {
            const timestamp = new Date().toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
            const saved = await adminDataClient.saveCrmEmailTemplate({ name: (subject.trim() || `Correo enviado ${timestamp}`).slice(0, 120), subject, body });
            setTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          }
        } catch (_) {
          notify(`Enviados: ${sentCount}. No se pudo guardar el correo como plantilla; comprueba la migración de la base de datos.`);
          return;
        }
      }
      notify(`Enviados: ${sentCount}${skippedCount ? ` · omitidos: ${skippedCount}` : ""}${failedCount ? ` · con error: ${failedCount}` : ""}${sentCount ? " · guardado en Plantillas" : ""}`);
    } catch (error) {
      notify(`${error instanceof Error ? error.message : "No se pudo completar el envío"}${sentCount ? ` · correos enviados antes del error: ${sentCount}` : ""}`);
    } finally {
      setSending(false);
      setSendProgress("");
    }
  }

  async function saveTemplate(updateExisting = false) {
    const name = templateName.trim();
    if (!name) { notify("Escribe un nombre para la plantilla"); return; }
    setTemplateBusy(true);
    try {
      const saved = await adminDataClient.saveCrmEmailTemplate({ ...(updateExisting && selectedTemplateId ? { id: selectedTemplateId } : {}), name, subject, body });
      setTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setSelectedTemplateId(saved.id); setTemplateName(saved.name);
      notify(updateExisting ? "Plantilla actualizada" : "Plantilla guardada");
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo guardar la plantilla"); }
    finally { setTemplateBusy(false); }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("¿Eliminar esta plantilla?")) return;
    setTemplateBusy(true);
    try { await adminDataClient.deleteCrmEmailTemplate(id); setTemplates((current) => current.filter((item) => item.id !== id)); if (selectedTemplateId === id) { setSelectedTemplateId(""); setTemplateName(""); } notify("Plantilla eliminada"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo eliminar la plantilla"); }
    finally { setTemplateBusy(false); }
  }

  function loadTemplate(template: CrmEmailTemplate) {
    setSubject(template.subject); setBody(template.body); setTemplateName(template.name); setSelectedTemplateId(template.id); setFieldQuery(null);
  }

  return <div className="email-composer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="email-composer" role="dialog" aria-modal="true" aria-labelledby="email-composer-title">
    <header><div><h2 id="email-composer-title">Correo electrónico</h2><p>{gmailReason}{!workspaceReady && workspaceReason ? ` · ${workspaceReason}` : ""}</p></div><button className="email-composer-close" type="button" aria-label="Cerrar" onClick={onClose}><X /></button></header>
    <section className="email-templates-panel"><div className="email-templates-heading"><div><h3>Plantillas</h3><p>Carga una plantilla para editarla o guárdala para reutilizarla.</p></div><label>Nombre<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Ej. Seguimiento webinar" /></label><Button type="button" variant="outline" disabled={templateBusy} onClick={() => void saveTemplate()}>Guardar como plantilla</Button>{selectedTemplateId && <Button type="button" disabled={templateBusy} onClick={() => void saveTemplate(true)}>Actualizar plantilla</Button>}</div><div className="email-template-list">{templates.map((template) => <article className={`email-template-item ${selectedTemplateId === template.id ? "active" : ""}`} key={template.id}><button type="button" className="email-template-load" onClick={() => loadTemplate(template)}><strong>{template.name}</strong><small>{template.subject || "Sin asunto"}</small></button><button type="button" className="email-template-delete" aria-label={`Eliminar ${template.name}`} disabled={templateBusy} onClick={() => void deleteTemplate(template.id)}><X /></button></article>)}{!templates.length && <span className="email-template-empty">Aún no hay plantillas guardadas.</span>}</div></section>
    <div className="email-composer-grid"><section className="email-recipient-panel"><h3>Destinatarios</h3><div className="email-recipient-controls"><label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, email o teléfono" /></label><label>Campaña<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="all">Todas las campañas</option>{campaigns.map((campaign) => <option key={campaign}>{campaign}</option>)}</select></label></div><div className="email-recipient-summary"><span>{selectedIds.length} seleccionados · {filtered.length} visibles</span><button type="button" onClick={() => setSelectedIds((current) => [...new Set([...current, ...filtered.map((item) => item.id)])])}>Seleccionar visibles</button><button type="button" onClick={() => setSelectedIds([])}>Limpiar</button></div><div className="email-recipient-list">{loading ? <p className="email-recipient-empty">Cargando…</p> : filtered.map((contact) => <label className="email-recipient-row" key={contact.id}><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, contact.id])] : current.filter((id) => id !== contact.id))} /><span><strong>{contact.name}</strong><small>{contact.email || "Sin correo electrónico"} · {contact.campaign || "Sin campaña"}</small></span></label>)}{!loading && !filtered.length && <p className="email-recipient-empty">No hay destinatarios con esos filtros.</p>}</div></section>
      <section className="email-message-panel"><h3>Mensaje</h3><label className="email-subject">Asunto<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Asunto del correo" /></label><label className="email-subject">Cuerpo<textarea ref={bodyRef} className="email-body-editor" value={body} onChange={(event) => changeBody(event.target.value, event.target.selectionStart)} onKeyDown={(event) => { if (fieldQuery == null || !mergeOptions.length) return; if (event.key === "Escape") setFieldQuery(null); if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insertField(mergeOptions[0].key); } }} placeholder="Escribe el correo. Teclea # para insertar una columna." /></label>{fieldQuery != null && <div className="email-merge-list" role="listbox" aria-label="Columnas de crm_leads">{mergeOptions.map((field) => <button type="button" role="option" key={field.key} onMouseDown={(event) => event.preventDefault()} onClick={() => insertField(field.key)}>#{field.key} · {field.label}</button>)}{!mergeOptions.length && <small>No hay columnas que coincidan.</small>}</div>}<p className="email-merge-hint">Los campos se sustituirán con los datos de cada destinatario al enviar.</p></section></div>
    <footer className="email-composer-footer"><span>{selectedContacts.filter((contact) => contact.email).length} de {selectedContacts.length} destinatarios seleccionados tienen email.{sendProgress && <small className="email-send-progress">{sendProgress}</small>}</span><div><Button type="button" variant="outline" disabled={sending} onClick={onClose}>Cerrar</Button><Button type="button" disabled={!workspaceReady || saving || loading || sending} onClick={() => void saveDraft()}>{saving ? "Guardando…" : "Guardar borrador"}</Button><Button type="button" disabled={!gmailReady || !workspaceReady || !selectedContacts.some((contact) => contact.email) || !subject.trim() || !body.trim() || loading || sending} onClick={() => void sendEmail()}>{sending ? "Enviando…" : "Enviar correo"}</Button></div></footer>
  </section></div>;
}

export const emailMergeColumnKeys = ["id", "notion_page_url", "notion_numeric_id", "name", "email", "phone", "email_uid", "summary", "body_text", "comment", "first_contact_comment", "area", "lead_type", "lifecycle", "task_status", "heat", "contact_at", "chase_at", "meeting_at", "overdue_at", "inside_at", "owner_names", "notion_owner_ids", "rolled_up_owner", "robin", "attended_previous_events", "first_payment_received", "folder_created", "checked", "school_name", "school_notion_urls", "campaign_notion_urls", "canva_presentation_url", "source_formula", "source_payload", "source_created_at", "source_updated_at", "created_at", "updated_at", "crm_stage", "lost_at"];

export const emailMergeColumnLabels: Record<string, string> = { id: "ID", notion_page_url: "URL de Notion", notion_numeric_id: "ID numérico de Notion", name: "Nombre", email: "Correo electrónico", phone: "Teléfono", email_uid: "ID de correo", summary: "Resumen", body_text: "Texto del lead", comment: "Comentario", first_contact_comment: "Comentario de primer contacto", area: "Área", lead_type: "Tipo de lead", lifecycle: "Ciclo de vida", task_status: "Estado de tarea", heat: "Heat", contact_at: "Fecha de contacto", chase_at: "Fecha de seguimiento", meeting_at: "Fecha de reunión", overdue_at: "Fecha de vencimiento", inside_at: "Fecha de entrada", owner_names: "Responsables", notion_owner_ids: "IDs de responsables de Notion", rolled_up_owner: "Responsable agregado", robin: "Robin", attended_previous_events: "Asistió a eventos anteriores", first_payment_received: "Primer pago recibido", folder_created: "Carpeta creada", checked: "Revisado", school_name: "Centro educativo", school_notion_urls: "Enlaces de centros", campaign_notion_urls: "Campaña (base de datos)", canva_presentation_url: "Presentación de Canva", source_formula: "Fórmula de origen", source_payload: "Datos de origen", source_created_at: "Fecha de creación de origen", source_updated_at: "Fecha de actualización de origen", created_at: "Fecha de alta CRM", updated_at: "Última actualización", crm_stage: "Estado CRM", lost_at: "Fecha Lost" };
