// Cliente HTTP para la API real del portal Robin (Netlify functions + Supabase).
// Todas las llamadas usan cookies ('same-origin').
import { getLocalPreviewResponse } from "./preview-api.js";

async function request(method, url, body) {
  const preview = await getLocalPreviewResponse(method, url);
  if (preview?.active) return preview.data;
  const opts = { method, credentials: "same-origin", headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const publicUrl = typeof window !== "undefined"
    && /(^|\.)project-robin\.com$/i.test(window.location.hostname)
    && url.startsWith("/api/")
      ? "/portal" + url
      : url;
  const resp = await fetch(publicUrl, opts);
  let data = null;
  try { data = await resp.json(); } catch (error) { console.warn("[api] optional operation failed", error && error.message); }
  if (!resp.ok) {
    const err = new Error(
      (data && (data.error + (data.detail ? ": " + data.detail : ""))) ||
        "HTTP " + resp.status
    );
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body),
};

export async function login(username, password) {
  return api.post("/api/auth/login", { username, password });
}
export async function logout() {
  try { await api.post("/api/auth/logout"); } catch (error) { console.warn("[api] optional operation failed", error && error.message); }
}
export async function me() {
  return api.get("/api/me");
}
export async function onboardingState() {
  return api.get("/api/onboarding/state");
}
export async function originSave(payload) {
  return api.post("/api/onboarding/origin", payload);
}
const MAX_DNI_IMAGE_BYTES = 10 * 1024 * 1024;
const DNI_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function validateDniImage(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("La imagen está vacía o no es válida.");
  }
  if (file.size > MAX_DNI_IMAGE_BYTES) throw new Error("Cada imagen puede ocupar como máximo 10 MB.");
  const mime = String(file.type || "").toLowerCase();
  if (!DNI_IMAGE_TYPES.has(mime)) throw new Error("Usa una imagen JPG, PNG, WEBP o GIF.");
  return mime;
}

async function cancelDniImage(upload, docType) {
  try {
    await api.post("/api/onboarding/dni/extract", {
      action: "cancel",
      doc_type: docType,
      side: upload.side,
      file_path: upload.path,
    });
  } catch (error) { console.warn("[dni_upload_cleanup_failed]", error && error.message); }
}

async function uploadDniImage(file, side, docType) {
  const mime = validateDniImage(file);
  const ticket = await api.post("/api/onboarding/dni/extract", {
    action: "upload_ticket",
    doc_type: docType,
    side,
    file_filename: file.name,
    file_mime: mime,
    file_size: file.size,
  });
  const upload = ticket && ticket.upload;
  if (!upload?.signed_url || !upload?.path) throw new Error("No se pudo preparar la subida segura.");

  let response;
  try {
    response = await fetch(upload.signed_url, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "cache-control": "no-store",
        "x-upsert": "false",
      },
      body: file,
    });
  } catch (error) {
    await cancelDniImage({ side, path: upload.path }, docType);
    throw new Error("No se pudo conectar con el almacenamiento seguro.");
  }
  if (!response.ok) {
    await cancelDniImage({ side, path: upload.path }, docType);
    throw new Error("No se pudo subir la imagen al almacenamiento seguro.");
  }
  return { side, path: upload.path, filename: file.name, mime, size: file.size };
}

