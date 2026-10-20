// Admin interface component for feature modules; composed by the shell or a feature module.
import { lazy, Suspense } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { FeatureModuleProps } from "@/features/admin/feature-shared";
import { DeveloperDatabasePage } from "@/features/admin/feature-shared";
import { ExternalAppRedirect } from "@/components/external-app-redirect";

const LeadInbox = lazy(() => import("@/features/admin/lead-inbox").then((module) => ({ default: module.LeadInbox })));
const Crm = lazy(() => import("@/features/admin/leads").then((module) => ({ default: module.Crm })));
const GlobalStudents = lazy(() => import("@/features/admin/students").then((module) => ({ default: module.GlobalStudents })));
const GlobalAnalytics = lazy(() => import("@/features/admin/analytics").then((module) => ({ default: module.GlobalAnalytics })));
const PersonalAnalytics = lazy(() => import("@/features/admin/analytics").then((module) => ({ default: module.PersonalAnalytics })));
const Campaigns = lazy(() => import("@/features/admin/analytics").then((module) => ({ default: module.Campaigns })));
const Configuration = lazy(() => import("@/features/admin/settings").then((module) => ({ default: module.Configuration })));
const WebAnalytics = lazy(() => import("@/components/web-analytics"));

function renderFeature(component: React.ReactNode) {
  return <Suspense fallback={<div className="page" aria-busy="true"><div className="empty">Cargando sección…</div></div>}>{component}</Suspense>;
}

export function FeatureModule(props: FeatureModuleProps) {
  const { path } = props;
  if (path === "/bandeja-leads") return renderFeature(<LeadInbox {...props} />);
  if (path === "/alumnos-global" || path.startsWith("/alumnos-global/")) return renderFeature(<GlobalStudents path={path} snapshot={props.portalSnapshot} connected={props.portalConnected} contacts={props.contacts} />);
  if (path === "/analitica-global" || path === "/pagos") return renderFeature(<GlobalAnalytics contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} connected={props.portalConnected} />);
  if (path === "/configuracion") return renderFeature(<Configuration {...props} />);
  if (path === "/base-datos" || path === "/crm/base-datos") return props.isDeveloperAdmin ? <DeveloperDatabasePage /> : <div className="page"><div className="empty"><ShieldCheck /><h2>Acceso restringido</h2></div></div>;
  if (path === "/alumnos" || path.startsWith("/alumnos/")) return <ExternalAppRedirect href="https://project-robin.com/login" name="Portal del Alumno" />;
  if (path === "/the-robin-plan" || path.startsWith("/the-robin-plan/")) return <ExternalAppRedirect href="https://project-robin.com/therobinplan/" name="The Robin Plan" />;
  if (path.startsWith("/crm")) return renderFeature(<Crm {...props} />);
  if (path.startsWith("/analiticas")) return renderFeature(<PersonalAnalytics path={path} currentUser={props.currentUser} contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} isDeveloperAdmin={props.isDeveloperAdmin} />);
  if (path.startsWith("/campanas")) return renderFeature(<Campaigns currentUser={props.currentUser} notify={props.notify} />);
  if (path.startsWith("/web")) return renderFeature(<WebAnalytics notify={props.notify} />);
  return <div className="page"><div className="empty"><AlertTriangle /><h2>Vista no disponible</h2><p>Esta sección ya no forma parte de la nueva navegación.</p></div></div>;
}
