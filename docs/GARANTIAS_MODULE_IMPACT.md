# Módulo Garantías — Análisis de impacto (Fase 1)

Fecha: 2026-07-22  
Estado: Fase 1 (módulo independiente para pruebas). Automatización de asignaciones **desactivada**.

---

## Archivos que se crearán

| Ruta | Rol |
|------|-----|
| `docs/GARANTIAS_MODULE_IMPACT.md` | Este documento |
| `docs/GARANTIAS_MODULE.md` | Arquitectura, pruebas, Fase 2, activación/reversión |
| `supabase/migration_garantias_fase1.sql` | Tablas + RLS + índices |
| `src/config/featureFlags.ts` | `FEATURE_FLAGS.GUARANTEES_MODULE` |
| `src/config/guaranteeAmounts.ts` | Montos Auto/Camioneta centralizados |
| `src/data/garantiasTypes.ts` | Tipos del dominio |
| `src/utils/garantiasCalc.ts` | Cálculos y estados |
| `src/utils/garantiasPermissions.ts` | Permisos UI + validación cliente |
| `src/utils/vehicleTipoGarantia.ts` | Inferencia auto/camioneta |
| `src/services/garantiasService.ts` | CRUD / movimientos (Supabase) |
| `src/services/garantiasMappers.ts` | Snake ↔ camel |
| `src/pages/Operaciones/Garantias.tsx` | Listado |
| `src/pages/Operaciones/GarantiaDetalle.tsx` | Detalle + historial |
| `src/components/garantias/*` | Formularios, tarjetas, widgets aislados |

## Archivos existentes a modificar (mínimo)

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Rutas `/operaciones/garantias` (+ redirect `/admin/garantias`) |
| `src/pages/Operaciones/OperacionesHub.tsx` | Enlace condicionado por feature flag |
| `src/utils/permissions.ts` | Sección `operaciones_garantias` + helpers |
| `src/services/fleetAssignmentService.ts` | Solo comentarios `// FASE2_GARANTIAS:` (sin lógica) |
| `src/pages/Vehiculos/VehiculoDetalle.tsx` | Widget informativo aislado (flag) |
| `src/pages/Operaciones/Conductores.tsx` | Widget / enlace informativo (flag) |
| `.env.example` (si existe) | Documentar `VITE_GUARANTEES_MODULE=1` |

## Tablas nuevas

1. `public.driver_guarantees` — garantía por conductor (1 activa máx.)
2. `public.guarantee_movements` — historial inmutable
3. `public.vehicle_driver_assignments` — preparada para Fase 2 (sin triggers / sin uso automático)
4. `public.guarantee_settings` — parámetros de monto por tipo (seed Auto 1000 / Camioneta 1500)

## Cambios en tablas existentes

**Ninguno.** No se alteran `ingresos`, `gastos`, `vehiculos`, `conductores`, ni FKs de flota.

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Confusión con ingreso tipo `GARANTÍAS` / gasto devolución | Módulo separado; docs clarifican que no tocan P&L |
| RLS demasiado permisivo | Políticas alineadas a roles admin/socio/contador; descuentos/ajustes/devoluciones restringidos |
| Inferencia auto/camioneta incorrecta | Override manual en formulario + config central |
| Activación accidental en prod | Feature flag off por defecto (`VITE_GUARANTEES_MODULE=1` para activar) |

## Estrategia de reversión

1. Desactivar `VITE_GUARANTEES_MODULE` (o quitar `=1`) → menú, rutas y widgets desaparecen.
2. No borrar datos automáticamente.
3. Si se debe retirar DDL: script opcional `supabase/rollback_garantias_fase1.sql` (DROP tablas nuevas; **no** toca tablas legacy).
4. Revertir commits de wiring en `App.tsx` / hub / widgets.

## Fase 2 (no implementada)

Puntos de conexión documentados en `docs/GARANTIAS_MODULE.md` y comentarios en `fleetAssignmentService.ts`.
