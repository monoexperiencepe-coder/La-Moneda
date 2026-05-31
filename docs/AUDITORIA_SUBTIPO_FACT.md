# Auditoría Tipo Fact vs Subtipo (`subtipo_gasto`)

**Fecha:** 2026-05-25  
**Alcance:** diagnóstico únicamente — sin cambios de UI, sin migración BD, sin reescritura de registros.

## Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Es seguro ocultar Tipo Fact ya? | **Parcialmente** — sí en representación, inversión y la mayoría de operativos; **no** de forma global sin capa de inferencia + modo avanzado para ambiguos. |
| % subtipos con inferencia automática 1:1 (tipo Fact) | **~72%** global (oficiales visibles); por categoría ver tabla abajo. |
| Subtipos ambiguos críticos | `OTROS / ESPECIFICAR`, `administrativo_general`, `combustible` (operativo), `cuota` (financiero, 2 labels), `prestamo` (financiero sin par Fact directo). |
| Registros históricos inconsistentes | Requiere `window.auditSubtipoFactData()` con gastos cargados en la app (ver §2). |
| ¿Migración BD obligatoria? | **No** — Tipo Fact puede autocompletarse al guardar. |
| Recomendación | **Ocultar Tipo Fact solo cuando el subtipo no es ambiguo**; mantener visible en admin/financiero/planilla hasta Fase 2. |

---

## Herramientas DEV (sin tocar UI)

Con la app en modo DEV y gastos cargados en contexto:

```js
window.auditSubtipoFactMap()           // o ('administrativo_empresa')
window.auditSubtipoFactData()          // requiere gastos en memoria
window.auditSubtipoFactImpact()
window.auditSubtipoFactInferability()
window.auditSubtipoFactFull()          // las tres anteriores
```

Logs: `[subtipo-fact:audit-map]`, `[subtipo-fact:audit-data]`, `[subtipo-fact:impact]`.

Implementación: `src/audit/auditSubtipoFact.ts`.

---

## 1. Mapeo subtipo → Tipo Fact

### Metodología

- **Operativo / inversión / representación:** mapas existentes (`FACT_DEFAULT_BY_CANON`, `FACT_DEFAULT_BY_INVERSION_CANON`, Fact fijo rep).
- **Administrativo / financiero:** intersección inversa con `factSubtiposGastos.json` (misma lógica que `buildSubtipoFormSelectOptions`, pero para inferir tipo Fact).
- **Ambiguo:** más de un Tipo Fact posible, o subtipo genérico (`OTROS / ESPECIFICAR`).

### Por categoría (subtipos oficiales visibles, catálogo unificado sin históricos)

| Categoría | Total visibles | Únicos (1 tipo Fact) | Ambiguos | Sin mapeo | % inferible 1:1 |
|-----------|----------------|----------------------|----------|-----------|-----------------|
| `representacion_interna` | 9 | 9 | 0 | 0 | **100%** |
| `inversion_compra` | 11 | 11 | 0 | 0 | **100%** (tipo Fact casi siempre `COMPRA ACTIVO`) |
| `operativo_vehiculo` | ~28 canónicos* | ~27 | 1 (`combustible`) | 0 | **~96%** |
| `operativo_flota_general` | ~28 | ~27 | 1 | 0 | **~96%** |
| `administrativo_empresa` | 21 | ~16 | ~4 | ~1 | **~76%** |
| `financiero_prestamo` | 6** | ~3 | ~2 | ~1 | **~50%** |

\* Tras dedupe Excel→canónico operativo.  
\*\* `cuota` aparece dos veces en catálogo oficial (misma value).

### Ejemplos `[subtipo-fact:audit-map]`

**Representación (todos → `OTROS GASTOS` + subtipo Fact fijo `REPRESENTACIÓN`):**

- `ALMUERZOS SOCIOS`, `REGALOS EMPRESARIALES`, … → único.

**Inversión (canónico → `COMPRA ACTIVO` + subtipo Fact):**

- `adquisicion_vehiculo` → `VEHÍCULO`
- `laptops`, `equipamiento_taller`, … → `MAQUINARIA` u `OFICINA`
- `otros_especificar` → `OTROS`

**Operativo — ambiguo:**

- `combustible` → default `MECÁNICOS` / `COMBUSTIBLE`, pero recargas deberían ser `ABASTECIMIENTO DE COMBUSTIBLE` / `GASOLINA|GLP|GNV`.

**Administrativo — ambiguos / débiles:**

