-- =============================================================================
-- Auditoría y normalización opcional de `subtipo_gasto` para operativos
-- =============================================================================
-- Mapeo canónico completo: `src/utils/operativoSubtipo.ts`.
-- Este script solo audita y ofrece un UPDATE comentado (aprox. SQL).
--
-- UPDATE (comentado): solo `tipo_gasto = 'operativo_vehiculo'` y columna
-- `subtipo_gasto`. No toca montos, fechas, tipo_gasto, tipo/sub_tipo/categoria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Conteo por valor actual de subtipo_gasto
-- -----------------------------------------------------------------------------
SELECT
  coalesce(nullif(trim(subtipo_gasto), ''), '(vacío)') AS subtipo_gasto_actual,
  count(*)::bigint AS n
FROM public.gastos
WHERE tipo_gasto = 'operativo_vehiculo'
GROUP BY 1
ORDER BY n DESC, 1;

-- -----------------------------------------------------------------------------
-- 2) Conteo por subtipo sugerido (aproximación SQL; alinear con operativoSubtipo.ts)
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    id,
    subtipo_gasto,
    translate(lower(trim(coalesce(subtipo_gasto, ''))), 'áéíóúüñ', 'aeiouun') AS nk
  FROM public.gastos
  WHERE tipo_gasto = 'operativo_vehiculo'
),
mapped AS (
  SELECT
    id,
    subtipo_gasto,
    CASE
      WHEN trim(coalesce(subtipo_gasto, '')) = '' THEN NULL
      WHEN nk IN (
        'motor', 'bateria', 'gps_chips', 'combustible', 'documentos', 'multas_tramites',
        'mantenimiento', 'accesorios', 'llantas', 'frenos', 'suspension', 'electricidad', 'gnv',
        'aire_acondicionado', 'interior', 'impuesto_vehicular', 'planchado_pintura',
        'otros_operativo'
      ) THEN nk
      WHEN nk IN ('arreglo motor', 'arreglo_motor') THEN 'motor'
      WHEN nk IN ('multas_permisos_tramites', 'multas permisos tramites')
        OR nk LIKE '%multas_permisos_tramites%'
        OR position('multas_permisos' in nk) > 0
      THEN 'multas_tramites'
      WHEN nk LIKE '%documentos vehiculares%'
        OR nk LIKE '%tramites vehiculares%'
        OR nk LIKE '%tramite vehicular%'
        OR nk LIKE '%tramites legales%'
        OR nk LIKE '%tramite legal%'
        OR nk LIKE '%permiso municipal%'
        OR nk LIKE '%permisos municipales%'
        OR nk LIKE '%multa%'
        OR nk LIKE '%papeleta%'
        OR nk LIKE '%sunat%'
        OR nk IN ('sat', 'permiso', 'permisos', 'tramite', 'tramites')
        OR nk LIKE 'sat %'
        OR nk LIKE '% sat'
        OR nk LIKE '% sat %'
        OR nk LIKE '%revision tecnica%'
        OR nk LIKE '%revisiones%'
        OR nk LIKE '%brevete%'
        OR nk LIKE '%licencia%'
        OR (nk LIKE '%permiso%' AND nk LIKE '%vehicular%')
        OR (nk LIKE '%tramite%' AND nk LIKE '%vehicular%')
      THEN 'multas_tramites'
      WHEN nk LIKE '%bater%' THEN 'bateria'
      WHEN nk LIKE '%gps%' OR nk LIKE '%chip%' THEN 'gps_chips'
      WHEN nk LIKE '%combust%' OR nk LIKE '%gasolin%' OR nk LIKE '%diesel%' THEN 'combustible'
      WHEN nk LIKE '%soat%' OR nk LIKE '%afocat%' THEN 'documentos'
      WHEN nk LIKE '%manten%' THEN 'mantenimiento'
      WHEN nk LIKE '%llant%' THEN 'llantas'
      WHEN nk LIKE '%fren%' THEN 'frenos'
      WHEN nk LIKE '%suspens%' OR nk LIKE '%direccion%' THEN 'suspension'
      WHEN nk LIKE '%electr%' THEN 'electricidad'
      WHEN nk LIKE '%gnv%' THEN 'gnv'
      WHEN nk LIKE '%aire%' AND nk LIKE '%acond%' THEN 'aire_acondicionado'
      WHEN nk LIKE '%impuesto%' OR nk LIKE '%vehicular%' THEN 'impuesto_vehicular'
      WHEN nk LIKE '%planchad%' OR nk LIKE '%pintur%' THEN 'planchado_pintura'
      WHEN nk LIKE '%forro%' OR nk LIKE '%funda%' OR nk LIKE '%interior%' THEN 'interior'
      WHEN nk LIKE '%accesor%' OR nk LIKE '%repuesto%' OR nk LIKE '%autoparte%' THEN 'accesorios'
      ELSE 'otros_operativo'
    END AS sugerido
  FROM base
)
SELECT
  coalesce(sugerido::text, '(vacío)') AS subtipo_sugerido,
  count(*)::bigint AS n
