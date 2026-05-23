-- Agregados financieros de gastos (SECURITY INVOKER → respeta RLS).
-- Ejecutar en SQL Editor de Supabase o vía CLI.
-- No modifica datos ni policies.

-- Normalización canónica de tipo_gasto (misma regla que frontend / audit_gastos_conciliacion).
create or replace function public.gastos_canonical_tipo_gasto(p_tipo_gasto text, p_has_vehicle boolean)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when nullif(btrim(p_tipo_gasto), '') is null and p_has_vehicle then 'operativo_vehiculo'
    when nullif(btrim(p_tipo_gasto), '') is null then 'gastos_globales'
    when btrim(p_tipo_gasto) = 'financiero' then 'financiero_prestamo'
    when btrim(p_tipo_gasto) = 'inversion' then 'inversion_compra'
    when btrim(p_tipo_gasto) = 'operativo_flota_global' then 'gastos_globales'
    when btrim(p_tipo_gasto) in ('personal_socios', 'personal_socios_familiares', 'personales')
      then 'representacion_interna'
    else btrim(p_tipo_gasto)
  end;
$$;

comment on function public.gastos_canonical_tipo_gasto(text, boolean) is
  'Mapea tipo_gasto legacy/null al bucket canónico UI (operativo, globales, financiero, etc.).';

-- Resumen financiero agregado por empresa (una fila).
create or replace function public.get_gastos_financial_summary(p_empresa_id uuid)
returns table (
  total_gastos numeric,
  total_count bigint,
  total_operativo_vehiculo numeric,
  count_operativo_vehiculo bigint,
  total_operativo_flota_general numeric,
  count_operativo_flota_general bigint,
  total_administrativo_empresa numeric,
  count_administrativo_empresa bigint,
  total_financiero_prestamo numeric,
  count_financiero_prestamo bigint,
  total_planilla_laboral numeric,
  count_planilla_laboral bigint,
  total_inversion_compra numeric,
  count_inversion_compra bigint,
  total_representacion_interna numeric,
  count_representacion_interna bigint,
  total_gastos_globales numeric,
  count_gastos_globales bigint,
  total_pendiente_revision numeric,
  count_pendiente_revision bigint
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
    coalesce(sum(b.monto), 0)::numeric as total_gastos,
    count(*)::bigint as total_count,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'operativo_vehiculo'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'operativo_vehiculo')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'operativo_flota_general'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'operativo_flota_general')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'administrativo_empresa'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'administrativo_empresa')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'financiero_prestamo'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'financiero_prestamo')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'planilla_laboral'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'planilla_laboral')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'inversion_compra'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'inversion_compra')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'representacion_interna'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'representacion_interna')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'gastos_globales'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'gastos_globales')::bigint,
    coalesce(sum(b.monto) filter (where b.tipo_canon = 'pendiente_revision'), 0)::numeric,
    count(*) filter (where b.tipo_canon = 'pendiente_revision')::bigint
  from base b;
$$;

comment on function public.get_gastos_financial_summary(uuid) is
  'KPIs globales de gastos por categoría canónica; SECURITY INVOKER respeta RLS.';

grant execute on function public.gastos_canonical_tipo_gasto(text, boolean) to anon;
grant execute on function public.gastos_canonical_tipo_gasto(text, boolean) to authenticated;
grant execute on function public.gastos_canonical_tipo_gasto(text, boolean) to service_role;

grant execute on function public.get_gastos_financial_summary(uuid) to anon;
grant execute on function public.get_gastos_financial_summary(uuid) to authenticated;
grant execute on function public.get_gastos_financial_summary(uuid) to service_role;
