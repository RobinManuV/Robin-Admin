import { ROBIN_BENEFITS, ROBIN_LEVELS, ROBIN_LEVEL_ORDER, STUDENTJOB_CITY_SLUG } from "./constants.js";

function formatDate(d) {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d)); }
  catch { return "—"; }
}

export { formatDate };

function formatMoney(amount, currency) {
  if (amount == null) return null;
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(amount); }
  catch { return amount + " " + (currency || "EUR"); }
}

export { formatMoney };

function getRobinLevel(user) {
  const daysActive = robinDaysActive(user);
  const ov = user && user.robin_level_override;
  const levelKey = (ov && ROBIN_LEVEL_ORDER[ov] != null) ? ov : (daysActive <= 75 ? "nest" : daysActive <= 181 ? "fly" : "rocket");
  const idx = ROBIN_LEVEL_ORDER[levelKey];
  const def = ROBIN_LEVELS[idx];
  const nextDef = ROBIN_LEVELS[idx + 1] || null;
  let progress = 1, daysRemaining = 0;
  if (nextDef) {
    const span = def.next - def.start;
    progress = Math.max(0, Math.min(1, (daysActive - def.start) / span));
    daysRemaining = Math.max(0, def.next - daysActive);
  }
  const unlockedBenefits = [];
  ROBIN_BENEFITS.forEach((g) => g.items.forEach((b) => { if (ROBIN_LEVEL_ORDER[b.level] <= idx) unlockedBenefits.push(b.key); }));
  return { level: levelKey, daysActive, progress, nextLevel: nextDef ? nextDef.key : null, daysRemaining, unlockedBenefits };
}

export { getRobinLevel };

function isSubscriberAdmin(u) {
  return !!(u && u.role === "subscriber_admin");
}

export { isSubscriberAdmin };

function isSubscriberUser(u) {
  return !!(u && (u.is_subscriber || u.role === "subscriber"));
}

export { isSubscriberUser };

function resizeImageFile(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img_error"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max; canvas.height = max;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export { resizeImageFile };

function prepareLogoFile(file, maxWidth = 900, maxHeight = 500) {
  return new Promise((resolve, reject) => {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("invalid_logo_type")); return;
    }
    if (file.size > 5 * 1024 * 1024) { reject(new Error("logo_too_large")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img_error"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export { prepareLogoFile };

function robinDaysActive(user) {
  const bonus = Number(user && user.bonus_days) || 0;
  const ref = user && (user.created_at || user.subscription_started_at);
  if (!ref) return bonus;
  const d = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  return (isFinite(d) && d > 0 ? d : 0) + bonus;
}

export { robinDaysActive };

function robinLevelDef(key) { return ROBIN_LEVELS[ROBIN_LEVEL_ORDER[key] != null ? ROBIN_LEVEL_ORDER[key] : 0]; }

export { robinLevelDef };

function robinLockFor(user, key) {
  const idx = ROBIN_LEVEL_ORDER[getRobinLevel(user).level];
  let b = null;
  for (const g of ROBIN_BENEFITS) { for (const x of g.items) { if (x.key === key) { b = x; break; } } if (b) break; }
  if (!b) return null;
  return ROBIN_LEVEL_ORDER[b.level] > idx ? robinLevelDef(b.level) : null;
}

export { robinLockFor };

function studentJobUrl(ciudad) {
  const slug = STUDENTJOB_CITY_SLUG[ciudad];
  return slug ? `https://www.studentjob.nl/bijbaan/${slug}` : "https://www.studentjob.nl/english-speaking-jobs";
}

export { studentJobUrl };

function uid(p = "id") { return `${p}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }

export { uid };
