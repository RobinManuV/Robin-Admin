# Migraciones de la base administrativa

Estas migraciones se aplican al proyecto Supabase configurado mediante
`ADMIN_SUPABASE_URL` y `ADMIN_SUPABASE_SERVICE_ROLE_KEY`, no al Supabase del
Portal del Alumno.

Las tablas de tesorería y del histórico comercial solo se utilizan desde
funciones de servidor con la clave de servicio. No conceden acceso directo al
navegador.

- `202609290001_create_finance_treasury_snapshots.sql`: histórico de caja.
- `202609300001_create_crm_performance_history.sql`: identidades CRM, eventos
  comerciales atómicos y sesiones activas del equipo.
- `202610010001_create_web_analytics.sql`: eventos anónimos de la web pública,
  agregados del panel, mapas de calor y retención de 14 meses.
- `202610060001_create_crm_email_workspace.sql`: borradores y plantillas de
  correo del CRM, accesibles únicamente a través de funciones autenticadas.
