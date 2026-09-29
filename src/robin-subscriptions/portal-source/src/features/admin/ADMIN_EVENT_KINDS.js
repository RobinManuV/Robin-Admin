import { Briefcase, Building2, CalendarCheck, Plane, Tag, Users } from "lucide-react";

const ADMIN_EVENT_KINDS = {
  eventos: { types: ["event", "party", "sports", "networking"], defaultType: "event", label: "evento", plural: "Eventos", icon: CalendarCheck, hasDate: true, hasCapacity: true },
  grupos:  { types: ["group"], defaultType: "group", label: "grupo", plural: "Grupos", icon: Users, hasMembers: true },
  ofertas: { types: ["announcement"], defaultType: "announcement", label: "oferta", plural: "Ofertas", icon: Tag, hasExpiry: true, hasPartner: true },
  viajes:  { types: ["trip"], defaultType: "trip", label: "viaje", plural: "Viajes", icon: Plane, hasDate: true, hasTrip: true },
  asociaciones: { types: ["association"], defaultType: "association", label: "asociación", plural: "Asociaciones", icon: Building2, hasAssoc: true },
  empleos: { types: ["job"], defaultType: "job", label: "empleo", plural: "Empleos", icon: Briefcase, hasJob: true },
};

export { ADMIN_EVENT_KINDS };
