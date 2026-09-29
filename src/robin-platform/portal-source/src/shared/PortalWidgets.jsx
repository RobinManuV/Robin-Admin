import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { notificationAck, notificationsPending } from "../api.js";
import { reportClientError } from "../client-utils.js";
import { GOLD, NAVY, NAVY_DARK } from "../theme.js";
import { Btn } from "../ui.jsx";

export function KpiCard({ icon: Icon, label, value, sub, tone = "navy" }) {
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

export function Row({ label, value, tone = "slate" }) {
  const color = tone === "green" ? "text-emerald-700" :
                tone === "amber" ? "text-amber-700" :
                tone === "rose" ? "text-rose-700" : "text-slate-800";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export function NotificationPopup() {
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try { const result = await notificationsPending(); if (!cancel) setQueue(result.notifications || []); }
      catch (_) { if (!cancel) setQueue([]); }
      finally { if (!cancel) setLoaded(true); }
    })();
    return () => { cancel = true; };
  }, []);

  if (!loaded || idx >= queue.length) return null;
  const notification = queue[idx];
  const isTerms = notification.type === "terms";

  async function handle(action) {
    setBusy(true);
    try { await notificationAck(notification.id, action); }
    catch (error) { reportClientError("optional_operation", error); }
    setBusy(false);
    setIdx((current) => current + 1);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY_DARK}, ${NAVY})` }}>
          <div className="h-9 w-9 rounded-xl grid place-items-center bg-white/10 flex-shrink-0">
            {isTerms ? <FileText className="h-5 w-5 text-white" /> : <Bell className="h-5 w-5 text-white" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">{isTerms ? "Cambio de términos" : "Notificación"}</div>
            <div className="text-white font-semibold truncate">{notification.title}</div>
          </div>
        </div>
        <div className="px-6 py-5 flex-1 overflow-y-auto">
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{notification.content}</div>
          {isTerms && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800">
              Este cambio modifica los términos y condiciones de tu contrato. Al aceptar, confirmas los nuevos términos sobre el contrato que firmaste originalmente y recibirás una confirmación por correo.
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="text-[11px] text-slate-400">{queue.length > 1 ? `${idx + 1} de ${queue.length}` : ""}</div>
          {isTerms ? (
            <Btn variant="primary" onClick={() => handle("accept")} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Acepto los nuevos términos
            </Btn>
          ) : (
            <Btn variant="primary" onClick={() => handle("seen")} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Entendido
            </Btn>
          )}
        </div>
      </motion.div>
    </div>
  );
}
