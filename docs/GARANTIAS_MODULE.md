# Módulo Garantías — Documentación (Fase 1)

## 1. Arquitectura

El módulo es **aislado** del P&L:

- Tablas propias: `driver_guarantees`, `guarantee_movements`, `guarantee_settings`, `vehicle_driver_assignments`
- No escribe en `ingresos` ni `gastos`
- No altera rankings, utilidad ni reportes financieros
- La garantía pertenece al **conductor**; el monto requerido depende del **tipo de vehículo** (auto / camioneta)

```
UI (flag) → garantiasService → Supabase (RLS)
                ↑
         garantiasCalc (única fuente de reglas)
```

## 2. Archivos creados

Ver también `docs/GARANTIAS_MODULE_IMPACT.md`.

- `supabase/migration_garantias_fase1.sql`
- `supabase/rollback_garantias_fase1.sql`
- `src/config/featureFlags.ts`
- `src/config/guaranteeAmounts.ts`
- `src/data/garantiasTypes.ts`
- `src/utils/garantiasCalc.ts`, `garantiasPermissions.ts`, `vehicleTipoGarantia.ts`
- `src/services/garantiasService.ts`, `garantiasMappers.ts`
- `src/pages/Operaciones/Garantias.tsx`, `GarantiaDetalle.tsx`
- `src/components/garantias/*`

## 3. Archivos modificados

- `src/App.tsx` — rutas
- `src/pages/Operaciones/OperacionesHub.tsx` — enlace condicional
- `src/utils/permissions.ts` — sección `operaciones_garantias`
- `src/services/fleetAssignmentService.ts` — comentarios Fase 2
- `src/pages/Vehiculos/VehiculoDetalle.tsx` — widget informativo
- `src/pages/Operaciones/Conductores.tsx` — widget en edición

## 4. Migraciones y RLS

Ejecutar en Supabase SQL Editor:

```sql
-- contenido de supabase/migration_garantias_fase1.sql
```

Políticas:

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `guarantee_settings` | admin/socio/contador | admin/contador | admin/contador | — |
| `driver_guarantees` | admin/socio/contador | admin/socio/contador | admin/socio/contador | denegado |
| `guarantee_movements` | admin/socio/contador | admin/socio/contador | denegado | denegado |
| `vehicle_driver_assignments` | admin/socio/contador | admin/contador | admin/contador | — |

Validación sensible (descuentos/ajustes/devoluciones) también en `garantiasPermissions.ts` (cliente).

## 5. Cálculos

Centralizados en `src/utils/garantiasCalc.ts`:

- Créditos: `initial_deposit`, `deposit`, `replenishment`, `adjustment_credit`
- Débitos: descuentos, `adjustment_debit`, `final_refund`
- `pendingAmount = max(0, required − balance)`
- `refundableAmount = max(0, balance)`
- Estados: sin_garantia, pendiente, completa, incompleta, con_descuentos_pendientes, cerrada, devuelta
- Auto→camioneta: sube requerido, muestra pendiente
- Camioneta→auto: baja requerido, **excedente retenido** (sin devolución automática)

Montos por defecto: `src/config/guaranteeAmounts.ts` (1000 / 1500) + tabla `guarantee_settings`.

## 6. Rutas

| Ruta | Descripción |
|------|-------------|
| `/operaciones/garantias` | Listado |
| `/operaciones/garantias/:id` | Detalle + historial |
| `/admin/garantias` | Redirect al listado |

## 7. Feature flag

```env
VITE_GUARANTEES_MODULE=1
# Fase 2 (NO activar aún):
# VITE_GUARANTEES_AUTO_ASSIGNMENT=1
```

Desactivado (default): sin menú, widgets ocultos, páginas muestran aviso.

## 8. Pruebas manuales sugeridas (Fase 1)

1. Auto + entrega inicial S/ 1000 → estado completa  
2. Camioneta + entrega S/ 1500 → completa  
3. Entrega parcial → incompleta / pendiente  
4. Abono parcial  
5. Descuento multa  
6. Descuento reparación  
7. Reposición  
8. Simular auto→camioneta → pendiente 500  
9. Simular camioneta→auto → excedente retenido  
10. Ajuste + / −  
11. Devolución final → status devuelta  
12. Segunda devolución → error  
13. Socio sin permiso de descuento → botón oculto / rechazo  
14. Flag off → sin enlace en Operaciones  
15. Confirmar ingresos/gastos/rankings sin cambios  

## 9. Fase 2 — puntos de conexión (desactivados)

En `fleetAssignmentService.ts` tras `logFleetAssignment`:

1. Insertar/cerrar `vehicle_driver_assignments`
2. Resolver garantía activa del conductor
3. Recalcular `required_amount` según nuevo vehículo
4. Movimiento `required_amount_change`
5. Nunca copiar saldo entre conductores

Activar solo con `FEATURE_FLAGS.GUARANTEES_AUTO_ASSIGNMENT`.

## 10. Reversión

1. Quitar `VITE_GUARANTEES_MODULE=1` y redeploy  
2. Opcional: `supabase/rollback_garantias_fase1.sql` (borra solo tablas nuevas)  
3. Revertir commits de wiring si se desea eliminar código  

## 11. Riesgos / pendientes

- Inferencia auto/camioneta heurística; override manual obligatorio en formularios  
- Confusión nominal con ingreso Fact `GARANTÍAS` (otro dominio)  
- RLS INSERT de movimientos permite socio a nivel SQL; la app restringe tipos sensibles — endurecer con policy por `movement_type` en Fase 2 si se requiere  
- Redirect `/admin/garantias/:id` va al listado (no conserva id)
