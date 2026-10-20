# Consola SQL del perfil desarrollador

La consola de Configuración ejecuta una sola instrucción SQL por envío en uno de los tres proyectos Supabase configurados en Netlify. Las consultas `SELECT` devuelven hasta 500 filas; las demás muestran el recuento de filas informado por PostgreSQL.

## Migraciones requeridas

Antes de que la consola pueda ejecutar consultas, aplicar la migración `202610200002_developer_sql_console.sql` en cada proyecto:

- `supabase/migrations/`: proyecto del Portal (`SUPABASE_URL`).
- `supabase/admin-migrations/`: proyecto CRM/Admin (`ADMIN_SUPABASE_URL`).
- `supabase/robin-plan-migrations/`: proyecto The Robin Plan (`ROBIN_PLAN_SUPABASE_URL`).

La función SQL solo concede `EXECUTE` a `service_role`. La función Netlify valida la sesión y vuelve a comprobar el correo del desarrollador en la tabla `users`; nunca envía claves de Supabase al navegador. Para el proyecto CRM/Admin y The Robin Plan también deben existir las variables de servicio correspondientes en Netlify.

El perfil desarrollador puede ejecutar SQL con privilegios de servidor, por lo que puede cambiar o eliminar datos y estructura. Esas operaciones pueden ser irreversibles.
