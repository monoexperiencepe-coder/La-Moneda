-- Fecha de inicio de contrato para conductores (campo operativo, no existía en schema).
alter table public.conductores
  add column if not exists fecha_inicio_contrato date;

comment on column public.conductores.fecha_inicio_contrato is
  'Fecha de inicio del contrato del conductor (registro UI / hoja CONDUCTORES).';
