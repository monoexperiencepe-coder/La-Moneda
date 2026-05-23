# Diagnóstico — nomenclatura KPIs financieros vs utilidad operativa

| Pantalla | KPI mostrado | Fuente | Fórmula | Nombre correcto |
|----------|--------------|--------|---------|-----------------|
| FinanzasHub | Resultado neto | Ingresos memoria + gastos RPC | Σ ingresos − Σ gastos (todas categorías) | **Resultado neto** |
| FinanzasHub | Utilidad operativa | `caja_negocio_vehiculo` + ingresos/gastos | Histórica + calculada post-corte | **Utilidad acumulada** |
| Resumen | Resultado neto | Período o RPC (preset Todo) | Ingresos período − gastos período/global | **Resultado neto** |
| Utilidad operativa | Histórica importada | `public.caja_negocio_vehiculo` | Σ monto | **Utilidad histórica importada** |
| Utilidad operativa | Calculada | ingresos + gastos operativos | Σ (ingresos − gastos op. unidad) meses > corte | **Utilidad operativa calculada** |
| Utilidad operativa | Acumulada | Combinada | Histórica + calculada | **Utilidad acumulada** |
| Caja negocio | Totales por mes/vehículo | `caja_negocio_vehiculo` | Σ monto | **Utilidad histórica importada** (detalle) |
| Reportes → Utilidad acumulada | Acumulada / período | Helper `utilidadOperativa.ts` | Igual que Utilidad operativa | **Utilidad acumulada** |
| Reportes → Rentabilidad vehículo | Por unidad | Helper + corte | Histórica + calculada en rango | **Utilidad operativa** |
| Reportes → Rendimiento mensual | Resultado mes | Memoria ingresos + gastos op. | ing − gastos op. + descuentos | **Resultado operativo mensual** (no global) |
| Vehículo detalle | Margen legacy | Memoria | ing − gastos op. + descuentos | Margen operativo (legacy) |
| Vehículo detalle | Caja negocio | `caja_negocio_vehiculo` | Σ monto vehículo | **Utilidad histórica importada** |
| Inversiones → utilidad | Inversión con utilidad | RPC `inversion_compra` | Σ gastos categoría | **Inversión con utilidad** (no utilidad operativa) |

## Corte histórico

- Tabla: `public.caja_negocio_vehiculo`
- Corte: último `YYYY-MM` con registros importados (`getUtilidadCorteHistorico()`)
- Meses ≤ corte → sumar montos importados
- Meses > corte → calcular ingresos − gastos `operativo_vehiculo` (excluye globales, admin, etc.)

## NO mezclar

- **Resultado neto global** ≠ **Utilidad operativa acumulada**
- **Inversión con utilidad** (`inversion_compra`) ≠ utilidad mensual por vehículo
