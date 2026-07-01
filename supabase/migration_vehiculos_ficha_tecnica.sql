-- Ficha técnica en public.vehiculos (nullable, no destructiva).
-- NO modifica id, numero_unidad, secuencias ni FKs.

alter table public.vehiculos add column if not exists combustible text;
alter table public.vehiculos add column if not exists tipo_carroceria text;
alter table public.vehiculos add column if not exists numero_motor text;
alter table public.vehiculos add column if not exists cantidad_llaves integer;
alter table public.vehiculos add column if not exists gps_1 text;
alter table public.vehiculos add column if not exists gps_2 text;
alter table public.vehiculos add column if not exists impuesto text;
alter table public.vehiculos add column if not exists km_inicial integer;
alter table public.vehiculos add column if not exists tarjeta_propiedad text;

comment on column public.vehiculos.combustible is 'Tipo de combustible (ficha técnica; opcional).';
comment on column public.vehiculos.tipo_carroceria is 'Tipo de carrocería (SUV, sedán, etc.; opcional).';
comment on column public.vehiculos.numero_motor is 'Número de motor (opcional).';
comment on column public.vehiculos.cantidad_llaves is 'Cantidad de llaves entregadas (opcional).';
comment on column public.vehiculos.gps_1 is 'Identificador GPS 1 (opcional).';
comment on column public.vehiculos.gps_2 is 'Identificador GPS 2 (opcional).';
comment on column public.vehiculos.impuesto is 'Estado impuesto vehicular (opcional).';
comment on column public.vehiculos.km_inicial is 'Kilometraje inicial al ingreso a flota (opcional).';
comment on column public.vehiculos.tarjeta_propiedad is 'Tipo/estado tarjeta de propiedad (opcional).';
