export function reportClientError(operation, error) {
  console.warn(JSON.stringify({
    level: 'warn',
    operation,
    error_code: (error && (error.code || error.message)) || 'client_optional_error',
  }));
}

export function formatTime(date) {
  try { return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date); }
  catch { return ""; }
}

// =====================
//  Utilidades de presentación compartidas
// =====================
export function formatDate(d) {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d)); }
  catch { return "—"; }
}

export function formatMoney(amount, currency) {
  if (amount == null) return null;
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(amount); }
  catch { return amount + " " + (currency || "EUR"); }
}

// Lee un archivo de imagen y devuelve un data URL cuadrado redimensionado (para avatar de perfil)
export function resizeImageFile(file, max = 256) {
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
