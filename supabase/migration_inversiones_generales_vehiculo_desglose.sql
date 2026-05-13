-- Desglose por columna de la hoja Excel VALOR DE INVERSION (valor vehículo, GNV, notarial, etc.).
-- Sigue sin ser public.gastos; solo referencia de inversión inicial por unidad.

alter table public.inversiones_generales_vehiculo
  add column if not exists fecha_compra date,
  add column if not exists valor_compra_usd numeric,
  add column if not exists gasto_gnv_usd numeric,
  add column if not exists gasto_notarial_usd numeric,
  add column if not exists leg_firmas_usd numeric,
  add column if not exists seguro_usd numeric,
  add column if not exists gps_usd numeric,
  add column if not exists fundas_accesorios_usd numeric,
  add column if not exists total_equivalente_pen numeric;

comment on column public.inversiones_generales_vehiculo.fecha_compra is
  'Fecha de compra según Excel (p. ej. F.COMPRA).';
comment on column public.inversiones_generales_vehiculo.valor_compra_usd is
  'Valor del vehículo en USD (columna tipo VALOR S US$).';
comment on column public.inversiones_generales_vehiculo.total_equivalente_pen is
  'Equivalente en soles de la hoja (columna s/), referencia; el total principal sigue en monto_total/moneda.';
