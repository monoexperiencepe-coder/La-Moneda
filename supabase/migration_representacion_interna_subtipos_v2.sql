-- =============================================================================
-- Representación interna — reclasificación v2 (PREVIEW + UPDATE comentado)
-- =============================================================================
-- Alcance: tipo_gasto = 'representacion_interna' (solo columna subtipo_gasto).
--
-- Reglas v2 (orden en cascada; primera condición que aplique gana):
--   1) cena_familiar: cena/noche/restaurante + familiar|familia; o bigrama
--      reunión↔noche; o (familiar|familia) con (cena|noche|restaurante).
--   2) reunion_socios: reunión, junta, directorio, coordinación.
--   3) gasto_representacion: representación, atención, invitación, agasajo,
--      visita, cliente; o reunión junto a «externa».
--   4) almuerzo_socios: almuerzo, menú, comida, restaurante, chifa, pollo,
--      ceviche/cevichería; o socios junto a señales de comida/local.
--   5) otros_representacion_interna: sin señal clara (o texto vacío).
--
-- Hay (clasificación): motivo, comentarios, sub_tipo (libre).
--    No se concatena subtipo_gasto ni tipo Fact: evitan subcadenas tipo
--    «representacion» en códigos legacy (p. ej. otros_representacion_interna).
--
-- USO:
--   1) Ejecutar solo los SELECT (auditoría + preview).
--   2) Validar conteos y los 50 ejemplos.
--   3) Descomentar el bloque UPDATE cuando proceda.
--
-- Ver también: audit_representacion_interna_textos.sql (textos y tokens).
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
-- B–C) Conteo sugerido por subtipo (v2) — misma lógica que el UPDATE comentado
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
      WHEN length(trim(hay)) = 0 THEN
        CASE
          WHEN lower(trim(subtipo_actual)) IN (
            'almuerzo_socios',
            'cena_familiar',
            'reunion_socios',
            'gasto_representacion',
            'otros_representacion_interna'
          ) THEN lower(trim(subtipo_actual))
          ELSE 'otros_representacion_interna'
        END
      WHEN (
        strpos(hay, 'cena') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        strpos(hay, 'noche') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'cena') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
        )
        AND (
          strpos(hay, 'cena') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR hay ~ 'reunion[^a-z0-9]{0,18}noche'
      OR hay ~ 'noche[^a-z0-9]{0,18}reunion'
        THEN 'cena_familiar'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
        THEN 'reunion_socios'
      WHEN strpos(hay, 'representacion') > 0
      OR strpos(hay, 'atencion') > 0
      OR strpos(hay, 'invitacion') > 0
      OR strpos(hay, 'agasajo') > 0
      OR strpos(hay, 'visita') > 0
      OR strpos(hay, 'cliente') > 0
      OR (
        strpos(hay, 'externa') > 0
        AND (
          strpos(hay, 'reunion') > 0
          OR strpos(hay, 'junta') > 0
          OR strpos(hay, 'visita') > 0
        )
      )
        THEN 'gasto_representacion'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR (
        strpos(hay, 'socio') > 0
        AND (
          strpos(hay, 'comida') > 0
          OR strpos(hay, 'restaurante') > 0
          OR strpos(hay, 'chifa') > 0
          OR strpos(hay, 'almuerzo') > 0
          OR strpos(hay, 'menu') > 0
          OR strpos(hay, 'pollo') > 0
          OR strpos(hay, 'ceviche') > 0
          OR strpos(hay, 'cevicheria') > 0
        )
      )
        THEN 'almuerzo_socios'
      ELSE 'otros_representacion_interna'
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
-- D) 50 ejemplos: actual vs sugerido (+ contexto)
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
      WHEN length(trim(hay)) = 0 THEN
        CASE
          WHEN lower(trim(subtipo_actual)) IN (
            'almuerzo_socios',
            'cena_familiar',
            'reunion_socios',
            'gasto_representacion',
            'otros_representacion_interna'
          ) THEN lower(trim(subtipo_actual))
          ELSE 'otros_representacion_interna'
        END
      WHEN (
        strpos(hay, 'cena') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        strpos(hay, 'noche') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'cena') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
        )
        AND (
          strpos(hay, 'cena') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR hay ~ 'reunion[^a-z0-9]{0,18}noche'
      OR hay ~ 'noche[^a-z0-9]{0,18}reunion'
        THEN 'cena_familiar'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
        THEN 'reunion_socios'
      WHEN strpos(hay, 'representacion') > 0
      OR strpos(hay, 'atencion') > 0
      OR strpos(hay, 'invitacion') > 0
      OR strpos(hay, 'agasajo') > 0
      OR strpos(hay, 'visita') > 0
      OR strpos(hay, 'cliente') > 0
      OR (
        strpos(hay, 'externa') > 0
        AND (
          strpos(hay, 'reunion') > 0
          OR strpos(hay, 'junta') > 0
          OR strpos(hay, 'visita') > 0
        )
      )
        THEN 'gasto_representacion'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR (
        strpos(hay, 'socio') > 0
        AND (
          strpos(hay, 'comida') > 0
          OR strpos(hay, 'restaurante') > 0
          OR strpos(hay, 'chifa') > 0
          OR strpos(hay, 'almuerzo') > 0
          OR strpos(hay, 'menu') > 0
          OR strpos(hay, 'pollo') > 0
          OR strpos(hay, 'ceviche') > 0
          OR strpos(hay, 'cevicheria') > 0
        )
      )
        THEN 'almuerzo_socios'
      ELSE 'otros_representacion_interna'
    END AS subtipo_sugerido
  FROM base
)
SELECT
  id,
  fecha,
  left(coalesce(motivo, ''), 72) AS motivo_corto,
  left(coalesce(comentarios, ''), 72) AS comentarios_corto,
  left(coalesce(tipo, ''), 40) AS tipo_fact,
  left(coalesce(sub_tipo, ''), 40) AS sub_tipo_fact,
  coalesce(nullif(trim(subtipo_actual), ''), '(vacío)') AS subtipo_actual,
  subtipo_sugerido,
  monto
