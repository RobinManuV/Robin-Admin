# Dataflow — Robin Admin

Mapa funcional de cómo entra, se transforma, protege y persiste la información que usa Robin Admin. Está pensado para seguir una operación entre pantalla, cliente HTTP, ruta, Function, servicio de dominio y sistema de datos/proveedor. Los nombres enlazados identifican puntos de entrada para inspeccionar; la implementación y configuración vigentes prevalecen sobre este resumen.

> **Alcance:** este documento describe flujos de aplicación. Para tratamiento y retención de datos personales, consulta también la documentación de privacidad de los repos vecinos. No inspecciona datos de producción ni declara el estado legal de los tratamientos.

## Mapa general de ejecución

```mermaid
flowchart LR
  Browser[Browser / React] --> Client[src/services/*]
  Client --> PublicPath[/api/*]
  PublicPath --> Route[netlify.toml redirects]
  Route --> Guard[Netlify Function: HTTP + auth]
  Guard --> Domain[lib/* domain service]
  Domain --> DB[(Supabase / Storage)]
  Domain --> Ext[Google · Holded · Notion · Meta · Revolut · email · AI]
  Browser -->|public host| CF[Cloudflare Worker in Robin Platform]
  CF -->|Admin paths| Route
  CF -->|shared identity paths| Platform[Robin Platform Functions]
  Inbound[Webhook / schedule] --> Guard
```

El cliente de React usa cookies same-origin y no debe recibir credenciales de proveedor. La Function es la frontera que autentica y autoriza; `lib/` concentra reglas, acceso a datos y adaptadores. Cloudflare elige el origin en el dominio público. Los prefijos y reescrituras exactos están en [CLOUDFLARE_ROUTING.md](CLOUDFLARE_ROUTING.md); el handler por ruta se consulta en [API_INVENTORY.md](API_INVENTORY.md).

## 1. Identidad, sesión y permisos

### Flujo de lectura de sesión

```text
src/main.jsx → src/App.jsx → portalClient.me()
  → /api/me o /portal/api/me
  → Netlify Function de identidad (Admin o Platform según host/path)
  → sesión validada → AdminApp
```

- El punto visible es [`src/App.jsx`](../src/App.jsx); el shell autenticado empieza en [`src/components/admin-app.tsx`](../src/components/admin-app.tsx).
- [`src/services/portal.ts`](../src/services/portal.ts) concentra las operaciones de identidad y perfil usadas por Admin.
- [`src/lib/api-path.ts`](../src/lib/api-path.ts) adapta rutas de identidad al prefijo público del portal cuando se sirve bajo `project-robin.com/admin`.
- En el host público, las llamadas de identidad compartida pueden terminar en Robin Platform; las APIs de CRM/administración permanecen en este repo. El dominio directo de Netlify usa las rutas y configuración de este deploy.

La sesión solo identifica al principal. Las rutas sensibles comprueban autorización otra vez en el servidor con los módulos de [auth](../lib/auth.js), [admin auth](../lib/admin-auth.js) y [authorization](../lib/authorization.js), junto con el handler del recurso. El permiso de pestaña en React controla presentación/navegación; no protege una mutation.

### Flujo de una ruta protegida

1. La UI decide si presenta acción según el shell/permisos visibles.
2. Un servicio hace la petición con credenciales same-origin.
3. La Function valida método y entrada, recupera sesión y comprueba rol, permiso y alcance del registro.
4. Solo entonces lee o cambia los datos y responde.

Para diagnosticar 401/403, distinguir cookie ausente/expirada de principal válido sin capability o acceso al recurso. Ver [01 · Runtime y sesión](userguide/01-runtime-and-session.md) y [06 · flujos entre repos](userguide/06-cross-repository-flows.md).

## 2. CRM, leads y sincronización

### Entradas de lead

Robin Admin recibe leads desde varios orígenes. Los puntos de entrada importantes incluyen:

- Website: [`netlify/functions/website-lead.js`](../netlify/functions/website-lead.js), llamado desde formulario/cliente web.
- Meta: [`meta-lead-webhook.js`](../netlify/functions/meta-lead-webhook.js) recibe el evento externo y valida el flujo de ingestión.
- Notion: [`notion-webhook.js`](../netlify/functions/notion-webhook.js) recibe cambios del sistema CRM externo.
- Operación interna: rutas `/api/admin/crm/*` y conversión servidor-a-servidor `/api/internal/crm/convert`.

