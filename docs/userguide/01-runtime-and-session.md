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
