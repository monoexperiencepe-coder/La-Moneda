-- Backfill de placa (y modelo vacío) en public.inversiones_generales_vehiculo desde public.vehiculos.
-- No modifica montos, public.gastos ni tablas de KPIs.
--
-- Unidad en esta BD: public.vehiculos.id (bigint, PK). No hay columna numero_unidad / nro_unidad en vehiculos;
-- la app usa vehicle_id = vehiculos.id (ver fetchVehiculos order by id).
-- Match: inversiones_generales_vehiculo.empresa_id = vehiculos.empresa_id
--    AND inversiones_generales_vehiculo.vehiculo_numero = vehiculos.id
--
-- Si tu flota no alinea vehiculo_numero con vehiculos.id, el diagnóstico mostrará sin_match > 0:
-- no ejecutar el bloque de UPDATE hasta corregir datos o ajustar la estrategia de join.

-- =============================================================================
-- 1) DIAGNÓSTICO (solo lectura; revisar resultados antes del bloque mutador)
-- =============================================================================

-- 1a) Inversiones con número de unidad y placa actual
SELECT
  i.id,
  i.empresa_id,
  i.vehiculo_referencia,
  i.vehiculo_numero,
  i.placa AS placa_actual,
  i.modelo AS modelo_actual
FROM public.inversiones_generales_vehiculo i
ORDER BY i.empresa_id, i.vehiculo_numero NULLS LAST, i.vehiculo_referencia;

-- 1b) Match propuesto: misma empresa y vehiculo_numero = vehiculos.id
SELECT
  i.id AS inversion_id,
  i.vehiculo_referencia,
  i.vehiculo_numero,
  i.placa AS placa_actual,
  v.id AS vehiculo_id,
  v.placa AS placa_vehiculos,
  v.marca,
  v.modelo AS modelo_vehiculos
FROM public.inversiones_generales_vehiculo i
LEFT JOIN public.vehiculos v
  ON v.empresa_id = i.empresa_id
 AND v.id = i.vehiculo_numero::bigint
ORDER BY i.empresa_id, i.vehiculo_numero NULLS LAST;

-- 1c) Resumen por empresa (conteos)
WITH inv AS (
  SELECT * FROM public.inversiones_generales_vehiculo
),
stats AS (
  SELECT
    i.empresa_id,
    COUNT(*)::bigint AS total_inversiones,
    COUNT(*) FILTER (WHERE i.vehiculo_numero IS NOT NULL)::bigint AS con_vehiculo_numero,
    COUNT(*) FILTER (
      WHERE i.vehiculo_numero IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.vehiculos v
          WHERE v.empresa_id = i.empresa_id AND v.id = i.vehiculo_numero::bigint
        )
    )::bigint AS matches_con_vehiculo,
    COUNT(*) FILTER (
      WHERE i.placa IS NULL OR BTRIM(i.placa) = ''
    )::bigint AS sin_placa,
    COUNT(*) FILTER (
      WHERE i.vehiculo_numero IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.vehiculos v
          WHERE v.empresa_id = i.empresa_id AND v.id = i.vehiculo_numero::bigint
        )
    )::bigint AS sin_match
  FROM inv i
  GROUP BY i.empresa_id
)
SELECT * FROM stats;

-- =============================================================================
-- 2) UPDATE condicionado (solo si no hay filas con vehiculo_numero sin vehículo)
--    Copia placa; rellena modelo solo si inversiones.modelo está vacío.
-- =============================================================================

DO $$
DECLARE
  total_inv bigint;
  con_num bigint;
  matched bigint;
  sin_placa bigint;
  sin_match bigint;
  n_updated bigint;
BEGIN
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE vehiculo_numero IS NOT NULL)::bigint,
    COUNT(*) FILTER (
      WHERE vehiculo_numero IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.vehiculos v
          WHERE v.empresa_id = i.empresa_id AND v.id = i.vehiculo_numero::bigint
        )
    )::bigint,
    COUNT(*) FILTER (WHERE placa IS NULL OR BTRIM(placa) = '')::bigint,
    COUNT(*) FILTER (
      WHERE vehiculo_numero IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.vehiculos v
          WHERE v.empresa_id = i.empresa_id AND v.id = i.vehiculo_numero::bigint
        )
    )::bigint
  INTO total_inv, con_num, matched, sin_placa, sin_match
  FROM public.inversiones_generales_vehiculo i;

  RAISE NOTICE '[inversiones_generales backfill placas] total_inversiones=%', total_inv;
  RAISE NOTICE '[inversiones_generales backfill placas] con_vehiculo_numero=%', con_num;
  RAISE NOTICE '[inversiones_generales backfill placas] matches_con_vehiculo=%', matched;
  RAISE NOTICE '[inversiones_generales backfill placas] sin_placa_antes=%', sin_placa;
  RAISE NOTICE '[inversiones_generales backfill placas] sin_match (numero sin fila en vehiculos)=%', sin_match;

  IF sin_match > 0 THEN
    RAISE NOTICE '[inversiones_generales backfill placas] UPDATE omitido: hay vehiculo_numero sin match en vehiculos (revisar join empresa_id + vehiculo_numero = vehiculos.id).';
    RETURN;
  END IF;

  IF con_num = 0 THEN
    RAISE NOTICE '[inversiones_generales backfill placas] UPDATE omitido: ninguna fila tiene vehiculo_numero.';
    RETURN;
  END IF;

  UPDATE public.inversiones_generales_vehiculo i
  SET
    placa = NULLIF(BTRIM(v.placa), ''),
    modelo = CASE
      WHEN i.modelo IS NULL OR BTRIM(COALESCE(i.modelo, '')) = ''
        THEN NULLIF(
          BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(v.marca), ''), NULLIF(BTRIM(v.modelo), ''))),
          ''
        )
      ELSE i.modelo
    END
  FROM public.vehiculos v
  WHERE i.empresa_id = v.empresa_id
    AND i.vehiculo_numero IS NOT NULL
    AND v.id = i.vehiculo_numero::bigint
    AND NULLIF(BTRIM(v.placa), '') IS NOT NULL;

  GET DIAGNOSTICS n_updated = ROW_COUNT;
  RAISE NOTICE '[inversiones_generales backfill placas] Filas actualizadas (placa/modelo desde vehiculos): %', n_updated;
END $$;

-- Verificación post (placas aún vacías con número asignado)
SELECT
  COUNT(*) FILTER (WHERE vehiculo_numero IS NOT NULL AND (placa IS NULL OR BTRIM(placa) = ''))::bigint
    AS inversiones_con_numero_sin_placa
FROM public.inversiones_generales_vehiculo;
