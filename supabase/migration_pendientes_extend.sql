-- Extensión segura de pendientes (capa manual / Qué hacer hoy).
-- Campos extendidos en metadata JSON; columnas legacy sin cambios obligatorios.

alter table public.pendientes
  add column if not exists titulo text not null default '';

alter table public.pendientes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.pendientes.metadata is
  'tipo, prioridad_v2, mostrar_en_hoy, responsable, fecha_objetivo, relacionado_tipo, relacionado_id';