export async function dniExtract(anverso, reverso, docType) {
  const normalizedType = docType === "passport" ? "passport" : "dni";
  const uploaded = [];
  try {
    uploaded.push(await uploadDniImage(anverso, "anverso", normalizedType));
    if (normalizedType === "dni") {
      uploaded.push(await uploadDniImage(reverso, "reverso", normalizedType));
    }
  } catch (error) {
    await Promise.all(uploaded.map((item) => cancelDniImage(item, normalizedType)));
    throw error;
  }

  const payload = {
    action: "extract",
    doc_type: normalizedType,
    anverso: uploaded.find((item) => item.side === "anverso"),
    reverso: uploaded.find((item) => item.side === "reverso") || null,
  };
  try {
    return await api.post("/api/onboarding/dni/extract", payload);
  } catch (error) {
    if (error.status) await Promise.all(uploaded.map((item) => cancelDniImage(item, normalizedType)));
    throw error;
  }
}
export async function dniSave(fields) {
  return api.post("/api/onboarding/dni/save", fields);
}
export async function profileSave(payload) {
  return api.post("/api/onboarding/profile", payload);
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function cancelAvatarUpload(path) {
  try { await api.post("/api/profile/avatar", { action: "cancel", file_path: path }); }
  catch (error) { console.warn("[avatar_upload_cleanup_failed]", error && error.message); }
}

export async function profileAvatarUpload(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("La imagen está vacía o no es válida.");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("La imagen puede ocupar como máximo 5 MB.");
  const mime = String(file.type || "").toLowerCase();
  if (!AVATAR_TYPES.has(mime)) throw new Error("Usa una imagen JPG, PNG o WEBP.");
  const ticket = await api.post("/api/profile/avatar", {
    action: "upload_ticket",
    file_filename: file.name,
    file_mime: mime,
    file_size: file.size,
  });
  const upload = ticket && ticket.upload;
  if (!upload?.signed_url || !upload?.path) throw new Error("No se pudo preparar la subida.");
  let response;
  try {
    response = await fetch(upload.signed_url, {
      method: "PUT",
      headers: { "Content-Type": mime, "cache-control": "no-store", "x-upsert": "false" },
      body: file,
    });
  } catch (_error) {
    await cancelAvatarUpload(upload.path);
    throw new Error("No se pudo conectar con Storage.");
  }
  if (!response.ok) {
    await cancelAvatarUpload(upload.path);
    throw new Error("No se pudo subir la imagen.");
  }
  try {
    return await api.post("/api/profile/avatar", {
      action: "commit",
      file_path: upload.path,
      file_filename: file.name,
      file_mime: mime,
      file_size: file.size,
    });
  } catch (error) {
    await cancelAvatarUpload(upload.path);
    throw error;
  }
}

// Guarda el campo "ha vivido fuera" del perfil. Si payload.user_id está presente y
// el llamante es admin, edita ese alumno; si no, edita el propio (sólo la 1ª vez).
export async function livedAbroadSave(payload) {
  return api.post("/api/profile/lived-abroad", payload);
}

export async function adminListClients() {
  return api.get("/api/admin/clients");
}

export async function adminListAllClients() {
  return api.get("/api/admin/clients/all");
}
export async function adminAssignClient(userId) {
  return api.post("/api/admin/clients/assign", { user_id: userId });
}

export async function contractSave(payload) {
  return api.post("/api/onboarding/contract", payload);
}

// Stripe Checkout para la primera cuota del onboarding. Devuelve { url }.
export async function onboardingCheckout() {
  return api.post("/api/onboarding/checkout", {});
}

// ----- PAGOS -----
export async function paymentsList() {
  return api.get("/api/payments");
}
// Stripe Checkout para una cuota desbloqueada (2-3 o extra). Devuelve { url }.
export async function paymentsCheckout(installment) {
  return api.post("/api/payments/checkout", { installment });
}
// Confirma el pago al volver de Stripe (idempotente).
export async function paymentsVerify(sessionId) {
  return api.post("/api/payments/verify", { session_id: sessionId });
}
export async function adminPaymentsList(userId) {
  return api.get("/api/admin/payments?user_id=" + encodeURIComponent(userId));
}
export async function adminPaymentsAdd(userId, concept, amount, dueDate) {
  return api.post("/api/admin/payments/add", { user_id: userId, concept, amount, due_date: dueDate || null });
}
export async function adminPaymentsDelete(userId, paymentId) {
  return api.post("/api/admin/payments/delete", { user_id: userId, payment_id: paymentId });
}
export async function adminPaymentsUnlock(userId, installment) {
  return api.post("/api/admin/payments/unlock", { user_id: userId, installment });
}
export async function adminPaymentsSetAmount(userId, installment, amount) {
  return api.post("/api/admin/payments/set-amount", { user_id: userId, installment, amount });
}
export async function adminPaymentsSetCarreras(userId, num) {
  return api.post("/api/admin/payments/set-carreras", { user_id: userId, num_carreras: num });
}

// ----- CARRERAS -----
export async function careersListMine() { return api.get("/api/careers"); }
export async function adminCareersListAll(userId) {
  const userQuery = userId ? `&user_id=${encodeURIComponent(userId)}` : "";
  return api.get(`/api/careers?all=1${userQuery}`);
}
export async function adminCareersCreate(payload) {
  const uploaded = [];
  const requiredDocs = [];
  try {
    for (const raw of (payload.required_docs || [])) {
      const { template_file: templateFile, ...document } = raw;
      if (templateFile) {
        const upload = await uploadFileDirect(templateFile, { purpose: "career_template" });
        uploaded.push({ ...upload, purpose: "career_template" });
        document.template_path = upload.path;
        document.template_filename = upload.filename;
        document.template_mime = upload.mime;
        document.template_size = upload.size;
      }
      requiredDocs.push(document);
    }
  } catch (error) {
    await Promise.all(uploaded.map(cancelDirectUpload));
    throw error;
  }
  return api.post("/api/admin/careers", { ...payload, required_docs: requiredDocs });
}
export async function adminCareersDelete(id) { return api.post("/api/admin/careers/delete", { id }); }
export async function adminCareersAssign(userId, careerTemplateId) {
  return api.post("/api/admin/careers/assign", { user_id: userId, career_template_id: careerTemplateId });
}
export async function adminCareersUnassign(userId, careerTemplateId) {
  return api.post("/api/admin/careers/assign", { user_id: userId, career_template_id: careerTemplateId, action: "unassign" });
}

// ----- DOCUMENTOS -----
export async function documentsList() { return api.get("/api/documents"); }
export async function documentsGet(id) { return api.get("/api/documents/get?id=" + encodeURIComponent(id)); }
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

async function uploadFileDirect(file, context) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("Archivo vacío o inválido.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("El archivo supera el máximo de 20 MB.");
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const ticket = await api.post("/api/documents/upload-ticket", {
    ...context,
    file_filename: file.name,
    file_mime: mime,
    file_size: file.size,
  });
  const upload = ticket && ticket.upload;
  if (!upload?.signed_url || !upload?.path) throw new Error("No se pudo preparar la subida.");
  let response;
  try {
    response = await fetch(upload.signed_url, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "cache-control": "max-age=3600",
        "x-upsert": "false",
      },
      body: file,
    });
  } catch (error) {
    await cancelDirectUpload({ ...context, path: upload.path });
    throw new Error("No se pudo conectar con Storage.");
  }
  if (!response.ok) {
    await cancelDirectUpload({ ...context, path: upload.path });
    throw new Error("No se pudo subir el archivo a Storage.");
  }
  return { ...context, path: upload.path, filename: file.name, mime, size: file.size };
}

