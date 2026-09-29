import React from "react";
import financialConfig from "../../../../shared/financial-config.js";
import { Btn } from "../../ui.jsx";
import { eur } from "./payment-utils.jsx";

const { FISCAL: ROBIN_FISCAL } = financialConfig;

export function Factura({ open, onClose, user, payment }) {
  if (!open || !payment) return null;
  const base = Number(payment.amount || 0) / (1 + ROBIN_FISCAL.iva / 100);
  const iva  = Number(payment.amount || 0) - base;
  const fechaEmision = payment.paid_at ? new Date(payment.paid_at) : new Date();
  const fechaStr = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "long", year: "numeric" }).format(fechaEmision);

  function printDoc() { window.print(); }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>Justificante de pago</div>
            <div className="text-xs text-slate-500">{payment.concept ? "Pago adicional" : "Cuota " + payment.installment} · {fechaStr}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 text-sm text-slate-700 space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Emisor</div>
              <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>{ROBIN_FISCAL.razon_social}</div>
              <div className="text-xs text-slate-500 mt-1">CIF: {ROBIN_FISCAL.cif}</div>
              <div className="text-xs text-slate-500">{ROBIN_FISCAL.direccion}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Cliente</div>
              <div className="text-sm font-semibold text-slate-900">{`${user?.nombre || ""} ${user?.apellidos || ""}`.trim() || "—"}</div>
              <div className="text-xs text-slate-500 mt-1">DNI: {user?.dni_numero || "—"}</div>
              <div className="text-xs text-slate-500">{user?.direccion || "—"}</div>
              <div className="text-xs text-slate-500">{user?.email || ""}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px] bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <div>Concepto</div>
              <div className="text-right">Base</div>
              <div className="text-right">IVA ({ROBIN_FISCAL.iva}%)</div>
            </div>
            <div className="grid grid-cols-[1fr_120px_120px] px-4 py-3 border-t border-slate-100">
              <div>
                <div className="font-medium text-slate-900">{payment.concept || ROBIN_FISCAL.concepto}</div>
                <div className="text-xs text-slate-500">{payment.concept ? "Pago adicional" : `Cuota ${payment.installment}`}</div>
              </div>
              <div className="text-right tabular-nums">{eur(base)}</div>
              <div className="text-right tabular-nums">{eur(iva)}</div>
            </div>
            <div className="grid grid-cols-[1fr_120px_120px] bg-slate-50 px-4 py-3 border-t border-slate-100">
              <div className="text-right text-xs font-semibold text-slate-500 uppercase">Total</div>
              <div></div>
              <div className="text-right font-bold text-slate-900 tabular-nums">{eur(payment.amount)}</div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            <div><strong>Fecha de emisión:</strong> {fechaStr}</div>
            {payment.payment_data?.last4 && <div><strong>Método:</strong> Tarjeta ···· {payment.payment_data.last4}</div>}
          </div>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <Btn variant="secondary" size="sm" onClick={onClose}>Cerrar</Btn>
          <Btn size="sm" onClick={printDoc}>Imprimir / PDF</Btn>
        </div>
      </div>
    </div>
  );
}

// =====================
//  PAGOS — CLIENTE (Sidebar)
// =====================
