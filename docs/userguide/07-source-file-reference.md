# 07 · Referencia por archivo y navegación del código

Este capítulo cierra el recorrido desde las capas principales hasta el catálogo de archivos fuente. La USERGUIDE explica cómo razonar sobre los flujos; los mapas permiten abrir cada archivo y seguir sus imports/exports. Úsalos juntos: el mapa es un índice, mientras que el source vigente determina el comportamiento.

## Índices del repositorio

- [Árbol completo por carpeta](../codebase/README.md): punto de entrada a los índices bajo `docs/codebase/`.
- [Frontend `src/`](../codebase/src/README.md): componentes, features, servicios, tipos, estilos y helpers.
- [Netlify y Functions](../codebase/netlify/README.md): rutas serverless y edge.
- [Backend `lib/`](../codebase/lib/README.md): servicios y adaptadores backend.
- [Supabase](../codebase/supabase/README.md): SQL y migraciones versionadas.
- [Scripts](../codebase/scripts/README.md), [tests](../codebase/tests/README.md), [docs](../codebase/docs/README.md), [public](../codebase/public/README.md) y [shared](../codebase/shared/README.md): mantenimiento y recursos de apoyo.
- [FILE_MAP mantenido](../FILE_MAP.md): relaciones y contratos que requieren explicación humana.
- [FILE_INDEX generado](../FILE_INDEX.generated.md): símbolos y referencias detectadas automáticamente.
- [API_INVENTORY](../API_INVENTORY.md): rutas públicas y handler candidato.

## Cómo leer una entrada del mapa

1. Abre el índice de la carpeta que contiene el archivo.
2. Sigue el enlace a la fuente y comprueba los exports reales. El nombre o descripción breve del mapa no garantiza uso o ejecución.
3. Usa referencias/imports para encontrar quién lo llama y qué módulo consume su salida.
4. Para una ruta, sigue el enlace del inventario a `netlify/functions/`, consulta [03 · API](03-api-and-functions.md) y continúa a `lib/`.
5. Para UI, parte de [02 · Frontend](02-frontend-features.md) y sigue el feature hasta su servicio y handler.
6. Para cambios cross-repo, parte de [06 · Flujos](06-cross-repository-flows.md) antes de modificar un contrato.

Los índices generados pueden no capturar llamadas dinámicas, imports por convención, configuración externa ni efectos laterales. Confirma referencias con búsqueda en el repo y lee la implementación antes de borrar o mover archivos.

## Cobertura y mantenimiento de la guía

El árbol por carpetas está destinado a que ningún archivo de código quede aislado: una entrada enlaza a la ruta real y agrupa la responsabilidad local. Para explicar un flujo largo, actualiza también `docs/FILE_MAP.md` y el capítulo de USERGUIDE correspondiente; una línea en el índice generado no sustituye el recorrido de dominio.

Después de mover archivos o renombrar exports, revisa enlaces locales, imports, redirects de `netlify.toml`, scripts y referencias en los otros repos. Consulta `package.json` para el comando de regeneración vigente y revisa el diff generado antes de incluirlo.

## Continuar el recorrido

- [Volver a USERGUIDE](../../USERGUIDE.md)
- [06 · Flujos entre repositorios](06-cross-repository-flows.md)
- [Robin Platform · índice por archivo](https://github.com/RobinManuV/Robin-platform-cliente/blob/main/docs/userguide/07-source-file-reference.md)
- [Robin Subscriptions · índice por archivo](https://github.com/saantimartinn/robin-subscriptions/blob/main/docs/userguide/07-source-file-reference.md)

**Volver al inicio:** [USERGUIDE](../../USERGUIDE.md) · [READMELONG](../../READMELONG.md)

**Fin del recorrido secuencial:** [volver al índice USERGUIDE](../../USERGUIDE.md).
