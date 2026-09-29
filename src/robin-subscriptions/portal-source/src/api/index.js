import { getLocalPreviewResponse } from "../../../../robin-platform/portal-source/src/preview-api.js";

async function request(method, url, body, isForm) {
  const preview = await getLocalPreviewResponse(method, url);
  if (preview?.active) return preview.data;
  const opts = { method, credentials: "same-origin", headers: {} };
  if (body && !isForm) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body;
  }
  const publicUrl = typeof window !== "undefined"
    && /(^|\.)project-robin\.com$/i.test(window.location.hostname)
    && url.startsWith("/api/")
      ? "/therobinplan" + url
      : url;
  const resp = await fetch(publicUrl, opts);
  let data = null;
  try { data = await resp.json(); } catch (_) {}
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
  postForm: (url, fd) => request("POST", url, fd, true),
};

export async function login(username, password) {
  return api.post("/api/auth/login", { username, password });
}

export async function requestPasswordReset(email) {
  return api.post("/api/auth/change-password", { action: "request_reset", email });
}

export async function resetPassword(token, password) {
  return api.post("/api/auth/change-password", { action: "reset", token, password });
}

export async function logout() {
  try { await api.post("/api/auth/logout"); } catch (_) {}
}

export async function me() {
  return api.get("/api/me");
}

export async function subscriberSignup(name, email, password, ciudad, discountCode, tcAccepted) {
  return api.post("/api/subscriber/signup", { name, email, password, ciudad, discount_code: discountCode, tc_accepted: !!tcAccepted });
}

export async function discountValidate(code) {
  return api.post("/api/subscription/discount", { code });
}

export async function socialData() { return api.get("/api/social"); }

export async function socialAction(action, targetId) { return api.post("/api/social", { action, target_id: targetId }); }

export async function messagesConversations() { return api.get("/api/messages"); }

export async function messagesThread(withId) { return api.get("/api/messages?with=" + encodeURIComponent(withId)); }

export async function messageSend(to, body) { return api.post("/api/messages", { to, body }); }

export async function challengesList() { return api.get("/api/challenges"); }

export async function challengeSubmit(challengeId, answers, files) { return api.post("/api/challenges", { action: "submit", challenge_id: challengeId, answers, files }); }

export async function subscriberCvAi(payload) {
  return api.post("/api/subscriber/cv-ai", payload);
}

export async function subscriberProfileUpdate(payload) {
  return api.post("/api/subscriber/profile", payload);
}

export async function subscriptionCheckout(plan) {
  return api.post("/api/subscription/checkout", { plan });
}

export async function subscriptionPlans() {
  return api.get("/api/subscription/plans");
}

export async function subscriptionPortal() {
  return api.post("/api/subscription/portal", {});
}

export async function partnersList() {
  return api.get("/api/partners");
}

export async function communityEventsList() {
  return api.get("/api/community/events");
}

export async function communityRsvp(eventId, status) {
  return api.post("/api/community/rsvp", { event_id: eventId, status });
}

export async function serviceRequestsList() {
  return api.get("/api/service-requests");
}

export async function serviceRequestCreate(payload) {
  return api.post("/api/service-requests", payload);
}

export async function subAdminData() {
  return api.get("/api/robin-plan/admin/data");
}

export async function subAdminMutate(entity, action, payload) {
  return api.post("/api/robin-plan/admin/mutate", { entity, action, payload });
}

export async function partnerLogoUpload(dataUrl, partnerId) {
  return api.post("/api/robin-plan/admin/partner-logo", { data_url: dataUrl, partner_id: partnerId || null });
}

export async function notificationsPending() {
  return api.get("/api/notifications");
}

export async function notificationAck(notificationId, action) {
  // action: 'seen' | 'accept'
  return api.post("/api/notifications/ack", { notification_id: notificationId, action });
}

export async function faqsList() { return api.get("/api/robin-plan/admin/faqs"); }
export async function adminFaqMutate(action, payload) { return subAdminMutate("faq", action, payload); }
