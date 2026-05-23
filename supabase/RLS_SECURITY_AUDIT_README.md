# Auditoría RLS — Estado real en Supabase (solo diagnóstico)

**Objetivo:** conocer el estado de seguridad **antes** de crear nuevas policies.  
**Regla:** no ejecutar `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, ni `GRANT` desde esta auditoría.

---

## Scripts (read-only)

| Archivo | Uso |
|---------|-----|
| [`diagnostico_rls_seguridad_actual.sql`](diagnostico_rls_seguridad_actual.sql) | Estado real: RLS, policies, grants, críticas, duplicados, helpers |
| [`diagnostico_rls_repo_vs_produccion.sql`](diagnostico_rls_repo_vs_produccion.sql) | Diff repo ↔ producción (policies faltantes/extra, RLS ON/OFF) |
| [`diagnostico_rls_prep_empresa_id.sql`](diagnostico_rls_prep_empresa_id.sql) | Columnas `empresa_id` y helpers Fase 0 (complemento) |

### Cómo ejecutar

1. Supabase Dashboard → **SQL Editor**.
2. Pegar y ejecutar **sección por sección** (recomendado) o el archivo completo.
3. Exportar resultados (CSV) con fecha y entorno (`prod` / `staging`).
4. Guardar como baseline antes de cualquier migración RLS.

**Rol recomendado:** `postgres` o cuenta con lectura en `pg_catalog` para ver todo el catálogo. Con `authenticated` verás lo permitido por tu usuario, no necesariamente el panorama global.

---

## Qué detecta cada sección (`diagnostico_rls_seguridad_actual.sql`)

| # | Sección | Detecta |
|---|---------|---------|
| 0 | Metadatos | BD, usuario de ejecución, timestamp |
| 1 | RLS activado | Todas las tablas `public` con `relrowsecurity` / `forcerowsecurity` |
| 2 | Policies | Listado completo + resumen por tabla/comando |
| 3 | Sin RLS | Tablas “abiertas” a nivel RLS (dependen de GRANT) |
| 4 | RLS sin policies | Tablas bloqueadas para roles sujetos a RLS |
| 5 | Grants | `anon`, `authenticated`, `service_role`; privilegios de escritura peligrosos |
| 6 | Conflictos | Nombres duplicados, varias policies PERMISSIVE mismo rol+cmd, audit logs solapadas |
| 7 | Críticas | Matriz `gastos`, `ingresos`, `vehiculos`, `conductores`, `control_fechas`, `financial_audit_logs` |

---

## Estado esperado según el **repositorio** (no asumir que prod = repo)

### Tablas con `ENABLE ROW LEVEL SECURITY` en migraciones

| Tabla | Archivo(s) repo |
|-------|------------------|
| `user_profiles` | `migration_user_profiles.sql` |
| `ingresos` | `migration_ingresos_rls_policies.sql` |
| `financial_audit_logs` | `migration_financial_audit_logs_rls.sql`, `migration_financiamiento_aportes_prestamos_v3.sql` |
| `aportes_accionistas` | `migration_financiamiento_aportes_prestamos_v3.sql` |
| `prestamos_financieros`, `prestamos_tramos` | `migration_prestamos_financieros*.sql`, writes en `*_tramos_rls_write.sql` |
| `prestamo_financiero_historial` | `migration_prestamo_financiero_historial.sql` (puede estar eliminada por `migration_drop_prestamo_financiero_historial.sql`) |
| `inversiones_generales_vehiculo` | `migration_inversiones_generales_vehiculo.sql` |

### Tablas críticas **sin** RLS en el repo (riesgo si `authenticated` tiene GRANT amplio)

| Tabla | Nota |
|-------|------|
| **`gastos`** | App usa Supabase con JWT; sin RLS = acceso a todas las filas con permiso de tabla |
| **`vehiculos`** | Idem |
| **`conductores`** | Idem |
| **`control_fechas`** | Migración explícita sin RLS |
| `kilometrajes`, `pendientes`, `registros_tiempo`, `gastos_caja`, `caja_negocio_vehiculo` | Idem |

`migration_rls_preparation.sql` añade `empresa_id` y helpers pero **no activa RLS** en operativas.

---

## Hallazgos típicos a revisar en producción

### 1. `ingresos` — RLS por rol, no por tenant

Las policies del repo filtran por `user_profiles.role` (`admin`, `socio`, `contador`, `operador`), **no** por `empresa_id`. Un usuario autenticado con rol permitido ve **todos** los ingresos de la tabla.

### 2. `financial_audit_logs` — posible solapamiento SELECT

Dos migraciones pueden coexistir:

- `financial_audit_logs_select_admin` (solo admin)
- `financial_audit_logs_select_finanzas` (admin, socio, contador)

Con policies PERMISSIVE, el efecto es **OR** → suele ganar la más amplia (`select_finanzas`). Ver sección **6d** del script principal.

### 3. `service_role` y `postgres`

`rolbypassrls = true` → **no aplican policies**. La clave `service_role` en el cliente bypassa RLS. La app en producción debe usar solo `anon` + `authenticated` en el frontend.

### 4. Drift repo vs prod

Usar `diagnostico_rls_repo_vs_produccion.sql`:

- **FALTA_EN_PROD** — migración del repo no aplicada.
- **EXTRA_EN_PROD** — policy manual o migración antigua no documentada en repo.
- **DRIFT RLS ON/OFF** — RLS activado/desactivado distinto al esperado.

### 5. Tablas con RLS y 0 policies

Bloquean `SELECT`/`INSERT`/… para `authenticated` salvo bypass. Si la app “funciona” en gastos sin RLS pero fallaría al activar RLS sin policies.

---

## Interpretación rápida — tablas críticas

| Tabla | Riesgo alto si… |
|-------|------------------|
| `gastos` | `rls_enabled = false` y `authenticated` tiene INSERT/UPDATE/DELETE |
| `ingresos` | RLS ON pero policies no filtran `empresa_id` |
| `vehiculos` / `conductores` / `control_fechas` | Sin RLS + grants de escritura a `authenticated` |
| `financial_audit_logs` | Sin RLS o SELECT demasiado amplio para no-admins |

---

## Fase 1 piloto — `vehiculos` / `conductores` (activo en repo)

| Tabla | Migración | Diagnóstico post |
|-------|-----------|------------------|
| `vehiculos` | [`migration_vehiculos_rls_fase1.sql`](migration_vehiculos_rls_fase1.sql) + [`migration_vehiculos_rls_fase1_fix.sql`](migration_vehiculos_rls_fase1_fix.sql) | [`diagnostico_rls_vehiculos_post_fase1.sql`](diagnostico_rls_vehiculos_post_fase1.sql) |
| `conductores` | [`migration_conductores_rls_fase1.sql`](migration_conductores_rls_fase1.sql) | [`diagnostico_rls_conductores_post_fase1.sql`](diagnostico_rls_conductores_post_fase1.sql) |
| `unidades` | [`migration_unidades_rls_fase1.sql`](migration_unidades_rls_fase1.sql) | [`diagnostico_rls_unidades_post_fase1.sql`](diagnostico_rls_unidades_post_fase1.sql) |
| `kilometrajes` | [`migration_kilometrajes_rls_fase1.sql`](migration_kilometrajes_rls_fase1.sql) | [`diagnostico_rls_kilometrajes_post_fase1.sql`](diagnostico_rls_kilometrajes_post_fase1.sql) |

Helpers compartidos: `is_restricted_operador_account()`, `can_mutate_vehiculos()`, `can_mutate_conductores()`, `can_mutate_unidades()`, `can_mutate_kilometrajes()`.

---

## Próximo paso (fuera de este alcance)

Cuando el diagnóstico esté exportado:

1. Corregir drift (migraciones pendientes en prod).
2. Extender RLS a otras tablas críticas (gastos, conductores, …) con el mismo patrón tenant + rol.
3. **No** activar RLS en una tabla hasta tener policies para SELECT/INSERT/UPDATE/DELETE que la app use.

---

## Referencias en repo

- [`RLS_PREP_IMPACT_REPORT.md`](RLS_PREP_IMPACT_REPORT.md) — Fase 0 prep
- [`migration_rls_preparation.sql`](migration_rls_preparation.sql) — helpers + `empresa_id`
