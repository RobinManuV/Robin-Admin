# Robin Admin

Panel administrativo de Robin. El portal del alumno se sirve desde el proyecto
`robin-platform` (`https://project-robin.com/login`) y The Robin Plan desde
`suscriptions-santi` (`https://project-robin.com/therobinplan/`). Este repositorio
mantiene el panel de administración y las integraciones que este necesita.

## Ejecutar

```bash
npm install
npx netlify dev
```

## Contenido

- Inicio compartido y bandeja global de leads
- Vista global de alumnos, pagos y analíticas conectada a `robin-platform`
- CRM personal por etapas
- Analíticas personales de pagos, finanzas, operaciones y ventas
- Campañas de Meta Ads
- Configuración de administradores e integraciones

Los accesos del menú superior abren los portales independientes. Las rutas
antiguas `/alumnos` y `/the-robin-plan` redirigen a esos mismos portales.

## Configuración

Copia `.env.example` a `.env` y completa al menos `JWT_SECRET`, `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`. Las claves privadas solo las leen las Netlify
Functions; nunca deben llevar el prefijo `VITE_`.
