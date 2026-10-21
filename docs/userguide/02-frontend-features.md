# 02 · Frontend y features

## Contrato del shell

`src/components/admin-app.tsx` obtiene identidad (`PortalAdmin`), datos, permisos y acciones. Distribuye callbacks a componentes presentacionales y decide la feature a partir del path. `src/components/feature-modules.tsx` implementa carga `React.lazy`/`Suspense`; al añadir una pantalla nueva se debe enlazar en ese dispatcher y en navegación/permisos del shell.

## Módulos de administración

| Área | Módulo(s) | Responsabilidad / dependencias principales |
|---|---|---|
| CRM y bandeja | [`leads.tsx`](../../src/features/admin/leads.tsx), [`lead-inbox.tsx`](../../src/features/admin/lead-inbox.tsx), [`lead-shared.tsx`](../../src/features/admin/lead-shared.tsx) | Tabla y grupos de leads, asignación, etapas, notas, llamadas, heat, origen y ficha. Consumidor de `adminDataClient`. |
| Campos y panel compartido | [`feature-shared.tsx`](../../src/features/admin/feature-shared.tsx) | Tipos de props, títulos, drawer de contacto, etiquetas y vista de base para desarrollador. |
| Estudiantes | [`students.tsx`](../../src/features/admin/students.tsx) | Vista global, perfil del cliente y traducción visual de asignación. |
| Analytics | [`analytics.tsx`](../../src/features/admin/analytics.tsx), `analytics-personal.tsx`, `analytics-finance.tsx`, `analytics-sales.tsx` | Composición de analítica agregada, personal, financiera y comercial; datos tipados en `src/services/integrations.ts`. |
| Configuración | [`settings.tsx`](../../src/features/admin/settings.tsx) | Gestión de admins, permisos e información de integraciones mediante callbacks del shell. |
| Correo CRM | [`email-composer.tsx`](../../src/features/admin/email-composer.tsx) | Edición/selección de campañas, contactos, plantillas y envío a través de `adminDataClient`. |

## Dashboard e informes

- [`dashboard-home.tsx`](../../src/components/dashboard-home.tsx) compone KPIs, series, accesos y listados; usa `dashboard-utils.ts` para intervalos de fecha y `admin-path.ts` para enlaces bajo `/admin`.
- [`dashboard-report.tsx`](../../src/components/dashboard-report.tsx) desglosa altas, embudo o facturación según query y período.
- [`dashboard-loader.tsx`](../../src/components/dashboard-loader.tsx) presenta el estado de carga; `empty-chart-bar.tsx` representa series vacías.
- [`developer-leads-table.tsx`](../../src/components/developer-leads-table.tsx) muestra una tabla paginada y editable con allowlist/backend validation en el endpoint developer correspondiente.

## Analítica web

[`web-analytics.tsx`](../../src/components/web-analytics.tsx) coordina período, estado de carga/error y navegación. Las vistas específicas viven en `web-analytics-traffic.tsx`, `-pages.tsx`, `-conversion.tsx`, `-heatmaps.tsx`, `-blog.tsx`, `-videos.tsx` y `-tech.tsx`. `web-analytics-shared.tsx` contiene formato de fechas, ratios, KPIs, paneles, tablas y estados sin datos. El contrato de datos está en `src/services/web-analytics.ts`.

## UI común y tipos

- `src/components/ui/` tiene primitives Button/Badge.
- `src/components/external-app-redirect.tsx` mantiene redirecciones a productos vecinos.
- `src/types/domain.ts` define contactos, estados CRM y tipos compartidos entre features.
- `src/styles/` contiene estilos globales y específicos de analítica.
- `src/lib/admin-permissions.ts` es el catálogo frontend de claves de visibilidad; mantener sus claves compatibles con la validación de backend.

Índice de todas las rutas de importación y archivos: [FILE_MAP](../FILE_MAP.md) y [árbol `src/`](../codebase/src/README.md).


## Añadir o modificar una vistaAñadir o modificar una vista

Antes de crear un componente decide si la vista pertenece al shell común, a dashboard/reporting o a un dominio de `src/features/admin/`. Para una feature del panel revisa el conjunto completo:

- Registro lazy y fallback en `src/components/feature-modules.tsx`.
- URL/path que la selecciona, entrada de navegación y permiso visible en `admin-app.tsx`.
- Propiedades y callbacks del módulo compartido; evitar que una pantalla fabrique por su cuenta una segunda shell.
- Cliente de servicio llamado y estados de cargando, vacío, error y éxito.
- Enlaces generados bajo `/admin`, query string y comportamiento al refrescar la ruta directamente.

Una pantalla puede ocultarse en el menú por UX, pero el endpoint debe proteger la operación por sí mismo. Si cambias una capability, busca el nombre completo en frontend y backend antes de renombrarlo.

---

**USERGUIDE:** [Índice](../../USERGUIDE.md) · [← Anterior](./01-runtime-and-session.md) · [Siguiente documento de lectura →](./03-api-and-functions.md) · [READMELONG](../../READMELONG.md)
