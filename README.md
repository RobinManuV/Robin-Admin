# Robin Admin

Panel administrativo de Robin. El acceso usa la sesión de `robin-platform` y la
sección `/alumnos` integra su workspace administrativo completo.

## Ejecutar

```bash
npm install
npx netlify dev
```

## Contenido

- Inicio compartido y bandeja global de leads
- Vista global de alumnos, pagos y analíticas
- CRM personal por etapas
- Analíticas personales de pagos, finanzas, operaciones y ventas
- Campañas de Meta Ads
- Configuración de administradores e integraciones

## Configuración

Copia `.env.example` a `.env` y completa al menos `JWT_SECRET`, `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`. Las claves privadas solo las leen las Netlify
Functions; nunca deben llevar el prefijo `VITE_`.
