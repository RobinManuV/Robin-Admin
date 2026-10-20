# Cloudflare y enrutamiento — Robin Admin

## Alcance y fuente de verdad

El Worker de `project-robin.com` está versionado en [Robin Platform: `infrastructure/cloudflare/project-robin-router.js`](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/infrastructure/cloudflare/project-robin-router.js). El Worker devuelve `fetch(request)` sin cambios para rutas que no reconoce; en el despliegue descrito por su README, WordPress sigue siendo el origen por defecto.

Esta página describe únicamente las reglas que aparecen en el código versionado. La asociación real de zona DNS, custom domains, variables de entorno del Worker y estado de publicación depende de la configuración externa de Cloudflare/Netlify.

El snapshot consultado en el dashboard el 20-10-2026, incluidos los seis patrones activos observados y la discrepancia entre la ficha del Worker y la página general de rutas, está en la [guía canónica de Robin Platform](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/CLOUDFLARE_ROUTING.md).

## Rutas de Admin en el Worker

| Entrada pública | Destino | Transformación |
|---|---|---|
| `/admin` y `/admin/` | `https://robin-admin-platform.netlify.app/` | Conserva query string. |
| `/admin/<ruta>` | Admin Netlify `/<ruta>` | Elimina `/admin`; el SPA de Netlify resuelve la ruta. |
| `/api/admin/*` y `/api/admin` | Admin Netlify misma ruta | Conserva `/api/admin`; `netlify.toml` la envía a Function. |
| `/api/internal/crm/*` | Admin Netlify misma ruta | Conserva la ruta para conversión CRM de servidor a servidor. |
| `/portal/api/auth/*`, `/portal/api/me`, `/portal/api/profile/*` | Robin Platform | El Worker elimina `/portal` y envía el path restante a la API de Platform. |

Desde una página `/admin/*`, `src/lib/api-path.ts` prefija con `/portal` las llamadas de identidad compartida (`/api/auth/*`, `/api/me`, `/api/profile/*`). Las llamadas `/api/admin/*` y `/api/internal/*` permanecen en la raíz y llegan al backend Admin.

## Assets del panel

Admin se compila con base `/` porque Netlify lo sirve desde raíz en su propio dominio. Al proxificar `/admin/`, el Worker transforma referencias HTML/CSS `/assets/...` a `/admin/assets/...` y añade `?v=admin-20261008` como clave de caché. Las solicitudes ya en `/admin/assets/*` pierden el prefijo antes del fetch a Netlify. Si se cambia el build base o la versión de caché, modificar y desplegar coordinadamente el Worker y el frontend.

El Worker comprueba que la respuesta de una ruta de asset no sea HTML; si recibe fallback HTML bajo `/assets/*`, devuelve `404 Admin asset not found`. Esto evita responder `index.html` con status 200 a una URL JavaScript inexistente.

## Segundo salto: Netlify Admin

Tras llegar a Admin Netlify:

1. `/api/*` se asigna a `netlify/functions/*.js` mediante los bloques `[[redirects]]` de [netlify.toml](../netlify.toml).
2. El código del handler valida método/origen/sesión/autorización, y delega en `lib/`.
3. Las rutas no API que son navegaciones SPA terminan en `/index.html`.
4. `/assets/*` se sirve desde `dist/assets/`; las Functions se exponen también en `/.netlify/functions/<name>` para llamadas internas o directas.

Consulta [API_INVENTORY](API_INVENTORY.md) para ruta pública → handler y [USERGUIDE](../USERGUIDE.md) para handler → servicio.

## Relación con los otros portales

- `/login` llega al selector de portal implementado por [Robin Platform](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/USERGUIDE.md).
- `/portal/*` y `/portal/api/*` se enrutan al proyecto Platform; el Worker elimina `/portal` únicamente para APIs, conservando prefijo en UI estática.
- `/therobinplan/*` y `/therobinplan/api/*` se enrutan a Robin Subscriptions; el Worker elimina `/therobinplan` para API, conserva el prefijo en UI.
- La sesión de suscriptor es separada. La entrada desde una sesión de aplicación usa el endpoint SSO de Subscriptions; no se comparte `JWT_SECRET` entre despliegues.

El cuadro completo y los patrones API de los tres repos se mantienen en [la guía canónica de Robin Platform](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/CLOUDFLARE_ROUTING.md).
