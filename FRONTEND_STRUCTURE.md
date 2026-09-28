# Estructura

```text
src/
├── App.jsx
├── main.jsx
├── components/
│   ├── admin-app.tsx
│   ├── feature-modules.tsx
│   └── ui/
├── data/mock-data.ts
├── services/
│   ├── admin-data.ts
│   ├── integrations.ts
│   └── portal.ts
├── styles/global.css
└── types/domain.ts
```

## Principios
- Una sola shell de administración.
- Sidebar y topbar compartidos.
- Routing real mediante `react-router-dom`.
- Datos mock separados.
- Servicios locales sin peticiones de red.
- Ninguna dependencia de backend ni autenticación.
- Ningún estado `Conectando con Robin`.
