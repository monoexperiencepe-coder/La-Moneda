-- Ingresos extraordinarios (sin vehículo obligatorio)
-- Ejecutar en Supabase SQL Editor antes de registrar ingresos no vehiculares desde la UI.

alter table public.ingresos
  alter column vehicle_id drop not null;

alter table public.ingresos
  drop constraint if exists ingresos_vehicle_id_fkey;

alter table public.ingresos
  add constraint ingresos_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehiculos (id)
  on delete set null;

alter table public.ingresos
  add column if not exists es_extraordinario boolean not null default false;

comment on column public.ingresos.es_extraordinario is
  'true = ingreso de empresa sin unidad (vehicle_id null). false = ingreso vehicular histórico o nuevo.';

create index if not exists idx_ingresos_es_extraordinario
  on public.ingresos (empresa_id, es_extraordinario)
  where es_extraordinario = true;
