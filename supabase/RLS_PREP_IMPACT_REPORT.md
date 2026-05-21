# Reporte de impacto — Preparación RLS (Fase 0)

**Fecha:** preparación en repo (sin activar RLS en tablas operativas).  
**Empresa tenant inicial:** `07593982-08e6-450c-8abe-4bf590609dd7`  
**Migración:** `supabase/migration_rls_preparation.sql`  
**Diagnóstico:** `supabase/diagnostico_rls_prep_empresa_id.sql`

---

## Resumen

| Acción | Estado en repo |
|--------|----------------|
| `user_profiles.empresa_id` + backfill | Migración SQL |
| Helpers `current_user_*`, `is_admin`, `is_active_user` | Migración SQL |
| `financial_audit_logs.empresa_id` + backfill | Migración SQL |
| `prestamos_tramos.empresa_id` denormalizado + trigger | Migración SQL (recomendado) |
| Políticas RLS nuevas en gastos/vehículos | **No** (fase siguiente) |
| Activar RLS en tablas sin políticas | **No** |

---

## 1. `user_profiles.empresa_id`

### Cambio

- Columna `empresa_id uuid NOT NULL` → FK `empresas(id)`.
- Todos los perfiles existentes → `07593982-08e6-450c-8abe-4bf590609dd7`.

### Impacto app (cambios TypeScript incluidos)

- `AuthContext` lee `empresa_id` del perfil (futuro: dejar de depender solo de `VITE_EMPRESA_ID` para seguridad).
- Nuevos usuarios: al crear perfil (script `create_initial_users.mjs` o manual), **debe** asignarse `empresa_id`.

### Impacto RLS futuro

Políticas tipo:

```sql
-- ejemplo futuro (NO aplicado aún)
empresa_id = public.current_user_empresa_id()
```

### Riesgos

- Usuario sin fila en `user_profiles` → helpers devuelven NULL/false → políticas futuras denegarán acceso (correcto).
- Multiempresa: un usuario = una empresa en esta fase; selector multi-tenant requerirá columna o tabla puente más adelante.

---

## 2. Helpers SQL

| Función | Retorno | Uso previsto |
|---------|---------|--------------|
| `current_user_role()` | `text` | Políticas por rol |
| `current_user_empresa_id()` | `uuid` | Aislamiento tenant |
| `is_active_user()` | `boolean` | Bloquear cuentas desactivadas |
| `is_admin()` | `boolean` | Auditoría, borrado logs, config |

**Características:** `STABLE`, `SECURITY DEFINER`, `search_path = public`, `GRANT EXECUTE` a `authenticated`.

**No reemplazan** `VITE_EMPRESA_ID` en el frontend hasta completar migración de políticas y pruebas.

---

## 3. Verificación tablas críticas — `empresa_id`

Según `schema_reference.sql` y migraciones del repo (estado **esperado** en BD alineada):

| Tabla | `empresa_id` en esquema repo | Notas |
|-------|------------------------------|--------|
| `gastos` | Sí (uuid, NOT NULL) | Crítico RLS fase 2 |
| `ingresos` | Sí | RLS parcial existente (sin empresa en policy) |
| `vehiculos` | Sí | Sin RLS en repo |
| `unidades` | Sí | Sin RLS en repo |
| `conductores` | Sí | Sin RLS en repo |
| `control_fechas` | Sí | Migración explícita sin RLS |
| `kilometrajes` | Sí | Idem |
| `pendientes` | Sí | Idem |
| `registros_tiempo` | Sí | Idem |
| `inversiones_vehiculo` | Sí | Comentario “revisar RLS” |
| `inversiones_generales_vehiculo` | Sí | RLS SELECT en migración |
| `gastos_caja` | Sí | Comentario revisar RLS |
| `caja_negocio_vehiculo` | Sí | Comentario revisar RLS |
| `prestamos_financieros` | Sí | RLS por rol existente |
| `aportes_accionistas` | Sí | RLS por rol existente |
| `financial_audit_logs` | **Añadido en prep** | Antes sin columna |
| `prestamos_tramos` | **Denormalizado en prep** | Antes solo vía FK padre |

**Acción operativa:** ejecutar `diagnostico_rls_prep_empresa_id.sql` en producción/staging y confirmar que ninguna fila muestra `MISSING`.

Si alguna tabla legacy no tiene columna, crear migración `ALTER` específica antes de activar RLS.

---

## 4. `financial_audit_logs.empresa_id`

### Antes

- Sin `empresa_id`; realtime escuchaba **todos** los INSERT globales.
- Fetch en app sin filtro tenant.

### Después (prep)

- Columna NOT NULL, backfill tenant único.
- Índice `(empresa_id, created_at desc)`.

