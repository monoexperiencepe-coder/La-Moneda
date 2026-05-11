-- Backfill seguro de vehiculo_numero desde vehiculo_referencia.
-- No toca montos ni elimina filas.
-- Casos: "Yaris 01", "RIO 11", "GLORY 82", cualquier texto que termine en número.

update public.inversiones_generales_vehiculo
set vehiculo_numero = cast(substring(trim(vehiculo_referencia) from '(\d{1,3})\s*$') as integer)
where trim(coalesce(vehiculo_referencia, '')) <> ''
  and substring(trim(vehiculo_referencia) from '(\d{1,3})\s*$') is not null
  and cast(substring(trim(vehiculo_referencia) from '(\d{1,3})\s*$') as integer) between 1 and 200
  and (
    vehiculo_numero is distinct from cast(substring(trim(vehiculo_referencia) from '(\d{1,3})\s*$') as integer)
  );

