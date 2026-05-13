-- =============================================================================
-- Representación interna — subtipos v4 (definitivo, sin cena_familiar automático)
-- =============================================================================
-- Alcance: solo filas con tipo_gasto = 'representacion_interna'.
-- Solo actualiza public.gastos.subtipo_gasto (UPDATE comentado hasta validar).
--
-- Subtipos finales:
--   movilidad_socios, almuerzo_socios, reunion_socios, gasto_representacion
--
-- Hay = lower(translate(motivo || comentarios || sub_tipo)) — sin subtipo_gasto
--       ni tipo Fact.
--
-- Orden en cascada:
--   1 movilidad_socios
--   2 almuerzo_socios
--   3 reunion_socios
--   4 gasto_representacion (resto, texto vacío, y ex cena_familiar por texto)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Conteo actual por subtipo_gasto
-- -----------------------------------------------------------------------------
SELECT
  coalesce(nullif(trim(subtipo_gasto), ''), '(vacío)') AS subtipo_actual,
  count(*) AS n
FROM public.gastos
WHERE tipo_gasto = 'representacion_interna'
GROUP BY 1
ORDER BY n DESC, 1;

-- -----------------------------------------------------------------------------
-- B) Conteo sugerido (v4)
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    g.id,
    trim(coalesce(g.subtipo_gasto, '')) AS subtipo_actual,
    lower(
      translate(
        regexp_replace(
          concat_ws(
            ' ',
            coalesce(g.motivo, ''),
            coalesce(g.comentarios, ''),
            coalesce(g.sub_tipo, '')
          ),
          '\s+',
          ' ',
          'g'
        ),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS hay
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
suggested AS (
  SELECT
    id,
    subtipo_actual,
    CASE
      WHEN length(trim(hay)) = 0 THEN 'gasto_representacion'
      WHEN strpos(hay, 'taxi') > 0
      OR strpos(hay, 'movilidad') > 0
      OR strpos(hay, 'transporte') > 0
      OR strpos(hay, 'pasaje') > 0
      OR strpos(hay, 'uber') > 0
      OR strpos(hay, 'didi') > 0
      OR strpos(hay, 'indrive') > 0
        THEN 'movilidad_socios'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'desayuno') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'makis') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR strpos(hay, 'panes') > 0
      OR strpos(concat(' ', hay, ' '), ' pan ') > 0
      OR strpos(hay, 'helado') > 0
      OR strpos(hay, 'postre') > 0
      OR strpos(hay, 'tamales') > 0
        THEN 'almuerzo_socios'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
      OR strpos(hay, 'regalo') > 0
      OR strpos(hay, 'obsequio') > 0
      OR strpos(hay, 'canasta') > 0
      OR strpos(hay, 'invitacion') > 0
      OR concat(' ', hay, ' ') LIKE '% socios %'
      OR concat(' ', hay, ' ') LIKE '% socio %'
        THEN 'reunion_socios'
      ELSE 'gasto_representacion'
    END AS subtipo_sugerido
  FROM base
)
SELECT
  subtipo_sugerido,
  count(*) AS n
FROM suggested
GROUP BY 1
ORDER BY n DESC, 1;

-- -----------------------------------------------------------------------------
-- C) Preview: 100 registros (actual vs sugerido + contexto)
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    g.id,
    g.fecha,
    g.motivo,
    g.comentarios,
    g.tipo,
    g.sub_tipo,
    trim(coalesce(g.subtipo_gasto, '')) AS subtipo_actual,
    g.monto,
    lower(
      translate(
        regexp_replace(
          concat_ws(
            ' ',
            coalesce(g.motivo, ''),
            coalesce(g.comentarios, ''),
            coalesce(g.sub_tipo, '')
          ),
          '\s+',
          ' ',
          'g'
        ),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS hay
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
suggested AS (
  SELECT
    id,
    fecha,
    motivo,
    comentarios,
    tipo,
    sub_tipo,
    subtipo_actual,
    monto,
    CASE
      WHEN length(trim(hay)) = 0 THEN 'gasto_representacion'
      WHEN strpos(hay, 'taxi') > 0
      OR strpos(hay, 'movilidad') > 0
      OR strpos(hay, 'transporte') > 0
      OR strpos(hay, 'pasaje') > 0
      OR strpos(hay, 'uber') > 0
      OR strpos(hay, 'didi') > 0
      OR strpos(hay, 'indrive') > 0
        THEN 'movilidad_socios'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'desayuno') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'makis') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR strpos(hay, 'panes') > 0
      OR strpos(concat(' ', hay, ' '), ' pan ') > 0
      OR strpos(hay, 'helado') > 0
      OR strpos(hay, 'postre') > 0
      OR strpos(hay, 'tamales') > 0
        THEN 'almuerzo_socios'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
      OR strpos(hay, 'regalo') > 0
      OR strpos(hay, 'obsequio') > 0
      OR strpos(hay, 'canasta') > 0
      OR strpos(hay, 'invitacion') > 0
      OR concat(' ', hay, ' ') LIKE '% socios %'
      OR concat(' ', hay, ' ') LIKE '% socio %'
        THEN 'reunion_socios'
      ELSE 'gasto_representacion'
    END AS subtipo_sugerido
  FROM base
)
SELECT
  id,
  fecha,
  left(coalesce(motivo, ''), 96) AS motivo_corto,
  left(coalesce(comentarios, ''), 96) AS comentarios_corto,
  left(coalesce(tipo, ''), 48) AS tipo_fact,
  left(coalesce(sub_tipo, ''), 48) AS sub_tipo_fact,
  coalesce(nullif(trim(subtipo_actual), ''), '(vacío)') AS subtipo_actual,
  subtipo_sugerido,
  monto
FROM suggested
ORDER BY id
LIMIT 100;

-- =============================================================================
-- UPDATE (comentado hasta validar A–C)
-- =============================================================================
/*
BEGIN;

WITH base AS (
  SELECT
    g.id,
    trim(coalesce(g.subtipo_gasto, '')) AS subtipo_actual,
    lower(
      translate(
        regexp_replace(
          concat_ws(
            ' ',
            coalesce(g.motivo, ''),
            coalesce(g.comentarios, ''),
            coalesce(g.sub_tipo, '')
          ),
          '\s+',
          ' ',
          'g'
        ),
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    ) AS hay
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
suggested AS (
  SELECT
    id,
    subtipo_actual,
    CASE
      WHEN length(trim(hay)) = 0 THEN 'gasto_representacion'
      WHEN strpos(hay, 'taxi') > 0
      OR strpos(hay, 'movilidad') > 0
      OR strpos(hay, 'transporte') > 0
      OR strpos(hay, 'pasaje') > 0
      OR strpos(hay, 'uber') > 0
      OR strpos(hay, 'didi') > 0
      OR strpos(hay, 'indrive') > 0
        THEN 'movilidad_socios'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'desayuno') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'makis') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR strpos(hay, 'panes') > 0
      OR strpos(concat(' ', hay, ' '), ' pan ') > 0
      OR strpos(hay, 'helado') > 0
      OR strpos(hay, 'postre') > 0
      OR strpos(hay, 'tamales') > 0
        THEN 'almuerzo_socios'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
      OR strpos(hay, 'regalo') > 0
      OR strpos(hay, 'obsequio') > 0
      OR strpos(hay, 'canasta') > 0
      OR strpos(hay, 'invitacion') > 0
      OR concat(' ', hay, ' ') LIKE '% socios %'
      OR concat(' ', hay, ' ') LIKE '% socio %'
        THEN 'reunion_socios'
      ELSE 'gasto_representacion'
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
*/
