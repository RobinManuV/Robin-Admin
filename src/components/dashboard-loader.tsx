import { Loader2 } from "lucide-react";

export function DashboardLoader() {
  return (
    <div className="dashboard-loader" role="status" aria-live="polite">
      <span className="dashboard-loader-icon"><Loader2 /></span>
      <span>Cargando dashboard…</span>
    </div>
  );
}
