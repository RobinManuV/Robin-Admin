# API inventory

Generated from `netlify.toml` redirect rules and the corresponding Function source.
Methods are statically inferred and should be confirmed in the handler; scheduled Functions and routes without redirects are documented in the routing guide.

| Public route | Handler | Method(s) (static) |
|---|---|---|
| `/api/auth/login` | [`auth-login`](../netlify/functions/auth-login.js) | POST |
| `/api/auth/logout` | [`auth-logout`](../netlify/functions/auth-logout.js) | POST |
| `/api/auth/change-password` | [`auth-change-password`](../netlify/functions/auth-change-password.js) | POST |
| `/api/notion/webhook` | [`notion-webhook`](../netlify/functions/notion-webhook.js) | POST |
| `/api/internal/crm/convert` | [`crm-convert`](../netlify/functions/crm-convert.js) | POST |
| `/api/admin/crm/leads` | [`admin-crm-leads`](../netlify/functions/admin-crm-leads.js) | DELETE, GET, POST |
| `/api/admin/crm/lead-notes` | [`admin-crm-lead-notes`](../netlify/functions/admin-crm-lead-notes.js) | GET |
| `/api/admin/crm/lead-calls` | [`admin-crm-lead-calls`](../netlify/functions/admin-crm-lead-calls.js) | GET |
| `/api/admin/crm/future-leads` | [`admin-crm-future-leads`](../netlify/functions/admin-crm-future-leads.js) | POST |
| `/api/admin/crm/email` | [`admin-crm-email`](../netlify/functions/admin-crm-email.js) | GET, PATCH, POST, PUT |
| `/api/admin/crm/heartbeat` | [`admin-crm-heartbeat`](../netlify/functions/admin-crm-heartbeat.js) | POST |
| `/api/leads/website` | [`website-lead`](../netlify/functions/website-lead.js) | POST |
| `/api/meta/lead-webhook` | [`meta-lead-webhook`](../netlify/functions/meta-lead-webhook.js) | GET, POST |
| `/api/admin/meta/insights` | [`admin-meta-insights`](../netlify/functions/admin-meta-insights.js) | GET |
| `/api/admin/holded/snapshot` | [`admin-holded-snapshot`](../netlify/functions/admin-holded-snapshot.js) | GET |
| `/api/admin/finance/dashboard` | [`admin-finance-dashboard`](../netlify/functions/admin-finance-dashboard.js) | GET |
| `/api/admin/sales/dashboard` | [`admin-sales-dashboard`](../netlify/functions/admin-sales-dashboard.js) | GET |
| `/api/admin/sales/test` | [`admin-sales-test`](../netlify/functions/admin-sales-test.js) | GET, POST |
| `/api/web/collect` | [`web-collect`](../netlify/functions/web-collect.js) | POST |
| `/api/admin/web/analytics` | [`admin-web-analytics`](../netlify/functions/admin-web-analytics.js) | GET |
| `/api/admin/web/heatmap` | [`admin-web-heatmap`](../netlify/functions/admin-web-heatmap.js) | GET |
| `/api/admin/web/blog` | [`admin-web-blog`](../netlify/functions/admin-web-blog.js) | POST |
| `/api/admin/payment-analytics` | [`admin-payment-analytics`](../netlify/functions/admin-payment-analytics.js) | GET |
| `/api/me` | [`me`](../netlify/functions/me.js) | GET |
| `/api/faqs` | [`faqs`](../netlify/functions/faqs.js) | GET, POST |
| `/api/profile/lived-abroad` | [`profile-lived-abroad`](../netlify/functions/profile-lived-abroad.js) | POST |
| `/api/profile/avatar` | [`profile-avatar`](../netlify/functions/profile-avatar.js) | POST |
| `/api/onboarding/state` | [`onboarding-state`](../netlify/functions/onboarding-state.js) | GET |
| `/api/onboarding/origin` | [`onboarding-origin`](../netlify/functions/onboarding-origin.js) | POST |
| `/api/onboarding/dni/extract` | [`onboarding-dni-extract`](../netlify/functions/onboarding-dni-extract.js) | POST |
| `/api/onboarding/dni/save` | [`onboarding-dni-save`](../netlify/functions/onboarding-dni-save.js) | POST |
| `/api/onboarding/profile` | [`onboarding-profile`](../netlify/functions/onboarding-profile.js) | POST |
| `/api/onboarding/contract` | [`onboarding-contract`](../netlify/functions/onboarding-contract.js) | POST |
| `/api/onboarding/checkout` | [`onboarding-checkout`](../netlify/functions/onboarding-checkout.js) | POST |
| `/api/payments/checkout` | [`payments-checkout`](../netlify/functions/payments-checkout.js) | POST |
| `/api/payments/verify` | [`payments-verify`](../netlify/functions/payments-verify.js) | POST |
| `/api/payments` | [`payments-list`](../netlify/functions/payments-list.js) | GET |
| `/api/invoice-pdf` | [`invoice-pdf`](../netlify/functions/invoice-pdf.js) | GET |
| `/api/admin/payments/set-amount` | [`admin-payments-set-amount`](../netlify/functions/admin-payments-set-amount.js) | POST |
| `/api/admin/payments/unlock` | [`admin-payments-unlock`](../netlify/functions/admin-payments-unlock.js) | POST |
| `/api/admin/payments/add` | [`admin-payments-add`](../netlify/functions/admin-payments-add.js) | POST |
| `/api/admin/payments/delete` | [`admin-payments-delete`](../netlify/functions/admin-payments-delete.js) | POST |
| `/api/admin/payments/set-carreras` | [`admin-payments-set-carreras`](../netlify/functions/admin-payments-set-carreras.js) | POST |
| `/api/admin/payments` | [`admin-payments-list`](../netlify/functions/admin-payments-list.js) | GET |
| `/api/admin/career-suggestions` | [`admin-career-suggestions`](../netlify/functions/admin-career-suggestions.js) | GET, POST |
| `/api/admin/careers/assign` | [`admin-careers-assign`](../netlify/functions/admin-careers-assign.js) | POST |
| `/api/admin/careers/delete` | [`admin-careers-delete`](../netlify/functions/admin-careers-delete.js) | POST |
| `/api/admin/careers` | [`admin-careers-create`](../netlify/functions/admin-careers-create.js) | POST |
| `/api/careers` | [`careers-list`](../netlify/functions/careers-list.js) | GET |
| `/api/documents/upload-ticket` | [`documents-upload-ticket`](../netlify/functions/documents-upload-ticket.js) | POST |
| `/api/documents/upload` | [`documents-upload`](../netlify/functions/documents-upload.js) | POST |
| `/api/documents/get` | [`documents-get`](../netlify/functions/documents-get.js) | GET |
| `/api/documents` | [`documents-list`](../netlify/functions/documents-list.js) | GET |
| `/api/admin/documents/review` | [`admin-documents-review`](../netlify/functions/admin-documents-review.js) | POST |
| `/api/admin/documents/add` | [`admin-documents-add`](../netlify/functions/admin-documents-add.js) | POST |
| `/api/admin/documents/delete` | [`admin-documents-delete`](../netlify/functions/admin-documents-delete.js) | POST |
| `/api/admin/documents` | [`documents-list`](../netlify/functions/documents-list.js) | GET |
| `/api/admin/phase` | [`admin-phase-set`](../netlify/functions/admin-phase-set.js) | POST |
| `/api/admin/dashboard` | [`admin-dashboard`](../netlify/functions/admin-dashboard.js) | GET |
| `/api/admin/integration-snapshot` | [`admin-integration-snapshot`](../netlify/functions/admin-integration-snapshot.js) | GET |
| `/api/admin/users` | [`admin-users`](../netlify/functions/admin-users.js) | GET, POST |
| `/api/admin/database` | [`admin-database`](../netlify/functions/admin-database.js) | POST |
| `/api/admin/developer-leads` | [`admin-developer-leads`](../netlify/functions/admin-developer-leads.js) | GET, POST |
| `/api/admin/developer-clients` | [`admin-developer-clients`](../netlify/functions/admin-developer-clients.js) | GET, POST |
| `/api/admin/tasks` | [`admin-tasks`](../netlify/functions/admin-tasks.js) | GET, POST |
| `/api/admin/assistant` | [`admin-assistant`](../netlify/functions/admin-assistant.js) | POST |
| `/api/admin/historial/add` | [`admin-historial-add`](../netlify/functions/admin-historial-add.js) | POST |
| `/api/admin/notifications` | [`admin-notifications`](../netlify/functions/admin-notifications.js) | GET, POST |
| `/api/notifications/ack` | [`notifications-ack`](../netlify/functions/notifications-ack.js) | POST |
| `/api/notifications` | [`notifications-list`](../netlify/functions/notifications-list.js) | GET |
| `/api/meet/webhook` | [`meet-webhook`](../netlify/functions/meet-webhook.js) | POST |
| `/api/meet/health` | [`meet-health`](../netlify/functions/meet-health.js) | GET, POST |
| `/api/bookings/availability` | [`bookings-availability`](../netlify/functions/bookings-availability.js) | GET |
| `/api/bookings/create` | [`bookings-create`](../netlify/functions/bookings-create.js) | POST |
| `/api/bookings` | [`bookings-list`](../netlify/functions/bookings-list.js) | GET |
| `/api/admin/clients/all` | [`admin-clients-all`](../netlify/functions/admin-clients-all.js) | GET |
| `/api/admin/clients/export` | [`admin-clients-export`](../netlify/functions/admin-clients-export.js) | GET |
| `/api/admin/clients/assign` | [`admin-client-assign`](../netlify/functions/admin-client-assign.js) | POST |
| `/api/admin/clients` | [`admin-clients-list`](../netlify/functions/admin-clients-list.js) | GET |
| `/api/admin/drive-health` | [`admin-drive-health`](../netlify/functions/admin-drive-health.js) | GET |
| `/api/admin/drive-sync` | [`admin-drive-sync`](../netlify/functions/admin-drive-sync.js) | GET, POST |
| `/api/admin/drive-rename` | [`admin-drive-rename`](../netlify/functions/admin-drive-rename.js) | GET, POST |
| `/api/stripe/webhook` | [`stripe-webhook`](../netlify/functions/stripe-webhook.js) | POST |
| `/api/chat` | [`chat-ai`](../netlify/functions/chat-ai.js) | GET, POST |
| `/api/admin/chat` | [`admin-chat`](../netlify/functions/admin-chat.js) | GET, POST |
