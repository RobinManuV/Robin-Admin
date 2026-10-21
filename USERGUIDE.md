# USERGUIDE — Robin Admin

Guía de incorporación técnica para quien empieza a trabajar en el panel de administración. Sigue una funcionalidad desde la pantalla que ve el usuario hasta el endpoint, la autorización, el servicio y la fuente de datos. La guía describe el código versionado; para el estado real del hosting consulta [Cloudflare y enrutamiento](docs/CLOUDFLARE_ROUTING.md).

> Empieza aquí si aún no conoces el repositorio. La [guía técnica extendida](READMELONG.md) da contexto de producto y despliegue; esta USERGUIDE es el recorrido operativo por el código.

## Qué es este repositorio

Robin Admin es una aplicación React/Vite servida como SPA, con endpoints en Netlify Functions y lógica reutilizable de backend en `lib/`. Contiene el panel interno (CRM, alumnos, analítica, finanzas, configuración e integraciones) y algunos flujos de aplicación. La identidad de aplicación procede de Robin Platform cuando se usa el dominio común. The Robin Plan es otro despliegue, con backend y datos propios.

No hay un paquete compartido ni un despliegue atómico entre estos repositorios. Cambiar un contrato que cruza repos requiere revisar los dos extremos y desplegar los cambios en un orden compatible.

## Antes de tocar código

1. Lee este índice y luego el capítulo de la capa que vas a modificar.
2. Comprueba [arquitectura](docs/ARCHITECTURE.md), [mapa manual de archivos](docs/FILE_MAP.md) e [inventario API](docs/API_INVENTORY.md). El inventario es un localizador generado; verifica el contrato en el handler.
3. Busca el punto de entrada y sus consumidores con `rg`/búsqueda de referencias. No deduzcas ownership solo por el nombre del archivo.
4. Revisa `package.json`, `netlify.toml` y `vite.config.mjs` antes de cambiar scripts, rutas, build, nonce CSP, redirects o headers.
5. En cambios de datos, identifica cuál proyecto Supabase recibe cada migración: `supabase/migrations/`, `admin-migrations/` y `robin-plan-migrations/` no son intercambiables.

## Ruta de lectura

```text
USERGUIDE.md
├── 01 Runtime y sesión
├── 02 Frontend y funcionalidades
├── 03 API y Functions
├── 04 Servicios de dominio
├── 05 Datos, integraciones y seguridad
├── 06 Flujos entre repositorios
└── 07 Referencia por archivo
```

Cada capítulo enlaza el anterior y el siguiente. Los enlaces a Platform y Subscriptions permiten seguir el mismo flujo al cruzar una frontera entre productos.

**Lectura secuencial:** empieza por [01 · Runtime, sesión y navegación](docs/userguide/01-runtime-and-session.md). Al final de cada capítulo sigue el enlace “Siguiente documento de lectura” hasta [07 · Referencia por archivo](docs/userguide/07-source-file-reference.md); desde allí puedes volver a este índice.

| Si vienes a… | Lee primero |
|---|---|
| Ejecutar o depurar el portal | [01 · Runtime, sesión y navegación](docs/userguide/01-runtime-and-session.md) |
| Añadir o cambiar una pantalla | [02 · Frontend y funcionalidades](docs/userguide/02-frontend-features.md) |
| Añadir o cambiar una ruta HTTP | [03 · API y Netlify Functions](docs/userguide/03-api-and-functions.md) |
| Cambiar una regla de negocio | [04 · Servicios de dominio](docs/userguide/04-domain-services.md) |
| Tocar persistencia, secretos o un proveedor | [05 · Datos, integraciones y seguridad](docs/userguide/05-data-integrations-security.md) |
| Cambiar login, SSO, navegación o routing compartido | [06 · Flujos entre repositorios](docs/userguide/06-cross-repository-flows.md) |
| Encontrar un archivo o seguir todos sus enlaces | [07 · Referencia por archivo](docs/userguide/07-source-file-reference.md) → árbol por carpeta → source |

## Mapa de ejecución

```text
Navegador
  index.html → src/main.jsx → src/App.jsx
  → src/components/admin-app.tsx → feature/dashboard component
  → src/services/* → public /api path
  → netlify.toml redirect → netlify/functions/<handler>.js
  → lib/* → Supabase / storage / provider
```

En el dominio público, Cloudflare puede enviar una petición de UI o API a este Netlify o a Robin Platform según el path. La tabla de reglas, transformaciones y límites de esa afirmación está en [CLOUDFLARE_ROUTING.md](docs/CLOUDFLARE_ROUTING.md). En el dominio Netlify directo, el navegador usa las rutas locales y redirects de este repo.

## Directorios y fuentes de verdad

