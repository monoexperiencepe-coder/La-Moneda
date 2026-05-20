-- =============================================================================
-- Auditoría SOLO LECTURA: conciliación total gastos vs categorías (tipo_gasto)
-- =============================================================================
-- Objetivo: explicar descuadre entre SUM(monto) total y suma de categorías UI.
-- NO modifica datos. Ejecutar en SQL Editor (Supabase) con rol de lectura.
--
-- Antes de correr: edita empresa_id en el CTE `params` (mismo UUID que VITE_EMPRESA_ID).
-- =============================================================================

-- ─── Parámetro empresa (editar una sola vez) ─────────────────────────────────
-- Comparar con: select id from public.empresas;

-- =============================================================================
-- 1) Total general de gastos
-- =============================================================================
WITH params AS (
  SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id
)
SELECT
  count(*) AS n_registros,
  round(sum(g.monto)::numeric, 2) AS total_pen
FROM public.gastos g
CROSS JOIN params p
WHERE g.empresa_id = p.empresa_id;

-- =============================================================================
-- 2) Total por tipo_gasto (crudo en BD)
-- =============================================================================
SELECT
  coalesce(nullif(btrim(g.tipo_gasto), ''), '(null o vacío)') AS tipo_gasto,
  count(*) AS n,
  round(sum(g.monto)::numeric, 2) AS total_pen
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
GROUP BY 1
ORDER BY total_pen DESC NULLS LAST;

-- =============================================================================
-- 2b) Inferencia UI cuando tipo_gasto es null (misma regla que frontend)
-- =============================================================================
WITH norm AS (
  SELECT
    g.*,
    CASE
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL AND g.vehicle_id IS NOT NULL THEN 'operativo_vehiculo (inferido)'
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL AND g.vehicle_id IS NULL THEN 'gastos_globales (inferido)'
      WHEN btrim(g.tipo_gasto) = 'financiero' THEN 'financiero_prestamo'
      WHEN btrim(g.tipo_gasto) = 'inversion' THEN 'inversion_compra'
      WHEN btrim(g.tipo_gasto) = 'operativo_flota_global' THEN 'gastos_globales'
      WHEN btrim(g.tipo_gasto) IN ('personal_socios', 'personal_socios_familiares', 'personales')
        THEN 'representacion_interna'
      ELSE btrim(g.tipo_gasto)
    END AS tipo_ui
  FROM public.gastos g
  CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
  WHERE g.empresa_id = p.empresa_id
)
SELECT
  tipo_ui,
  count(*) AS n,
  round(sum(monto)::numeric, 2) AS total_pen
FROM norm
GROUP BY 1
ORDER BY total_pen DESC;

-- =============================================================================
-- 3) tipo_gasto NULL, vacío o desconocido (no canónico UI)
-- =============================================================================
WITH norm AS (
  SELECT
    g.id,
    g.fecha,
    g.monto,
    g.motivo,
    g.tipo_gasto,
    g.subtipo_gasto,
    g.vehicle_id,
    CASE
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL AND g.vehicle_id IS NOT NULL THEN 'operativo_vehiculo'
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL THEN 'gastos_globales'
      WHEN btrim(g.tipo_gasto) = 'financiero' THEN 'financiero_prestamo'
      WHEN btrim(g.tipo_gasto) = 'inversion' THEN 'inversion_compra'
      WHEN btrim(g.tipo_gasto) = 'operativo_flota_global' THEN 'gastos_globales'
      WHEN btrim(g.tipo_gasto) IN ('personal_socios', 'personal_socios_familiares', 'personales')
        THEN 'representacion_interna'
      ELSE btrim(g.tipo_gasto)
    END AS tipo_norm
  FROM public.gastos g
  CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
  WHERE g.empresa_id = p.empresa_id
)
SELECT
  n.id,
  n.fecha,
  n.monto,
  n.motivo,
  n.tipo_gasto AS tipo_raw,
  n.tipo_norm,
  n.subtipo_gasto,
  n.vehicle_id
FROM norm n
WHERE n.tipo_norm NOT IN (
  'operativo_vehiculo',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'gastos_globales',
  'inversion_compra'
)
ORDER BY abs(n.monto) DESC, n.fecha DESC
LIMIT 200;

-- =============================================================================
-- 4) Posibles duplicados (misma fecha, monto, motivo, vehículo, tipo)
-- =============================================================================
SELECT
  g.fecha,
  g.monto,
  left(g.motivo, 80) AS motivo,
  g.vehicle_id,
  coalesce(g.tipo_gasto, '(null)') AS tipo_gasto,
  count(*) AS n,
  array_agg(g.id ORDER BY g.id) AS ids,
  round(sum(g.monto)::numeric, 2) AS suma_grupo
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
GROUP BY g.fecha, g.monto, g.motivo, g.vehicle_id, g.tipo_gasto
HAVING count(*) > 1
ORDER BY suma_grupo DESC
LIMIT 100;

