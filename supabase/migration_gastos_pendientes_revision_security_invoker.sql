-- =============================================================================
-- FIX — public.gastos_pendientes_revision (solo vista)
-- =============================================================================
-- Corrige error: "cannot change name of view column fecha to id"
-- al recrear la vista con columnas distintas a la definición original.
--
-- NO toca RLS/policies de public.gastos ni otras tablas.
-- Idempotente.
--
-- Columnas (orden y nombres = migration_gastos_revision_manual.sql):
--   fecha, monto, vehicle_id, comentarios, tipo_gasto, subtipo_gasto,
--   sugerencia, requiere_revision
-- =============================================================================

drop view if exists public.gastos_pendientes_revision;

create view public.gastos_pendientes_revision
with (security_invoker = true)
as
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
  'Cola revisión manual (legacy en frontend; la app usa public.gastos). security_invoker=true respeta RLS de gastos.';

revoke all on table public.gastos_pendientes_revision from public;
revoke all on table public.gastos_pendientes_revision from anon;
revoke all on table public.gastos_pendientes_revision from authenticated;
grant select on table public.gastos_pendientes_revision to authenticated;

do $$
declare
  col_list text;
  invoker_ok boolean;
begin
  select string_agg(a.attname, ', ' order by a.attnum)
  into col_list
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'gastos_pendientes_revision'
    and c.relkind = 'v'
    and a.attnum > 0
    and not a.attisdropped;

  if col_list is distinct from
    'fecha, monto, vehicle_id, comentarios, tipo_gasto, subtipo_gasto, sugerencia, requiere_revision'
  then
    raise exception 'gastos_pendientes_revision: columnas=% (esperado fecha,...,requiere_revision)', col_list;
  end if;

  select coalesce(
    (
      select c.reloptions @> array['security_invoker=true']
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relname = 'gastos_pendientes_revision' and c.relkind = 'v'
    ),
    false
  ) into invoker_ok;

  if not invoker_ok then
    raise warning 'gastos_pendientes_revision: security_invoker no detectado; en PG15+ usar ALTER VIEW ... SET (security_invoker=true)';
  end if;
end $$;
