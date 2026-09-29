import { GOLD } from "../../shared/theme.js";
import React from "react";

function RobinProgressBar({ value, light }) {
  return (
    <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: light ? "rgba(255,255,255,0.2)" : "#e2e8f0" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((value || 0) * 100)}%`, background: `linear-gradient(90deg, ${GOLD}, #E08600)` }} />
    </div>
  );
}

export { RobinProgressBar };
