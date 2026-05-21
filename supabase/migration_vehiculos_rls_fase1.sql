-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.vehiculos
-- =============================================================================
-- Requisitos previos (ejecutar antes si no están aplicados):
--   - migration_rls_preparation.sql (helpers + user_profiles.empresa_id)
--   - vehiculos.empresa_id poblado (misma empresa que el perfil del usuario)
--
-- NO activa RLS en: gastos, ingresos, user_profiles, financial_audit_logs, etc.
--
-- Reglas:
--   SELECT:  is_active_user() AND empresa_id = current_user_empresa_id()
--   INSERT/UPDATE/DELETE: can_mutate_vehiculos() (admin/contador/socio; nunca operador ni operador@)
--   operador: solo SELECT (sin escritura)
--
-- Si operador@ pudo UPDATE: ejecutar migration_vehiculos_rls_fase1_fix.sql
-- (RLS OFF, role distinto en user_profiles, o policies sin can_mutate_vehiculos).
--
-- Idempotente: elimina cualquier policy previa en vehiculos y recrea nombres controlados.
-- =============================================================================

-- Helpers vehiculos (requiere migration_rls_preparation.sql para is_active_user / empresa_id)
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

revoke all on function public.is_restricted_operador_account() from public;
revoke all on function public.can_mutate_vehiculos() from public;
grant execute on function public.is_restricted_operador_account() to authenticated;
grant execute on function public.can_mutate_vehiculos() to authenticated;

-- Pre-flight (solo informativo; no modifica datos)
do $$
declare
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.vehiculos where empresa_id is null;
  if n_null > 0 then
    raise warning 'vehiculos RLS fase1: % filas con empresa_id NULL (no visibles con policies)', n_null;
  end if;

  select count(*) into n_helpers
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'current_user_role',
      'current_user_empresa_id',
      'is_active_user',
      'can_mutate_vehiculos',
      'is_restricted_operador_account'
    );
  if n_helpers < 5 then
    raise exception 'vehiculos RLS fase1: faltan helpers (ejecutar migration_rls_preparation.sql y migration_vehiculos_rls_fase1_fix.sql)';
  end if;
end $$;

-- Eliminar policies existentes en vehiculos (activas o inactivas por RLS off)
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

-- Lectura: cualquier rol activo del tenant
create policy "vehiculos_select_tenant_active"
  on public.vehiculos
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
  );

-- Escritura: admin, contador, socio (nunca operador / operador@)
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

comment on policy "vehiculos_select_tenant_active" on public.vehiculos is
  'Fase 1: lectura por tenant para usuarios activos (incluye operador).';

comment on policy "vehiculos_insert_tenant_editors" on public.vehiculos is
  'Fase 1: alta solo admin/contador/socio del tenant.';

comment on policy "vehiculos_update_tenant_editors" on public.vehiculos is
  'Fase 1: actualización solo admin/contador/socio del tenant.';

comment on policy "vehiculos_delete_tenant_editors" on public.vehiculos is
  'Fase 1: borrado solo admin/contador/socio del tenant.';
