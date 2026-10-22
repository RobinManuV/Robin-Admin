# Robin Admin

Panel interno de Project Robin para CRM, operaciones, finanzas, analítica e integraciones. El navegador ejecuta React/Vite; las rutas de datos se sirven con Netlify Functions y servicios de dominio en `lib/`.

## Inicio rápido

Requisitos: Node.js compatible con la versión de Vite y npm.

```bash
npm ci
cp .env.example .env
npx netlify dev
```

Configura solo variables necesarias para el flujo local. Las claves de servicio pertenecen al backend y no deben usar el prefijo `VITE_`.

## Documentación

- [Referencia de datos y métricas](docs/REFERENCIA_DATOS_METRICAS.md): fuentes, campos, fórmulas, ejemplos y límites conocidos de las estadísticas de Robin.

- [READMELONG](READMELONG.md): descripción extensa del producto y sus límites técnicos.
- [USERGUIDE](USERGUIDE.md): árbol de navegación para entender el repositorio y seguir flujos entre repos.
- [Arquitectura](docs/ARCHITECTURE.md): capas, dependencias y datos.
- [Cloudflare y enrutamiento](docs/CLOUDFLARE_ROUTING.md): entrada desde `project-robin.com` hasta Netlify y Functions.
- [Mapa técnico de archivos](docs/FILE_MAP.md), mantenido manualmente, y [índice generado](docs/FILE_INDEX.generated.md) con el [árbol de código](docs/codebase/README.md).
- [Inventario de API](docs/API_INVENTORY.md): rutas de Netlify y handlers.
- [Análisis CRM histórico](docs/crm-historical-metrics.md) y [mapeo CRM de Notion](docs/notion-crm-mapping.md).

## Repos relacionados

- [Robin Platform cliente](https://github.com/RobinManuV/Robin-platform-cliente): portal de alumnos y origen de identidad compartida.
- [Robin Subscriptions](https://github.com/saantimartinn/robin-subscriptions): The Robin Plan, con backend y base de datos propios.

El árbol y los contratos de los otros repos se enlazan desde [USERGUIDE](USERGUIDE.md).
