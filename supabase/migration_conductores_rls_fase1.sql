-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.conductores
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql (is_active_user, current_user_empresa_id)
--             is_restricted_operador_account (vehiculos fase1 / fase1_fix)
--
-- Reglas:
--   SELECT:  is_active_user() AND empresa_id = current_user_empresa_id()
--   INSERT/UPDATE/DELETE: can_mutate_conductores() + mismo tenant
--   operador / operador@: solo SELECT
--
-- NO toca: gastos, ingresos, vehiculos (ya con RLS), user_profiles, etc.
-- Idempotente.
-- =============================================================================

-- Helper escritura conductores (misma lógica que can_mutate_vehiculos)
create or replace function public.can_mutate_conductores()
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

comment on function public.can_mutate_conductores() is
  'true solo admin/contador/socio activos; nunca operador ni operador@lamoneda.com.';

revoke all on function public.can_mutate_conductores() from public;
grant execute on function public.can_mutate_conductores() to authenticated;

-- Pre-flight
do $$
declare
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.conductores where empresa_id is null;
  if n_null > 0 then
    raise warning 'conductores RLS fase1: % filas con empresa_id NULL', n_null;
  end if;

  select count(*) into n_helpers
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'is_active_user',
      'current_user_empresa_id',
      'is_restricted_operador_account',
      'can_mutate_conductores'
    );
  if n_helpers < 4 then
    raise exception 'conductores RLS fase1: faltan helpers (rls_preparation + vehiculos fix o esta migración)';
  end if;
end $$;

-- Eliminar policies previas en conductores
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conductores'
  loop
    execute format('drop policy if exists %I on public.conductores', pol.policyname);
  end loop;
end $$;

alter table public.conductores enable row level security;
alter table public.conductores force row level security;

create policy "conductores_select_tenant_active"
  on public.conductores
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "conductores_insert_tenant_editors"
  on public.conductores
  for insert
  to authenticated
  with check (
    public.is_active_user() = true
    and public.can_mutate_conductores() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "conductores_update_tenant_editors"
  on public.conductores
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_conductores() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.can_mutate_conductores() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "conductores_delete_tenant_editors"
  on public.conductores
  for delete
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_conductores() = true
    and empresa_id = public.current_user_empresa_id()
  );

comment on policy "conductores_select_tenant_active" on public.conductores is
  'Fase 1: lectura por tenant (incluye operador activo).';

comment on policy "conductores_insert_tenant_editors" on public.conductores is
  'Fase 1: alta admin/contador/socio del tenant.';

comment on policy "conductores_update_tenant_editors" on public.conductores is
  'Fase 1: edición admin/contador/socio del tenant.';

comment on policy "conductores_delete_tenant_editors" on public.conductores is
  'Fase 1: borrado admin/contador/socio del tenant.';

-- Verificación
do $$
declare
  rls_on boolean;
  n_pol int;
begin
  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'conductores' and c.relkind = 'r';

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'conductores';

  if not coalesce(rls_on, false) then
    raise exception 'conductores RLS fase1: relrowsecurity sigue false';
  end if;
  if n_pol < 4 then
    raise exception 'conductores RLS fase1: se esperaban 4 policies, hay %', n_pol;
  end if;
end $$;
