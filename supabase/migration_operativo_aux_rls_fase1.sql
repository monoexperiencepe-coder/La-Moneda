-- =============================================================================
-- Fase 1 RLS piloto — bloque operativo auxiliar
--   public.pendientes | public.registros_tiempo | public.control_fechas
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
-- Idempotente. NO toca gastos, ingresos, financial_audit_logs ni tablas ya con RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_mutate_pendientes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(p.is_active, true)
        and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
        and not public.is_restricted_operador_account()
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.can_mutate_registros_tiempo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(p.is_active, true)
        and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
        and not public.is_restricted_operador_account()
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.can_mutate_control_fechas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(p.is_active, true)
        and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
        and not public.is_restricted_operador_account()
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.can_mutate_pendientes() from public;
revoke all on function public.can_mutate_registros_tiempo() from public;
revoke all on function public.can_mutate_control_fechas() from public;
grant execute on function public.can_mutate_pendientes() to authenticated;
grant execute on function public.can_mutate_registros_tiempo() to authenticated;
grant execute on function public.can_mutate_control_fechas() to authenticated;

-- RPC resumen vencimientos (SECURITY INVOKER → RLS en control_fechas)
create or replace function public.fetch_latest_control_fechas_by_vehicle(p_empresa_id uuid)
returns setof public.control_fechas
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (cf.vehicle_id, cf.tipo) cf.*
  from public.control_fechas cf
  where cf.empresa_id = p_empresa_id
  order by
    cf.vehicle_id nulls last,
    cf.tipo,
    cf.fecha_vencimiento desc nulls last,
    cf.id desc;
$$;

-- ---------------------------------------------------------------------------
-- public.pendientes
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'pendientes'
  loop execute format('drop policy if exists %I on public.pendientes', pol.policyname); end loop;
end $$;

alter table public.pendientes enable row level security;
alter table public.pendientes force row level security;

create policy "pendientes_select_tenant_active" on public.pendientes for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id());

create policy "pendientes_insert_tenant_editors" on public.pendientes for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_pendientes() = true and empresa_id = public.current_user_empresa_id());

create policy "pendientes_update_tenant_editors" on public.pendientes for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_pendientes() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_pendientes() = true and empresa_id = public.current_user_empresa_id());

create policy "pendientes_delete_tenant_editors" on public.pendientes for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_pendientes() = true and empresa_id = public.current_user_empresa_id());

-- ---------------------------------------------------------------------------
-- public.registros_tiempo
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'registros_tiempo'
  loop execute format('drop policy if exists %I on public.registros_tiempo', pol.policyname); end loop;
end $$;

alter table public.registros_tiempo enable row level security;
alter table public.registros_tiempo force row level security;

create policy "registros_tiempo_select_tenant_active" on public.registros_tiempo for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id());

create policy "registros_tiempo_insert_tenant_editors" on public.registros_tiempo for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_registros_tiempo() = true and empresa_id = public.current_user_empresa_id());

create policy "registros_tiempo_update_tenant_editors" on public.registros_tiempo for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_registros_tiempo() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_registros_tiempo() = true and empresa_id = public.current_user_empresa_id());

create policy "registros_tiempo_delete_tenant_editors" on public.registros_tiempo for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_registros_tiempo() = true and empresa_id = public.current_user_empresa_id());

-- ---------------------------------------------------------------------------
-- public.control_fechas
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'control_fechas'
  loop execute format('drop policy if exists %I on public.control_fechas', pol.policyname); end loop;
end $$;

alter table public.control_fechas enable row level security;
alter table public.control_fechas force row level security;

create policy "control_fechas_select_tenant_active" on public.control_fechas for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id());

create policy "control_fechas_insert_tenant_editors" on public.control_fechas for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_control_fechas() = true and empresa_id = public.current_user_empresa_id());

create policy "control_fechas_update_tenant_editors" on public.control_fechas for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_control_fechas() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_control_fechas() = true and empresa_id = public.current_user_empresa_id());

create policy "control_fechas_delete_tenant_editors" on public.control_fechas for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_control_fechas() = true and empresa_id = public.current_user_empresa_id());

-- Verificación
do $$
declare
  t text;
  n int;
  rls_on boolean;
begin
  foreach t in array array['pendientes', 'registros_tiempo', 'control_fechas'] loop
    select c.relrowsecurity into rls_on from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relkind = 'r';
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if not coalesce(rls_on, false) then raise exception 'RLS aux: % sin RLS', t; end if;
    if n < 4 then raise exception 'RLS aux: % policies=%', t, n; end if;
  end loop;
end $$;
