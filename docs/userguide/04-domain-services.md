# 04 · Servicios de dominio (`lib/`)

Los handlers de [netlify/functions](../codebase/netlify/functions/README.md) deben conservar HTTP, autorización y forma de respuesta; la lógica que tiene varios consumidores vive en `lib/`. El [mapa de archivos](../FILE_MAP.md) muestra imports locales para cada módulo.

## Módulos por responsabilidad

| Grupo | Archivos | Contrato técnico |
|---|---|---|
| HTTP, acceso y usuario | `http.js`, `auth.js`, `authorization.js`, `admin-auth.js`, `admins.js`, `admin-profiles.js`, `identity.js`, `admin-supabase.js`, `supabase.js`, `privacy.js`, `validation.js`, `observability.js` | Parseo/response HTTP, sesión JWT/cookie, guards y perfiles, clientes Supabase, validación, redacción y errores. Cambios de roles afectan los tres frontends. |
| CRM e ingestión | `crm-identity.js`, `crm-lead-ingest.js`, `crm-historical-metrics.js`, `crm-performance.js`, `sales-personal-scope.js`, `sales-dashboard.js`, `sales-utils.js`, `career-suggestions.js` | Normaliza identidad/campos de leads, métricas, filtrado por responsable, agregados comerciales y recomendaciones. |
| Finanzas y pagos | `finance-dashboard.js`, `finance/`, `holded.js`, `holded/`, `payments.js`, `extra-payments.js`, `stripe.js`, `sales-test-mode.js`, `operational-config.js` | Fachadas de compatibilidad, rangos/aggregates financieros, facturas, sincronización Holded y operaciones de pago. |
| Datos y documentos | `storage.js`, `dni-upload.js`, `ocr.js`, `document-drive.js`, `career-documents.js`, `contract-pdf.js`, `career-requirements.js` | Tickets de upload, límites de archivos, OCR, Drive, PDFs y requisitos/carreras. |
| Comunicación | `email.js`, `google-gmail.js`, `account-access-email.js`, `onboarding-welcome.js`, `faq-citations.js`, `faq-knowledge.js`, `anthropic-chat.js` | Email saliente, Gmail, plantillas, contexto de FAQs y llamadas IA. Mantener redacción PII al loggear errores. |
| Calendar, reservas e ingestión | `booking-config.js`, `booking-availability.js`, `booking-create.js`, `google-calendar.js`, `meet-transcript.js`, `integration-sync.js` | Configuración de disponibilidad, reservas idempotentes, eventos Calendar/Meet y sync/reintentos. |
| Proveedores auxiliares | `google-drive.js`, `google-sheets.js`, `notion.js`, `google-web-analytics.js`, `web-analytics-auth.js`, `subscriptions-supabase.js`, `subscriptions-partner-logo.js` | Adaptadores encapsulan tokens, esquema externo, transformaciones y errores de proveedor. |
| Datos/configuración | `careers-data.json`, configuración `lib/finance/*` y `lib/operational-config.js` | Catálogos/defaults no secretos; no colocar datos personales de producción en JSON versionado. |

## Fachadas de finanzas

`lib/finance-dashboard.js` preserva el punto de importación existente y delega en `lib/finance/` (configuración, períodos, ingresos contratados, gastos, Holded, facturas, tesorería y dashboard). `lib/holded.js` mantiene exports para consumidores antiguos y delega en `lib/holded/` (cliente HTTP, analítica, invoices y payment-invoice). Al mover una exportación, mantener nombre, forma de argumentos y estructura de respuesta hasta actualizar consumidores.

## Cómo seguir una operación

Ejemplo: dashboard financiero → `src/services/integrations.ts` → `/api/admin/finance/dashboard` → `netlify/functions/admin-finance-dashboard.js` → `lib/finance-dashboard.js` → `lib/finance/dashboard.js` / `lib/holded/*` → Holded o Supabase. La consulta usa el guard de Admin y formatea la respuesta con el tipo `FinanceDashboard`.

Ejemplo: mutar lead → `leads.tsx` → `adminDataClient` (`src/services/admin-data.ts`) → `/api/admin/crm/leads` → `admin-crm-leads.js` → `lib/crm-*`/Supabase; el cliente actualiza el estado y aplica `toContact()` para normalizar el row a `Contact`.
