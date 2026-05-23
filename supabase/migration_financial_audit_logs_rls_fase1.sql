-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.financial_audit_logs
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql (empresa_id) + is_restricted_operador_account
--
-- SELECT: tenant + admin/contador/socio (nunca operador ni operador@)
-- INSERT: tenant + user_id = auth.uid() (append-only; undo / gastos / ingresos)
-- UPDATE: sin policy (bloqueado)
-- DELETE: admin activo + tenant (can_delete_financial_audit_logs)
--
-- NO toca: gastos, ingresos, otras tablas.
-- Idempotente: reemplaza policies antiguas (insert_own, select_admin, select_finanzas, …).
-- =============================================================================

create or replace function public.can_delete_financial_audit_logs()
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
        and lower(trim(p.role::text)) = 'admin'
        and not public.is_restricted_operador_account()
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

comment on function public.can_delete_financial_audit_logs() is
  'Borrado audit logs: solo admin activo; nunca operador ni operador@lamoneda.com.';

revoke all on function public.can_delete_financial_audit_logs() from public;
grant execute on function public.can_delete_financial_audit_logs() to authenticated;

do $$
declare
  pol record;
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.financial_audit_logs where empresa_id is null;
  if n_null > 0 then
    raise warning 'financial_audit_logs RLS fase1: % filas con empresa_id NULL', n_null;
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
      'can_delete_financial_audit_logs'
    );
  if n_helpers < 5 then
    raise exception 'financial_audit_logs RLS fase1: faltan helpers (rls_preparation + vehiculos fix)';
  end if;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'financial_audit_logs'
  loop
    execute format('drop policy if exists %I on public.financial_audit_logs', pol.policyname);
  end loop;
end $$;

alter table public.financial_audit_logs enable row level security;
alter table public.financial_audit_logs force row level security;

create policy "financial_audit_logs_select_tenant_finanzas"
  on public.financial_audit_logs
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
    and public.current_user_role() in ('admin', 'contador', 'socio')
    and not public.is_restricted_operador_account()
  );

create policy "financial_audit_logs_insert_tenant_authenticated"
  on public.financial_audit_logs
  for insert
  to authenticated
  with check (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
    and (auth.uid())::text = user_id
  );

create policy "financial_audit_logs_delete_admin"
  on public.financial_audit_logs
  for delete
  to authenticated
  using (
    public.is_active_user() = true
    and empresa_id = public.current_user_empresa_id()
    and public.can_delete_financial_audit_logs() = true
  );

comment on policy "financial_audit_logs_select_tenant_finanzas" on public.financial_audit_logs is
  'Fase 1: lectura historial solo admin/contador/socio del tenant.';
comment on policy "financial_audit_logs_insert_tenant_authenticated" on public.financial_audit_logs is
  'Fase 1: append-only; cualquier usuario activo del tenant (incl. operador al auditar gastos).';
comment on policy "financial_audit_logs_delete_admin" on public.financial_audit_logs is
  'Fase 1: cleanup historial solo admin.';

do $$
declare
  rls_on boolean;
  forced boolean;
  n_pol int;
  n_update int;
begin
  select c.relrowsecurity, c.relforcerowsecurity
  into rls_on, forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'financial_audit_logs' and c.relkind = 'r';

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public' and tablename = 'financial_audit_logs';

  select count(*) into n_update
  from pg_policies
  where schemaname = 'public' and tablename = 'financial_audit_logs' and cmd = 'UPDATE';

  if not coalesce(rls_on, false) then
    raise exception 'financial_audit_logs RLS fase1: relrowsecurity sigue false';
  end if;
  if not coalesce(forced, false) then
    raise exception 'financial_audit_logs RLS fase1: relforcerowsecurity sigue false';
  end if;
  if n_pol <> 3 then
    raise exception 'financial_audit_logs RLS fase1: se esperaban 3 policies, hay %', n_pol;
  end if;
  if n_update > 0 then
    raise exception 'financial_audit_logs RLS fase1: UPDATE no debe tener policy (hay %)', n_update;
  end if;
end $$;
