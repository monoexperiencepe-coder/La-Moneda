-- Fase 1: número de unidad visual separado del id técnico (NO destructiva).
-- NO modifica vehiculos.id, secuencias ni FKs existentes.

alter table public.vehiculos
  add column if not exists numero_unidad integer;

alter table public.vehiculos
  add column if not exists propietario_nombre text;

comment on column public.vehiculos.numero_unidad is
  'Número visible de unidad en flota (1…N por empresa). Distinto de id (PK técnica).';

comment on column public.vehiculos.propietario_nombre is
  'Nombre del propietario del vehículo (capa operativa; opcional).';

-- Unicidad por tenant (permite NULL mientras se backfillea).
create unique index if not exists vehiculos_empresa_numero_unidad_uidx
  on public.vehiculos (empresa_id, numero_unidad)
  where numero_unidad is not null;

-- ── Backfill ─────────────────────────────────────────────────────────────
-- 1) Vehículos enlazados en public.unidades → #1…#82 según vehicle_id ascendente
--    (referencia del catálogo legacy de 82 filas).
-- 2) Resto de activos sin fila en unidades → continúan la secuencia (ej. id 178 → 83).

with ordered_unidad as (
  select
    u.empresa_id,
    u.vehicle_id,
    row_number() over (
      partition by u.empresa_id
      order by u.vehicle_id asc
    )::integer as nu
  from public.unidades u
  where u.vehicle_id is not null
),
updated_from_unidades as (
  update public.vehiculos v
  set numero_unidad = ou.nu
  from ordered_unidad ou
  where v.id = ou.vehicle_id
    and v.empresa_id = ou.empresa_id
    and v.numero_unidad is distinct from ou.nu
  returning v.id
),
max_per_empresa as (
  select empresa_id, coalesce(max(numero_unidad), 0) as max_nu
  from public.vehiculos
  group by empresa_id
),
missing as (
  select
    v.id,
    v.empresa_id,
    (
      row_number() over (partition by v.empresa_id order by v.id asc)
      + m.max_nu
    )::integer as nu
  from public.vehiculos v
  join max_per_empresa m on m.empresa_id = v.empresa_id
  where v.numero_unidad is null
    and v.activo = true
)
update public.vehiculos v
set numero_unidad = m.nu
from missing m
where v.id = m.id
  and v.empresa_id = m.empresa_id;

-- Verificación (solo lectura; comentar si se ejecuta en pipeline automatizado):
-- select id, placa, numero_unidad, activo from public.vehiculos where placa = 'CAU-677';
-- select max(numero_unidad) from public.vehiculos where empresa_id = '<uuid>';
