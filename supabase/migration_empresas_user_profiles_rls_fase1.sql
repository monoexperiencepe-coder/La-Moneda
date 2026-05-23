-- =============================================================================
-- Fase 1 RLS — tablas de identidad / tenant (cierre seguridad)
--   public.empresas
--   public.user_profiles
--   public.gastos_pendientes_revision (vista → security_invoker + grants)
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql (+ helpers current_user_empresa_id, is_admin, is_active_user)
--
-- NO toca: gastos, ingresos, financial_audit_logs, ni tablas financieras ya protegidas.
-- NO modifica datos.
-- Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.empresas — solo lectura del tenant propio
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'empresas'
  loop
    execute format('drop policy if exists %I on public.empresas', pol.policyname);
  end loop;
end $$;

alter table public.empresas enable row level security;
alter table public.empresas force row level security;

create policy "empresas_select_tenant"
  on public.empresas
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and id = public.current_user_empresa_id()
  );

comment on policy "empresas_select_tenant" on public.empresas is
  'Usuario activo lee solo la fila de su empresa (user_profiles.empresa_id). Sin mutaciones desde app.';

-- ---------------------------------------------------------------------------
-- public.user_profiles — propio perfil + admin del tenant
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', pol.policyname);
  end loop;
end $$;

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

create policy "user_profiles_select_own"
  on public.user_profiles
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and auth.uid() = id
  );

create policy "user_profiles_select_admin_tenant"
  on public.user_profiles
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  );

create policy "user_profiles_update_admin_tenant"
  on public.user_profiles
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  );

comment on policy "user_profiles_select_own" on public.user_profiles is
  'Login / AuthContext: cada usuario lee su fila (auth.uid() = id).';
comment on policy "user_profiles_select_admin_tenant" on public.user_profiles is
  'Admin activo lee perfiles de su empresa (p. ej. historial del sistema).';
comment on policy "user_profiles_update_admin_tenant" on public.user_profiles is
  'Solo admin activo puede actualizar perfiles del mismo tenant. Usuarios normales no UPDATE propio.';

-- INSERT/DELETE: sin policies → denegado para authenticated (altas vía service_role / triggers).

-- ---------------------------------------------------------------------------
-- Grants mínimos (anon sin escritura ni lectura directa)
-- ---------------------------------------------------------------------------
revoke all on table public.empresas from public;
revoke all on table public.empresas from anon;
revoke all on table public.empresas from authenticated;
grant select on table public.empresas to authenticated;

revoke all on table public.user_profiles from public;
revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select, update on table public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- public.gastos_pendientes_revision — aplicar en archivo aparte (misma transacción opcional):
--   migration_gastos_pendientes_revision_security_invoker.sql
-- CREATE OR REPLACE no puede cambiar columnas; DROP+CREATE con security_invoker.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verificación (empresas + user_profiles)
-- ---------------------------------------------------------------------------
do $$
declare
  n_emp int;
  n_prof int;
  rls_e boolean;
  forced_e boolean;
  rls_p boolean;
  forced_p boolean;
begin
  select c.relrowsecurity, c.relforcerowsecurity
  into rls_e, forced_e
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'empresas' and c.relkind = 'r';

  select count(*) into n_emp
  from pg_policies where schemaname = 'public' and tablename = 'empresas';

  if not coalesce(rls_e, false) then
    raise exception 'empresas/user_profiles RLS: empresas sin RLS';
  end if;
  if not coalesce(forced_e, false) then
    raise exception 'empresas/user_profiles RLS: empresas sin FORCE';
  end if;
  if n_emp <> 1 then
    raise exception 'empresas/user_profiles RLS: empresas policies=% (esperado 1)', n_emp;
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
  into rls_p, forced_p
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'user_profiles' and c.relkind = 'r';

  select count(*) into n_prof
  from pg_policies where schemaname = 'public' and tablename = 'user_profiles';

  if not coalesce(rls_p, false) then
    raise exception 'empresas/user_profiles RLS: user_profiles sin RLS';
  end if;
  if not coalesce(forced_p, false) then
    raise exception 'empresas/user_profiles RLS: user_profiles sin FORCE';
  end if;
  if n_prof <> 3 then
    raise exception 'empresas/user_profiles RLS: user_profiles policies=% (esperado 3)', n_prof;
  end if;
end $$;
