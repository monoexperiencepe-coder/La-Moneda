# COPILOT CERTIFICATION REPORT

> **Pendiente — datos reales.** Este archivo se genera al ejecutar certificación con sesión activa.

## Cómo generar

1. `npm run preview` (o `npm run dev`)
2. Iniciar sesión en la app
3. Abrir consola del navegador (o `/copilot-debug`)
4. Ejecutar:

```js
await window.runCopilotCertification()
```

Se descargará automáticamente `COPILOT_CERTIFICATION_REPORT.md` con resultados A–K.

Recuperar último resultado en sesión:

```js
window.getCopilotCertificationReport()
```

## Casos certificados

| ID | Pregunta | Criterio PASS |
|----|----------|---------------|
| A | cuantos vehiculos hay | Conteo = inventario |
| B | cuantos conductores registrados hay | Conteo = pantalla |
| C | vehiculo numero 3 | Placa y conductor reales |
| D | utilidad vehiculo 1 | ingresos − gastos = utilidad |
| E | porque tiene esa utilidad | Explica, no repite utilidad |
| F | categoría de esos gastos | Categorías reales |
| G | cuanto se gasto en motor | Monto consistente |
| H | cuantos documentos hay | = inventario docs |
| I | cuantas alertas automaticas hay | = Qué hacer hoy |
| J | que documentos vencen esta semana | Lista real |
| K | top 10 utilidad historica | 10 filas completas |
