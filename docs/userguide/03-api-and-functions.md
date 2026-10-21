# 03 · API y Netlify Functions

## Cómo encontrar un handler

La API pública de Admin se declara en `netlify.toml`: cada bloque `[[redirects]]` con status 200 relaciona `/api/...` con `/.netlify/functions/<handler>`. El inventario generado [API_INVENTORY.md](../API_INVENTORY.md) enlaza cada ruta al archivo exacto. Las Functions no sustituyen validaciones de dominio por configuración de ruta.

```text
React component → src/services/* → public /api path → netlify.toml redirect
  → netlify/functions/<handler>.js → lib/* → Supabase / external provider
```

## Familias de endpoints

| Dominio | Prefijos/rutas | Handlers representativos | Siguiente capa |
|---|---|---|---|
| Identidad y perfil | `/api/auth/*`, `/api/me`, `/api/profile/*` | `auth-login`, `auth-logout`, `auth-change-password`, `me`, `profile-avatar` | `lib/auth.js`, `lib/identity.js`, proveedor de sesión compartida cuando entra por Cloudflare. |
| CRM | `/api/admin/crm/*`, `/api/internal/crm/*`, `/api/leads/website`, `/api/meta/lead-webhook`, `/api/notion/webhook` | `admin-crm-leads`, `admin-crm-lead-notes`, `admin-crm-lead-calls`, `admin-crm-future-leads`, `admin-crm-email`, `crm-convert`, `website-lead`, `meta-lead-webhook` | `lib/crm-*`, `lib/notion.js`, ingestión y sincronización. |
| Analytics, finanzas y ventas | `/api/admin/finance/*`, `/api/admin/sales/*`, `/api/admin/holded/*`, `/api/admin/meta/*`, `/api/admin/web/*` | `admin-finance-dashboard`, `admin-sales-dashboard`, `admin-holded-snapshot`, `admin-meta-insights`, `admin-web-*`, `web-collect` | `lib/finance/`, `lib/holded/`, Google Analytics y adaptadores Meta. |
| App y pagos | `/api/onboarding/*`, `/api/payments/*`, `/api/invoice-pdf`, `/api/admin/payments/*` | handlers `onboarding-*`, `payments-*`, `admin-payments-*`, `stripe-webhook` | `lib/onboarding-*`, `lib/payments.js`, `lib/stripe.js`, PDF e integraciones. |
| Documentos y carreras | `/api/documents/*`, `/api/admin/documents/*`, `/api/careers*`, `/api/admin/careers*` | `documents-*`, `admin-documents-*`, `careers-list`, `admin-careers-*` | Drive/Storage, OCR, `lib/career-*`, recomendaciones. |
| Operación y admins | `/api/admin/dashboard`, `/api/admin/users`, `/api/admin/tasks`, `/api/admin/database`, `/api/admin/clients/*`, `/api/admin/notifications` | `admin-dashboard`, `admin-users`, `admin-tasks`, `admin-database`, `admin-clients-*`, `admin-notifications` | `lib/admin-*`, permisos, Supabase y servicios internos. |
| Reservas, Meet y chat | `/api/bookings/*`, `/api/meet/*`, `/api/chat`, `/api/admin/chat` | `bookings-*`, `meet-*`, `chat-ai`, `admin-chat` | Calendar/Meet, `lib/booking-*`, `lib/meet-transcript.js`, `lib/anthropic-chat.js`. |

## Reglas de handlers

- Las Functions son adaptadores HTTP: leen `event.httpMethod`, validan entrada/origen y responden con estado/cabeceras explícitas.
- Reutilizar las funciones de `lib/http.js`, `lib/auth.js`, `lib/authorization.js`, `lib/admin-auth.js`, `lib/validation.js` y `lib/observability.js`; evitar duplicar parsing o autorización.
- Los handlers `admin-*` deben comprobar usuario, permisos y alcance del registro en backend. El menú oculto no autoriza una mutación.
- Webhooks (Stripe, Notion, Meta, Meet) validan secreto o firma y deben preservar idempotencia. Los handlers programados se declaran bajo `[functions."name"]` en `netlify.toml`.
- La respuesta suele ser JSON; PDF y eventos streaming son excepciones. Las APIs usan `Cache-Control: no-store` según config de hosting.

Para reglas y tablas estáticas revisa la fuente del handler: [inventario](../API_INVENTORY.md) detecta métodos por regex y no reemplaza revisión manual del contrato.


## Receta para una ruta nuevaReceta para una ruta nueva

1. Define método, ruta pública, parámetros, esquema de entrada, respuesta y política de error.
2. Añade o actualiza el redirect de `netlify.toml`; usa nombres de Function que se puedan resolver sin ambigüedad.
3. Implementa el límite HTTP en `netlify/functions/`: rechaza métodos no admitidos, verifica origen cuando corresponde, autentica, autoriza y valida antes de mutar.
4. Mueve lógica reutilizable a `lib/` si hay regla de dominio o más de un consumidor; el handler debe permanecer como adaptador de transporte.
5. Añade el consumidor al cliente de `src/services/` y mapea respuesta a tipos UI sin elevar privilegios.
6. Actualiza contratos/inventario si corresponde y rastrea referencias de las rutas antiguas.

En webhooks, valida la firma sobre el cuerpo en la forma exigida por el proveedor antes de parsear o escribir. En jobs, revisa schedule, timeout, concurrencia y efectos de reintento en `netlify.toml`.

---

**USERGUIDE:** [Índice](../../USERGUIDE.md) · [← Anterior](./02-frontend-features.md) · [Siguiente documento de lectura →](./04-domain-services.md) · [READMELONG](../../READMELONG.md)
