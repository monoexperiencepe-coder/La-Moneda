-- Gastos de línea SIM / chips GPS: de administrativo_empresa → operativo_vehiculo.
-- No mueve pagos claramente de "plataforma GPS" (software / servicio), solo chips / recargas.
-- Ejecutar en Supabase SQL editor o vía migraciones del proyecto.

update public.gastos g
set
  tipo_gasto = 'operativo_vehiculo',
  subtipo_gasto = case
    when coalesce(btrim(g.subtipo_gasto), '') <> ''
      and lower(g.subtipo_gasto) !~ '^tributario'
      and (
        lower(g.subtipo_gasto) ~ '(gps.*chip|chip.*gps|recarga.*chip|chips.*claro)'
        or lower(g.subtipo_gasto) like '%gps chips%'
      )
    then btrim(g.subtipo_gasto)
    else 'GPS chips'
  end,
  es_global_flota = false,
  origen_clasificacion = case
    when coalesce(g.origen_clasificacion, '') = '' then 'migration_gps_chips_operativo'
    when g.origen_clasificacion like '%migration_gps_chips_operativo%' then g.origen_clasificacion
    else g.origen_clasificacion || ' | migration_gps_chips_operativo'
  end,
  requiere_revision = coalesce(g.requiere_revision, false) or (g.vehicle_id is null)
where
  coalesce(g.tipo_gasto, '') = 'administrativo_empresa'
  and not (
    lower(concat_ws(' ', g.motivo, g.comentarios, coalesce(g.detalle_operativo, ''), coalesce(g.categoria_real, '')))
    ~ '(plataforma\s*gps|gps\s*plataforma)'
  )
  and (
    lower(coalesce(g.subtipo_gasto, '')) ~ '(gps.*chip|chip.*gps|recarga.*chip|chips.*claro)'
    or lower(coalesce(g.sub_tipo, '')) ~ '(gps.*chip|chip.*gps|chips.*telef)'
    or lower(concat_ws(
      ' ',
      g.motivo,
      g.comentarios,
      coalesce(g.detalle_operativo, ''),
      coalesce(g.categoria_real, ''),
      coalesce(g.subcategoria, '')
    )) ~ '(chip[s]?\s*gps|gps\s*chip[s]?|recarga\s*chip[s]?|chips\s*claro|gps\s*chips)'
  );
