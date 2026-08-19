-- Agrega la categoría "Otros gastos / Gastos varios" al resumen financiero.
-- Ejecutar en SQL Editor de Supabase DESPUÉS de desplegar el frontend.
--
-- Por qué BEGIN/DROP/CREATE en lugar de CREATE OR REPLACE:
--   PostgreSQL 42P13: CREATE OR REPLACE no puede cambiar el tipo de retorno de una
--   función existente. Añadir columnas a RETURNS TABLE es un cambio de firma.
--   La transacción garantiza que si el CREATE falla, el DROP se deshace también:
--   nunca hay un intervalo donde la función esté eliminada.
--
-- gastos_canonical_tipo_gasto no necesita cambio: 'otros_gastos_varios' es un
-- valor canónico nuevo sin alias legacy → pasa directo al ELSE de la función.

begin;

-- 1. Eliminar la versión anterior (firma con 10 pares de columnas).
drop function if exists public.get_gastos_financial_summary(uuid);

-- 2. Recrear con 11 pares: agrega total_otros_gastos_varios / count_otros_gastos_varios
--    entre representacion_interna y gastos_globales (orden igual al frontend).
create function public.get_gastos_financial_summary(p_empresa_id uuid)
returns table (
  total_gastos                   numeric,
  total_count                    bigint,
  total_operativo_vehiculo       numeric,
  count_operativo_vehiculo       bigint,
  total_operativo_flota_general  numeric,
  count_operativo_flota_general  bigint,
  total_administrativo_empresa   numeric,
  count_administrativo_empresa   bigint,
  total_financiero_prestamo      numeric,
  count_financiero_prestamo      bigint,
  total_planilla_laboral         numeric,
  count_planilla_laboral         bigint,
  total_inversion_compra         numeric,
  count_inversion_compra         bigint,
  total_representacion_interna   numeric,
  count_representacion_interna   bigint,
  total_otros_gastos_varios      numeric,
  count_otros_gastos_varios      bigint,
  total_gastos_globales          numeric,
  count_gastos_globales          bigint,
  total_pendiente_revision       numeric,
  count_pendiente_revision       bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      g.monto,
      public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) as tipo_canon
    from public.gastos g
    where g.empresa_id = p_empresa_id
  )
  select
    coalesce(sum(b.monto), 0)::numeric                                                    as total_gastos,
    count(*)::bigint                                                                       as total_count,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'operativo_vehiculo'),      0)::numeric,
    count(*) filter (where b.tipo_canon = 'operativo_vehiculo')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'operativo_flota_general'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'operativo_flota_general')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'administrativo_empresa'),  0)::numeric,
    count(*) filter (where b.tipo_canon = 'administrativo_empresa')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'financiero_prestamo'),     0)::numeric,
    count(*) filter (where b.tipo_canon = 'financiero_prestamo')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'planilla_laboral'),        0)::numeric,
    count(*) filter (where b.tipo_canon = 'planilla_laboral')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'inversion_compra'),        0)::numeric,
    count(*) filter (where b.tipo_canon = 'inversion_compra')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'representacion_interna'),  0)::numeric,
    count(*) filter (where b.tipo_canon = 'representacion_interna')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'otros_gastos_varios'),     0)::numeric,
    count(*) filter (where b.tipo_canon = 'otros_gastos_varios')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'gastos_globales'),         0)::numeric,
    count(*) filter (where b.tipo_canon = 'gastos_globales')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'pendiente_revision'),      0)::numeric,
    count(*) filter (where b.tipo_canon = 'pendiente_revision')::bigint
  from base b;
$$;

-- 3. Comentario (igual que la función anterior, actualizado).
comment on function public.get_gastos_financial_summary(uuid) is
  'KPIs globales de gastos por categoría canónica (incluye otros_gastos_varios); SECURITY INVOKER respeta RLS.';

-- 4. Permisos idénticos a los de la función anterior (migration_gastos_financial_summary_fn.sql).
grant execute on function public.get_gastos_financial_summary(uuid) to anon;
grant execute on function public.get_gastos_financial_summary(uuid) to authenticated;
grant execute on function public.get_gastos_financial_summary(uuid) to service_role;

commit;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN (ejecutar por separado, solo lectura)
-- ============================================================
--
-- 1. Confirma que la función existe con la firma correcta (22 columnas de retorno).
--
--    select count(*) as columnas_retorno
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'get_gastos_financial_summary';
--    -- Espera: 1 fila (función existe)
--
-- 2. Llama a la función con el empresa_id real y comprueba que devuelve columnas nuevas.
--
--    select
--      total_gastos,
--      total_otros_gastos_varios,
--      count_otros_gastos_varios
--    from public.get_gastos_financial_summary('<TU_EMPRESA_ID_UUID>');
--    -- Espera: total_gastos ≥ 0, columnas nuevas presentes (0 si no hay gastos de esa categoría aún)
--
-- 3. Confirma que los permisos se restauraron.
--
--    select grantee, privilege_type
--    from information_schema.routine_privileges
--    where specific_schema = 'public'
--      and routine_name = 'get_gastos_financial_summary';
--    -- Espera: filas para anon, authenticated, service_role con EXECUTE
--
-- 4. Confirma que total_gastos no cambió respecto a antes de la migración
--    (la suma sin filtro es idéntica; solo se añaden columnas de desglose).
--
--    select total_gastos, total_otros_gastos_varios
--    from public.get_gastos_financial_summary('<TU_EMPRESA_ID_UUID>');
--    -- total_gastos debe coincidir con el valor que tenías antes.
--    -- total_otros_gastos_varios = 0 si aún no hay gastos registrados en esa categoría.