| Subtipo | Tipos Fact posibles | Notas |
|---------|---------------------|-------|
| `OTROS / ESPECIFICAR` | 7+ tipos | Aparece en casi todo el catálogo Fact |
| `administrativo_general` | 0–1 | Sin etiqueta Fact dedicada; cae en genérico |
| `PERMISOS VARIOS` | `DOCUMENTOS`, a veces `SEGUROS /DOCUMENTOS` | Prioridad: DOCUMENTOS |
| `SEGUROS VEHICULAR` | Match parcial → `GASTOS FIJOS` / `SEGUROS` | No existe literal en Fact |
| `NOTARIALES` | — | Sin homólogo exacto (`TRÁMITES NOTARIALES` ≠ `NOTARIALES`) |

**Administrativo — únicos (muestra):**

| Subtipo | Tipo Fact inferido |
|---------|-------------------|
| `ALQUILERES` | `GASTOS FIJOS` |
| `SUNAT`, `SUNARP`, `SUTRAN`, `MUNICIPALES` | `TRIBUTARIOS / NOTARIALES` |
| `ATU` | `SEGUROS /DOCUMENTOS` |
| `DELIVERY`, `TAXI`, `MEMBRESIAS` | `OTROS GASTOS` |
| `INMUEBLE` | `COMPRA ACTIVO` |
| `INTERESES` | `GASTOS FIJOS` |

**Financiero:**

| Subtipo | Estado |
|---------|--------|
| `interes` | Único → `GASTOS FIJOS` |
| `ALQUILERES`, `membresias` | Únicos con match Fact |
| `cuota` | Ambiguo (dos labels oficiales, mismo value) |
| `prestamo` | **Sin subtipo Fact homónimo** — requiere regla explícita (`OTROS GASTOS` / cuota) |
| `prestamo_interes_banca` | Ambiguo (`OTROS /ESPECIFICAR` en varios tipos) |

---

## 2. Data histórica

No hay acceso a Supabase en esta auditoría offline. Con gastos en memoria:

```js
const d = window.auditSubtipoFactData()
```

### Criterios de clasificación

| Estado | Regla |
|--------|-------|
| `ok` | `tipo` Fact ∈ tipos posibles para `subtipo_gasto` y `subTipo` Fact dedupe-compatible |
| `mismatchTipoFact` | Subtipo reconocido pero `tipo` Fact no está en el conjunto inferido |
| `mismatchSubtipoFact` | Tipo Fact coherente pero `subTipo` Fact no coincide |
| `subtipoNoReconocido` | No normaliza / no intersecta catálogo Fact |
| `sinSubtipo` | `subtipo_gasto` vacío |

### Patrones esperados en históricos (sin conteos reales)

1. **Admin con subtipo Excel nuevo y Fact manual antiguo** — subtipo correcto, tipo Fact incoherente.
2. **Operativo con `combustible` en MECÁNICOS vs ABASTECIMIENTO** — ambos “válidos” semánticamente.
3. **Representación con `gasto_representacion` legacy** — normaliza a invitaciones; Fact sigue en `OTROS GASTOS` (OK).
4. **Financiero `prestamo` sin par Fact** — alto riesgo de `mismatch` o subtipo Fact vacío.
5. **Registros migrados solo con `tipo`/`subTipo` Fact** — `subtipo_gasto` vacío → `sinSubtipo`.

Ejecutar `auditSubtipoFactData` en producción/staging y revisar `ejemplosCriticos` (máx. 25 filas).

---

## 3. Impacto en KPIs y sistemas

### Lo que **no** depende del Tipo Fact en UI

- Resumen ejecutivo (`Resumen.tsx`) — agrega por **`tipo_gasto`** (RPC `get_gastos_financial_summary`).
- Distribución por categoría financiera — `gastosFinancialSummary.ts`.
- IA financiera OPEX/CAPEX — `financialAnalytics.ts` usa `tipo_gasto`.
- Pestañas y filtros en `Gastos.tsx` — **`subtipo_gasto`** + normalizadores.

### Lo que **sí** depende del Tipo Fact

| Área | Archivo | Riesgo | Ocultar UI | Migración |
|------|---------|--------|------------|-----------|
| Formulario registro | `ExpenseForm.tsx` | Alto | No aún | No |
| Edición tabla | `RegistrosTable.tsx` | Alto | No aún | No |
| Filtro subtipo admin | `gastosSubtipos.ts` | Alto | No aún | No |
| KPI bucket gráficos legacy | `factMappers.ts` | Medio | Sí* | No |
| Clasificación / quick entry | `gastoClasificacionSugerencia.ts`, `parseQuickEntry.ts` | Medio | Parcial | No |
| Export / búsqueda | `reportesExport.ts`, `recordSearch.ts` | Bajo | Sí | No |
| Persistencia | `supabaseMappers.ts` | Alto (escritura) | Sí** | No |