async function cancelDirectUpload(upload) {
  try {
    await api.post("/api/documents/upload-ticket", {
      action: "cancel",
      purpose: upload.purpose,
      document_id: upload.document_id,
      user_id: upload.user_id,
      file_path: upload.path,
    });
  } catch (error) { console.warn("[upload_cleanup_failed]", error && error.message); }
}

export async function documentsUpload(documentId, file) {
  const upload = await uploadFileDirect(file, { purpose: "document", document_id: documentId });
  return api.post("/api/documents/upload", {
    id: documentId,
    file_path: upload.path,
    file_filename: upload.filename,
    file_mime: upload.mime,
    file_size: upload.size,
  });
}
export async function adminDocumentsList(userId) { return api.get("/api/admin/documents?user_id=" + encodeURIComponent(userId)); }
export async function adminDocumentsReview(id, decision, reason) {
  return api.post("/api/admin/documents/review", { id, decision, rejection_reason: reason });
}
export async function adminDocumentsAdd(payload, templateFile) {
  if (!templateFile) return api.post("/api/admin/documents/add", payload);
  const upload = await uploadFileDirect(templateFile, {
    purpose: "document_template",
    user_id: payload.user_id,
  });
  return api.post("/api/admin/documents/add", {
    ...payload,
    template_path: upload.path,
    template_filename: upload.filename,
    template_mime: upload.mime,
    template_size: upload.size,
  });
}
export async function adminDocumentsDelete(id) { return api.post("/api/admin/documents/delete", { id }); }

