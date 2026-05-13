-- Normaliza subtipo_gasto a "Batería" en gastos operativos por vehículo cuando el texto
-- sugiere batería (motivo, comentarios o subtipo previo). UPDATE idempotente: no INSERT,
-- no duplica filas; no modifica monto, tipo_gasto ni columna tipo (Fact).
--
-- Ejecutar en Supabase SQL editor o pipeline de migraciones.

UPDATE public.gastos g
SET subtipo_gasto = 'Batería'
WHERE
  COALESCE(btrim(g.subtipo_gasto), '') IS DISTINCT FROM 'Batería'
  AND COALESCE(g.tipo_gasto, '') = 'operativo_vehiculo'
  AND (
    LOWER(
      COALESCE(g.motivo, '')
      || ' '
      || COALESCE(g.comentarios, '')
      || ' '
      || COALESCE(g.subtipo_gasto, '')
    ) LIKE '%bateria%'
    OR LOWER(
      COALESCE(g.motivo, '')
      || ' '
      || COALESCE(g.comentarios, '')
      || ' '
      || COALESCE(g.subtipo_gasto, '')
    ) LIKE '%batería%'
  );