Recorrido conceptual:

```text
Website / Meta / Notion / operador
  → public route → ingress Function
  → validate + identify + normalize (lib/crm-*)
  → persist/sync
  → admin-crm-* Function → src/services/admin-data.ts
  → leads.tsx / lead-inbox.tsx
```

La lógica de identidad, normalización y deduplicación se debe buscar en los módulos `lib/crm-*`; la UI consume sus contratos por [`src/services/admin-data.ts`](../src/services/admin-data.ts) y las pantallas CRM enlazadas en [USERGUIDE 02](../USERGUIDE.md). Para una mutación, no te quedes en el formulario: sigue el handler de leads/notas/llamadas/futuros leads y sus helpers hasta la tabla o el adaptador externo.

### Conversión y cambios de estado

Una operación de conversión puede cruzar el prefijo interno `/api/internal/crm/convert`: este route está destinado a integración backend, no es el API genérico del navegador. Comprueba el caller antes de cambiar autenticación o payload. Asignación, etapa, notas, llamadas, campañas y estado futuro tienen handlers distintos, por lo que sus efectos secundarios y permisos no son necesariamente idénticos.

Al cambiar el contrato revisa: normalización de identificadores/email, dedupe, owner/advisor, estado visible, historial, sync con Notion, respuesta esperada por la UI e idempotencia de reintentos. El mapa de campos Notion está en [`docs/notion-crm-mapping.md`](notion-crm-mapping.md); métricas históricas están en [`docs/crm-historical-metrics.md`](crm-historical-metrics.md).

## 3. Perfil de cliente, onboarding y documentos

### Datos de aplicación

Admin presenta parte de los datos de aplicación que pertenecen al flujo del cliente y a Robin Platform. Para una pantalla de cliente, empieza en el componente bajo `src/features/admin/`, sigue al servicio y determina si el handler/tabla pertenece a Admin o a Platform. No asumas que los datos visibles en este panel son propiedad de la DB administrativa de este repo.

El flujo de documentos usa handlers bajo `/api/documents/*` y `/api/admin/documents/*`. El cliente obtiene una operación de carga/lectura permitida; backend valida principal, ownership, metadata y permisos; el objeto vive en Storage/Drive según el servicio correspondiente y la tabla conserva la metadata. Revisa [`lib/storage.js`](../lib/storage.js), [`lib/document-drive.js`](../lib/document-drive.js), [`lib/dni-upload.js`](../lib/dni-upload.js) y [`lib/career-documents.js`](../lib/career-documents.js), además de las Functions exactas del inventario.

Para cambios de archivos sigue estas etapas por separado: autorización de upload ticket, transferencia del binario, validación de MIME/tamaño/owner, escritura de metadata, lectura/download y borrado. Una URL firmada concede acceso temporal a un objeto específico; no expongas una service-role key ni conviertas el bucket en público.

## 4. Pagos, finanzas e informes

### Pagos operativos

