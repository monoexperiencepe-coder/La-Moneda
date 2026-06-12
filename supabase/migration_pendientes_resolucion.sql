-- Pendientes: resolución, autoría y soft delete (migración mínima, no destructiva).
-- Impacto: solo ADD COLUMN IF NOT EXISTS; no modifica filas existentes.
-- Rollback:
--   alter table public.pendientes drop column if exists created_by;
--   alter table public.pendientes drop column if exists resolved_at;
--   alter table public.pendientes drop column if exists resolved_by;
--   alter table public.pendientes drop column if exists deleted_at;
-- Riesgo: bajo. La app también persiste estos campos en metadata JSON como respaldo.

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
