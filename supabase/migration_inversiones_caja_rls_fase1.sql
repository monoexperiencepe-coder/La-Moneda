-- =============================================================================
-- Fase 1 RLS piloto — inversiones + caja
--   public.inversiones_vehiculo
--   public.inversiones_generales_vehiculo
--   public.gastos_caja
--   public.caja_negocio_vehiculo
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
-- Idempotente. NO toca gastos, ingresos, financial_audit_logs, préstamos, etc.
-- =============================================================================

create or replace function public.can_mutate_inversiones_vehiculo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(p.is_active, true)
      and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
      and not public.is_restricted_operador_account()
    from public.user_profiles p where p.id = auth.uid() limit 1
  ), false);
$$;

create or replace function public.can_mutate_inversiones_generales_vehiculo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(p.is_active, true)
      and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
      and not public.is_restricted_operador_account()
    from public.user_profiles p where p.id = auth.uid() limit 1
  ), false);
$$;

create or replace function public.can_mutate_gastos_caja()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(p.is_active, true)
      and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
      and not public.is_restricted_operador_account()
    from public.user_profiles p where p.id = auth.uid() limit 1
  ), false);
$$;

create or replace function public.can_mutate_caja_negocio_vehiculo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(p.is_active, true)
      and lower(trim(p.role::text)) in ('admin', 'contador', 'socio')
      and not public.is_restricted_operador_account()
    from public.user_profiles p where p.id = auth.uid() limit 1
  ), false);
$$;

revoke all on function public.can_mutate_inversiones_vehiculo() from public;
revoke all on function public.can_mutate_inversiones_generales_vehiculo() from public;
revoke all on function public.can_mutate_gastos_caja() from public;
revoke all on function public.can_mutate_caja_negocio_vehiculo() from public;
grant execute on function public.can_mutate_inversiones_vehiculo() to authenticated;
grant execute on function public.can_mutate_inversiones_generales_vehiculo() to authenticated;
grant execute on function public.can_mutate_gastos_caja() to authenticated;
grant execute on function public.can_mutate_caja_negocio_vehiculo() to authenticated;

-- ---------------------------------------------------------------------------
-- public.inversiones_vehiculo
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'inversiones_vehiculo'
  loop execute format('drop policy if exists %I on public.inversiones_vehiculo', pol.policyname); end loop;
end $$;

alter table public.inversiones_vehiculo enable row level security;
alter table public.inversiones_vehiculo force row level security;

create policy "inversiones_vehiculo_select_tenant_finanzas" on public.inversiones_vehiculo for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio') and not public.is_restricted_operador_account());

create policy "inversiones_vehiculo_insert_tenant_editors" on public.inversiones_vehiculo for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_inversiones_vehiculo() = true
    and empresa_id = public.current_user_empresa_id());

create policy "inversiones_vehiculo_update_tenant_editors" on public.inversiones_vehiculo for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_inversiones_vehiculo() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_inversiones_vehiculo() = true and empresa_id = public.current_user_empresa_id());

create policy "inversiones_vehiculo_delete_tenant_editors" on public.inversiones_vehiculo for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_inversiones_vehiculo() = true and empresa_id = public.current_user_empresa_id());

-- ---------------------------------------------------------------------------
-- public.inversiones_generales_vehiculo
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'inversiones_generales_vehiculo'
  loop execute format('drop policy if exists %I on public.inversiones_generales_vehiculo', pol.policyname); end loop;
end $$;

alter table public.inversiones_generales_vehiculo enable row level security;
alter table public.inversiones_generales_vehiculo force row level security;

create policy "inversiones_generales_vehiculo_select_tenant_finanzas" on public.inversiones_generales_vehiculo for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio') and not public.is_restricted_operador_account());

create policy "inversiones_generales_vehiculo_insert_tenant_editors" on public.inversiones_generales_vehiculo for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_inversiones_generales_vehiculo() = true
    and empresa_id = public.current_user_empresa_id());

create policy "inversiones_generales_vehiculo_update_tenant_editors" on public.inversiones_generales_vehiculo for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_inversiones_generales_vehiculo() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_inversiones_generales_vehiculo() = true and empresa_id = public.current_user_empresa_id());

create policy "inversiones_generales_vehiculo_delete_tenant_editors" on public.inversiones_generales_vehiculo for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_inversiones_generales_vehiculo() = true and empresa_id = public.current_user_empresa_id());

-- ---------------------------------------------------------------------------
-- public.gastos_caja
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'gastos_caja'
  loop execute format('drop policy if exists %I on public.gastos_caja', pol.policyname); end loop;
end $$;

alter table public.gastos_caja enable row level security;
alter table public.gastos_caja force row level security;

create policy "gastos_caja_select_tenant_finanzas" on public.gastos_caja for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio') and not public.is_restricted_operador_account());

create policy "gastos_caja_insert_tenant_editors" on public.gastos_caja for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_gastos_caja() = true
    and empresa_id = public.current_user_empresa_id());

create policy "gastos_caja_update_tenant_editors" on public.gastos_caja for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_gastos_caja() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_gastos_caja() = true and empresa_id = public.current_user_empresa_id());

create policy "gastos_caja_delete_tenant_editors" on public.gastos_caja for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_gastos_caja() = true and empresa_id = public.current_user_empresa_id());

-- ---------------------------------------------------------------------------
-- public.caja_negocio_vehiculo
-- ---------------------------------------------------------------------------
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'caja_negocio_vehiculo'
  loop execute format('drop policy if exists %I on public.caja_negocio_vehiculo', pol.policyname); end loop;
end $$;

alter table public.caja_negocio_vehiculo enable row level security;
alter table public.caja_negocio_vehiculo force row level security;

create policy "caja_negocio_vehiculo_select_tenant_finanzas" on public.caja_negocio_vehiculo for select to authenticated
  using (public.is_active_user() = true and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio') and not public.is_restricted_operador_account());

create policy "caja_negocio_vehiculo_insert_tenant_editors" on public.caja_negocio_vehiculo for insert to authenticated
  with check (public.is_active_user() = true and public.can_mutate_caja_negocio_vehiculo() = true
    and empresa_id = public.current_user_empresa_id());

create policy "caja_negocio_vehiculo_update_tenant_editors" on public.caja_negocio_vehiculo for update to authenticated
  using (public.is_active_user() = true and public.can_mutate_caja_negocio_vehiculo() = true and empresa_id = public.current_user_empresa_id())
  with check (public.is_active_user() = true and public.can_mutate_caja_negocio_vehiculo() = true and empresa_id = public.current_user_empresa_id());

create policy "caja_negocio_vehiculo_delete_tenant_editors" on public.caja_negocio_vehiculo for delete to authenticated
  using (public.is_active_user() = true and public.can_mutate_caja_negocio_vehiculo() = true and empresa_id = public.current_user_empresa_id());

-- Verificación
do $$
declare t text; n int; rls_on boolean; forced boolean;
begin
  foreach t in array array[
    'inversiones_vehiculo', 'inversiones_generales_vehiculo', 'gastos_caja', 'caja_negocio_vehiculo'
  ] loop
    select c.relrowsecurity, c.relforcerowsecurity into rls_on, forced
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = t and c.relkind = 'r';
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if not coalesce(rls_on, false) then raise exception 'inversiones/caja RLS: % sin RLS', t; end if;
    if not coalesce(forced, false) then raise exception 'inversiones/caja RLS: % sin FORCE', t; end if;
    if n <> 4 then raise exception 'inversiones/caja RLS: % policies=%', t, n; end if;
  end loop;
end $$;
