import React from "react";
import { CalendarDays, FileText, Flag } from "lucide-react";
import { Badge, Card, CardContent, CardHeader } from "../../ui.jsx";
import { GOLD, NAVY } from "../../theme.js";

export function careerTimelineItems(careers = []) {
  return careers.flatMap((career) => (career.required_docs || []).map((requirement, index) => ({
    ...requirement,
    id: requirement.id || `${career.id || 'career'}-${index}`,
    type: requirement.type === "event" ? "event" : "document",
    deadline: requirement.deadline || null,
    careerId: career.id,
    careerName: career.name,
    university: career.university,
  }))).sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

function formatDeadline(value) {
  if (!value) return "Deadline pendiente";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-ES", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

export function CareerRequirementsTimeline({ careers = [], title = "Timeline de requerimientos" }) {
  const items = careerTimelineItems(careers);
  return (
    <Card>
      <CardHeader title={title} subtitle="Documentos y fechas clave de tus carreras, ordenados por deadline" icon={CalendarDays} />
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">Todavía no hay requerimientos asignados.</div>
        ) : (
          <div className="relative ml-3 border-l-2 border-slate-100 space-y-1">
            {items.map((item) => {
              const isEvent = item.type === "event";
              const Icon = isEvent ? Flag : FileText;
              return (
                <div key={`${item.careerId}-${item.id}`} className="relative pl-8 py-3">
                  <span className="absolute -left-[17px] top-4 h-8 w-8 rounded-full grid place-items-center border-4 border-white"
                    style={{ background: isEvent ? GOLD : NAVY, color: "white" }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 transition hover:border-slate-300 hover:shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{item.careerName}{item.university ? ` · ${item.university}` : ""}</div>
                      </div>
                      <Badge tone={isEvent ? "amber" : "blue"}>{isEvent ? "Evento" : "Documento"}</Badge>
                    </div>
                    <div className={`mt-2 text-xs font-semibold ${item.deadline ? "text-slate-700" : "text-amber-600"}`}>
                      <CalendarDays className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />{formatDeadline(item.deadline)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
