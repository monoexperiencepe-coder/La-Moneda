-- =============================================================================
-- Representación interna: normalizar subtipo_gasto a códigos snake_case
-- =============================================================================
-- Alcance: SOLO filas con tipo_gasto = 'representacion_interna'.
-- No modifica montos, fechas, tipo_gasto ni otras categorías.
--
-- Códigos destino:
--   almuerzo_socios, cena_familiar, reunion_socios, gasto_representacion,
--   otros_representacion_interna
--
-- Ejecución: revisar los SELECT de auditoría y preview; luego ejecutar el
-- bloque BEGIN/COMMIT (o correr el archivo completo en el SQL editor).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Auditoría: total de registros
-- -----------------------------------------------------------------------------
SELECT count(*) AS total_representacion_interna
FROM public.gastos
WHERE tipo_gasto = 'representacion_interna';

-- -----------------------------------------------------------------------------
-- 2) Auditoría: conteo por subtipo_gasto actual
-- -----------------------------------------------------------------------------
SELECT
  coalesce(nullif(trim(subtipo_gasto), ''), '(vacío)') AS subtipo_actual,
  count(*) AS n
FROM public.gastos
WHERE tipo_gasto = 'representacion_interna'
GROUP BY 1
ORDER BY n DESC, 1;

-- -----------------------------------------------------------------------------
-- 3) CTE reutilizable: texto unificado (motivo + comentarios + sub_tipo + subtipo_gasto)
-- -----------------------------------------------------------------------------
-- (Definida de nuevo dentro de cada bloque SELECT/UPDATE por claridad.)

