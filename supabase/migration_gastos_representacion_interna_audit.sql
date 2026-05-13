  -- Auditoría y migración opcional: personales / socios → representacion_interna
  -- Ejecutar PRIMERO solo los SELECT en el SQL editor de Supabase (no modifica datos).
  -- Revisa conteos y valores; luego descomenta el UPDATE si procede.

  -- ─── 1) Conteo total de filas candidatas (tipo_gasto legacy / personales) ───
  SELECT count(*) AS filas_candidatas
  FROM public.gastos
  WHERE btrim(coalesce(tipo_gasto, '')) IN ('personal_socios', 'personal_socios_familiares', 'personales');

  -- ─── 2) Desglose por tipo_gasto y subtipo_gasto (valores actuales relacionados) ───
  SELECT
    btrim(coalesce(tipo_gasto, '')) AS tipo_gasto,
    btrim(coalesce(subtipo_gasto, '')) AS subtipo_gasto,
    count(*) AS n
  FROM public.gastos
  WHERE btrim(coalesce(tipo_gasto, '')) IN ('personal_socios', 'personal_socios_familiares', 'personales')
    OR (
      btrim(coalesce(tipo_gasto, '')) = 'representacion_interna'
      AND btrim(coalesce(subtipo_gasto, '')) <> ''
    )
  GROUP BY 1, 2
  ORDER BY n DESC, 1, 2;

  -- ─── 3) Filas que quedarían con UPDATE (mismo filtro que el UPDATE propuesto) ───
  SELECT count(*) AS filas_afectadas_por_update
  FROM public.gastos
  WHERE btrim(coalesce(tipo_gasto, '')) IN ('personal_socios', 'personal_socios_familiares', 'personales');

  -- ═══ Migración (OPCIONAL): descomenta y ejecuta solo tras validar conteos ═══
  -- BEGIN;
  -- UPDATE public.gastos
  -- SET tipo_gasto = 'representacion_interna'
  -- WHERE btrim(coalesce(tipo_gasto, '')) IN ('personal_socios', 'personal_socios_familiares', 'personales');
  -- COMMIT;
