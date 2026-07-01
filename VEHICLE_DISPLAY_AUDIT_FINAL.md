# Auditoría final — `numero_unidad` vs `id` técnico

**Fecha:** 2026-05-25  
**Estado BD confirmado:** CAU-677 → Unidad **#83** / id **178** · CCQ586 → Unidad **#84** / id **179** · `MAX(numero_unidad)=84` · `COUNT(numero_unidad IS NULL)=0` (post-fix SQL).

**Alcance:** Solo lectura de código. Sin cambios en BD, ids, secuencias, FKs, utilidad ni SQL.

---

## Veredicto ejecutivo

| Área | Estado |
|------|--------|
| **Inventario / detalle / formularios principales** | ✅ Mayormente correcto (`getVehicleDisplayNumber`, helpers) |
| **Selectores ingreso/gasto/km/doc/indisponibilidad** | ✅ Labels con `numero_unidad` |
| **Copiloto finanzas (utilidad/ingresos/gastos)** | ✅ Resuelve por display; consulta con `vehicle.id` |
| **Copiloto flota / documentos / alertas** | ⚠️ **Pendiente** — varios paths usan `v.id === numero` |
| **Operaciones (documentación, conductores, control global)** | ⚠️ **Pendiente** — `#${v.id}` visible |
| **Reportes (fallbacks sin vehículo en memoria)** | ⚠️ **Pendiente** — `#${vehicleId}` / `Unidad #${id}` |
| **FKs / rutas / cálculos** | ✅ Correcto — `vehicle.id` solo interno |