Las pantallas del panel llaman servicios en `src/services/portal.ts` o `integrations.ts`, según el dominio. Los endpoints de pago de usuario, los endpoints `/api/admin/payments/*), la verificación y los webhooks pueden actualizar recursos distintos. Resuelve cada ruta en [API_INVENTORY](API_INVENTORY.md), inspecciona la Function y sigue [`lib/payments.js`](../lib/payments.js), [`lib/stripe.js`](../lib/stripe.js) u otro adaptador efectivamente importado. No infieras el proveedor por el nombre de una pantalla.

En la entrada de un proveedor, verifica firma/secreto antes de procesar; registra la clave de evento para reconocer reintentos; persiste el resultado antes de informar éxito. En la salida, el servidor crea el intento/checkout con el proveedor y la UI solo navega o presenta estado. La URL de retorno no sustituye la confirmación de backend.

### Agregados de finanzas y ventas

```text
Dashboard/report UI → src/services/integrations.ts
  → /api/admin/finance/dashboard o /api/admin/sales/dashboard
  → handler → lib/finance-dashboard.js / sales-dashboard.js
  → lib/finance/* + lib/holded/* + Supabase/provider
  → respuesta agregada → tipo/view de dashboard
```

Los módulos `lib/finance-dashboard.js` y `lib/holded.js` conservan fachadas de compatibilidad sobre submódulos. Al cambiar un cálculo revisa período, timezone, filtros, monedas/unidades, datos faltantes y el tipo que consume React. Holded y la base local pueden aportar piezas diferentes: anota la fuente de cada campo antes de cambiar una suma.

## 5. Analítica e integraciones

- **Analítica web:** el navegador envía eventos permitidos a `/api/web/collect`; la Function filtra/normaliza y persiste según los servicios configurados. El panel usa `src/services/web-analytics.ts` y rutas `/api/admin/web/*`. Sigue collector, almacenamiento, agregador y visualización, no solo el gráfico.
- **Meta:** webhook/insights tienen caminos separados: ingestión modifica/normaliza datos de lead; insights consulta métricas externas. Comprueba permisos y credenciales de servidor.
- **Google:** Drive, Sheets, Calendar/Meet y Analytics se acceden mediante adaptadores server-side `lib/google-*` y handlers consumidores. Cada integración tiene su propio scope, retry y formato de respuesta.
- **Notion:** el webhook alimenta CRM; el mapping de campos está documentado, pero confirma conversión y deduplicación en la implementación.
- **AI y correo:** chat, OCR, sugerencias y mensajes pasan por handlers de dominio a Anthropic/Resend/Gmail. Manda el conjunto mínimo de datos, aplica límites y no registres prompt, documento ni respuesta sensible por defecto.

La lista de adaptadores no implica que todos se ejecuten en cada operación. La prueba de qué proveedor interviene es el import/call path del handler concreto y la configuración del entorno. Sigue los símbolos mediante [FILE_MAP](FILE_MAP.md) y [el índice por archivo](codebase/README.md).

## 6. Tráfico y rutas entre repos

En producción, el Worker vive en Robin Platform. Para una ruta de Admin pública, Cloudflare elige este origin; para identidad compartida puede enviar la petición a Platform. El fallback de WordPress y la lista de rutas observadas son parte de la topología; consulta [CLOUDFLARE_ROUTING](CLOUDFLARE_ROUTING.md) para las reglas y la fecha del snapshot.

Subscriptions tiene cuenta, cookie, DB y facturación propias. Platform puede validar identidad de aplicación en el SSO; esto no comparte el principal local de suscriptor con Admin. Sigue las guías de [Robin Platform](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/DATAFLOW.md) y [Robin Subscriptions](https://github.com/saantimartinn/robin-subscriptions/blob/main/docs/DATAFLOW.md) para los tramos que salen de este repo.

## Cómo usar este mapa en una tarea

1. Escribe la entidad que cambia y quién la posee.
2. Encuentra el elemento UI o el origen externo; sigue su enlace al cliente o ingress.
3. Resuelve la ruta en `netlify.toml`/Worker y abre el handler concreto.
4. Registra autenticación, permiso, validación y ownership antes de leer el efecto de escritura.
5. Sigue los imports hasta tabla, Storage o API de proveedor, y vuelve a la respuesta que consume el frontend.
6. Comprueba reintentos, duplicados, errores y otros lectores del mismo dato.
7. Si el cambio cruza repo, anota los dos endpoints/consumidores y mantiene compatibilidad de despliegue.

### Referencias

- [USERGUIDE](../USERGUIDE.md) · itinerarios por capa.
- [Arquitectura](ARCHITECTURE.md) · límites del sistema.
- [API inventory](API_INVENTORY.md) · ruta hacia handler.
- [Cloudflare routing](CLOUDFLARE_ROUTING.md) · origin y transformaciones.
- [FILE_MAP](FILE_MAP.md) y [codebase index](codebase/README.md) · módulos y archivos.
- [Privacy data map de Platform](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/PRIVACY_DATA_MAP.md).
- [Privacy data map de Subscriptions](https://github.com/saantimartinn/robin-subscriptions/blob/main/docs/PRIVACY_DATA_MAP.md).
