# Auditoría — Flujo `numero_unidad` al crear vehículo

**Fecha:** 2026-05-25  
**Síntoma:** Tras backfill correcto (CAU-677 → Unidad **#83**, ID **178**), el siguiente alta quedó **Unidad #179 / ID 179** en lugar de **#84 / 179**.  
**Alcance:** Solo lectura de código en repo. Sin cambios en BD ni implementación.

---

## Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Dónde **debería** calcularse `numero_unidad`? | `fetchNextNumeroUnidad()` en `src/services/vehiculosService.ts`, **antes** del `INSERT`, vía `vehiculoToInsert()`. |
| ¿Hay código que haga `numero_unidad = id` al **escribir**? | **No** en el path de alta de vehículo. Solo fallbacks de **lectura/UI** (`getVehicleDisplayNumber` → `id`) y payloads de copiloto (`fleetAnalytics.ts`). |
| ¿Hay `update()` post-insert que sobrescriba? | **No** en el flujo «Registrar vehículo». |
| ¿Qué explica **#179 = id**? | Dos escenarios compatibles con el código: **(A)** columna `numero_unidad` **NULL** en BD y la UI usa fallback `id`; **(B)** columna **179** en BD por trigger/default en Supabase **no documentado en repo** o porque `max(numero_unidad)` devolvió **178** al calcular el siguiente. |

**Verificación obligatoria en Supabase (sin modificar):**

```sql
-- ¿Valor real guardado?
SELECT id, placa, numero_unidad, activo, empresa_id
FROM public.vehiculos
WHERE id = 179;

-- ¿Qué máximo ve el cliente al calcular +1?
SELECT max(numero_unidad) AS max_nu, count(*) FILTER (WHERE numero_unidad IS NULL) AS sin_nu
FROM public.vehiculos
WHERE empresa_id = '<uuid-empresa>';

-- ¿Trigger en producción que copie id?
SELECT tgname, pg_get_triggerdef(t.oid, true)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'vehiculos' AND NOT t.tgisinternal;
```

En DevTools → Network → request `POST .../vehiculos` → body JSON: comprobar si el payload incluye `"numero_unidad": 84` o si la clave **no aparece**.

---

## 1. Mapa de referencias `numero_unidad` / `numeroUnidad`

### Escritura a BD (único path de INSERT en `vehiculos`)

| Archivo | Rol |
|---------|-----|
| `src/services/vehiculosService.ts` | `fetchNextNumeroUnidad()` + `insertVehiculo()` |
| `src/services/supabaseMappers.ts` | `vehiculoToInsert()` → clave `numero_unidad`; `vehiculoPatchToSnake()` en updates |

### Lectura / mapeo

| Archivo | Rol |
|---------|-----|
| `src/services/supabaseMappers.ts` | `mapVehiculoRow()` — lee `r.numero_unidad` → `numeroUnidad` (null si vacío) |
| `src/services/vehiculosService.ts` | `fetchVehiculos()` — orden `numero_unidad ASC, id ASC` |

### Display / fallback (no escriben BD)

| Archivo | Patrón |
|---------|--------|
| `src/utils/vehicleDisplayNumber.ts` | `getVehicleDisplayNumber(v)` → **`v.numeroUnidad ?? v.id`** |
| `src/components/Cards/VehicleCard.tsx` | `Unidad #{getVehicleDisplayNumber(vehicle)}` |
| `src/pages/Vehiculos/VehiculoDetalle.tsx` | Igual + `ID {vehicle.id}` secundario |
| `src/utils/vehicleDisplayNumber.ts` | `formatVehicleIdFallback(id)` → `Unidad #${vehicleId}` (solo id técnico) |
| `src/modules/fleet/fleetAnalytics.ts` | **`numeroUnidad: v.id`** en payloads copiloto (líneas ~368, ~424) — **solo respuesta LLM, no INSERT** |

### Migración / SQL (repo)

| Archivo | Rol |
|---------|-----|
| `supabase/migration_vehiculos_numero_unidad.sql` | ADD COLUMN + backfill + índice único. **Sin DEFAULT, sin trigger INSERT.** |

### No encontrado en repo

- `numero_unidad = id` / `numero_unidad = vehicle.id` en TypeScript de alta
- `numero_unidad ??= id` / `numero_unidad || id` en servicios
- Trigger `BEFORE INSERT` en `vehiculos` que asigne `numero_unidad`
- Edge Function que inserte en `vehiculos`
- Segundo `.from('vehiculos').insert(...)` fuera de `vehiculosService.ts`

---

## 2. Flujo completo: Registrar vehículo → UI

```
Inventario.tsx
  └─ RegistrarVehiculoForm.tsx  (handleSubmit)
       row: { placa, marca, modelo, anio?, color?, activo }
       ⚠ NO incluye numeroUnidad
       └─ RegistrosContext.handleAddVehicle()
            └─ useRegistros.addVehicle(row, { conductorId? })
                 ├─ insertVehiculo(row, profile.empresa_id)     ← ÚNICO INSERT
                 ├─ setVehicles(mergeVehicleSorted(..., created))
                 ├─ runFleetAssignment(conductorId, created.id)   ← solo conductores
                 └─ return created
       └─ upsertInversionGeneralVehiculoValor(result, ...)      ← tabla inversiones_generales_vehiculo
            usa vehicle.id como vehiculo_numero; NO toca vehiculos.numero_unidad
```

### Detalle `insertVehiculo` (punto crítico)

```98:111:src/services/vehiculosService.ts
  const payload = vehiculoToInsert(empresaId, {
    ...row,
    placa,
    marca,
    modelo,
    color: row.color?.trim() || undefined,
    numeroUnidad: await fetchNextNumeroUnidad(empresaId),
  });

  const { data, error } = await supabase
    .from('vehiculos')
    .insert(payload)
    .select('*')
    .single();
```

**Momento del cálculo:** **Antes** del `INSERT`, en cliente, async.

### `fetchNextNumeroUnidad`

```15:29:src/services/vehiculosService.ts
async function fetchNextNumeroUnidad(empresaId: string): Promise<number> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('numero_unidad')
    .eq('empresa_id', empresaId)
    .not('numero_unidad', 'is', null)
    .order('numero_unidad', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[vehiculos next numero_unidad]', error.message);
    return 1;
  }
  const max = data?.[0]?.numero_unidad;
  const n = max != null && Number.isFinite(Number(max)) ? Math.round(Number(max)) : 0;
  return n + 1;
}
```

Comportamiento:

| Resultado query | Valor devuelto | Efecto en INSERT |
|-----------------|----------------|------------------|
| `max = 83` | **84** | Correcto |
| `max = 178` | **179** | Coincide con el bug observado |
| Sin filas / `max` null | **1** | Enviaría `numero_unidad: 1` → conflicto índice único si #1 existe |
| `error` | **1** | Idem (insert probablemente falla por unique) |

### `vehiculoToInsert` — cuándo **no** envía la columna

```131:133:src/services/supabaseMappers.ts
  if (row.numeroUnidad != null && Number.isFinite(row.numeroUnidad) && row.numeroUnidad > 0) {
    payload.numero_unidad = Math.round(row.numeroUnidad);
  }
```

Si `numeroUnidad` no cumple la condición → **payload sin `numero_unidad`** → Postgres inserta **NULL** (columna nullable, sin DEFAULT en migración del repo).

### Post-insert / refresh

| Paso | ¿Sobrescribe `numero_unidad`? |
|------|-------------------------------|
| `addVehicle` → `setVehicles(mergeVehicleSorted)` | No; usa objeto devuelto por `.select('*')` |
| `useEmpresaRegistrosRealtime` → `upsertVehicle(mapVehiculoRow(...))` | No; refleja fila BD |
| `patchVehiculo` / `EditarVehiculoModal` | Solo en edición manual; patch **no** incluye `numeroUnidad` al guardar modelo/color |
| `refreshFromSupabase` / reload flota | Re-lee BD; no recalcula |

---

## 3. Respuestas a las preguntas de auditoría

### ¿Se calcula antes o después del insert?

**Antes**, en cliente: `await fetchNextNumeroUnidad(empresaId)` → `vehiculoToInsert` → `insert(payload)`.

No hay recálculo después del insert en este flujo.

### ¿Se copia desde `id`?

**En el path de alta: no** (código actual del repo).

**En UI:** sí, si `numeroUnidad` es null/ inválido:

```4:9:src/utils/vehicleDisplayNumber.ts
export function getVehicleDisplayNumber(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad'>,
): number {
  const n = vehicle.numeroUnidad;
  if (n != null && Number.isFinite(n) && n > 0) return Math.round(n);
  return vehicle.id;
}
```

Esto hace que **Unidad #179** sea **indistinguible en pantalla** de un `numero_unidad = 179` real cuando el id es 179.

### ¿Hay un efecto que lo sobrescriba?

**En frontend:** no identificado post-insert.

**En BD (fuera del repo):** posible trigger/default en Supabase que asigne `NEW.id` si la columna va NULL — **no está en `supabase/migration_vehiculos_numero_unidad.sql`**; hay que inspeccionar producción (query arriba).

### ¿El listado usa `numero_unidad` o fallback `id`?

| Componente | Comportamiento |
|--------------|----------------|
| `VehicleCard`, `Inventario`, selects | `getVehicleDisplayNumber` → **columna si existe, si no `id`** |
| `fetchVehiculos` orden | `numero_unidad ASC`, luego `id` |
| `mergeVehicleSorted` | Orden por `vehicleFleetSortKey` (= display number) |

---

## 4. Hipótesis ordenadas (causa → evidencia)

### H1 — **Fallback UI (numero_unidad NULL en BD)** — muy probable si no se inspeccionó la columna

1. El bundle en ejecución **no incluye** `fetchNextNumeroUnidad` (deploy anterior, caché, o código no desplegado).
2. INSERT sin `numero_unidad` → **NULL** en BD.
3. `mapVehiculoRow` → `numeroUnidad: null`.
4. UI: `getVehicleDisplayNumber` → **179**.

**Cómo confirmar:** `SELECT numero_unidad FROM vehiculos WHERE id = 179` → **NULL**. Network payload sin clave `numero_unidad`.

### H2 — **Trigger/default en Supabase `numero_unidad := id`** — muy probable si columna = 179 en BD

No hay trigger en el repo, pero el patrón **179/179** es exactamente `NEW.id`.

**Cómo confirmar:** query de triggers + columna **NOT NULL 179** con payload INSERT **sin** `numero_unidad`.

### H3 — **`fetchNextNumeroUnidad` devolvió 179** (max en BD = 178)

Ocurre si existe alguna fila con `numero_unidad = 178` (backfill alternativo, script manual `SET numero_unidad = id`, datos legacy).

Con backfill del repo, `max` debería ser **83** → siguiente **84**. CAU-677 tiene **83**, no 178.

**Cómo confirmar:** `SELECT id, placa, numero_unidad FROM vehiculos WHERE numero_unidad >= 83 ORDER BY numero_unidad DESC LIMIT 10`.

### H4 — **Error en `fetchNextNumeroUnidad` → retorno 1**

Provocaría **23505** en `(empresa_id, numero_unidad)` al insertar #1 duplicado. El insert **no debería completarse** salvo que el índice único no exista.

Descartado si el vehículo se creó con placa nueva y sin error.

### H5 — **Código copiado `numeroUnidad: v.id` en otro módulo**

Solo encontrado en `src/modules/fleet/fleetAnalytics.ts` (respuestas copiloto). **No participa en INSERT.**

---

## 5. Diagrama de decisión del valor mostrado

```
INSERT payload
    │
    ├─ incluye numero_unidad: 84 ──► BD = 84 ──► UI #84
    │
    ├─ sin numero_unidad ──► BD = NULL ──► mapVehiculoRow → null
    │                              │
    │                              └─► getVehicleDisplayNumber → id (179) ──► UI #179  ⚠
    │
    └─ trigger BD (si existe) NEW.id ──► BD = 179 ──► UI #179
```

---

## 6. Dónde se «pierde» el #84 esperado

| Etapa | Archivo | Qué puede fallar |
|-------|---------|------------------|
| Formulario | `RegistrarVehiculoForm.tsx` | No pasa `numeroUnidad` (by design; lo asigna el servicio) |
| Cálculo | `vehiculosService.ts` → `fetchNextNumeroUnidad` | No ejecutado (código viejo) o `max` incorrecto (178) |
| Serialización | `supabaseMappers.ts` → `vehiculoToInsert` | Omite clave si `numeroUnidad` inválido |
| BD | Supabase (prod) | Trigger/default copia `id`; o NULL sin trigger |
| Lectura UI | `vehicleDisplayNumber.ts` | **Enmascara NULL** mostrando `#id` |

**No hay archivo post-insert que sobrescriba** `numero_unidad` en el flujo de registro.

---

## 7. Solución recomendada (sin implementar)

Prioridad según hallazgo en producción:

1. **Diagnosticar primero** (queries + Network payload en el INSERT del vehículo 179).

2. **Si payload sin `numero_unidad` o bundle viejo:**
   - Asegurar despliegue de `vehiculosService.ts` con `fetchNextNumeroUnidad`.
   - Log DEV ya existe: `[vehiculos:insert] { id, numeroUnidad, placa }` — revisar consola en próximo alta.

3. **Si trigger/default en BD copia `id`:**
   - Eliminar o ajustar trigger (fuera del repo actual).
   - Mantener asignación solo en cliente o mover a **función SQL** `max(numero_unidad)+1` atómica.

4. **Endurecer cliente (futuro):**
   - Tras `.select('*')`, validar `created.numeroUnidad`; si null o === `created.id` con `max+1` esperado, log error visible.
   - Considerar RPC/`INSERT ... RETURNING` con función SQL para evitar carrera y RLS en SELECT previo.
   - Corregir `fleetAnalytics.ts` para usar `getVehicleDisplayNumber(v)` en payloads copiloto (display only).

5. **Corregir fila 179 (dato):**
   - Una vez confirmada la causa: `UPDATE vehiculos SET numero_unidad = 84 WHERE id = 179 AND ...` (fuera de alcance de esta auditoría; usuario pidió no tocar BD ahora).

6. **Manejo de error en `fetchNextNumeroUnidad`:**
   - Hoy `return 1` en error puede generar inserts incorrectos o fallos opacos; debería **abortar** el insert, no enviar 1.

---

## 8. Checklist para la próxima reproducción

- [ ] Network: body INSERT incluye `numero_unidad` y su valor
- [ ] Response `.select('*')`: `numero_unidad` en JSON
- [ ] SQL: `numero_unidad` de fila id=179 (NULL vs 179 vs 84)
- [ ] SQL: `max(numero_unidad)` por empresa
- [ ] SQL: triggers en `vehiculos`
- [ ] Consola DEV: log `[vehiculos:insert]`
- [ ] Consola: error `[vehiculos next numero_unidad]` (RLS / permisos)

---

## 9. Archivos del flujo (referencia rápida)

```
src/pages/Vehiculos/Inventario.tsx
src/components/vehiculos/RegistrarVehiculoForm.tsx
src/context/RegistrosContext.tsx          (handleAddVehicle)
src/hooks/useRegistros.ts                 (addVehicle)
src/services/vehiculosService.ts          (fetchNextNumeroUnidad, insertVehiculo)  ← CÁLCULO
src/services/supabaseMappers.ts           (vehiculoToInsert, mapVehiculoRow)
src/utils/vehicleDisplayNumber.ts         (fallback id en UI)
src/components/Cards/VehicleCard.tsx
src/hooks/useEmpresaRegistrosRealtime.ts  (sync, no recalcula)
```

**Conclusión:** El único lugar del repo que **calcula** `numero_unidad` al crear es `fetchNextNumeroUnidad` + `insertVehiculo`. El síntoma **#179 = id** encaja con **(a)** columna NULL + fallback UI, **(b)** trigger BD `= id`, o **(c)** `max(numero_unidad)=178` en BD. La auditoría de código **no puede distinguir** entre (a)/(b)/(c) sin inspeccionar la fila 179, el payload HTTP y triggers en Supabase.