\* Si al guardar se sigue calculando `categoria` vía `inferCategoriaFromTipoGasto(tipoFact)`.  
\*\* Ocultar en UI pero seguir guardando `tipo`/`subTipo` inferidos.

**Conclusión impacto:** `canHideFromUI: false` a nivel global; `requiresMigration: false` si se autocompleta al guardar.

---

## 4. Arquitectura propuesta (evaluación)

```
UI: Categoría financiera + Subtipo
        ↓
inferFactFromFinancialSubtipo(categoria, subtipo)  [ya en auditSubtipoFact.ts]
        ↓
Guardar: tipo_gasto, subtipo_gasto, tipo (Fact), subTipo (Fact), categoria (KPI)
```

| Principio | Viabilidad |
|-----------|------------|
| Tipo Fact capa interna | **Sí** para operativo, inversión, representación **ya hoy** |
| Admin/financiero inferido | **Parcial** — requiere `mapSubtipoToFactTipo` productivo + reglas ambiguos |
| Ambiguo → UI avanzada | **Recomendado** |
| Históricos sin tocar | **Sí** — solo auditoría |
| BD sin migración | **Sí** |

---

## 5. Plan por fases (sin UI en Fase 0)

### Fase 0 — Diagnóstico (esta entrega)

- Módulo `auditSubtipoFact.ts` + funciones `window.*`.
- Documento de referencia.
- `npm run build` OK.

### Fase 1 — Capa de inferencia (sin ocultar UI)

- Extraer `inferFactFromFinancialSubtipo` → `mapSubtipoToFactTipo.ts` productivo.
- Reglas explícitas: `prestamo`, `administrativo_general`, `NOTARIALES`, `SEGUROS VEHICULAR`.
- Al guardar (ExpenseForm, move categoría, RegistrosTable): si usuario no eligió Fact manual, autocompletar.
- Log `[subtipo-fact:infer]` en DEV al guardar.

### Fase 2 — UI condicional

- Ocultar selects Tipo Fact si `!ambiguous`.
- Panel “Avanzado” para ambiguos y edición histórica.
- Preview: “Se registrará como MECÁNICOS › COMBUSTIBLE”.

### Fase 3 — Limpieza histórica (opcional, manual)

- Reporte desde `auditSubtipoFactData`.
- Herramienta admin “alinear Fact con subtipo” registro a registro (no batch automático).

---

## 6. Recomendación final

**Opción adoptada: ocultar Tipo Fact solo si el subtipo no es ambiguo** (modo híbrido).

| Categoría | Ocultar Tipo Fact en formulario |
|-----------|-------------------------------|
| Representación interna | Ya efectivo (Fact fijo) |
| Inversión con utilidad | Sí (Fase 2) |
| Operativo vehículo / flota | Sí, excepto `combustible` → avanzado |
| Administrativo | **No** hasta Fase 1 reglas |
| Financiero | **No** hasta reglas `prestamo` / `cuota` |

**No** ocultar globalmente todavía: el filtro actual `buildSubtipoFormSelectOptions(cat, gastos, factTipo)` depende del orden **Fact → subtipo** en admin/financiero.

---

## 7. Respuestas al entregable

1. **¿Seguro ocultar Tipo Fact?** → Solo en rep/inversión/operativo no ambiguo; admin/financiero requieren inferencia primero.
2. **% inferible automáticamente** → ~72% global; 100% rep/inversión; ~76% admin; ~50% financiero.
3. **Subtipos ambiguos** → `OTROS / ESPECIFICAR`, `administrativo_general`, `combustible`, `cuota`, `prestamo`, `prestamo_interes_banca`, colisiones operativo/admin (ATU, SUNAT, TAXI).
4. **Históricos inconsistentes** → Ejecutar `window.auditSubtipoFactData()`; patrones listados en §2.
5. **Archivos dependientes** → 15 archivos en `SUBTIPO_FACT_IMPACT_ENTRIES` (`auditSubtipoFact.ts`).
6. **Plan** → Fases 0–3 arriba.
7. **Recomendación** → **Híbrido**: inferir y ocultar si no ambiguo; mantener visible en admin/financiero hasta Fase 2.
