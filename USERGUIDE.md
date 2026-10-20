# USERGUIDE — Robin Admin

Índice técnico para navegar el código desde una funcionalidad visible hasta su ruta HTTP, handler, servicio, datos y repositorio vecino. `docs/FILE_MAP.md` explica manualmente módulos y contratos; `docs/FILE_INDEX.generated.md` y `docs/codebase/` son localizadores automáticos.

## Árbol de lectura

```text
USERGUIDE.md
├── docs/userguide/01-runtime-and-session.md
├── docs/userguide/02-frontend-features.md
├── docs/userguide/03-api-and-functions.md
├── docs/userguide/04-domain-services.md
├── docs/userguide/05-data-integrations-security.md
├── docs/userguide/06-cross-repository-flows.md
├── docs/ARCHITECTURE.md
├── docs/CLOUDFLARE_ROUTING.md
├── docs/API_INVENTORY.md
└── docs/codebase/README.md → mapas por carpeta → enlaces a cada archivo fuente
```

## Flujos recomendados

| Necesidad | Recorrido |
|---|---|
| ¿Cómo inicia Admin? | [Runtime y sesión](docs/userguide/01-runtime-and-session.md) → [Cloudflare y rutas](docs/CLOUDFLARE_ROUTING.md) → `src/App.jsx` → `src/components/admin-app.tsx`. |
| ¿Dónde vive una pantalla? | [Frontend y features](docs/userguide/02-frontend-features.md) → `src/components/feature-modules.tsx` → feature de `src/features/admin/`. |
| ¿Qué endpoint llama? | [API y Functions](docs/userguide/03-api-and-functions.md) → [inventario de API](docs/API_INVENTORY.md) → `netlify/functions/<handler>.js`. |
| ¿Dónde está la lógica real? | [Servicios de dominio](docs/userguide/04-domain-services.md) → `lib/` → proveedor o base de datos. |
| ¿Qué comparte con los otros portales? | [Flujos entre repos](docs/userguide/06-cross-repository-flows.md) → [enrutamiento](docs/CLOUDFLARE_ROUTING.md) y sus guías. |

## Directorios fuente

- [`src/`](docs/codebase/src/README.md): frontend y tipos.
- [`netlify/functions/`](docs/codebase/netlify/functions/README.md): límites HTTP y funciones programadas.
- [`lib/`](docs/codebase/lib/README.md): dominio e integraciones backend.
- [`supabase/`](docs/codebase/supabase/README.md): migraciones por ámbito.
- [`scripts/`](docs/codebase/scripts/README.md), tests y configuración: índices y controles.
- [Mapa técnico mantenido](docs/FILE_MAP.md) y [índice automático](docs/FILE_INDEX.generated.md) con exports detectados.

## Guías por capa

- [01 · Runtime, sesión y navegación](docs/userguide/01-runtime-and-session.md)
- [02 · Frontend, rutas y módulos funcionales](docs/userguide/02-frontend-features.md)
- [03 · API y Netlify Functions](docs/userguide/03-api-and-functions.md)
- [04 · Servicios de dominio](docs/userguide/04-domain-services.md)
- [05 · Datos, proveedores y seguridad](docs/userguide/05-data-integrations-security.md)
- [06 · Flujos que cruzan repositorios](docs/userguide/06-cross-repository-flows.md)

## Documentos maestros

- [Descripción técnica extendida](READMELONG.md)
- [Arquitectura de este repo](docs/ARCHITECTURE.md)
- [Cloudflare, Netlify y rutas](docs/CLOUDFLARE_ROUTING.md)
- [Inventario API](docs/API_INVENTORY.md)
- [Árbol de archivos](docs/codebase/README.md)
