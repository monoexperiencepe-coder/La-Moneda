-- Revisión manual de clasificación financiera en public.gastos.
-- No elimina tablas ni columnas existentes.

-- --- Columnas de auditoría / revisión ---
alter table public.gastos add column if not exists clasificacion_confianza numeric;
alter table public.gastos add column if not exists clasificacion_manual boolean not null default false;
alter table public.gastos add column if not exists revisado_por text;
alter table public.gastos add column if not exists revisado_at timestamptz;

comment on column public.gastos.clasificacion_confianza is
  'Confianza numérica de la clasificación automática (0–1 u otra escala definida por la app).';
comment on column public.gastos.clasificacion_manual is
  'TRUE cuando tipo/subtipo fueron confirmados o corregidos manualmente.';
comment on column public.gastos.revisado_por is
  'Identificador del usuario que revisó (email, id auth, etc.).';
comment on column public.gastos.revisado_at is
  'Marca de tiempo de la última revisión manual.';

-- --- Cola de revisión: pendientes explícitos o marcados para revisión ---
create or replace view public.gastos_pendientes_revision as
select
  g.fecha,
  g.monto,
  g.vehicle_id,
  g.comentarios,
  g.tipo_gasto,
  g.subtipo_gasto,
  (
    case
      when coalesce(btrim(g.subtipo_gasto), '') <> ''
        then coalesce(g.tipo_gasto, '') || ' · ' || g.subtipo_gasto
      else coalesce(g.tipo_gasto, g.origen_clasificacion, '')
    end
  ) as sugerencia,
  g.requiere_revision
from public.gastos g
where
  g.tipo_gasto = 'pendiente_revision'
  or g.requiere_revision = true;

comment on view public.gastos_pendientes_revision is
  'Gastos visibles para revisión manual: tipo_gasto = pendiente_revision o requiere_revision = true. sugerencia = tipo · subtipo si hay subtipo; si no, tipo u origen_clasificacion.';