| Ubicación | Cómo usarla al investigar |
|---|---|
| `src/App.jsx`, `src/main.jsx` | Entrada, resolución de sesión y montaje React. |
| `src/components/admin-app.tsx` | Shell autenticada, pathname, navegación, permisos visibles y datos comunes. |
| `src/components/feature-modules.tsx` | Registro/carga de pantallas; comprobarlo al añadir una feature. |
| `src/features/admin/` | Pantallas y subcomponentes de los dominios del panel. |
| `src/services/` | Clientes HTTP y conversión de respuesta a tipos consumidos por UI. |
| `src/lib/`, `src/types/` | Helpers de navegador, permisos de visibilidad y contratos tipados. |
| `netlify/functions/` | Entrada HTTP/job; debe conservar método, respuesta, auth y validación. |
| `netlify/edge-functions/` | Controles previos a Functions configurados por Netlify. |
| `lib/` | Servicios, autorización, persistencia y adaptadores de proveedores del servidor. |
| `supabase/*` | SQL versionado por proyecto/ámbito. Confirma el destino antes de aplicar. |
| `netlify.toml`, `vite.config.mjs` | Rutas, headers, build, CSP nonce, funciones y bundling. |
| `docs/codebase/` | Índices por carpeta que llevan al source; son navegación, no especificación de runtime. |

Para recorrer la lista completa, usa el [árbol de código](docs/codebase/README.md), el [mapa mantenido](docs/FILE_MAP.md) y el [índice generado](docs/FILE_INDEX.generated.md). El segundo explica relaciones; el tercero permite localizar símbolos/archivos rápidamente.

## Cómo seguir un cambio desde la UI

1. Localiza la pantalla en `src/features/admin/` o `src/components/`. Busca el dispatcher y cómo recibe sus props en `admin-app.tsx`.
2. Sigue el callback hasta `src/services/portal.ts`, `admin-data.ts`, `integrations.ts` o `web-analytics.ts`. Anota URL, método, body, credenciales y forma de respuesta.
3. Resuelve esa URL en `netlify.toml` y [API_INVENTORY.md](docs/API_INVENTORY.md). Confirma el handler real.
4. Lee el handler: método y origen, sesión, permiso/ownership, validación, efectos laterales, errores y respuesta.
5. Sigue imports del handler a `lib/`, y desde allí a Supabase, Storage o un proveedor.
6. Comprueba consumidores del mismo contrato antes de cambiar campos, nombres de roles, status codes o comportamiento de error.

Para solicitudes entrantes (webhooks, integraciones, cron), invierte la ruta: configuración/job → handler → servicio → escritura/destino → efectos de reintento.

## Desarrollo local y verificación

Consulta `package.json` para comandos vigentes. La arquitectura documenta `npx netlify dev` para el runtime integrado y `npm run build` para compilar el SPA; el frontend solo con Vite puede no tener las Functions disponibles. Usa las pruebas y scripts definidos en el repo según el tipo de cambio. No uses la salida compilada como lugar para editar código fuente.

Al reproducir un bug, anota URL completa, pathname y query, host, identidad/rol (sin copiar secretos ni datos personales), request/response status y logs saneados. Para una página blanca bajo `/admin`, verifica consecutivamente: HTML y JS cargados, path/base de assets, consola, fallback SPA, CSP nonce y rewrite de Worker. Cloudflare tiene un capítulo propio porque una respuesta HTML en lugar de JS puede parecer un fallo React.

## Guías por capa

- [01 · Runtime, sesión y navegación](docs/userguide/01-runtime-and-session.md)
- [02 · Frontend y funcionalidades](docs/userguide/02-frontend-features.md)
- [03 · API y Netlify Functions](docs/userguide/03-api-and-functions.md)
- [04 · Servicios de dominio](docs/userguide/04-domain-services.md)
- [05 · Datos, integraciones y seguridad](docs/userguide/05-data-integrations-security.md)
- [06 · Flujos entre repositorios](docs/userguide/06-cross-repository-flows.md)
- [07 · Referencia por archivo y navegación del código](docs/userguide/07-source-file-reference.md)

## Documentación relacionada y repos vecinos

- [READMELONG](READMELONG.md) · contexto de producto, runtime y dominios.
- [Arquitectura](docs/ARCHITECTURE.md) · límites entre capas y responsabilidades.
- [Cloudflare y rutas](docs/CLOUDFLARE_ROUTING.md) · rutas públicas, proxy y transformaciones.
- [API inventory](docs/API_INVENTORY.md) · rutas conocidas y handler candidato.
- [Dataflow](docs/DATAFLOW.md) · recorridos de identidad, CRM, documentos, pagos y proveedores.
- [Robin Platform USERGUIDE](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/USERGUIDE.md) · identidad de aplicación, portal y Worker.
- [Robin Subscriptions USERGUIDE](https://github.com/saantimartinn/robin-subscriptions/blob/main/USERGUIDE.md) · cuenta, billing y comunidad de The Robin Plan.

**Volver al inicio:** [USERGUIDE](USERGUIDE.md) · [README largo](READMELONG.md)
