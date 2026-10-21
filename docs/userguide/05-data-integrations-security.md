# 05 · Datos, proveedores y seguridad

## Persistencia

El backend crea clientes Supabase mediante módulos servidor (`lib/supabase.js`, `lib/admin-supabase.js` y adaptadores de proyecto). `supabase/migrations/` define esquema general; `supabase/admin-migrations/` y `supabase/robin-plan-migrations/` mantienen ámbitos específicos. La semántica vigente debe contrastarse con SQL versionado y consumidores, no inferirse solo por el nombre de tabla.

Storage se accede por `lib/storage.js`, `lib/document-drive.js`, `lib/dni-upload.js` y `lib/career-documents.js`. El frontend recibe ticket/URL firmada cuando procede; no añadir service-role key a código `src/` ni a builds.

## Integraciones

- **Holded**: `lib/holded*`, `lib/finance/*`, snapshots y endpoints de finanzas/ventas.
- **Supabase**: DB/Auth/Storage según módulos de servidor; session/roles se validan en handlers.
- **Google Drive/Sheets/Gmail/Calendar/Analytics**: adaptadores separados por API en `lib/google-*`; OAuth refresh tokens son secretos de backend.
- **Notion**: webhook y mapeo CRM; `docs/notion-crm-mapping.md` explica traducción de campos.
- **Meta**: ingestión lead webhook y métricas de campañas.
- **Stripe/Revolut**: webhooks/pagos según handler y config activa. Verificar proveedor antes de cambiar comportamiento, ya que Platform usa Revolut en su flujo de aplicación.
- **Anthropic/Resend**: endpoints AI, email y sugerencias; poner límites y minimizar PII.

## Seguridad y errores

1. Autenticación por cookie firmada; no aceptar rol enviado por el cliente como autoridad.
2. Asegurar cada endpoint con guard de sesión, permiso y ownership, no solo por ocultación de React.
3. Validar origen y payload con `lib/http.js`/`validation.js`; limitar tamaños de upload y payload.
4. Verificar firmas de webhooks antes de procesar; usar IDs para idempotencia y retries.
5. Mantener CSP con nonce configurado en `vite.config.mjs` y `netlify.toml`; el Worker debe conservar HTML/headers relevantes.
6. Redactar identificadores/documentos con `lib/privacy.js` y `lib/observability.js`; no loggear body completo.

`README.md` no sustituye el contrato de secretos: usa `.env.example`. No copiar `.env` a documentación ni actualizar exports de producción. Para arquitectura y publicación revisa [CLOUDFLARE_ROUTING](../CLOUDFLARE_ROUTING.md).


## Revisión de cambio de datos o proveedorRevisión de cambio de datos o proveedor

Para cada escritura identifica quién es dueño del dato, qué rol puede mutarlo, qué tabla/proyecto recibe el cambio y si existe una migration o política RLS asociada. Las carpetas `supabase/admin-migrations/` y `supabase/robin-plan-migrations/` indican ámbitos diferentes: confirma el proyecto de destino con la configuración de despliegue antes de aplicar SQL.

Para integrar un proveedor, sigue el adaptador en `lib/`, el handler consumidor y la variable declarada en `.env.example`. Conserva timeouts, límites, paginación, refresh token y manejo de error; no expongas tokens en mensajes al navegador. Para eventos de proveedor, documenta la clave de idempotencia y qué ocurre cuando el proveedor reintenta.

Una revisión útil pregunta: ¿se filtró PII al log?, ¿puede un admin consultar un registro fuera de su alcance?, ¿la URL firmada expira?, ¿se devuelve información en error?, ¿la lectura usa datos reales o un fallback? Para las reglas generales vuelve al [capítulo 03](03-api-and-functions.md) y a [ARCHITECTURE](../ARCHITECTURE.md).

---

**USERGUIDE:** [Índice](../../USERGUIDE.md) · [← Anterior](./04-domain-services.md) · [Siguiente documento de lectura →](./06-cross-repository-flows.md) · [READMELONG](../../READMELONG.md)
