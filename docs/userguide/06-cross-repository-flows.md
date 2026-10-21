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


## Recorrido del login compartidoRecorrido del login compartido

Admin y Platform son dos origins Netlify detrás del mismo dominio público. Al entrar en Admin, la página usa su propio shell; para operaciones de identidad, `src/lib/api-path.ts` puede dirigir las llamadas a `/portal/api/*`, que el Worker entrega a Platform. Las rutas de administración de este producto siguen en Admin. La sesión de aplicación y la autorización se resuelven en el backend correspondiente; la cookie visible en el navegador no concede permiso por sí sola.

Antes de cambiar el flujo:

1. Dibuja la URL exacta del navegador, su rewrite y el origin final.
2. Confirma qué repo es proveedor y cuál consumidor de cada endpoint y campo.
3. Mantén compatibles roles, capabilities, IDs, shape JSON, status y semántica de logout.
4. Revisa los links de navegación y los tres capítulos SSO/Cloudflare.
5. Despliega el proveedor antes de depender de un campo nuevo, o usa una migración compatible en ambos lados.

Continúa en [Platform · sesión y routing](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/userguide/01-runtime-and-identity.md) y [Subscriptions · SSO](https://github.com/saantimartinn/robin-subscriptions/blob/main/docs/userguide/01-app-session-and-sso.md). Para paths exactos, el documento de referencia es [CLOUDFLARE_ROUTING](../CLOUDFLARE_ROUTING.md).

---

**USERGUIDE:** [Índice](../../USERGUIDE.md) · [← Anterior](./05-data-integrations-security.md) · [Siguiente documento de lectura →](./07-source-file-reference.md) · [READMELONG](../../READMELONG.md)