-- =============================================================================
-- 5) Inversión con utilidad (inversion_compra + legacy inversion)
-- =============================================================================
SELECT
  count(*) AS n,
  round(sum(g.monto)::numeric, 2) AS total_inversion_pen
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
  AND btrim(coalesce(g.tipo_gasto, '')) IN ('inversion_compra', 'inversion');

-- =============================================================================
-- 6) Gasto caja / caja negocio / reinversión (texto en gastos)
-- =============================================================================
SELECT
  g.id,
  g.fecha,
  g.monto,
  g.tipo_gasto,
  g.tipo,
  g.categoria,
  g.motivo,
  left(g.comentarios, 120) AS comentarios
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
  AND (
    g.comentarios ~* 'gastos_caja|origen\s+gastos_caja|caja\s+negocio|reinversi[oó]n|utilidad|compra\s+carro|inter[eé]s'
    OR g.motivo ~* 'caja\s+negocio|gastos_caja|reinversi[oó]n'
    OR g.tipo ~* 'caja'
    OR g.categoria ~* 'caja'
  )
ORDER BY abs(g.monto) DESC
LIMIT 200;

-- =============================================================================
-- 6b) Ledger histórico gastos_caja (tabla aparte — NO está en total tabla Gastos)
-- =============================================================================
SELECT
  count(*) AS n_gastos_caja,
  round(sum(gc.monto)::numeric, 2) AS total_gastos_caja_pen
FROM public.gastos_caja gc
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE gc.empresa_id = p.empresa_id;

-- =============================================================================
-- 6c) Caja negocio por vehículo (tabla aparte)
-- =============================================================================
SELECT
  count(*) AS n_caja_negocio,
  round(sum(c.monto)::numeric, 2) AS total_caja_negocio_pen
FROM public.caja_negocio_vehiculo c
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE c.empresa_id = p.empresa_id;

-- =============================================================================
-- 7) Monto negativo o cero
-- =============================================================================
SELECT
  count(*) AS n,
  round(sum(g.monto)::numeric, 2) AS total_pen
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
  AND g.monto <= 0;

SELECT
  g.id,
  g.fecha,
  g.monto,
  g.tipo_gasto,
  g.motivo
FROM public.gastos g
CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
WHERE g.empresa_id = p.empresa_id
  AND g.monto <= 0
ORDER BY g.monto ASC
LIMIT 100;

-- =============================================================================
-- 8) Comparación: total vs suma categorías canónicas UI
-- =============================================================================
WITH norm AS (
  SELECT
    g.monto,
    CASE
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL AND g.vehicle_id IS NOT NULL THEN 'operativo_vehiculo'
      WHEN nullif(btrim(g.tipo_gasto), '') IS NULL THEN 'gastos_globales'
      WHEN btrim(g.tipo_gasto) = 'financiero' THEN 'financiero_prestamo'
      WHEN btrim(g.tipo_gasto) = 'inversion' THEN 'inversion_compra'
      WHEN btrim(g.tipo_gasto) = 'operativo_flota_global' THEN 'gastos_globales'
      WHEN btrim(g.tipo_gasto) IN ('personal_socios', 'personal_socios_familiares', 'personales')
        THEN 'representacion_interna'
      ELSE btrim(g.tipo_gasto)
    END AS tipo_ui
  FROM public.gastos g
  CROSS JOIN (SELECT 'REEMPLAZAR-EMPRESA-UUID'::uuid AS empresa_id) p
  WHERE g.empresa_id = p.empresa_id
),
tot AS (
  SELECT round(sum(monto)::numeric, 2) AS total_general FROM norm
),
parrilla AS (
  SELECT round(sum(monto)::numeric, 2) AS suma_6_tarjetas
  FROM norm
  WHERE tipo_ui IN (
    'operativo_vehiculo',
    'administrativo_empresa',
    'financiero_prestamo',
    'planilla_laboral',
    'representacion_interna',
    'gastos_globales'
  )
),
inv AS (
  SELECT round(sum(monto)::numeric, 2) AS suma_inversion
  FROM norm
  WHERE tipo_ui = 'inversion_compra'
),
orphan AS (
  SELECT round(coalesce(sum(monto), 0)::numeric, 2) AS suma_huerfanos
  FROM norm
  WHERE tipo_ui NOT IN (
    'operativo_vehiculo',
    'administrativo_empresa',
    'financiero_prestamo',
    'planilla_laboral',
    'representacion_interna',
    'gastos_globales',
    'inversion_compra'
  )
)
SELECT
  t.total_general,
  p.suma_6_tarjetas,
  i.suma_inversion,
  p.suma_6_tarjetas + i.suma_inversion AS suma_6_mas_inversion,
  o.suma_huerfanos,
  t.total_general - p.suma_6_tarjetas AS diff_vs_6_tarjetas,
  t.total_general - (p.suma_6_tarjetas + i.suma_inversion) AS diff_vs_6_mas_inversion,
  t.total_general - (
    p.suma_6_tarjetas + i.suma_inversion + o.suma_huerfanos
  ) AS diff_residual
FROM tot t, parrilla p, inv i, orphan o;
