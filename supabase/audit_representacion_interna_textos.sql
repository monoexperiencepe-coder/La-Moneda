-- =============================================================================
-- Auditoría SOLO LECTURA: representación interna (textos reales)
-- =============================================================================
-- tipo_gasto = 'representacion_interna'
-- No modifica datos.
--
-- Preview reclasificación v2 (conteos sugeridos + 50 ejemplos, UPDATE comentado):
--   supabase/migration_representacion_interna_subtipos_v2.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Detalle por registro (export / revisión manual)
-- -----------------------------------------------------------------------------
SELECT
  g.id,
  g.fecha,
  g.motivo,
  g.comentarios,
  g.tipo,
  g.sub_tipo,
  g.subtipo_gasto AS subtipo_gasto_actual,
  g.monto
FROM public.gastos g
WHERE g.tipo_gasto = 'representacion_interna'
ORDER BY g.fecha DESC, g.id DESC;

-- -----------------------------------------------------------------------------
-- 2a) Palabras frecuentes (tokens ≥ 4 caracteres) en motivo + comentarios + sub_tipo
-- -----------------------------------------------------------------------------
WITH src AS (
  SELECT
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
    ) AS blob
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
tok AS (
  SELECT
    trim(
      both
      FROM
        regexp_split_to_table(
          regexp_replace(blob, '[^a-z0-9]+', ' ', 'gi'),
          ' '
        )
    ) AS w
  FROM src
  WHERE length(blob) > 0
)
SELECT
  w AS palabra,
  count(*) AS n
FROM tok
WHERE length(w) >= 4
GROUP BY 1
ORDER BY n DESC, 1
LIMIT 120;

-- -----------------------------------------------------------------------------
-- 2b) Frases / bigramas (palabra consecutiva) en motivo + comentarios + sub_tipo
-- -----------------------------------------------------------------------------
WITH src AS (
  SELECT
    g.id,
    regexp_split_to_array(
      trim(
        both
        FROM
          regexp_replace(
            lower(
              translate(
                concat_ws(
                  ' ',
                  coalesce(g.motivo, ''),
                  coalesce(g.comentarios, ''),
                  coalesce(g.sub_tipo, '')
                ),
                'áéíóúñüÁÉÍÓÚÑÜ',
                'aeiounuAEIOUNU'
              )
            ),
            '[^a-z0-9]+',
            ' ',
            'gi'
          )
      ),
      '\s+'
    ) AS arr
  FROM public.gastos g
  WHERE g.tipo_gasto = 'representacion_interna'
),
w AS (
  SELECT
    s.id,
    u.word,
    u.ord
  FROM src s
  CROSS JOIN LATERAL unnest(s.arr) WITH ORDINALITY AS u(word, ord)
  WHERE cardinality(s.arr) >= 2
  AND length(trim(u.word)) >= 1
),
pairs AS (
  SELECT
    w1.word || ' ' || w2.word AS bigrama
  FROM w w1
  JOIN w w2 ON w2.id = w1.id
  AND w2.ord = w1.ord + 1
  WHERE length(w1.word) >= 3
  AND length(w2.word) >= 3
)
SELECT
  bigrama,
  count(*) AS n
FROM pairs
GROUP BY 1
ORDER BY n DESC, 1
LIMIT 80;
