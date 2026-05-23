# Auditoría y propuesta — Subtipos de gastos (LA MONEDA)

**Estado:** solo análisis — **sin cambios de código, BD ni RLS** (May 2026).  
**Fuente objetivo:** `SUBTIPOS GASTOS.xlsx` (no encontrado en el repo en esta revisión; ver §8).

---

## 1. Resumen ejecutivo

El sistema actual mezcla **tres capas** de “subtipo”:

| Capa | Dónde vive | Persistencia | Uso principal |
|------|------------|--------------|---------------|
| **A. Categoría financiera** | `tipo_gasto` | `public.gastos.tipo_gasto` | Tabs Finanzas, RLS operador, reportes por bucket |
| **B. Catálogo Fact (Excel histórico)** | `tipo` + `sub_tipo` / `subTipo` | `gastos.tipo`, `gastos.sub_tipo`, `motivo` | KPI agregados (`categoria`), formulario no-operativo |
| **C. Subtipo financiero UI** | `subtipo_gasto` | `gastos.subtipo_gasto` | Filtros, mover categoría, conciliación, labels |

Para **operativos** y **representación interna**, `subtipo_gasto` usa **códigos snake_case propios**, no los textos del Excel Fact. Para el resto, suele guardarse el **texto Fact** tal cual (p. ej. `ARREGLO MOTOR`, `ALQUILERES`) o códigos sintéticos (`prestamo`, `administrativo_general`).

**Riesgo principal:** proliferación de strings libres en histórico + catálogo Fact con typos + segunda capa operativa ya normalizada pero separada.

**Dirección recomendada:** una **config canónica tipada** (derivada del Excel) + **capa alias legacy → canónico** (solo lectura para histórico; escritura canónica para registros nuevos).

---

## 2. Dónde vive hoy la “lista oficial”

### 2.1 Catálogo Fact (subtipos por tipo Dim)

- **Archivo:** `src/data/factSubtiposGastos.json`
- **API:** `src/data/factCatalog.ts` → `getSubtiposGasto(tipo)`, `TIPOS_GASTO_FACT`
- **Contenido:** ~12 tipos Fact (clave UPPERCASE), cada uno con array de subtipos **texto humano** (mayúsculas, acentos, typos incluidos).

Ejemplos de tipos Fact: `MECÁNICOS`, `ACCESORIOS`, `GASTOS FIJOS`, `TRIBUTARIOS / NOTARIALES`, `OTROS GASTOS`, `GNV`, etc.

**Typos / inconsistencias ya en catálogo actual (no Excel):**

| Subtipo en JSON | Nota |
|-----------------|------|
| `MANTENIKIENTO` | Falta **E** (mantenimiento) |
| `ARREGLO ELECTRINICO` | Falta **C** (electrónico) |
| `ÚTILES DE OFICINS` | Falta **A** (oficina) |
| `CUOTA DE NANTENIMIENTO` | Typo mantenimiento |
| `Batería` vs resto en MAYÚSCULAS | Inconsistencia de casing |
| `OTROS /ESPECIFICAR` | Comodín repetido en muchos tipos |

### 2.2 Categorías financieras (`tipo_gasto`)

- **Archivo:** `src/data/finanzaGastoRegistro.ts`
  - `FINANZA_GASTO_REGISTRO_OPTIONS` (labels UI)
  - `FACT_TIPOS_POR_FINANZA_GASTO` — qué tipos Fact se muestran por categoría
- **Permisos / tabs:** `src/utils/permissions.ts` → `FINANZA_MOVE_TARGET_TIPO_GASTO`
- **Tabs:** `src/pages/Finanzas/Gastos.tsx` → `GASTO_TABS` por `tipo_gasto`
- **Legacy:** `src/utils/gastosTipoGasto.ts` → `LEGACY_TIPO_MAP`, `tipoGastoUiCanonical`

Valores: `operativo_vehiculo`, `operativo_flota_general`, `administrativo_empresa`, `financiero_prestamo`, `planilla_laboral`, `representacion_interna`, `gastos_globales`, `inversion_compra`, `pendiente_revision`.

### 2.3 Subtipos operativos (canónico snake_case)

- **Archivo:** `src/utils/operativoSubtipo.ts`
  - `OPERATIVO_SUBTIPO_OPTIONS` (~18 valores: `motor`, `bateria`, `gps_chips`, …)
  - `NORM_FACT_SUBTIPO_TO_CANON` — mapeo Fact subtipo → canónico
  - `normalizeOperativoSubtipo` / `resolveOperativoSubtipoGastoCanon` — lectura histórica tolerante
  - `FACT_DEFAULT_BY_CANON` — al registrar, rellena `tipo` + `subTipo` Fact

