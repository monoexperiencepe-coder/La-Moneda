-- =============================================================================
-- Diagnóstico READ-ONLY — consistencia KPIs financieros (empresa fija)
-- =============================================================================
-- empresa_id: 07593982-08e6-450c-8abe-4bf590609dd7
-- Comparar con frontend: ingresos globales, gastos RPC, utilidad, inversion_compra.
-- =============================================================================

-- Reemplazar EMPRESA_UUID si aplica (valor de referencia del tenant):
-- 07593982-08e6-450c-8abe-4bf590609dd7

-- ─── A) Total ingresos (PEN equivalente: monto en tabla ingresos) ───
select
  count(*)::bigint as ingresos_count,
  round(coalesce(sum(i.monto), 0)::numeric, 2) as total_ingresos_pen
from public.ingresos i
where i.empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid;

-- ─── B) Total gastos (todas las categorías) ───
select
  count(*)::bigint as gastos_count,
  round(coalesce(sum(g.monto), 0)::numeric, 2) as total_gastos_pen
from public.gastos g
where g.empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid;

-- ─── C) Utilidad SQL = ingresos − gastos ───
with ing as (
  select coalesce(sum(monto), 0)::numeric as total from public.ingresos
  where empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
),
gas as (
  select coalesce(sum(monto), 0)::numeric as total from public.gastos
  where empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
)
select
  round(i.total, 2) as total_ingresos_pen,
  round(g.total, 2) as total_gastos_pen,
  round(i.total - g.total, 2) as utilidad_pen
from ing i, gas g;

-- ─── D) Gastos por tipo_gasto canónico (misma lógica que RPC) ───
select
  public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) as tipo_canon,
  count(*)::bigint as n,
  round(sum(g.monto)::numeric, 2) as total_pen
from public.gastos g
where g.empresa_id = :'empresa_id'::uuid
group by 1
order by total_pen desc;

-- ─── E) Inversión con utilidad (inversion_compra) ───
select
  count(*)::bigint as n,
  round(coalesce(sum(g.monto), 0)::numeric, 2) as inversion_compra_pen
from public.gastos g
where g.empresa_id = :'empresa_id'::uuid
  and public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) = 'inversion_compra';

-- ─── F) RPC get_gastos_financial_summary (debe coincidir con B, D, E) ───
select *
from public.get_gastos_financial_summary('07593982-08e6-450c-8abe-4bf590609dd7'::uuid);

-- ─── G) Referencia esperada frontend (valores reportados por usuario) ───
select unnest(array[
  'total_gastos_pen ≈ 4949367.05',
  'gastos_count ≈ 13632',
  'utilidad_pen = total_ingresos_pen − total_gastos_pen',
  'inversion_compra_pen = fila RPC total_inversion_compra'
]) as nota;
