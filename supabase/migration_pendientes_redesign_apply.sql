-- Pendientes del equipo — migración combinada (NO destructiva).
-- Ejecutar en Supabase SQL Editor si crear/editar pendientes falla por columnas faltantes.
-- Incluye: migration_pendientes_extend.sql + migration_pendientes_resolucion.sql

-- Capa manual (título + metadata JSON)
alter table public.pendientes
  add column if not exists titulo text not null default '';

alter table public.pendientes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.pendientes.metadata is
  'tipo, prioridad_v2, mostrar_en_hoy, responsable, fecha_objetivo, relacionado_tipo, relacionado_id, created_by, resolved_at, deleted_at';

-- Autoría, resolución y soft delete (columnas opcionales; la app también usa metadata)
alter table public.pendientes
  add column if not exists created_by uuid;

alter table public.pendientes
  add column if not exists resolved_at timestamptz;

alter table public.pendientes
  add column if not exists resolved_by uuid;

alter table public.pendientes
  add column if not exists deleted_at timestamptz;

comment on column public.pendientes.created_by is 'Usuario que creó el pendiente (auth.users.id).';
comment on column public.pendientes.resolved_at is 'Instante de resolución (estado RESUELTO).';
comment on column public.pendientes.resolved_by is 'Usuario que resolvió el pendiente.';
comment on column public.pendientes.deleted_at is 'Soft delete; null = activo en consultas.';
