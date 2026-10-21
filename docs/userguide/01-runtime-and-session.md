# 01 · Runtime, sesión y navegación

## Inicio de la aplicación

`src/main.jsx` crea el root React, carga `src/styles/global.css` y monta `src/App.jsx`. `App` consulta `portalClient.me()` al montar. Hasta que esa consulta termina no muestra el shell; si no hay sesión, presenta el formulario local de login; si la hay, monta `AdminApp`.

El host `project-robin.com` usa identidad compartida del portal cliente. `src/lib/api-path.ts` convierte endpoints de identidad en `/portal/api/*`, que el Worker enruta a Robin Platform. En el hostname directo de Admin, las mismas llamadas quedan en `/api/*` y los redirects Netlify de este repo son su fallback.

## Sesión y navegación protegida

`src/services/portal.ts` concentra operaciones de login, logout, `me`, cambio de contraseña, snapshot de integración, usuarios admin, carga de avatar y endpoints del panel de desarrollador. Envía `credentials: same-origin` para que el navegador adjunte la cookie HttpOnly.

`src/components/admin-app.tsx` es el shell autenticado. Lee `window.location.pathname`, quita el prefijo `/admin`, determina el área activa y consulta los datos de CRM/administración. Sus helpers locales `getArea` e `isSideItemActive` mantienen activa la navegación. Después verifica permiso de pestaña y selecciona la feature.

El frontend puede ocultar rutas no permitidas, pero la autorización verdadera se implementa en Functions por cada request. Para cambios de roles revisar también `src/lib/admin-permissions.ts`, `lib/admin-auth.js`, `lib/authorization.js` y `netlify/functions/admin-users.js`.

## Ruta de navegación

```text
index.html → src/main.jsx → src/App.jsx
  ├─ sin usuario → AdminLogin
  └─ sesión válida → src/components/admin-app.tsx
       ├─ dashboard/report → dashboard-home.tsx / dashboard-report.tsx
       ├─ feature → feature-modules.tsx → src/features/admin/*
       └─ analítica web → web-analytics.tsx → web-analytics-<tab>.tsx
```

El Admin usa pathname propio, mientras Cloudflare expone el mismo SPA bajo `/admin/`. Ver [enrutamiento](../CLOUDFLARE_ROUTING.md), [arquitectura](../ARCHITECTURE.md) y [mapa de frontend](02-frontend-features.md).


## Diagnóstico paso a pasoDiagnóstico paso a paso

Cuando Admin no llega al shell, separa la resolución de identidad del render:

1. Comprueba que el documento y los bundles se hayan servido; si el HTML carga pero el JS no, investiga primero el path de asset bajo `/admin` y la regla del Worker.
2. En la pestaña de red localiza `/api/me` o la llamada de sesión equivalente. El host y pathname determinan si `src/lib/api-path.ts` la transforma a `/portal/api/*`.
3. Si la ruta va a Platform, sigue la respuesta allí; si va a Admin, comprueba redirects y Function local.
4. Distingue 401 (no hay sesión válida), 403 (identidad válida sin permiso), error de red (proxy/origin) y error de parseo/respuesta.
5. Tras validar sesión, sigue el pathname a `admin-app.tsx`; confirma que el prefijo de despliegue no se interprete como nombre de feature.

Al cambiar login, comprueba al menos la entrada desde dominio común y desde host directo de Netlify, junto con logout y expiración. No copies cookies reales ni tokens a incidencias o documentación.

---

**USERGUIDE:** [Índice](../../USERGUIDE.md) · [Siguiente documento de lectura →](./02-frontend-features.md) · [READMELONG](../../READMELONG.md)