FROM mapped
GROUP BY 1
ORDER BY n DESC, 1;

-- -----------------------------------------------------------------------------
-- 3) Preview: hasta 100 filas (actual vs sugerido) donde difieren
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT
    id,
    fecha,
    monto,
    subtipo_gasto,
    translate(lower(trim(coalesce(subtipo_gasto, ''))), 'áéíóúüñ', 'aeiouun') AS nk
  FROM public.gastos
  WHERE tipo_gasto = 'operativo_vehiculo'
),
mapped AS (
  SELECT
    id,
    fecha,
    monto,
    subtipo_gasto AS actual,
    CASE
      WHEN trim(coalesce(subtipo_gasto, '')) = '' THEN NULL
      WHEN nk IN (
        'motor', 'bateria', 'gps_chips', 'combustible', 'documentos', 'multas_tramites',
        'mantenimiento', 'accesorios', 'llantas', 'frenos', 'suspension', 'electricidad', 'gnv',
        'aire_acondicionado', 'interior', 'impuesto_vehicular', 'planchado_pintura',
        'otros_operativo'
      ) THEN nk
      WHEN nk IN ('arreglo motor', 'arreglo_motor') THEN 'motor'
      WHEN nk IN ('multas_permisos_tramites', 'multas permisos tramites')
        OR nk LIKE '%multas_permisos_tramites%'
        OR position('multas_permisos' in nk) > 0
      THEN 'multas_tramites'
      WHEN nk LIKE '%documentos vehiculares%'
        OR nk LIKE '%tramites vehiculares%'
        OR nk LIKE '%tramite vehicular%'
        OR nk LIKE '%tramites legales%'
        OR nk LIKE '%tramite legal%'
        OR nk LIKE '%permiso municipal%'
        OR nk LIKE '%permisos municipales%'
        OR nk LIKE '%multa%'
        OR nk LIKE '%papeleta%'
        OR nk LIKE '%sunat%'
        OR nk IN ('sat', 'permiso', 'permisos', 'tramite', 'tramites')
        OR nk LIKE 'sat %'
        OR nk LIKE '% sat'
        OR nk LIKE '% sat %'
        OR nk LIKE '%revision tecnica%'
        OR nk LIKE '%revisiones%'
        OR nk LIKE '%brevete%'
        OR nk LIKE '%licencia%'
        OR (nk LIKE '%permiso%' AND nk LIKE '%vehicular%')
        OR (nk LIKE '%tramite%' AND nk LIKE '%vehicular%')
      THEN 'multas_tramites'
      WHEN nk LIKE '%bater%' THEN 'bateria'
      WHEN nk LIKE '%gps%' OR nk LIKE '%chip%' THEN 'gps_chips'
      WHEN nk LIKE '%combust%' OR nk LIKE '%gasolin%' OR nk LIKE '%diesel%' THEN 'combustible'
      WHEN nk LIKE '%soat%' OR nk LIKE '%afocat%' THEN 'documentos'
      WHEN nk LIKE '%manten%' THEN 'mantenimiento'
      WHEN nk LIKE '%llant%' THEN 'llantas'
      WHEN nk LIKE '%fren%' THEN 'frenos'
      WHEN nk LIKE '%suspens%' OR nk LIKE '%direccion%' THEN 'suspension'
      WHEN nk LIKE '%electr%' THEN 'electricidad'
      WHEN nk LIKE '%gnv%' THEN 'gnv'
      WHEN nk LIKE '%aire%' AND nk LIKE '%acond%' THEN 'aire_acondicionado'
      WHEN nk LIKE '%impuesto%' OR nk LIKE '%vehicular%' THEN 'impuesto_vehicular'
      WHEN nk LIKE '%planchad%' OR nk LIKE '%pintur%' THEN 'planchado_pintura'
      WHEN nk LIKE '%forro%' OR nk LIKE '%funda%' OR nk LIKE '%interior%' THEN 'interior'
      WHEN nk LIKE '%accesor%' OR nk LIKE '%repuesto%' OR nk LIKE '%autoparte%' THEN 'accesorios'
      ELSE 'otros_operativo'
    END AS sugerido,
    nk
  FROM base
)
SELECT id, fecha, monto, actual, sugerido
FROM mapped
WHERE sugerido IS NOT NULL
  AND trim(coalesce(actual, '')) <> ''
  AND nk <> sugerido
ORDER BY fecha DESC
LIMIT 100;

-- -----------------------------------------------------------------------------
-- 3b) Preview enfocado: legacy multas_permisos_tramites → multas_tramites
-- -----------------------------------------------------------------------------
SELECT
  id,
  fecha,
  monto,
  trim(subtipo_gasto) AS actual,
  'multas_tramites'::text AS sugerido
