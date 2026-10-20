// Admin interface component for empty chart bar; composed by the shell or a feature module.
export function EmptyChartBar({ className = "" }: { className?: string }) {
  return <div className={`empty-chart-bar ${className}`.trim()} role="img" aria-label="Sin datos"><i /></div>;
}