**Persistencia:** `subtipo_gasto` = código (`motor`, no `ARREGLO MOTOR`).

### 2.4 Representación interna

- **Archivo:** `src/data/representacionInterna.ts` → `SUBTIPOS_REPRESENTACION_INTERNA`
- **Normalización:** `src/utils/representacionInternaSubtipoLabel.ts` (frases legacy, `cena_familiar`, etc.)
- **Fact fijo:** tipo `OTROS GASTOS`, subtipo Fact `REPRESENTACIÓN`; `subtipo_gasto` = código UI.

### 2.5 Defaults y validación al mover categoría

- **Archivo:** `src/utils/gastoMoveCategoriaDefaults.ts`
  - `getValidSubtiposForTipoGastoFinanza` — union Fact + operativo + representación + sintéticos
  - `normalizeSubtipoForTipoGasto` — al mover, fuerza subtipo válido para destino
  - Defaults: `prestamo`, `administrativo_general`, `global_no_asignado`, `motor`, etc.

### 2.6 Etiquetas y filtros (solo lectura)

- **Archivo:** `src/utils/subtipoFinancieroLabel.ts`
  - `getSubtipoFinancieroLabel` — display según `tipo_gasto`
  - `gastoMatchesSubtipoFinancieroFilter` — filtros en Gastos.tsx
  - Fusión UI préstamos: `SUBTIPO_FILTRO_PRESTAMO_FUSION`

### 2.7 Formulario de alta

- **Archivo:** `src/components/Forms/ExpenseForm.tsx`
  - Categoría financiera → tipo Fact (select) → subtipo Fact (select desde JSON)
  - Operativo: select **canónico** (`subtipoOperativoCanon`)
  - Representación: select códigos fijos
  - **No hay input libre** para subtipo en flujo normal (solo selects)

### 2.8 Conciliación / mover / undo

- `src/utils/gastoCategoriaMove.ts`, `src/pages/Finanzas/Gastos.tsx`, `PendienteRevisionConciliacionPanel.tsx`
- `src/pages/Finanzas/RevisionClasificacion.tsx` — edición tipo/subtipo con `normalizeSubtipoForTipoGasto`
- `src/utils/gastoClasificacionSugerencia.ts` — reglas texto → `tipo_gasto` + subtipo operativo
- Undo: revierte `subtipo_gasto` guardado (valores históricos mezclados)

### 2.9 Reportes / analytics

- `src/utils/financialFleetAnalytics.ts` — filtra `subtipo_gasto === 'motor'`
- `src/pages/Reportes/sections/GastosOperativosSection.tsx`
- `src/utils/clasificacionGasto.ts` — agrupa por `tipo_gasto` operativo
- `src/utils/factMappers.ts` — `inferCategoriaFromTipoGasto(tipo Fact)` → `CategoriaGasto` KPI

### 2.10 Scripts de importación (fuera del frontend)

- `scripts/clasificar_gastos_financieros.mjs` — keywords → `subtipo_gasto` operativo
- `scripts/import_gastos_caja_clasificados_final.mjs` — columna Excel `subtipo` → BD
- Migraciones SQL representación: `supabase/migration_representacion_interna_subtipos*.sql` (solo BD histórica, no tocar ahora)

### 2.11 Vista legacy

- `public.gastos_pendientes_revision` — **no usada en frontend**; app filtra `gastos` con `pendiente_revision` / `requiere_revision`.

---

## 3. ¿Permite subtipos libres?

| Flujo | ¿Libre? |
|-------|---------|
| ExpenseForm (UI) | **No** — selects acotados |
| Mover categoría | **Semi** — `normalizeSubtipoForTipoGasto` acota a set válido; si histórico no mapea, cae a default |
| Import Excel / scripts | **Sí** — puede escribir cualquier string en `subtipo_gasto` |
| Edición clasificación (admin) | Selects acotados por categoría |
| BD directa | **Sí** |

**Conclusión:** la UI ya evita proliferación en registros nuevos por formulario; el histórico y los imports son la fuente de ruido.

---

## 4. Modelo de datos en `public.gastos` (relevante)

Campos relacionados (ver `supabaseMappers.ts`):

