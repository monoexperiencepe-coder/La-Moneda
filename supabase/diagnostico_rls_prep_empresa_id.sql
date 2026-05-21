-- Diagnóstico read-only: columnas empresa_id en tablas críticas.
-- Ejecutar en Supabase SQL Editor después de migration_rls_preparation.sql (o antes, como baseline).

-- Perfiles
select
  'user_profiles' as tabla,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'empresa_id'
  ) as tiene_empresa_id,
  (select count(*) from public.user_profiles) as filas,
  (select count(*) from public.user_profiles where empresa_id is null) as sin_empresa_id;

-- Tablas críticas (esperado: tiene_empresa_id = true en todas)
with expected(tabla) as (
  values
    ('gastos'),
    ('ingresos'),
    ('vehiculos'),
    ('unidades'),
    ('conductores'),
    ('control_fechas'),
    ('kilometrajes'),
    ('pendientes'),
    ('registros_tiempo'),
    ('inversiones_vehiculo'),
    ('inversiones_generales_vehiculo'),
    ('gastos_caja'),
    ('caja_negocio_vehiculo'),
    ('prestamos_financieros'),
    ('aportes_accionistas'),
    ('financial_audit_logs'),
    ('prestamos_tramos')
)
select
  e.tabla,
  coalesce(
    (
      select c.data_type
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = e.tabla
        and c.column_name = 'empresa_id'
    ),
    'MISSING'
  ) as empresa_id_tipo
from expected e
order by e.tabla;

-- RLS habilitado (informativo; no modificar)
select
  c.relname as tabla,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'gastos', 'ingresos', 'vehiculos', 'conductores', 'user_profiles',
    'financial_audit_logs', 'prestamos_financieros', 'prestamos_tramos'
  )
order by c.relname;

-- Helpers RLS
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_admin'
  )
order by p.proname;

-- Esquema financial_audit_logs (detectar drift v3 vs app)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'financial_audit_logs'
order by ordinal_position;
