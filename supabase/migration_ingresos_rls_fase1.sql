-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.ingresos
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
--   (p. ej. migration_vehiculos_rls_fase1_fix.sql)
--
-- SELECT: tenant + admin/contador/socio (nunca operador ni operador@)
-- INSERT/UPDATE/DELETE: can_mutate_ingresos() + tenant
--
-- NO toca: gastos, financial_audit_logs, otras tablas.
-- Idempotente: reemplaza policies antiguas (ingresos_*_finanzas).
-- =============================================================================

create or replace function public.can_mutate_ingresos()
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

comment on function public.can_mutate_ingresos() is
  'Escritura ingresos: admin/contador/socio activos; nunca operador ni operador@lamoneda.com.';

revoke all on function public.can_mutate_ingresos() from public;
grant execute on function public.can_mutate_ingresos() to authenticated;

do $$
declare
  pol record;
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.ingresos where empresa_id is null;
  if n_null > 0 then
    raise warning 'ingresos RLS fase1: % filas con empresa_id NULL', n_null;
  end if;

  select count(*) into n_helpers
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'is_active_user',
      'current_user_empresa_id',
      'current_user_role',
      'is_restricted_operador_account',
      'can_mutate_ingresos'
    );
  if n_helpers < 5 then
    raise exception 'ingresos RLS fase1: faltan helpers (rls_preparation + vehiculos fix)';
  end if;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ingresos'
  loop
    execute format('drop policy if exists %I on public.ingresos', pol.policyname);
  end loop;
end $$;

alter table public.ingresos enable row level security;
alter table public.ingresos force row level security;

create policy "ingresos_select_tenant_finanzas"
  on public.ingresos
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio')
    and not public.is_restricted_operador_account()
  );

create policy "ingresos_insert_tenant_editors"
  on public.ingresos
  for insert
  to authenticated
  with check (
    public.is_active_user() = true
    and public.can_mutate_ingresos() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "ingresos_update_tenant_editors"
  on public.ingresos
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_ingresos() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.can_mutate_ingresos() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "ingresos_delete_tenant_editors"
  on public.ingresos
  for delete
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_ingresos() = true
    and empresa_id = public.current_user_empresa_id()
  );

comment on policy "ingresos_select_tenant_finanzas" on public.ingresos is
  'Fase 1: lectura ingresos solo admin/contador/socio del tenant; operador bloqueado.';
comment on policy "ingresos_insert_tenant_editors" on public.ingresos is
  'Fase 1: alta ingresos (can_mutate_ingresos).';
comment on policy "ingresos_update_tenant_editors" on public.ingresos is
  'Fase 1: edición ingresos (can_mutate_ingresos).';
comment on policy "ingresos_delete_tenant_editors" on public.ingresos is
  'Fase 1: borrado ingresos (can_mutate_ingresos).';

do $$
declare
  rls_on boolean;
  forced boolean;
  n_pol int;
begin
  select c.relrowsecurity, c.relforcerowsecurity
  into rls_on, forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'ingresos' and c.relkind = 'r';

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'ingresos';

  if not coalesce(rls_on, false) then
    raise exception 'ingresos RLS fase1: relrowsecurity sigue false';
  end if;
  if not coalesce(forced, false) then
    raise exception 'ingresos RLS fase1: relforcerowsecurity sigue false';
  end if;
  if n_pol <> 4 then
    raise exception 'ingresos RLS fase1: se esperaban 4 policies, hay %', n_pol;
  end if;
end $$;
