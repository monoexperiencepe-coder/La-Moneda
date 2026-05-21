-- =============================================================================
-- FIX Fase 1 RLS — public.vehiculos (operador no debe UPDATE/INSERT/DELETE)
-- =============================================================================
-- Ejecutar si operador@ puede mutar vehiculos:
--   1) RLS estaba OFF (policies inactivas)
--   2) user_profiles.role del operador@ no es 'operador' (p. ej. socio/contador)
--   3) Policies usaban solo current_user_role() sin bloquear cuenta operador@
--
-- Idempotente. Solo public.vehiculos. No toca otras tablas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (vehiculos + alinear con app: operador@ = solo lectura)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(p.role::text))
  from public.user_profiles p
  where p.id = auth.uid()
  limit 1;
$$;

comment on function public.current_user_role() is
  'Rol normalizado (lower) del usuario autenticado. NULL sin perfil.';

/** Cuenta operador restringida (email operador@ o rol operador en perfil). */
create or replace function public.is_restricted_operador_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        lower(trim(p.role::text)) = 'operador'
        or lower(trim(p.email)) = lower(trim(coalesce(
          nullif(current_setting('app.restricted_operador_email', true), ''),
          'operador@lamoneda.com'
        )))
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    true
  );
$$;

comment on function public.is_restricted_operador_account() is
  'true si auth.uid() es operador (rol o email operador@). Sin perfil → true (sin escritura).';

/** Escritura vehiculos: admin/contador/socio activos, nunca operador ni operador@. */
create or replace function public.can_mutate_vehiculos()
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

comment on function public.can_mutate_vehiculos() is
  'true solo para admin/contador/socio activos que no sean cuenta operador restringida.';

revoke all on function public.is_restricted_operador_account() from public;
revoke all on function public.can_mutate_vehiculos() from public;
grant execute on function public.is_restricted_operador_account() to authenticated;
grant execute on function public.can_mutate_vehiculos() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies vehiculos (reemplazo total)
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehiculos'
  loop
    execute format('drop policy if exists %I on public.vehiculos', pol.policyname);
  end loop;
end $$;

alter table public.vehiculos enable row level security;
alter table public.vehiculos force row level security;

create policy "vehiculos_select_tenant_active"
  on public.vehiculos
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "vehiculos_insert_tenant_editors"
  on public.vehiculos
  for insert
  to authenticated
  with check (
    public.is_active_user() = true
    and public.can_mutate_vehiculos() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "vehiculos_update_tenant_editors"
  on public.vehiculos
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_vehiculos() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.can_mutate_vehiculos() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "vehiculos_delete_tenant_editors"
  on public.vehiculos
  for delete
  to authenticated
  using (
    public.is_active_user() = true
    and public.can_mutate_vehiculos() = true
    and empresa_id = public.current_user_empresa_id()
  );

-- ---------------------------------------------------------------------------
-- Verificación inmediata (levanta exception si RLS sigue OFF)
-- ---------------------------------------------------------------------------
do $$
declare
  rls_on boolean;
  n_pol int;
begin
  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'vehiculos' and c.relkind = 'r';

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'vehiculos';

  if not coalesce(rls_on, false) then
    raise exception 'vehiculos RLS FIX: relrowsecurity sigue false tras ENABLE';
  end if;
  if n_pol < 4 then
    raise exception 'vehiculos RLS FIX: se esperaban >= 4 policies, hay %', n_pol;
  end if;
end $$;