FROM suggested
ORDER BY id
LIMIT 50;

-- =============================================================================
-- UPDATE (dejar comentado hasta validar en preview A–D)
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
    hay,
    CASE
      WHEN length(trim(hay)) = 0 THEN
        CASE
          WHEN lower(trim(subtipo_actual)) IN (
            'almuerzo_socios',
            'cena_familiar',
            'reunion_socios',
            'gasto_representacion',
            'otros_representacion_interna'
          ) THEN lower(trim(subtipo_actual))
          ELSE 'otros_representacion_interna'
        END
      WHEN (
        strpos(hay, 'cena') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        strpos(hay, 'noche') > 0
        AND (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
          OR strpos(hay, 'cena') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR (
        (
          strpos(hay, 'familiar') > 0
          OR strpos(hay, 'familia') > 0
        )
        AND (
          strpos(hay, 'cena') > 0
          OR strpos(hay, 'noche') > 0
          OR strpos(hay, 'restaurante') > 0
        )
      )
      OR hay ~ 'reunion[^a-z0-9]{0,18}noche'
      OR hay ~ 'noche[^a-z0-9]{0,18}reunion'
        THEN 'cena_familiar'
      WHEN strpos(hay, 'reunion') > 0
      OR strpos(hay, 'junta') > 0
      OR strpos(hay, 'directorio') > 0
      OR strpos(hay, 'coordinacion') > 0
        THEN 'reunion_socios'
      WHEN strpos(hay, 'representacion') > 0
      OR strpos(hay, 'atencion') > 0
      OR strpos(hay, 'invitacion') > 0
      OR strpos(hay, 'agasajo') > 0
      OR strpos(hay, 'visita') > 0
      OR strpos(hay, 'cliente') > 0
      OR (
        strpos(hay, 'externa') > 0
        AND (
          strpos(hay, 'reunion') > 0
          OR strpos(hay, 'junta') > 0
          OR strpos(hay, 'visita') > 0
        )
      )
        THEN 'gasto_representacion'
      WHEN strpos(hay, 'almuerzo') > 0
      OR strpos(hay, 'menu') > 0
      OR strpos(hay, 'comida') > 0
      OR strpos(hay, 'restaurante') > 0
      OR strpos(hay, 'chifa') > 0
      OR strpos(hay, 'pollo') > 0
      OR strpos(hay, 'ceviche') > 0
      OR strpos(hay, 'cevicheria') > 0
      OR (
        strpos(hay, 'socio') > 0
        AND (
          strpos(hay, 'comida') > 0
          OR strpos(hay, 'restaurante') > 0
          OR strpos(hay, 'chifa') > 0
          OR strpos(hay, 'almuerzo') > 0
          OR strpos(hay, 'menu') > 0
          OR strpos(hay, 'pollo') > 0
          OR strpos(hay, 'ceviche') > 0
          OR strpos(hay, 'cevicheria') > 0
        )
      )
        THEN 'almuerzo_socios'
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
*/
