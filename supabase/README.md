# Base de datos del CRM

La migración de IDs legibles para `crm_leads` está en
`admin-migrations/202610190003_add_crm_leads_display_id.sql` y se aplica al
proyecto configurado como `ADMIN_SUPABASE_URL`. La migración de
`migrations/202610190001_add_users_display_id.sql` corresponde a la tabla
`users` del Supabase del portal. Ambas conservan los UUID originales como
claves internas; `display_id` es el identificador corto para mostrar.

La migración `migrations/20260923120000_create_crm_leads.sql` replica la
estructura de **Main Database** de Notion en PostgreSQL/Supabase.

## Modelo

- `crm_leads`: información, seguimiento, responsable y clasificación del lead.
- `crm_lead_applications`: los tres estados de aplicación que Notion guardaba
  en columnas independientes.
- `source_payload`: respaldo JSON para que una futura importación sea sin
  pérdida aunque Notion añada propiedades antes de completar la migración.

La migración activa RLS sin políticas públicas. Por tanto, la base queda
cerrada para clientes anónimos hasta que se conecte la autenticación del CRM.

## Migración inicial

Los 424 registros de Notion se importaron directamente al proyecto Supabase
`Portal Admin` el 23/09/2026. La información personal no se guardó en Git ni en
archivos de migración; el repositorio contiene únicamente el esquema.

Resultado validado: 424 leads y 144 estados de aplicación relacionados.