FROM public.gastos
WHERE tipo_gasto = 'operativo_vehiculo'
  AND translate(lower(trim(coalesce(subtipo_gasto, ''))), 'áéíóúüñ', 'aeiouun') IN (
    'multas_permisos_tramites',
    'multas permisos tramites'
  )
ORDER BY fecha DESC
LIMIT 100;

-- -----------------------------------------------------------------------------
-- 4) UPDATE masivo (comentado). Descomentar solo tras validar el preview.
-- -----------------------------------------------------------------------------
/*
WITH base AS (
  SELECT
    id,
    subtipo_gasto,
    translate(lower(trim(coalesce(subtipo_gasto, ''))), 'áéíóúüñ', 'aeiouun') AS nk
  FROM public.gastos
  WHERE tipo_gasto = 'operativo_vehiculo'
),
mapped AS (
  SELECT
    id,
    subtipo_gasto,
    CASE
      WHEN trim(coalesce(subtipo_gasto, '')) = '' THEN NULL
      WHEN nk IN (
        'motor', 'bateria', 'gps_chips', 'combustible', 'documentos', 'multas_tramites',
        'mantenimiento', 'accesorios', 'llantas', 'frenos', 'suspension', 'electricidad', 'gnv',
        'aire_acondicionado', 'interior', 'impuesto_vehicular', 'planchado_pintura',
        'otros_operativo'
      ) THEN nk
      WHEN nk IN ('arreglo motor', 'arreglo_motor') THEN 'motor'
      WHEN nk IN ('multas_permisos_tramites', 'multas permisos tramites')
        OR nk LIKE '%multas_permisos_tramites%'
        OR position('multas_permisos' in nk) > 0
      THEN 'multas_tramites'
      WHEN nk LIKE '%documentos vehiculares%'
        OR nk LIKE '%tramites vehiculares%'
        OR nk LIKE '%tramite vehicular%'
        OR nk LIKE '%tramites legales%'
        OR nk LIKE '%tramite legal%'
        OR nk LIKE '%permiso municipal%'
        OR nk LIKE '%permisos municipales%'
        OR nk LIKE '%multa%'
        OR nk LIKE '%papeleta%'
        OR nk LIKE '%sunat%'
        OR nk IN ('sat', 'permiso', 'permisos', 'tramite', 'tramites')
        OR nk LIKE 'sat %'
        OR nk LIKE '% sat'
        OR nk LIKE '% sat %'
        OR nk LIKE '%revision tecnica%'
        OR nk LIKE '%revisiones%'
        OR nk LIKE '%brevete%'
        OR nk LIKE '%licencia%'
        OR (nk LIKE '%permiso%' AND nk LIKE '%vehicular%')
        OR (nk LIKE '%tramite%' AND nk LIKE '%vehicular%')
      THEN 'multas_tramites'
      WHEN nk LIKE '%bater%' THEN 'bateria'
      WHEN nk LIKE '%gps%' OR nk LIKE '%chip%' THEN 'gps_chips'
      WHEN nk LIKE '%combust%' OR nk LIKE '%gasolin%' OR nk LIKE '%diesel%' THEN 'combustible'
      WHEN nk LIKE '%soat%' OR nk LIKE '%afocat%' THEN 'documentos'
      WHEN nk LIKE '%manten%' THEN 'mantenimiento'
      WHEN nk LIKE '%llant%' THEN 'llantas'
      WHEN nk LIKE '%fren%' THEN 'frenos'
      WHEN nk LIKE '%suspens%' OR nk LIKE '%direccion%' THEN 'suspension'
      WHEN nk LIKE '%electr%' THEN 'electricidad'
      WHEN nk LIKE '%gnv%' THEN 'gnv'
      WHEN nk LIKE '%aire%' AND nk LIKE '%acond%' THEN 'aire_acondicionado'
      WHEN nk LIKE '%impuesto%' OR nk LIKE '%vehicular%' THEN 'impuesto_vehicular'
      WHEN nk LIKE '%planchad%' OR nk LIKE '%pintur%' THEN 'planchado_pintura'
      WHEN nk LIKE '%forro%' OR nk LIKE '%funda%' OR nk LIKE '%interior%' THEN 'interior'
      WHEN nk LIKE '%accesor%' OR nk LIKE '%repuesto%' OR nk LIKE '%autoparte%' THEN 'accesorios'
      ELSE 'otros_operativo'
    END AS sugerido,
    nk
  FROM base
)
UPDATE public.gastos g
SET subtipo_gasto = m.sugerido
FROM mapped m
WHERE g.id = m.id
  AND m.sugerido IS NOT NULL
  AND trim(coalesce(m.subtipo_gasto, '')) <> ''
  AND m.nk <> m.sugerido;
*/
