# 06 · Flujos entre los tres repositorios

## Responsabilidades

| Repo | Runtime principal | Datos/identity |
|---|---|---|
| [Robin Admin](https://github.com/RobinManuV/Robin-Admin) | Panel interno en `/admin/`; funciones de CRM administrativo, finanzas e integraciones. | Usa APIs de admin locales y endpoints comunes de identidad de Platform cuando sirve bajo `project-robin.com`. |
| [Robin Platform cliente](https://github.com/RobinManuV/Robin-platform-cliente) | Portal del alumno y administración de aplicación bajo `/portal/`; Worker Cloudflare en `infrastructure/cloudflare/`. | Fuente de identidad/application y DB propia del producto Platform. |
| [Robin Subscriptions](https://github.com/saantimartinn/robin-subscriptions) | The Robin Plan bajo `/therobinplan/`. | DB Supabase, cookie, roles y Stripe Billing independientes. |

## Login compartido Admin + Platform

1. Admin muestra su formulario en `src/App.jsx`.
2. En `project-robin.com/admin`, `portalClient.login()` llama `/portal/api/auth/login` porque `apiPath()` detecta el host y la ruta.
3. El Worker quita `/portal` y llama el Netlify Function de Robin Platform `/api/auth/login`.
4. La cookie de sesión se devuelve al navegador con el scope configurado; `portalClient.me()` repite el recorrido.
5. Los datos administrativos (`/api/admin/...`) no se prefijan; el Worker envía esos endpoints a Admin Netlify.

Revisar conjuntamente: [Admin `api-path.ts`](../../src/lib/api-path.ts), [Admin `portal.ts`](../../src/services/portal.ts), [Platform client API](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/portal-source/src/api/core.js) y [Worker](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/infrastructure/cloudflare/project-robin-router.js).

## Entrada a The Robin Plan

El selector `/login` y el menú cross-portal están en Robin Platform; la experiencia The Robin Plan vive en el repo Subscriptions. Desde una sesión de Platform, `frontend/src/app.jsx` (Subscriptions) llama `/api/auth/sso`. Ese Function verifica sesión del proyecto Platform y establece una cookie propia de suscriptor solo tras encontrar una identidad válida. No comparte JWT secret ni sustituye las reglas de suscripción.

Revisar [Platform USERGUIDE](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/USERGUIDE.md), [Subscriptions USERGUIDE](https://github.com/saantimartinn/robin-subscriptions/blob/main/USERGUIDE.md) y el [mapa Cloudflare](../CLOUDFLARE_ROUTING.md).

## Contratos duplicados y cambios coordinados

Los repos se despliegan de forma independiente; no hay paquete fuente común ni release atómico. Si se cambia identidad, roles, shape de `users`, permisos de pestañas, prefijos de ruta, snapshots o límites de subida:

1. buscar consumidor en los otros repos mediante sus `USERGUIDE.md`/`FILE_MAP.md`;
2. mantener compatibilidad del request y response durante el despliegue gradual;
3. preparar migración de DB solo en el repo dueño de ese esquema;
4. desplegar y comprobar cada dominio/ruta afectada.

No usar rutas relativas de archivos entre repos: los links externos apuntan a `main` y la URL concreta del archivo en GitHub.