**Riesgo principal:** Usuario o IA dice «unidad 83» y un módulo resuelve `vehicles.id === 83` (vehículo técnico distinto al #83 visible) en lugar de `numero_unidad === 83`.

---

## 1. UI visible

### ✅ Uso correcto (display = `numero_unidad`)

| Archivo | Patrón |
|---------|--------|
| `src/components/Cards/VehicleCard.tsx` | `Unidad #{getVehicleDisplayNumber(vehicle)}` + `· ID {vehicle.id}` secundario |
| `src/pages/Vehiculos/VehiculoDetalle.tsx` | `unidad #{getVehicleDisplayNumber}` + `· ID {vehicle.id}` secundario |
| `src/components/vehiculos/EditarVehiculoModal.tsx` | `Unidad #…` + `ID sistema {vehicle.id}` |
| `src/components/vehiculos/RegistrarIndisponibilidadModal.tsx` | `getVehicleDisplayNumber` / `formatVehicleMarcaPlacaLabel` |
| `src/pages/Vehiculos/Inventario.tsx` | Orden y badge por `getVehicleDisplayNumber` |
| `src/hooks/useRegistros.ts` | `getVehicleLabel` → `formatVehicleLabelFull` |
| `src/components/Tables/RegistrosTable.tsx` | `formatVehicleIdPlaca` / `formatVehicleIdFallback` |
| `src/pages/Finanzas/Gastos.tsx`, `UtilidadOperativa.tsx` | Helpers display |
| `src/utils/buildOperativeAlerts.ts` | `formatVehicleLabelFull` |
| `src/utils/parseQuickEntry.ts` (preview) | `formatVehicleUnitHash` cuando hay objeto `Vehicle` |

**Nota:** Mostrar `ID {vehicle.id}` / `ID sistema` en texto pequeño secundario es **aceptable** según criterio del proyecto.

### ⚠️ Uso pendiente (id técnico como número visible)

| Archivo | Línea(s) | Hallazgo | Riesgo | Recomendación |
|---------|----------|----------|--------|---------------|
| `src/pages/Operaciones/Documentacion.tsx` | 102, 336 | `#{v.id} · {v.placa}` en tabla y cards | **Alto** — usuario ve #178 como «unidad» | `formatVehicleIdPlaca(v)` o `#${getVehicleDisplayNumber(v)}` |
| `src/pages/Operaciones/Documentacion.tsx` | 173-174 | Orden «unidad» = `a.v.id - b.v.id` | **Medio** — orden ≠ flota visible | `vehicleFleetSortKey(a.v) - vehicleFleetSortKey(b.v)` |
| `src/pages/Operaciones/ControlGlobal.tsx` | 257 | `#{v.id} — {marca} {modelo}` | **Alto** | `formatVehiclePlacaMarcaLabel(v)` |
| `src/components/operaciones/ConductorEditPanel.tsx` | 125 | Selector `#{v.id} · placa` | **Alto** | `formatVehicleIdPlaca` + marca |
| `src/pages/Operaciones/Conductores.tsx` | 705, 936 | Selector y badge `#{v.id}` | **Alto** | Mismos helpers |
| `src/pages/Finanzas/Resumen.tsx` | 623 | Fallback `Unidad #${key}` (`key` = `vehicleId`) | **Medio** | `formatVehicleIdFallback` con lookup o solo placa |
| `src/pages/Reportes/sections/UtilidadAcumuladaSection.tsx` | 84 | Fallback `Unidad #${id}` | **Medio** | Lookup + `getVehicleDisplayNumber` |
| `src/pages/Finanzas/Ingresos.tsx` | 498 | Fallback `#${vehicleId}` | **Medio** | `formatVehicleIdFallback(vehicleId)` |
| `src/pages/Finanzas/CajaNegocio.tsx` | 248, 253 | `#${filterVehicleId}` / `#${vehicleId}` | **Medio** | Helpers con lookup |
| `src/pages/Reportes/sections/IngresosReporteSection.tsx` | 90 | Fallback `#${vid}` | **Bajo** (solo si falta vehículo en memoria) | `#${getVehicleDisplayNumber(v)}` cuando `v` existe |
| `src/pages/Reportes/sections/GastosOperativosSection.tsx` | 87 | Idem | **Bajo** | Idem |
| `src/pages/Dashboard/Inicio.tsx` | 239 | Pendientes: `#${p.vehicleId}` si no hay placa | **Bajo** | `formatVehicleIdFallback` |
| `src/utils/documentacionHistorialSearch.ts` | 95 | Haystack `#${vid}` (id técnico) | **Medio** | Incluir `numero_unidad` en haystack |
| `src/utils/utilidadReal.ts` | 235 | Ranking LLM: `Unidad ${v.id}` si no hay placa | **Bajo** (copiloto interno) | `getVehicleDisplayNumber(v)` |

### ✅ Sin número de unidad visible (solo placa/marca — aceptable)

| Archivo | Notas |
|---------|--------|
| `src/pages/Reportes/sections/RentabilidadVehiculoSection.tsx` | Muestra placa + marca; ranking posicional 1…N, no `#id` |
| `src/components/vehiculos/AsignarConductorModal.tsx` | Header: placa/marca; no muestra `#id` (podría añadir Unidad #N opcional) |
| `src/pages/Operaciones/ControlGlobal.tsx` (l.259) | Placa secundaria OK; título usa `#id` (pendiente arriba) |

---

## 2. Selectores

**Convención correcta:** `value: v.id` (FK técnica) + `label` con `numero_unidad`.

| Flujo | Archivo | Label | Value (FK) | Estado |
|-------|---------|-------|------------|--------|
| Registrar ingreso | `IncomeForm.tsx` | `formatVehicleSelectLabel` | `v.id` | ✅ |
| Registrar gasto | `ExpenseForm.tsx` | `formatVehicleSelectLabel` | `v.id` | ✅ |
| Registrar km | `KilometrajeMantenimientoPanel.tsx` | `formatVehicleIdPlaca` / `formatVehiclePlacaMarcaLabel` | `String(v.id)` | ✅ |
| Registrar documento | `DocumentationForm.tsx` | `formatVehicleSelectLabel` | `v.id` | ✅ |
| Control fechas (doc) | `ControlFechaRegistroPanel.tsx` | `formatVehiclePlacaMarcaLabel` | `String(v.id)` | ✅ label ✅ / orden interno `a.id` ⚠️ |
| Indisponibilidad | `RegistrarIndisponibilidadModal.tsx` | `formatVehicleMarcaPlacaLabel` | `String(v.id)` | ✅ |
| Pendientes | `PendienteFormPanel.tsx` | `formatVehicleLabelFull` | `String(v.id)` | ✅ |
| Descuento / mantenimiento / préstamo | Forms respectivos | `formatVehicleSelectLabel` | `v.id` | ✅ |
| Revisión conciliación | `PendienteRevisionConciliacionPanel.tsx` | `formatVehicleLabelFull` | `String(v.id)` | ✅ |
| **Asignar conductor (modal inventario)** | `AsignarConductorModal.tsx` | Solo placa en header | N/A | ⚠️ sin `#unidad` |
| **Asignar vehículo a conductor** | `Conductores.tsx` | `#{v.id}` | `String(v.id)` | ❌ label |
| **Editar conductor** | `ConductorEditPanel.tsx` | `#{v.id}` | `String(v.id)` | ❌ label |
| Reportes / filtros Caja | `CajaNegocio.tsx` | Placa o `#vehicleId` | `String(v.id)` | ⚠️ fallback |

---

## 3. Copiloto / IA

### ✅ Resolución por `numero_unidad` + consulta con `vehicle.id`

| Archivo | Comportamiento |
|---------|----------------|
| `src/modules/ai/vehiculoFinanzasTool.ts` | `findVehicleByDisplayNumber` → `calcularUtilidadRealVehiculo(vehicle.id, …)` |
| `src/modules/ai/vehiculoFinanzasDetalleTool.ts` | Idem ingresos/gastos/desglose |
| `src/modules/ai/utilidadVehiculosRank.ts` | Output `#${getVehicleDisplayNumber(v)}`; cálculos por `vehicleId` técnico |
| `src/modules/ai/documentosExtendedTool.ts` (lista por rango) | `getVehicleDisplayNumber` en `listaBreve` |
| `src/modules/ai/tools/definitions.ts` | Descripción `numero` = visible, no id técnico |
| `src/utils/vehicleSearchFromQuery.ts` | Busca display primero → devuelve `vehicle.id` para filtros |

**Ejemplo esperado:** «utilidad vehículo 83» → `findVehicleByDisplayNumber(83)` → id **178** → suma ingresos/gastos con `vehicle_id=178`.

### ❌ Resolución por `id` técnico (pendiente)

| Archivo | Línea(s) | Problema | Riesgo | Recomendación |
|---------|----------|----------|--------|---------------|
| `src/modules/fleet/fleetAnalytics.ts` | 344-368 | `getVehiculoPorNumero`: `x.id === numero`; devuelve `numeroUnidad: v.id` | **Crítico** para «vehículo 83» | Usar `findVehicleByDisplayNumber`; `numeroUnidad: getVehicleDisplayNumber(v)` |
| `src/modules/fleet/fleetAnalytics.ts` | 424 | `vehiculoAsignado.numeroUnidad: v.id` | **Alto** | `getVehicleDisplayNumber(v)` |
| `src/modules/ai/documentosExtendedTool.ts` | 144-166, 189-190 | `v.id === numero`; `pivot.get(numero)` con id técnico; payload `numeroUnidad: numero` | **Crítico** — docs unidad 83 pueden apuntar a id 83 | `findVehicleByDisplayNumber`; `pivot.get(vehicle.id)` |
| `src/modules/ai/alertasDetalleTool.ts` | 51-71, 88, 101-102, 129 | `makeItem(vehiculo, …)` usa `vehicleId`; `numeroUnidad: vehiculo` (= id) | **Alto** en respuestas IA | Pasar `getVehicleDisplayNumber(v)` |
| `src/modules/ai/tools/runner.ts` | 127 | `resolveNumeroVehiculoArg` acepta `vehicle_id` (técnico) | **Medio** (compat legacy) | Documentar o priorizar solo `numero`; resolver con `findVehicleByDisplayNumber` antes de tools |
| `src/modules/ai/tools/runner.ts` | 441 | Fallback ranking gastos: `` `ID ${v.id}` `` | **Bajo** | Incluir `#${getVehicleDisplayNumber(v)}` |
| `src/modules/fleet/fleetAnalytics.ts` | 158-168 | Orden listas flota: `a.id - b.id` | **Bajo** (orden copiloto) | `vehicleFleetSortKey` |

### Matriz consulta usuario → tool

| Consulta | Tool enrutado | Resuelve #83 correctamente |
|----------|---------------|----------------------------|
| «utilidad vehículo 83» | `getUtilidadVehiculo` | ✅ |
| «ingresos unidad 84» | `getIngresosVehiculo` | ✅ |
| «documentos vehículo 83» | `getDocumentosVehiculo` | ❌ (id 83 ≠ unidad 83) |
| «vehículo número 83» (solo ficha) | `getVehiculoPorNumero` | ❌ |
| «alertas sin ingresos» | `getAlertasDetalle` | ⚠️ campo `vehiculo` = id técnico |

---

## 4. Reportes / utilidad

| Archivo | Display | Cálculo (FK) | Estado |
|---------|---------|--------------|--------|
| `src/utils/utilidadModuloUi.ts` | `formatVehicleIdPlaca(v)`; sort por `numeroUnidad` | `vehicleId: v.id` | ✅ |
| `src/pages/Finanzas/UtilidadOperativa.tsx` | `formatVehicleLabelFull` | Por `vehicleId` técnico | ✅ |
| `src/modules/ai/utilidadVehiculosRank.ts` | `#${unit}` en ranking | `buildTopVehiculosUtilidad` por `v.id` | ✅ |
| `src/pages/Reportes/sections/RentabilidadVehiculoSection.tsx` | Placa/marca (sin #unidad) | `r.vehicle.id` navegación | ⚠️ opcional añadir #unidad |
| `src/pages/Reportes/sections/IngresosReporteSection.tsx` | Placa; fallback `#vid` | Agregación por `vehicleId` | ⚠️ fallback |
| `src/pages/Reportes/sections/GastosOperativosSection.tsx` | Idem | Idem | ⚠️ fallback |
| `src/pages/Reportes/sections/UtilidadAcumuladaSection.tsx` | Placa; fallback `Unidad #id` | Por id técnico en datos | ⚠️ fallback |

**Utilidad numérica:** Sin regresión — todos los cálculos siguen `vehicle_id = id` técnico (correcto).

---

## 5. Fallbacks peligrosos

### Definición central

```4:9:src/utils/vehicleDisplayNumber.ts
export function getVehicleDisplayNumber(vehicle): number {
  const n = vehicle.numeroUnidad;
  if (n != null && Number.isFinite(n) && n > 0) return Math.round(n);
  return vehicle.id;  // ← fallback peligroso si numero_unidad NULL
}
```

| Mecanismo | Ubicación | Cuándo dispara | Riesgo post-backfill |
|-----------|-----------|----------------|----------------------|
| `getVehicleDisplayNumber` → `id` | `vehicleDisplayNumber.ts:9` | `numeroUnidad` null | **Alto** si vuelve a haber NULL (ej. insert sin blindaje) |
| `findVehicleByDisplayNumber` → `v.id === n` | `vehicleDisplayNumber.ts:60` | Segunda pasada legacy | **Medio** — «#178» resuelve id 178, no unidad #178 inexistente |
| `formatVehicleIdFallback(id)` | `vehicleDisplayNumber.ts:64-66` | Sin objeto Vehicle | **Medio** — muestra `Unidad #179` aunque sea id técnico |
| `vehicleSearchFromQuery` fallback id | `vehicleSearchFromQuery.ts:8` | Tras fallar display | **Medio** — búsqueda «178» filtra id técnico |
| `parseQuickEntry` solo `v.id === num` | `parseQuickEntry.ts:221-249` | Entrada rápida «carro 83» | **Alto** — no usa `numero_unidad` |
| `resolveNumeroVehiculoArg` + `vehicle_id` | `runner.ts:127` | Args tool con id técnico | **Medio** |

**Con BD sana (NULL=0):** Los helpers display son **seguros** para vehículos cargados en memoria. Persisten riesgos en **módulos que no usan los helpers** y en **fallbacks cuando no hay objeto Vehicle**.

---

## 6. Flujo crear → merge → realtime

| Paso | ¿Sobrescribe `numero_unidad`? | Notas |
|------|-------------------------------|-------|
| `insertVehiculo` | Asigna en INSERT (blindado) | `src/services/vehiculosService.ts` |
| `addVehicle` → `mergeVehicleSorted` | No | Usa respuesta `.select('*')` |
| Realtime `upsertVehicle` | No | Refleja fila BD vía `mapVehiculoRow` |
| `patchVehiculo` post-alta | No toca `numeroUnidad` en flujo registro | Solo modelo/color en edición |

**Conclusión:** No hay path post-insert que borre `numero_unidad` en UI state.

---

## 7. `addVehicle` — caminos de ejecución

Un solo camino productivo:

```
RegistrarVehiculoForm → RegistrosContext.handleAddVehicle → useRegistros.addVehicle → insertVehiculo
```

Opcional post-insert: asignación conductor + inversión general (no mutan `vehiculos.numero_unidad`).

---

## 8. Checklist validación manual (post-audit)

| Caso | Esperado |
|------|----------|
| Inventario CAU-677 | Unidad **#83** · ID sistema 178 |
| Inventario CCQ586 | Unidad **#84** · ID sistema 179 |
| Selector ingreso unidad 84 | Label `#84 — … (CCQ586)`; value FK = 179 |
| Copiloto «utilidad vehículo 83» | Datos de id 178 |
| Copiloto «documentos vehículo 83» | ⚠️ Hoy puede usar id 83 — **verificar antes de confiar** |
| Próximo alta | `numero_unidad=85`, UI **#85**, id técnico ≥180 |
| `COUNT(numero_unidad IS NULL)` | **0** |

---

## 9. Prioridad de corrección recomendada (sin implementar)

1. **P0 — IA:** `getVehiculoPorNumero`, `buildDocumentosVehiculoPayload`, `alertasDetalleTool` → `findVehicleByDisplayNumber`.
2. **P1 — UI operaciones:** `Documentacion.tsx`, `ControlGlobal.tsx`, `Conductores.tsx`, `ConductorEditPanel.tsx`.
3. **P2 — Fallbacks reportes:** `Resumen`, `UtilidadAcumulada`, `Ingresos`, `CajaNegocio` → lookup + helpers.
4. **P3 — Entrada rápida:** `parseQuickEntry.ts` alinear con `vehicleSearchFromQuery`.
5. **P4 — Orden:** sorts por `a.id` → `vehicleFleetSortKey` donde el orden es «unidad #1→N».

---

## 10. Archivos de referencia (helper canónico)

| Helper | Uso |
|--------|-----|
| `getVehicleDisplayNumber(v)` | Número visible |
| `formatVehicleSelectLabel(v)` | Selects largos |
| `formatVehicleIdPlaca(v)` | `#N · PLACA` |
| `formatVehicleLabelFull(v)` | `#N Marca Modelo (PLACA)` |
| `findVehicleByDisplayNumber(vehicles, n)` | Resolver consulta usuario/IA → Vehicle |
| `formatVehicleIdFallback(vehicleId)` | Solo cuando no hay Vehicle (idealmente tras lookup) |

**Regla:** `value` / `vehicle_id` / FK = **`vehicle.id`** · Label / búsqueda usuario / IA = **`numero_unidad`**.