-- -----------------------------------------------------------------------------
-- 4) Preview: hasta 20 filas con subtipo sugerido (solo lectura)
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    g.id,
    g.motivo,
    g.comentarios,
    g.sub_tipo,
    g.subtipo_gasto AS subtipo_actual,
    lower(
      translate(
        regexp_replace(
          concat_ws(
            ' ',
            coalesce(g.motivo, ''),
            coalesce(g.comentarios, ''),
            coalesce(g.sub_tipo, ''),
            coalesce(g.subtipo_gasto, '')
          ),
          '\s+',
          ' ',
          'g'
        ),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS hay,
    lower(
      translate(
        trim(coalesce(g.subtipo_gasto, '')),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS st_norm
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
suggested AS (
  SELECT
    id,
    motivo,
    comentarios,
    sub_tipo,
    subtipo_actual,
    CASE
      WHEN lower(trim(coalesce(subtipo_actual, ''))) IN (
        'almuerzo_socios',
        'cena_familiar',
        'reunion_socios',
        'gasto_representacion',
        'otros_representacion_interna'
      )
        THEN lower(trim(subtipo_actual))
      WHEN st_norm IN (
        'almuerzo socios',
        'cena familiar',
        'reunion socios',
        'gasto de representación',
        'gasto de representacion',
        'otros representación interna',
        'otros representacion interna'
      )
        THEN CASE st_norm
          WHEN 'almuerzo socios' THEN 'almuerzo_socios'
          WHEN 'cena familiar' THEN 'cena_familiar'
          WHEN 'reunion socios' THEN 'reunion_socios'
          WHEN 'gasto de representación' THEN 'gasto_representacion'
          WHEN 'gasto de representacion' THEN 'gasto_representacion'
          WHEN 'otros representación interna' THEN 'otros_representacion_interna'
          WHEN 'otros representacion interna' THEN 'otros_representacion_interna'
        END
      WHEN strpos(hay, 'almuerzo') > 0 AND strpos(hay, 'socio') > 0 THEN 'almuerzo_socios'
      WHEN strpos(hay, 'cena') > 0 AND strpos(hay, 'familiar') > 0 THEN 'cena_familiar'
      WHEN strpos(hay, 'reunion') > 0 AND strpos(hay, 'socio') > 0 THEN 'reunion_socios'
      WHEN strpos(hay, 'cena') > 0 AND strpos(hay, 'socio') > 0 THEN 'reunion_socios'
      WHEN strpos(hay, 'otros') > 0 AND strpos(hay, 'representacion') > 0 AND strpos(hay, 'interna') > 0
        THEN 'otros_representacion_interna'
      WHEN strpos(hay, 'representacion') > 0 THEN 'gasto_representacion'
      ELSE 'otros_representacion_interna'
    END AS subtipo_sugerido
  FROM base
)
SELECT
  id,
  left(coalesce(motivo, ''), 80) AS motivo_corto,
  left(coalesce(comentarios, ''), 80) AS comentarios_corto,
  sub_tipo,
  subtipo_actual,
  subtipo_sugerido
FROM suggested
ORDER BY id
LIMIT 20;

-- -----------------------------------------------------------------------------
-- 5) UPDATE (solo subtipo_gasto; solo tipo_gasto = representacion_interna)
-- -----------------------------------------------------------------------------
BEGIN;

WITH base AS (
  SELECT
    g.id,
    g.subtipo_gasto AS subtipo_actual,
    lower(
      translate(
        regexp_replace(
          concat_ws(
            ' ',
            coalesce(g.motivo, ''),
            coalesce(g.comentarios, ''),
            coalesce(g.sub_tipo, ''),
            coalesce(g.subtipo_gasto, '')
          ),
          '\s+',
          ' ',
          'g'
        ),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS hay,
    lower(
      translate(
        trim(coalesce(g.subtipo_gasto, '')),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS st_norm
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
suggested AS (
  SELECT
    id,
    subtipo_actual,
    CASE
      WHEN lower(trim(coalesce(subtipo_actual, ''))) IN (
        'almuerzo_socios',
        'cena_familiar',
        'reunion_socios',
        'gasto_representacion',
        'otros_representacion_interna'
      )
        THEN lower(trim(subtipo_actual))
      WHEN st_norm IN (
        'almuerzo socios',
        'cena familiar',
        'reunion socios',
        'gasto de representación',
        'gasto de representacion',
        'otros representación interna',
        'otros representacion interna'
      )
        THEN CASE st_norm
          WHEN 'almuerzo socios' THEN 'almuerzo_socios'
          WHEN 'cena familiar' THEN 'cena_familiar'
          WHEN 'reunion socios' THEN 'reunion_socios'
          WHEN 'gasto de representación' THEN 'gasto_representacion'
          WHEN 'gasto de representacion' THEN 'gasto_representacion'
          WHEN 'otros representación interna' THEN 'otros_representacion_interna'
          WHEN 'otros representacion interna' THEN 'otros_representacion_interna'
        END
      WHEN strpos(hay, 'almuerzo') > 0 AND strpos(hay, 'socio') > 0 THEN 'almuerzo_socios'
      WHEN strpos(hay, 'cena') > 0 AND strpos(hay, 'familiar') > 0 THEN 'cena_familiar'
      WHEN strpos(hay, 'reunion') > 0 AND strpos(hay, 'socio') > 0 THEN 'reunion_socios'
      WHEN strpos(hay, 'cena') > 0 AND strpos(hay, 'socio') > 0 THEN 'reunion_socios'
      WHEN strpos(hay, 'otros') > 0 AND strpos(hay, 'representacion') > 0 AND strpos(hay, 'interna') > 0
        THEN 'otros_representacion_interna'
      WHEN strpos(hay, 'representacion') > 0 THEN 'gasto_representacion'
      ELSE 'otros_representacion_interna'
    END AS subtipo_sugerido
  FROM base
)
UPDATE public.gastos g
SET subtipo_gasto = s.subtipo_sugerido
FROM suggested s
WHERE g.id = s.id
  AND g.tipo_gasto = 'representacion_interna'
  AND coalesce(trim(g.subtipo_gasto), '') IS DISTINCT FROM s.subtipo_sugerido;

COMMIT;
