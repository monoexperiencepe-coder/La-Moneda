# Fase 1 — Número de unidad visual (`numero_unidad`)

**Fecha:** 2026-05-25  
**Estado:** Implementado en código + SQL listo para aplicar en Supabase (migración **no ejecutada** en producción desde este repo).

---

## Problema

`vehiculos.id` es la PK técnica (secuencia PostgreSQL) pero se usaba como número visible en toda la UI (`#${vehicle.id}`).

| Métrica | Valor |
|---------|-------|
| Vehículos activos | 83 |
| `max(id)` | 178 |
| CAU-677 | `id = 178`, debe mostrarse como **#83** |
| Próximo vehículo nuevo | `id` técnico ≥ 179, UI **#84** |

Ver auditoría previa: `VEHICLE_ID_AUDIT_REPORT.md`.

---

## Qué NO se tocó (según alcance)

- `vehiculos.id`, PKs, secuencias, FKs existentes
- Lógica de cálculo de utilidad (`calcularUtilidadRealVehiculo`, filtros de gastos)
- Tablas `ingresos`, `gastos`, `conductores`, `documentos`, `kilometrajes` — siguen guardando `vehicle_id = id` técnico
- Realtime / suscripciones

---

## Cambios en base de datos

**Archivo:** `supabase/migration_vehiculos_numero_unidad.sql`

```sql
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS numero_unidad integer;
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS propietario_nombre text;

CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_empresa_numero_unidad_uidx
  ON public.vehiculos (empresa_id, numero_unidad)
  WHERE numero_unidad IS NOT NULL;
```

### Backfill (en el mismo script)

1. **#1 → #82:** vehículos con fila en `public.unidades` (`vehicle_id` ASC por empresa).
2. **#83+:** activos restantes sin fila en `unidades`, ordenados por `id` ASC, continúan la secuencia.
3. **CAU-677** (`id = 178`) → `numero_unidad = 83` (activo sin fila legacy en `unidades`).

### Verificación post-migración (SQL)

```sql
SELECT id, placa, numero_unidad, activo FROM public.vehiculos WHERE placa = 'CAU-677';
SELECT max(numero_unidad) FROM public.vehiculos WHERE empresa_id = '<uuid-empresa>';
-- Esperado: CAU-677 → 83; max → 83 antes de registrar otro vehículo
```

---

## Cambios en aplicación

### Modelo y persistencia

| Archivo | Cambio |
|---------|--------|
| `src/data/types.ts` | `Vehicle.numeroUnidad?`, `Vehicle.propietarioNombre?` |
| `src/services/supabaseMappers.ts` | Mapeo `numero_unidad` / `propietario_nombre` |
| `src/services/vehiculosService.ts` | Orden por `numero_unidad`; `fetchNextNumeroUnidad()` en insert |

### Helper central

**`src/utils/vehicleDisplayNumber.ts`**

```ts
getVehicleDisplayNumber(vehicle) → vehicle.numeroUnidad ?? vehicle.id
formatVehicleSelectLabel, formatVehicleIdPlaca, formatVehicleLabelFull, …
findVehicleByDisplayNumber(vehicles, numero)  // copiloto + búsqueda
vehicleFleetSortKey(vehicle)                  // orden inventario
```

### Nuevo vehículo

- `insertVehiculo`: asigna `numero_unidad = max(numero_unidad) + 1` por `empresa_id`.
- El `id` técnico lo sigue generando la secuencia (p. ej. 179).
- La UI muestra `#84` vía `getVehicleDisplayNumber`.

### UI actualizada (solo etiquetas visibles)

- Inventario, `VehicleCard`, `VehiculoDetalle`, `EditarVehiculoModal`
- Formularios: ingreso, gasto, documento, km, indisponibilidad, descuento, mantenimiento, préstamo, pendientes
- `RegistrosTable`, `useRegistros.getVehicleLabel`, `Gastos`, `UtilidadOperativa`
- Reportes/utilidad: `utilidadModuloUi` (labels + orden por `numeroUnidad`)
- Búsqueda: `vehicleSearchFromQuery` resuelve #83 visible o #178 técnico → `vehicle_id` correcto
- Copiloto (solo display/resolución): `vehiculoFinanzasTool`, `vehiculoFinanzasDetalleTool`, `utilidadVehiculosRank`, `documentosExtendedTool`, descripciones en `tools/definitions.ts`

**Nota:** Las rutas `/vehiculos/:id` y todos los `vehicle_id` en BD siguen siendo el **id técnico**.

---

## Validación esperada (tras aplicar SQL)

| Caso | Esperado |
|------|----------|
| CAU-677 en inventario | **Unidad #83** (badge + detalle) |
| ID sistema (admin) | Visible como texto secundario: `ID 178` |
| Próximo alta | `numero_unidad = 84`, UI `#84` |
| Ingresos/gastos de CAU-677 | Sin cambios (`vehicle_id = 178`) |
| Utilidad CAU-677 | Mismos montos (cálculo por `vehicle_id` técnico) |
| `npm run build` | ✅ OK (2026-05-25) |

---

## Pasos para desplegar

1. **Backup** de `public.vehiculos` (recomendado).
2. Ejecutar en Supabase SQL Editor:  
   `supabase/migration_vehiculos_numero_unidad.sql`
3. Verificar queries de la sección anterior.
4. Desplegar frontend (este commit).
5. Smoke test: inventario ordenado 1…83, detalle CAU-677, registrar ingreso/gasto con selector de unidad.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Duplicado `numero_unidad` | Índice único `(empresa_id, numero_unidad)` |
| UI sin migración aplicada | Fallback `numeroUnidad ?? id` — comportamiento legacy hasta backfill |
| Usuario busca `#178` en historial | `extractVehicleSearchIds` acepta id técnico y número visible |
| Copiloto pregunta por unidad | `findVehicleByDisplayNumber` + cálculos con `vehicle.id` |

---

## Archivos principales creados/modificados

```
supabase/migration_vehiculos_numero_unidad.sql   (nuevo)
src/utils/vehicleDisplayNumber.ts                (nuevo)
src/services/vehiculosService.ts
src/services/supabaseMappers.ts
src/data/types.ts
src/hooks/useRegistros.ts
src/utils/vehicleSearchFromQuery.ts
src/utils/utilidadModuloUi.ts
src/modules/ai/vehiculoFinanzasTool.ts
src/modules/ai/vehiculoFinanzasDetalleTool.ts
+ ~30 componentes/páginas (solo labels)
```

---

## Fase 2 (fuera de alcance)

- Editar `numero_unidad` manualmente / reordenar flota
- UI de `propietario_nombre`
- Deprecar tabla `unidades` legacy
- Ocultar id técnico en producción para no-admins
