import { useState } from "react";
import { AlertTriangle, ChevronRight, ExternalLink, GraduationCap, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Contact } from "@/types/domain";
import { PortalClient, PortalSnapshot } from "@/services/portal";
import { Title, ContactDrawer } from './feature-shared';

export function GlobalStudents({ path, snapshot, connected, contacts }: { path: string; snapshot: PortalSnapshot | null; connected: boolean; contacts: Contact[] }) {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [personFilter, setPersonFilter] = useState("all");
  const [studentQuery, setStudentQuery] = useState("");
  if (connected && !snapshot) return <div className="page"><Title name="Alumnos" sub="Sincronizando con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL" /><div className="empty compact"><GraduationCap /><h2>Cargando alumnos…</h2></div></div>;
  if (snapshot) {
    const detailId = path.startsWith("/alumnos-global/") ? decodeURIComponent(path.slice("/alumnos-global/".length)) : "";
    const detail = snapshot.clients.find((client) => client.id === detailId);
    if (detailId) return <StudentProfile client={detail} portalUrl={snapshot.portalUrl} />;
    const normalizedPerson = (value?: string) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const visibleClients = snapshot.clients.filter((client) => {
      const matchesPerson = personFilter === "all" || (personFilter === "unassigned" ? !client.assigned_to : normalizedPerson(client.assigned_to).includes(personFilter));
      const haystack = [client.nombre, client.apellidos, client.email, client.telefono_alumno].filter(Boolean).join(" ").toLowerCase();
      return matchesPerson && haystack.includes(studentQuery.trim().toLowerCase());
    });
    return <div className="page"><Title name="Alumnos" sub="Clientes sincronizados con el portal de aplicación." eyebrow="INICIO · VISTA GLOBAL"><div className="student-filter"><label>Persona<select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}><option value="all">Todas</option><option value="noel">Noel</option><option value="manuel">Manuel</option><option value="maria">María</option><option value="unassigned">Sin asignar</option></select></label></div><div className="owner-legend"><span className="owner-tone-noel">Noel</span><span className="owner-tone-manuel">Manuel</span><span className="owner-tone-maria">María</span></div><Badge variant="outline">{visibleClients.length} ALUMNOS</Badge></Title><div className="module-toolbar student-search"><label><Search /><input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Buscar por nombre, email o teléfono…" /></label></div><div className="student-grid">{visibleClients.map((client) => <a key={client.id} className={`student-card ${ownerTone(client.assigned_to)}`} href={`/alumnos-global/${encodeURIComponent(client.id)}`} target="_blank" rel="noreferrer"><i>{`${client.nombre?.[0] || ""}${client.apellidos?.[0] || ""}` || "R"}</i><div><h3>{[client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email}</h3><p>{client.email || "Sin email"}</p><span>{client.tipo || "general"} · Fase {client.application_phase || 1} · {client.assigned_to || "Sin asignar"}</span></div><Badge variant="outline">{client.requires_onboarding ? "Onboarding" : "Activo"}</Badge><ChevronRight /></a>)}</div></div>;
  }
  return (
    <div className="page">
      <Title name="Alumnos" sub="Vista global de alumnos y acceso a su perfil." eyebrow="INICIO · VISTA GLOBAL">
        <Button><Plus />Añadir alumno</Button>
      </Title>
      <div className="student-grid">
        {contacts.map((contact) => (
          <button key={contact.id} className="student-card" onClick={() => setSelected(contact)}>
            <i>{contact.initials}</i>
            <div><h3>{contact.name}</h3><p>{contact.university}</p><span>{contact.course}</span></div>
            <Badge variant="outline">{contact.status}</Badge>
            <ChevronRight />
          </button>
        ))}
      </div>
      {selected && <ContactDrawer contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export function StudentProfile({ client, portalUrl }: { client?: PortalClient; portalUrl: string }) {
  if (!client) return <div className="page"><div className="empty"><AlertTriangle /><h2>Alumno no encontrado</h2></div></div>;
  const name = [client.nombre, client.apellidos].filter(Boolean).join(" ") || client.email || "Alumno";
  const rows = [["ID", client.display_id], ["Email", client.email], ["Teléfono", client.telefono_alumno], ["País", client.pais], ["Origen", client.origin], ["Tipo de servicio", client.tipo], ["Nivel de aplicación", client.application_level], ["Asesor asignado", client.assigned_to], ["Fecha de alta", client.created_at ? new Date(client.created_at).toLocaleDateString("es-ES") : "—"]];
  return <div className="page student-profile-page"><Title name={name} sub="Ficha sincronizada del alumno y estado del onboarding." eyebrow="ALUMNOS · FICHA INDIVIDUAL"><a className="portal-link-button" href={`${portalUrl}/portal/`} target="_blank" rel="noreferrer"><ExternalLink />Abrir portal</a></Title><section className="panel student-profile-hero"><i>{`${client.nombre?.[0] || ""}${client.apellidos?.[0] || ""}` || "R"}</i><div><h2>{name}</h2><p>{client.email}</p></div><Badge variant="outline">Fase {client.application_phase || 1}</Badge></section><section className="student-profile-status"><article><small>Onboarding</small><strong>{client.requires_onboarding ? "Pendiente" : "Completado"}</strong></article><article><small>Identidad</small><strong>{client.dni_completed ? "Verificada" : "Pendiente"}</strong></article><article><small>Perfil</small><strong>{client.profile_completed ? "Completado" : "Pendiente"}</strong></article><article><small>Contrato</small><strong>{client.contract_signed ? "Firmado" : "Pendiente"}</strong></article><article><small>Pago</small><strong>{client.pago_completed ? "Completado" : "Pendiente"}</strong></article></section><section className="panel student-profile-info"><h2>Información del alumno</h2><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>{Boolean(client.intereses?.length) && <div className="student-interests"><strong>Intereses</strong><p>{client.intereses?.join(" · ")}</p></div>}</section></div>;
}

export function ownerTone(owner?: string) {
  if (!owner) return "owner-tone-neutral";
  const value = owner.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("noel")) return "owner-tone-noel";
  if (value.includes("manuel")) return "owner-tone-manuel";
  if (value.includes("maria")) return "owner-tone-maria";
  return "owner-tone-neutral";
}
