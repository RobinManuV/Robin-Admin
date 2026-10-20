import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { FeatureModuleProps } from '@/features/admin/feature-shared';
import { LeadInbox, Crm } from '@/features/admin/leads';
import { GlobalStudents } from '@/features/admin/students';
import { GlobalAnalytics, PersonalAnalytics, Campaigns } from '@/features/admin/analytics';
import { Configuration } from '@/features/admin/settings';
import { ExternalAppRedirect } from '@/components/external-app-redirect';
import { DeveloperDatabasePage } from '@/features/admin/feature-shared';
import { WebAnalytics } from '@/components/web-analytics';

export function FeatureModule(props: FeatureModuleProps) {
  const { path } = props;
  if (path === '/bandeja-leads') return <LeadInbox {...props} />;
  if (path === '/alumnos-global' || path.startsWith('/alumnos-global/')) return <GlobalStudents path={path} snapshot={props.portalSnapshot} connected={props.portalConnected} contacts={props.contacts} />;
  if (path === '/analitica-global' || path === '/pagos') return <GlobalAnalytics contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} connected={props.portalConnected} />;
  if (path === '/configuracion') return <Configuration {...props} />;
  if (path === '/base-datos' || path === '/crm/base-datos') return props.isDeveloperAdmin ? <DeveloperDatabasePage /> : <div className="page"><div className="empty"><ShieldCheck /><h2>Acceso restringido</h2></div></div>;
  if (path === '/alumnos' || path.startsWith('/alumnos/')) return <ExternalAppRedirect href="https://project-robin.com/login" name="Portal del Alumno" />;
  if (path === '/the-robin-plan' || path.startsWith('/the-robin-plan/')) return <ExternalAppRedirect href="https://project-robin.com/therobinplan/" name="The Robin Plan" />;
  if (path.startsWith('/crm')) return <Crm {...props} />;
  if (path.startsWith('/analiticas')) return <PersonalAnalytics path={path} currentUser={props.currentUser} contacts={props.contacts} leadStages={props.leadStages} snapshot={props.portalSnapshot} isDeveloperAdmin={props.isDeveloperAdmin} />;
  if (path.startsWith('/campanas')) return <Campaigns currentUser={props.currentUser} notify={props.notify} />;
  if (path.startsWith('/web')) return <WebAnalytics notify={props.notify} />;
  return <div className="page"><div className="empty"><AlertTriangle /><h2>Vista no disponible</h2><p>Esta sección ya no forma parte de la nueva navegación.</p></div></div>;
}