- `tipo_gasto` — categoría financiera
- `subtipo_gasto` — subtipo financiero / canónico (mixto)
- `tipo`, `sub_tipo` — capa Fact
- `motivo` — suele reflejar subtipo Fact legible
- `categoria` — agregado KPI derivado de Fact
- `origen_clasificacion`, `clasificacion_manual`, `requiere_revision`

**Compatibilidad histórica:** cualquier refactor debe tratar `subtipo_gasto` + `tipo`/`sub_tipo` como **read-only legacy** en display/filtros hasta migración explícita.

---

## 5. Propuesta de estructura canónica (post-Excel)

### 5.1 Objetivo de diseño

Un solo módulo (propuesto):

```
src/data/gastoSubtiposCanonical/
  index.ts              # exports + tipos
  finanzaSubtipos.ts    # por FinanzaGastoRegistroValue
  factBridge.ts         # opcional: enlace Fact tipo/subtipo
  aliases.ts            # legacyKey → canonicalId
  labels.ts             # id → label UI
```

**Tipos propuestos:**

```ts
type CanonicalSubtipoId = string; // slug estable, ej. "alojamientos"

type CanonicalSubtipo = {
  id: CanonicalSubtipoId;
  label: string;           // "ALOJAMIENTOS" (display oficial Excel)
  finanza: FinanzaGastoRegistroValue | FinanzaGastoRegistroValue[];
  factTipo?: string;       // opcional: "GASTOS FIJOS"
  factSubtipo?: string;    // opcional: texto Fact para motivo/KPI
  aliases: string[];       // normKey de variantes históricas
};

type GastoSubtiposConfig = {
  version: string;         // fecha o hash del Excel
  byFinanza: Record<FinanzaGastoRegistroValue, CanonicalSubtipo[]>;
};
```

### 5.2 Reglas de escritura (futuro)

| `tipo_gasto` | Qué guardar en `subtipo_gasto` (nuevo) |
|--------------|------------------------------------------|
| `operativo_*` | Mantener **códigos operativos** actuales o migrar a `id` canónico unificado |
| `representacion_interna` | Mantener códigos actuales (ya estables) |
| Resto | **`canonicalId`** (slug) + opcional mantener Fact en `tipo`/`sub_tipo` |
| Histórico | **Sin cambio** hasta migración SQL |

### 5.3 Capa alias (ejemplos solicitados)

Función única (propuesta):

```ts
function resolveCanonicalSubtipo(
  raw: string | null,
  tipoGasto?: string | null,
): { id: string; label: string; isLegacyUnmapped: boolean }
```

**Ejemplos de entradas alias (normKey):**

| Legacy (typo) | Canónico propuesto |
|---------------|-------------------|
| `ALOJAMEINTOS` | `alojamientos` → label `ALOJAMIENTOS` |
| `EQUIPAMEINTO DE TALLER` | `equipamiento_taller` → `EQUIPAMIENTO DE TALLER` |
| `MANTENIKIENTO` | `mantenimiento` (mapear a operativo `mantenimiento` o Fact `MANTENIMIENTO COMPLETO`) |
| `ARREGLO ELECTRINICO` | `electricidad` / Fact `ARREGLO ELECTRÓNICO` |

**Importante:** los alias deben generarse **automáticamente** desde el Excel + diff contra `factSubtiposGastos.json` + distinct `subtipo_gasto` en BD (fase posterior, solo lectura).

### 5.4 Duplicados y ambigüedades a resolver con Excel

Criterios de detección (script futuro):

1. Misma `normKey` → labels distintos  
2. Mismo label → distintos `tipo_gasto`  
3. Subtipo Fact vs `subtipo_gasto` divergente en misma fila  
4. Comodín `OTROS /ESPECIFICAR` sobrecargado  
5. Categorías Excel que no mapean 1:1 a `FinanzaGastoRegistroValue`

---

## 6. Estrategia de compatibilidad histórica

### 6.1 Lectura (sin tocar BD)

1. **Display:** `getSubtipoFinancieroLabel` delega a `resolveCanonicalSubtipo`; si no hay match, muestra **texto crudo** (comportamiento actual).
2. **Filtros:** agrupar por `canonicalId` cuando exista alias; si no, bucket `__legacy_raw__` o texto original.
3. **Operativos:** mantener `operativoSubtipo.ts` hasta unificar IDs con canónico global.
4. **Representación:** sin cambios en códigos.
5. **Reportes:** seguir contando por `tipo_gasto`; subtipo agregado por canónico resuelto.

### 6.2 Escritura (registros nuevos)

