-- Clasificación financiera/operativa de gastos para capa inteligente de reportes.
-- No elimina ni toca `gastos_caja` (ledger bruto/original).

alter table public.gastos add column if not exists tipo_gasto text;
alter table public.gastos add column if not exists subtipo_gasto text;
alter table public.gastos add column if not exists origen_clasificacion text;
alter table public.gastos add column if not exists es_global_flota boolean not null default false;
alter table public.gastos add column if not exists requiere_revision boolean not null default false;

comment on column public.gastos.tipo_gasto is
  'Clasificación principal para reportes: operativo_vehiculo, operativo_flota_global, administrativo_empresa, financiero, inversion, personal_socios, pendiente_revision.';
comment on column public.gastos.subtipo_gasto is
  'Subclasificación textual derivada de reglas (palabras clave/heurísticas).';
comment on column public.gastos.origen_clasificacion is
  'Origen de la clasificación, p. ej. reglas_v1, manual, ia_v1.';
comment on column public.gastos.es_global_flota is
  'TRUE cuando el gasto aplica a la flota global y no a un vehículo único.';
comment on column public.gastos.requiere_revision is
  'TRUE cuando la clasificación quedó en pendiente_revision o baja confianza.';
