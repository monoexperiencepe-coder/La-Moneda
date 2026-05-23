-- Diagnóstico READ-ONLY: RPC get_gastos_financial_summary vs SUM manual.
-- Reemplazar EMPRESA_UUID antes de ejecutar.

-- ─── 1) Total bruto SUM(monto) (respeta RLS del rol actual) ───
SELECT
  count(*) AS n_filas,
  round(coalesce(sum(g.monto), 0)::numeric, 2) AS total_pen
FROM public.gastos g
WHERE g.empresa_id = 'EMPRESA_UUID'::uuid;

-- ─── 2) RPC agregada (misma sesión / mismo rol) ───
SELECT *
FROM public.get_gastos_financial_summary('EMPRESA_UUID'::uuid);

-- ─── 3) Comparar total RPC vs SUM manual ───
WITH manual AS (
  SELECT coalesce(sum(g.monto), 0)::numeric AS total_pen
  FROM public.gastos g
  WHERE g.empresa_id = 'EMPRESA_UUID'::uuid
),
rpc AS (
  SELECT s.total_gastos
  FROM public.get_gastos_financial_summary('EMPRESA_UUID'::uuid) s
)
SELECT
  manual.total_pen AS sum_manual,
  rpc.total_gastos AS rpc_total,
  round((manual.total_pen - rpc.total_gastos)::numeric, 4) AS diff
FROM manual, rpc;

-- ─── 4) Desglose por tipo_gasto crudo en BD ───
SELECT
  coalesce(nullif(btrim(g.tipo_gasto), ''), '(null o vacío)') AS tipo_gasto_raw,
  count(*) AS n,
  round(sum(g.monto)::numeric, 2) AS total_pen
FROM public.gastos g
WHERE g.empresa_id = 'EMPRESA_UUID'::uuid
GROUP BY 1
ORDER BY total_pen DESC;

-- ─── 5) Desglose canónico (helper SQL) ───
SELECT
  public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) AS tipo_canon,
  count(*) AS n,
  round(sum(g.monto)::numeric, 2) AS total_pen
FROM public.gastos g
WHERE g.empresa_id = 'EMPRESA_UUID'::uuid
GROUP BY 1
ORDER BY total_pen DESC;

-- ─── 6) EXPLAIN ANALYZE del RPC (performance) ───
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.get_gastos_financial_summary('EMPRESA_UUID'::uuid);

-- ─── 7) Índices útiles (solo lectura; no crea nada) ───
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'gastos'
ORDER BY indexname;