### Impacto app

- `insertFinancialAuditLog` envía `empresa_id` (desde `EMPRESA_ID` o perfil).
- `fetchFinancialAuditLogs` filtra por `empresa_id`.
- Realtime: filtro `empresa_id=eq.{EMPRESA_ID}` (cambio en hook).

### Esquema dual (riesgo)

Existen dos definiciones en migraciones antiguas:

1. **App actual:** `bigserial`, `user_id text`, `action_type`, `old_data`, `new_data`, `reason`
2. **v3 financiamiento:** `uuid` id, `actor_id`, `action`, `payload` — otro modelo

El diagnóstico lista columnas reales. **No ejecutar prep** si la tabla no coincide con el modelo de la app.

---

## 5. `prestamos_tramos` — join vs `empresa_id` directo

### Opción A — Solo JOIN (ya usado en políticas write del repo)

```sql
exists (
  select 1 from prestamos_financieros pf
  where pf.id = prestamos_tramos.prestamo_financiero_id
    and pf.empresa_id = current_user_empresa_id()
)
```

**Pros:** sin redundancia; siempre consistente.  
**Contras:** políticas y realtime más lentos; Realtime PostgREST no filtra por join.

### Opción B — `empresa_id` denormalizado (implementado en prep)

- Columna + backfill desde padre + trigger `BEFORE INSERT/UPDATE OF prestamo_financiero_id`.
- Permite `filter: empresa_id=eq.{uuid}` en Realtime.
- Políticas pueden usar `empresa_id = current_user_empresa_id()` **o** validar contra padre.

**Recomendación adoptada:** **B** para realtime y RLS simple; mantener FK `prestamo_financiero_id` como fuente de verdad.

**Servicios:** inserts de tramos deben seguir enviando solo `prestamo_financiero_id`; el trigger rellena `empresa_id`.

---

## 6. Lo que NO hace esta fase

- No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en gastos, vehiculos, conductores, etc.
- No nuevas policies en tablas operativas.
- No cambia policies existentes de `ingresos`, `prestamos_*`, `aportes_*`.
- No modifica `user_profiles` RLS existente (solo añade columna).

---

## 7. Orden de despliegue recomendado

1. **Staging:** ejecutar `migration_rls_preparation.sql`.
2. Ejecutar `diagnostico_rls_prep_empresa_id.sql` → revisar `MISSING` y esquema audit logs.
3. Desplegar frontend con soporte `empresa_id` en audit + perfil (commit separado).
4. Verificar app: login, historial sistema, préstamos, realtime badge.
5. **Producción:** repetir 1–4 en ventana de bajo tráfico.
6. Fase 1 RLS: políticas en `gastos` usando helpers (siguiente proyecto).

---

## 8. Rollback (manual)

```sql
-- Solo si es necesario revertir prep (no tocar si ya hay políticas nuevas)

-- drop trigger/function tramos
drop trigger if exists prestamos_tramos_sync_empresa_id_trg on public.prestamos_tramos;
drop function if exists public.prestamos_tramos_sync_empresa_id();

-- columnas (cuidado: pérdida de dato tenant en audit)
-- alter table public.user_profiles drop column if exists empresa_id;
-- alter table public.financial_audit_logs drop column if exists empresa_id;
-- alter table public.prestamos_tramos drop column if exists empresa_id;

-- helpers
drop function if exists public.is_admin();
drop function if exists public.is_active_user();
drop function if exists public.current_user_empresa_id();
drop function if exists public.current_user_role();
```

---

## 9. Próximos pasos (Fase 1 — fuera de este PR)

| Prioridad | Tarea |
|-----------|--------|
| CRÍTICO | RLS `gastos` con `empresa_id = current_user_empresa_id()` + rol |
| CRÍTICO | RLS `vehiculos`, `conductores`, `control_fechas`, … |
| IMPORTANTE | Reescribir policies `ingresos` / préstamos para incluir empresa |
| IMPORTANTE | Tests PostgREST con JWT operador vs admin |
| FUTURO | `empresa_id` en JWT claim; multi-tenant por usuario |

---

## 10. Archivos tocados en el repositorio (código)

| Archivo | Cambio |
|---------|--------|
| `supabase/migration_rls_preparation.sql` | Migración principal |
| `supabase/diagnostico_rls_prep_empresa_id.sql` | Verificación |
| `supabase/RLS_PREP_IMPACT_REPORT.md` | Este documento |
| `src/context/AuthContext.tsx` | `empresa_id` en perfil |
| `src/services/financialAuditService.ts` | insert/fetch con `empresa_id` |
| `src/data/types.ts` | tipos opcionales |
| `src/hooks/useEmpresaRegistrosRealtime.ts` | filtro audit por empresa |