1. `ExpenseForm` / mover categoría: solo IDs del config canónico.  
2. Rellenar `tipo`/`sub_tipo` Fact desde `factBridge` del ítem canónico elegido.  
3. `normalizeSubtipoForTipoGasto` usa set de IDs canónicos, no lista Fact suelta.

### 6.3 Realtime / conciliación

- Sin cambio de contrato: siguen llegando filas con strings viejos; UI re-normaliza al pintar.
- Conciliación pendiente: sugerencias pueden apuntar a **canonicalId** nuevo.

### 6.4 Qué no romper

- Filas con `subtipo_gasto` NULL o texto Fact antiguo deben seguir visibles en su pestaña (`tipo_gasto`).
- Undo y audit logs conservan snapshots completos (no reescribir `old_data`).

---

## 7. Plan de migración futura (opcional, por fases)

| Fase | Alcance | Riesgo |
|------|---------|--------|
| **0** | Auditoría + Excel → JSON canónico + script diff | Nulo |
| **1** | Nuevo módulo config + alias; UI solo **altas/mover** | Bajo |
| **2** | Reemplazar `factSubtiposGastos.json` generado desde Excel (mantener export Fact) | Medio |
| **3** | Script reporte: filas `subtipo_gasto` sin alias | Nulo |
| **4** | SQL **opcional** `UPDATE` solo donde alias es 1:1 y seguro | Alto — requiere sign-off |
| **5** | Deprecar rutas duplicadas (`getValidSubtiposForTipoGastoFinanza` disperso) | Medio |

**No incluir en fase 4:** cambios masivos en `tipo`/`motivo` sin validación por categoría.

---

## 8. Excel `SUBTIPOS GASTOS.xlsx` — pendiente de ingestión

El archivo **no está** en `c:\LA MONEDA` (búsqueda `*.xlsx` / `*SUBTIPOS*`).

**Para completar el mapeo canónico:**

1. Copiar a: `data/canonical/SUBTIPOS GASTOS.xlsx` (ruta sugerida).
2. Ejecutar (cuando exista el archivo):

```bash
node scripts/audit_subtipos_excel.mjs
```

Salida esperada: `reports/subtipos_excel_audit.json` con hojas, columnas, duplicados y diff vs `factSubtiposGastos.json`.

**Hasta tener el Excel**, la propuesta de lista oficial se basa en `factSubtiposGastos.json` + capas operativo/representación descritas arriba. Los ejemplos `ALOJAMIENTOS` / `EQUIPAMIENTO DE TALLER` sugieren que el Excel introduce subtipos **administrativos u oficina** no presentes hoy en el JSON Fact (validar al ingestar).

---

## 9. Centralización recomendada

| Hoy (disperso) | Mañana (único entrypoint) |
|----------------|---------------------------|
| `factSubtiposGastos.json` | Generado desde Excel → `gastoSubtipos.canonical.json` |
| `gastoMoveCategoriaDefaults.ts` | `getValidSubtipos(finanza)` desde config |
| `operativoSubtipo.ts` | Subconjunto `finanza operativo_*` del mismo config o bridge |
| `representacionInterna.ts` | Subconjunto fijo representación |
| `subtipoFinancieroLabel.ts` | `labelForSubtipo(raw, tipoGasto)` → alias resolver |

**Beneficio:** una sola fuente para formulario, mover categoría, conciliación y reportes; Fact queda como **vista derivada**, no maestro paralelo.

---

## 10. Checklist de validación (cuando se implemente)

- [ ] Login / AuthContext OK  
- [ ] Operador: alta gasto global / pendiente con subtipo válido  
- [ ] Admin: todas las pestañas Gastos filtran igual que antes  
- [ ] Mover categoría + undo  
- [ ] Historial sistema muestra labels legibles para legacy  
- [ ] Reportes Resumen / Gastos operativos sin caída de totales  
- [ ] `npm run build`  
- [ ] Comparar conteos BD pre/post (solo si hay fase SQL)

---

## 11. Archivos clave (referencia rápida)

```
src/data/factSubtiposGastos.json      # Catálogo Fact actual
src/data/finanzaGastoRegistro.ts      # tipo_gasto ↔ tipos Fact permitidos
src/data/representacionInterna.ts     # Subtipos representación
src/utils/operativoSubtipo.ts         # Canónico operativo + map Fact→canon
src/utils/gastoMoveCategoriaDefaults.ts
src/utils/subtipoFinancieroLabel.ts
src/components/Forms/ExpenseForm.tsx
src/pages/Finanzas/Gastos.tsx
```

---

*Documento generado para revisión antes de cualquier cambio en código o BD.*
