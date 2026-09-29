import { GOLD, NAVY, NAVY_DARK } from "./theme.js";
import React from "react";

const Badge = ({ children, tone = "slate" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    blue: "bg-sky-50 text-sky-700 border border-sky-200",
    navy: "text-white",
    rose: "bg-rose-50 text-rose-700 border border-rose-200",
    gold: "text-white",
  };
  const inlineStyle =
    tone === "navy" ? { backgroundColor: NAVY } :
    tone === "gold" ? { backgroundColor: GOLD } : undefined;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`} style={inlineStyle}>
      {children}
    </span>
  );
};

export { Badge };

const Btn = ({ children, onClick, variant = "primary", className = "", disabled, type = "button", size = "md" }) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const vars = {
    primary: "text-white shadow-sm hover:opacity-90",
    secondary: "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    gold: "text-white shadow-sm hover:opacity-90",
  };
  const inlineStyle =
    variant === "primary" ? { background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})` } :
    variant === "gold" ? { background: `linear-gradient(135deg, ${GOLD}, #e8941a)` } : undefined;

  return (
    <button type={type} disabled={disabled} onClick={onClick} style={inlineStyle}
      className={`${base} ${sizes[size]} ${vars[variant]} ${className}`}>
      {children}
    </button>
  );
};

export { Btn };

const Card = ({ children, className = "" }) => (
  <div className={`ui-card rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

export { Card };

const CardContent = ({ children, className = "" }) => <div className={`ui-card-content px-6 py-5 ${className}`}>{children}</div>;

export { CardContent };

const CardHeader = ({ title, subtitle, icon: Icon, right }) => (
  <div className="ui-card-header px-6 py-4 border-b border-slate-100 flex items-center gap-4 justify-between">
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="h-9 w-9 rounded-xl grid place-items-center text-white flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DARK})` }}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        <div className="ui-card-title text-[15px] font-semibold text-slate-900 truncate" style={{ fontFamily: "'Georgia', serif" }}>{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>}
      </div>
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);

export { CardHeader };

const Divider = () => <div className="h-px bg-slate-100 my-4" />;

export { Divider };

const Field = ({ label, value, onChange, placeholder, type = "text" }) => (
  <label className="block">
    <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</div>
    <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition" />
  </label>
);

export { Field };

function KpiCard({ icon: Icon, label, value, sub, tone = "navy" }) {
  const bg = tone === "navy" ? `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` :
             tone === "gold" ? `linear-gradient(135deg, ${GOLD}, #e8941a)` :
             tone === "rose" ? "linear-gradient(135deg, #be123c, #e11d48)" :
             "linear-gradient(135deg, #475569, #64748b)";
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ background: bg }}>
      <div className="flex items-center gap-2 text-white/80 text-[11px] uppercase tracking-wider font-semibold">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className="text-white text-2xl font-bold mt-1.5" style={{ fontFamily: "'Georgia', serif" }}>{value}</div>
      {sub && <div className="text-white/70 text-[11px] mt-1 truncate">{sub}</div>}
    </div>
  );
}

export { KpiCard };

function Row({ label, value, tone = "slate" }) {
  const c = tone === "green" ? "text-emerald-700" :
            tone === "amber" ? "text-amber-700" :
            tone === "rose"  ? "text-rose-700"   : "text-slate-800";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${c}`}>{value}</div>
    </div>
  );
}

export { Row };

const SelectField = ({ label, value, onChange, options = [], placeholder = "Selecciona…", allowEmpty = true }) => (
  <label className="block">
    {label && <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</div>}
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition">
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const lbl = typeof o === "string" ? o : o.label;
        return <option key={val} value={val}>{lbl}</option>;
      })}
    </select>
  </label>
);

export { SelectField };

const TextareaField = ({ label, value, onChange, placeholder, rows = 4 }) => (
  <label className="block">
    {label && <div className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</div>}
    <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:bg-white transition resize-none" />
  </label>
);

export { TextareaField };
