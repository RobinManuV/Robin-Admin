# Robin Admin — Frontend only

Copia frontend independiente para prototipado y revisión visual.

## Ejecutar

```bash
npm install
npm run dev
```

## Contenido

- Inicio compartido y bandeja global de leads
- Vista global de alumnos, pagos y analíticas
- CRM personal por etapas
- Analíticas personales de pagos, finanzas, operaciones y ventas
- Campañas de Meta Ads
- Configuración de administradores e integraciones

## Importante

Este proyecto es exclusivamente frontend.

No incluye:
- Supabase real
- Stripe real
- WhatsApp API
- Meta
- Holded
- Netlify Functions
- webhooks
- secretos
- autenticación real
- llamadas de backend

Los datos están en `src/data/mockData.js`.

No existe ninguna pantalla intermedia tipo **"Conectando con Robin"**, ni una
pantalla de login. La aplicación abre directamente el panel y todas las
integraciones se simulan en el navegador.