// ----- FASE APLICACIÓN -----
export async function adminPhaseSet(userId, phase) { return api.post("/api/admin/phase", { user_id: userId, phase }); }


// ----- ADMIN DASHBOARD -----
export async function adminDashboard() {
  return api.get("/api/admin/dashboard");
}
export async function adminTaskCreate(payload) {
  return api.post("/api/admin/tasks", { action: "create", ...payload });
}
export async function adminTaskToggle(id) {
  return api.post("/api/admin/tasks", { action: "toggle", id });
}
export async function adminTaskDelete(id) {
  return api.post("/api/admin/tasks", { action: "delete", id });
}


// ----- ADMIN ASSISTANT (chat IA) + HISTORIAL -----
export async function adminAssistant(messages, focusUserId) {
  return api.post("/api/admin/assistant", { messages, focus_user_id: focusUserId || null });
}
export async function adminHistorialAdd(payload) {
  return api.post("/api/admin/historial/add", payload);
}


// ----- ADMIN · SUGERENCIAS DE CARRERAS (IA) -----
export async function adminCareerSuggestions(userId) {
  return api.get("/api/admin/career-suggestions?user_id=" + encodeURIComponent(userId));
}
export async function adminCareerSuggestionsRegenerate(userId) {
  return api.post("/api/admin/career-suggestions", { user_id: userId, action: "regenerate" });
}
export async function adminCareerSuggestionFeedback(userId, programCode, decision) {
  return api.post("/api/admin/career-suggestions", {
    user_id: userId,
    action: "feedback",
    program_code: programCode,
    decision,
  });
}


// ----- CHAT CON IA (alumno) -----
export async function chatAiList() {
  return api.get("/api/chat");
}
export async function chatAiSend(content) {
  return api.post("/api/chat", { content });
}

// ----- CHAT CON IA · vista e intervención del ASESOR -----
export async function adminChatList(userId) {
  return api.get("/api/admin/chat?user_id=" + encodeURIComponent(userId));
}
export async function adminChatSend(userId, content) {
  return api.post("/api/admin/chat", { user_id: userId, content });
}
export async function adminChatResume(userId) {
  return api.post("/api/admin/chat", { user_id: userId, action: "resume" });
}


// ----- BOOKINGS (reservas Google Meet) -----
export async function bookingsList(userId) {
  const qs = userId ? ("?user_id=" + encodeURIComponent(userId)) : "";
  return api.get("/api/bookings" + qs);
}
export async function bookingsCreate(payload) {
  return api.post("/api/bookings/create", payload);
}
export async function bookingsAvailability(params) {
  const p = params || {};
  const qs = new URLSearchParams();
  if (p.from) qs.set("from", p.from);
  if (p.days) qs.set("days", String(p.days));
  const s = qs.toString();
  return api.get("/api/bookings/availability" + (s ? ("?" + s) : ""));
}

// ----- Notificaciones -----
export async function adminNotificationsList() {
  return api.get("/api/admin/notifications");
}
export async function adminNotificationCreate(payload) {
  // payload: { title, content, type: 'info'|'terms', user_ids: [] }
  return api.post("/api/admin/notifications", payload);
}
export async function notificationsPending() {
  return api.get("/api/notifications");
}
export async function notificationAck(notificationId, action) {
  // action: 'seen' | 'accept'
  return api.post("/api/notifications/ack", { notification_id: notificationId, action });
}

// ----- FAQs -----
export async function faqsList() { return api.get("/api/faqs"); }
export async function adminFaqMutate(action, payload) { return api.post("/api/faqs", { action, payload }); }
