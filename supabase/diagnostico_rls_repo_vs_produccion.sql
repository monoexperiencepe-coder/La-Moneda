-- =============================================================================
-- REPO vs PRODUCCIÓN — Policies y RLS esperados según migraciones del repo
-- =============================================================================
-- Ejecutar en Supabase SQL Editor (producción o staging).
-- Compara el inventario REAL (pg_policies / pg_class) con lo que declaran
-- los archivos en supabase/*.sql del repositorio LA MONEDA.
--
-- NO modifica nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Inventario de policies ESPERADAS en el repo (fuente: grep create policy)
-- -----------------------------------------------------------------------------
-- Actualizar esta lista si se añaden migraciones nuevas.
with repo_expected as (
  select * from (values
    -- user_profiles
    ('user_profiles', 'user can read own profile', 'SELECT', true),
    ('user_profiles', 'user can update own profile', 'UPDATE', true),
    ('user_profiles', 'user_profiles_select_admin_all', 'SELECT', true),
    -- ingresos
    ('ingresos', 'ingresos_select_finanzas', 'SELECT', true),
    ('ingresos', 'ingresos_insert_finanzas', 'INSERT', true),
    ('ingresos', 'ingresos_update_finanzas_editors', 'UPDATE', true),
    ('ingresos', 'ingresos_delete_finanzas_editors', 'DELETE', true),
    -- financial_audit_logs (puede haber drift entre migraciones)
    ('financial_audit_logs', 'financial_audit_logs_insert_own', 'INSERT', true),
    ('financial_audit_logs', 'financial_audit_logs_select_admin', 'SELECT', true),
    ('financial_audit_logs', 'financial_audit_logs_select_finanzas', 'SELECT', true),
    ('financial_audit_logs', 'financial_audit_logs_delete_admin', 'DELETE', true),
    -- aportes
    ('aportes_accionistas', 'aportes_accionistas_select_finanzas', 'SELECT', true),
    ('aportes_accionistas', 'aportes_accionistas_insert_finanzas', 'INSERT', true),
    ('aportes_accionistas', 'aportes_accionistas_delete_finanzas', 'DELETE', true),
    -- préstamos
    ('prestamos_financieros', 'prestamos_financieros_select_finanzas', 'SELECT', true),
    ('prestamos_financieros', 'prestamos_financieros_insert_finanzas', 'INSERT', true),
    ('prestamos_financieros', 'prestamos_financieros_update_finanzas', 'UPDATE', true),
    ('prestamos_financieros', 'prestamos_financieros_select_finanzas_extra', 'SELECT', false),
    -- diagnostico_prestamos (opcional, comentada en repo)
    ('prestamos_tramos', 'prestamos_tramos_select_finanzas', 'SELECT', true),
    ('prestamos_tramos', 'prestamos_tramos_insert_finanzas', 'INSERT', true),
    ('prestamos_tramos', 'prestamos_tramos_update_finanzas', 'UPDATE', true),
    -- historial préstamo (puede estar drop en migration_drop_*)
    ('prestamo_financiero_historial', 'prestamo_fin_hist_select_finanzas', 'SELECT', false),
    ('prestamo_financiero_historial', 'prestamo_fin_hist_insert_finanzas', 'INSERT', false),
    -- inversiones generales
    ('inversiones_generales_vehiculo', 'inversiones_generales_vehiculo_select_finanzas', 'SELECT', true)
  ) as t(tablename, policyname, cmd, obligatoria_en_prod)
),
actual as (
  select tablename, policyname, cmd
  from pg_policies
  where schemaname = 'public'
)
select
  e.tablename,
  e.policyname,
  e.cmd,
  e.obligatoria_en_prod,
  case when a.policyname is not null then 'OK_EN_PROD' else 'FALTA_EN_PROD' end as estado
from repo_expected e
left join actual a
  on a.tablename = e.tablename and a.policyname = e.policyname
where e.obligatoria_en_prod
order by estado desc, e.tablename, e.policyname;

-- Policies en PROD que NO están en la lista del repo (drift / manual / antiguas)
with repo_expected as (
  select tablename, policyname from (values
    ('user_profiles', 'user can read own profile'),
    ('user_profiles', 'user can update own profile'),
    ('user_profiles', 'user_profiles_select_admin_all'),
    ('ingresos', 'ingresos_select_finanzas'),
    ('ingresos', 'ingresos_insert_finanzas'),
    ('ingresos', 'ingresos_update_finanzas_editors'),
    ('ingresos', 'ingresos_delete_finanzas_editors'),
    ('financial_audit_logs', 'financial_audit_logs_insert_own'),
    ('financial_audit_logs', 'financial_audit_logs_select_admin'),
    ('financial_audit_logs', 'financial_audit_logs_select_finanzas'),
    ('financial_audit_logs', 'financial_audit_logs_delete_admin'),
    ('aportes_accionistas', 'aportes_accionistas_select_finanzas'),
    ('aportes_accionistas', 'aportes_accionistas_insert_finanzas'),
    ('aportes_accionistas', 'aportes_accionistas_delete_finanzas'),
    ('prestamos_financieros', 'prestamos_financieros_select_finanzas'),
    ('prestamos_financieros', 'prestamos_financieros_insert_finanzas'),
    ('prestamos_financieros', 'prestamos_financieros_update_finanzas'),
    ('prestamos_financieros', 'prestamos_financieros_select_finanzas_extra'),
    ('prestamos_tramos', 'prestamos_tramos_select_finanzas'),
    ('prestamos_tramos', 'prestamos_tramos_insert_finanzas'),
    ('prestamos_tramos', 'prestamos_tramos_update_finanzas'),
    ('prestamo_financiero_historial', 'prestamo_fin_hist_select_finanzas'),
    ('prestamo_financiero_historial', 'prestamo_fin_hist_insert_finanzas'),
    ('inversiones_generales_vehiculo', 'inversiones_generales_vehiculo_select_finanzas')
  ) as t(tablename, policyname)
)
select
  a.tablename,
  a.policyname,
  a.cmd,
  'EXTRA_EN_PROD (no listada en repo)' as nota
from pg_policies a
left join repo_expected e
  on e.tablename = a.tablename and e.policyname = a.policyname
where a.schemaname = 'public'
  and e.policyname is null
order by a.tablename, a.policyname;

-- -----------------------------------------------------------------------------
-- B) RLS ENABLE esperado en repo vs real
-- -----------------------------------------------------------------------------
with repo_rls_expected as (
  select * from (values
    ('user_profiles', true),
    ('ingresos', true),
    ('financial_audit_logs', true),
    ('aportes_accionistas', true),
    ('prestamos_financieros', true),
    ('prestamos_tramos', true),
    ('prestamo_financiero_historial', false),  -- puede no existir tabla
    ('inversiones_generales_vehiculo', true),
    ('gastos', false),
    ('vehiculos', false),
    ('conductores', false),
    ('control_fechas', false),
    ('kilometrajes', false),
    ('pendientes', false),
    ('registros_tiempo', false),
    ('gastos_caja', false),
    ('caja_negocio_vehiculo', false)
  ) as t(tabla, rls_esperado_repo)
),
actual_rls as (
  select
    c.relname as tabla,
    c.relrowsecurity as rls_actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
)
select
  e.tabla,
  e.rls_esperado_repo,
  a.rls_actual,
  exists (select 1 from actual_rls ar where ar.tabla = e.tabla) as tabla_existe,
  case
    when not exists (select 1 from actual_rls ar where ar.tabla = e.tabla) then 'SIN_TABLA'
    when e.rls_esperado_repo and not a.rls_actual then 'DRIFT: repo dice RLS ON, prod OFF'
    when not e.rls_esperado_repo and a.rls_actual then 'DRIFT: repo dice RLS OFF, prod ON'
    else 'ALINEADO'
  end as comparacion
from repo_rls_expected e
left join actual_rls a on a.tabla = e.tabla
order by
  case
    when not exists (select 1 from actual_rls ar where ar.tabla = e.tabla) then 3
    when e.rls_esperado_repo and not coalesce(a.rls_actual, false) then 1
    when not e.rls_esperado_repo and coalesce(a.rls_actual, false) then 2
    else 4
  end,
  e.tabla;

-- -----------------------------------------------------------------------------
-- C) Migraciones del repo que tocan RLS (checklist manual)
-- -----------------------------------------------------------------------------
select unnest(array[
  'migration_user_profiles.sql → RLS user_profiles',
  'migration_user_profiles_admin_select.sql → policy admin select all',
  'migration_ingresos_rls_policies.sql → RLS ingresos (4 policies, sin empresa_id en USING)',
  'migration_financial_audit_logs_rls.sql → insert_own + select_admin',
  'migration_financiamiento_aportes_prestamos_v3.sql → aportes + audit select_finanzas',
  'migration_financial_audit_logs_delete_policy.sql → delete admin',
  'migration_prestamos_financieros*.sql → RLS préstamos/tramos select',
  'migration_prestamos_financieros_tramos_rls_write.sql → insert/update',
  'migration_aportes_accionistas_rls_write/delete.sql',
  'migration_inversiones_generales_vehiculo.sql → select finanzas',
  'migration_rls_preparation.sql → empresa_id + helpers; NO activa RLS operativas',
  'migration_control_fechas_kilometrajes.sql → explícito SIN RLS',
  'gastos / vehiculos / conductores → SIN migración RLS en repo'
]) as migracion_repo_documentada;
