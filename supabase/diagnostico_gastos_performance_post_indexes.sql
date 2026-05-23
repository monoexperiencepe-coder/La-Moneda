-- =============================================================================
-- Diagnóstico READ-ONLY — performance post-índices (gastos + summary RPC)
-- =============================================================================
-- Reemplazar EMPRESA_UUID antes de ejecutar.
-- Ejecutar como usuario autenticado (admin) para medir RLS real vía PostgREST-like.
-- =============================================================================

-- ─── A) Índices activos ───
select indexname, pg_size_pretty(pg_relation_size(c.oid)) as size, indexdef
from pg_indexes i
join pg_class c on c.relname = i.indexname
join pg_namespace n on n.oid = c.relnamespace and n.nspname = i.schemaname
where i.schemaname = 'public'
  and i.tablename in ('gastos', 'user_profiles')
order by i.tablename, i.indexname;

-- ─── B) EXPLAIN: recent 1000 (mismo patrón que fetchGastosRecent) ───
explain (analyze, buffers, format text)
select g.id, g.fecha, g.monto, g.tipo_gasto
from public.gastos g
where g.empresa_id = 'EMPRESA_UUID'::uuid
order by g.fecha desc, g.id desc
limit 1000;

-- ─── C) EXPLAIN: summary GROUP BY tipo canónico ───
explain (analyze, buffers, format text)
with scoped as (
  select
    g.monto,
    public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) as tipo_canon
  from public.gastos g
  where g.empresa_id = 'EMPRESA_UUID'::uuid
)
select tipo_canon, sum(monto) as total_monto, count(*) as n
from scoped
group by tipo_canon
order by tipo_canon;

-- ─── D) EXPLAIN: RPC get_gastos_financial_summary ───
explain (analyze, buffers, format text)
select *
from public.get_gastos_financial_summary('EMPRESA_UUID'::uuid);

-- ─── E) Totales de referencia (deben coincidir con RPC) ───
select
  count(*) as n,
  round(sum(monto)::numeric, 2) as total_pen
from public.gastos g
where g.empresa_id = 'EMPRESA_UUID'::uuid;

select *
from public.get_gastos_financial_summary('EMPRESA_UUID'::uuid);

-- ─── F) Helpers RLS — atributos STABLE / SECURITY DEFINER ───
select
  p.proname as function_name,
  case p.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
  end as volatility,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_restricted_operador_account',
    'can_read_gasto',
    'get_gastos_financial_summary',
    'gastos_canonical_tipo_gasto'
  )
order by p.proname;

-- ─── G) Interpretación ───
select unnest(array[
  'fetchGastosRecent: buscar Index Scan on gastos_empresa_id_fecha_id_desc_idx',
  'summary: Bitmap/Index Scan on gastos_empresa_id_kpi_cover_idx o empresa_id_idx',
  'Execution Time < 3000 ms → OK para PostgREST',
  'Seq Scan on gastos con 13k rows → revisar ANALYZE o índices no aplicados',
  'can_read_gasto: 1 Index Scan user_profiles PK por fila evaluada (normal bajo RLS)'
]) as nota;
