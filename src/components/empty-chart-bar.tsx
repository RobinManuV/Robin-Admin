export function EmptyChartBar({ className = "" }: { className?: string }) {
  return <div className={`empty-chart-bar ${className}`.trim()} role="img" aria-label="Sin datos"><i /></div>;
}
