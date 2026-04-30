# Reporte: persistencia Supabase vs datos locales

Objetivo del proyecto: **todo lo que el usuario registre en la app debe guardarse en Supabase**. Este documento resume el estado después de la limpieza de mocks en UI y el plan para lo que falta.

---

## Ya persisten en Supabase (registro real)

| Área | Tabla(s) / RPC | Notas |
|------|-----------------|--------|
| Vehículos | `vehiculos` | |
| Unidades operativas | `unidades` | |
| Conductores | `conductores` | |
| Ingresos | `ingresos` | Incl. drawers rápidos |
| Gastos | `gastos` | Incl. drawers rápidos |
| Control de fechas / vencimientos | `control_fechas` + RPC `fetch_latest_control_fechas_by_vehicle` | Resumen ligero; historial paginado en app |
| Kilometrajes | `kilometrajes` | |
| Pendientes | `pendientes` | |
| Valor tiempo | `registros_tiempo` | |

---

## Quitado de la UI (no se ofrecía persistencia real)

| Módulo | Antes | Ahora |
|--------|--------|--------|
| **Documentación manual** (`DocumentationForm`, historial `documentaciones`, drawer rápido “Documentación”) | Solo estado React + `mockData` inicial | Eliminado de `Documentacion.tsx` y del FAB / drawers. Los vencimientos van solo por **Registrar vencimiento** → Supabase. |
| **Mantenimiento “historial técnico”** (`MaintenanceForm`, lista `mantenimientos`, drawer “Mantenimiento”) | Solo memoria | Eliminado de `Mantenimiento.tsx` y del FAB. Quedan **km** y **valor tiempo** (Supabase). |
| **Descuentos** (página + drawer + FAB) | `addDescuento` solo actualizaba estado local | Página sustituida por aviso; sin formulario. Entrada quitada del **Finanzas hub**. |
| **Préstamos** (página) | `addPrestamo` / abonos solo locales | Página sustituida por aviso; sin formulario. Entrada quitada del **Finanzas hub**. |

Los datos mock iniciales (`mockData.ts`) **ya no se cargan** en `useRegistros`: `descuentos`, `prestamos`, `prestamoAbonos`, `mantenimientos`, `documentaciones` arrancan en `[]`. Los helpers `add*` siguen en el hook por si en el futuro se conectan servicios (sin UI que los invoque salvo código heredado en drawers no montados).

---

## Módulos que aún no tienen persistencia Supabase (propuesta)

### 1. Descuentos / rebajes (finanzas)

- **Importancia**: Alta si el Excel llevaba rebajes aparte de gastos (margen, reportes).
- **Propuesta**: Tabla `descuentos` con `empresa_id`, `vehicle_id` (nullable), `fecha`, `fecha_registro`, `categoria`, `monto` (negativo), `comentarios`, `created_at`. CRUD vía servicio + `refreshFromSupabase`.
- **UI**: Rehabilitar `/finanzas/descuentos`, formulario y FAB cuando exista el servicio.

### 2. Préstamos y abonos

- **Importancia**: Alta si se usaba cartera de préstamos en el Excel.
- **Propuesta**: `prestamos` (capital, moneda, tasa, saldo, estado, fechas…) y `prestamo_abonos` (FK préstamo, monto, fecha). Transacciones o triggers para saldo.
- **UI**: Rehabilitar `/finanzas/prestamos` con flujo async.

### 3. Historial técnico de mantenimiento (taller)

- **Importancia**: Media (operativo distinto de km en tabla `kilometrajes`).
- **Propuesta**: Tabla `mantenimientos_taller` o ampliar `kilometrajes` con campos de taller si prefieren un solo registro.
- **UI**: Volver a mostrar formulario en `Mantenimiento.tsx` cuando haya API.

### 4. “Documentación manual” tipo Excel (motivo + SOAT/RT en un solo formulario legacy)

- **Importancia**: Baja si **todo** pasa a `control_fechas` por tipo.
- **Alternativa**: No recrear tabla; unificar en `control_fechas` + comentarios.
- **Si hiciera falta auditoría de capturas**: tabla `documentacion_eventos` opcional.

### 5. Logros (`Logros.tsx`)

- **Importancia**: Baja (gamificación).
- **Opciones**: Ocultar ruta del menú o persistir `logros_usuario` en Supabase más adelante.

---

## Archivos legacy (no montados en layout)

Siguen en el repo pero **no se importan** en `MainLayout`: `QuickDiscountDrawer`, `QuickMaintenanceDrawer`, `QuickDocumentationDrawer`. Se pueden borrar en una pasada de limpieza o actualizar cuando existan APIs.

---

## Cómo validar

1. Navegar **Finanzas**: solo ingresos, gastos, resumen, reportes (sin descuentos/préstamos en el hub).
2. **Documentación**: solo tabla Supabase + panel de registro/historial; sin acordeón “solo sesión”.
3. **Mantenimiento**: km + valor tiempo; sin formulario de taller local.
4. **FAB (+)**: solo ingreso y gasto.
5. URL directa `/finanzas/descuentos` o `/finanzas/prestamos`: mensaje claro, sin datos falsos.

---

*Generado como parte de la tarea de alinear la app con “nada que no se guarde de verdad”.*
