-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.kilometrajes
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
--
-- Reglas:
--   SELECT:  is_active_user() AND empresa_id = current_user_empresa_id()
--   INSERT/UPDATE/DELETE: can_mutate_kilometrajes() + mismo tenant
--   operador / operador@: solo SELECT (Control KMS lectura; sin alta/baja)
--
-- NO toca: gastos, ingresos, vehiculos, conductores, unidades, etc.
-- Idempotente.
-- =============================================================================

create or replace function public.can_mutate_kilometrajes()
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

comment on function public.can_mutate_kilometrajes() is
  'true solo admin/contador/socio activos; nunca operador ni operador@lamoneda.com.';

revoke all on function public.can_mutate_kilometrajes() from public;
grant execute on function public.can_mutate_kilometrajes() to authenticated;

do $$
declare
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.kilometrajes where empresa_id is null;
  if n_null > 0 then
    raise warning 'kilometrajes RLS fase1: % filas con empresa_id NULL', n_null;
  end if;

  select count(*) into n_helpers
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'is_active_user',
      'current_user_empresa_id',
      'is_restricted_operador_account',
      'can_mutate_kilometrajes'
    );
  if n_helpers < 4 then
    raise exception 'kilometrajes RLS fase1: faltan helpers (rls_preparation + piloto vehiculos)';
  end if;
end $$;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kilometrajes'
  loop
    execute format('drop policy if exists %I on public.kilometrajes', pol.policyname);
  end loop;
end $$;

alter table public.kilometrajes enable row level security;
alter table public.kilometrajes force row level security;

create policy "kilometrajes_select_tenant_active"
  on public.kilometrajes
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "kilometrajes_insert_tenant_editors"
  on public.kilometrajes
  for insert
  to authenticated
  with check (
    public.is_active_user() = true
    and public.can_mutate_kilometrajes() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "kilometrajes_update_tenant_editors"
  on public.kilometrajes
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_kilometrajes() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.can_mutate_kilometrajes() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "kilometrajes_delete_tenant_editors"
  on public.kilometrajes
  for delete
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_kilometrajes() = true
    and empresa_id = public.current_user_empresa_id()
  );

comment on policy "kilometrajes_select_tenant_active" on public.kilometrajes is
  'Fase 1: lectura por tenant (operador: Control KMS / dashboards).';

comment on policy "kilometrajes_insert_tenant_editors" on public.kilometrajes is
  'Fase 1: alta admin/contador/socio (Mantenimiento / registro KM).';

comment on policy "kilometrajes_update_tenant_editors" on public.kilometrajes is
  'Fase 1: edición admin/contador/socio.';

comment on policy "kilometrajes_delete_tenant_editors" on public.kilometrajes is
  'Fase 1: borrado admin/contador/socio.';

do $$
declare
  rls_on boolean;
  n_pol int;
begin
  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'kilometrajes' and c.relkind = 'r';

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'kilometrajes';

  if not coalesce(rls_on, false) then
    raise exception 'kilometrajes RLS fase1: relrowsecurity sigue false';
  end if;
  if n_pol < 4 then
    raise exception 'kilometrajes RLS fase1: se esperaban 4 policies, hay %', n_pol;
  end if;
end $$;
