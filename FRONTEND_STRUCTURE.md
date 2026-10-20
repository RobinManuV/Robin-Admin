# Estructura

```text
src/
├── App.jsx
├── main.jsx
├── components/
│   ├── admin-app.tsx
│   ├── feature-modules.tsx
│   └── ui/
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
- Las estadísticas y los registros proceden de sus APIs y bases de datos conectadas.
- No se muestran datos de demostración como si fueran datos reales.
- Si un gráfico no recibe datos, muestra una única barra neutra.
