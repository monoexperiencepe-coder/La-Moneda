-- =============================================================================
-- Fase 1 RLS piloto — SOLO public.gastos
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
--   (p. ej. migration_vehiculos_rls_fase1_fix.sql)
--
-- SELECT admin/contador/socio: tenant completo.
-- SELECT operador / operador@: solo gastos_globales + pendiente_revision (tenant).
-- INSERT operador: solo esos tipos; finanzas: cualquier tipo del tenant.
-- UPDATE operador: USING fila antigua visible; WITH CHECK nueva fila mismo tenant
--   (puede reclasificar a cualquier tipo_gasto).
-- DELETE: admin/contador/socio; operador bloqueado.
--
-- NO toca: ingresos, financial_audit_logs, gastos_caja, otras tablas.
-- Idempotente.
-- =============================================================================

create or replace function public.gasto_tipo_operador_visible(p_tipo text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(trim(coalesce(p_tipo, ''))) in ('gastos_globales', 'pendiente_revision');
$$;

comment on function public.gasto_tipo_operador_visible(text) is
  'true si tipo_gasto es visible para cuenta operador restringida (globales / pendiente revisión).';

create or replace function public.can_read_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and (
      not public.is_restricted_operador_account()
      or public.gasto_tipo_operador_visible(p_tipo)
    );
$$;

comment on function public.can_read_gasto(text, uuid) is
  'SELECT gastos: finanzas ven tenant; operador@ solo globales y pendiente_revision.';

create or replace function public.can_insert_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or (
        public.is_restricted_operador_account()
        and public.gasto_tipo_operador_visible(p_tipo)
      )
    );
$$;

comment on function public.can_insert_gasto(text, uuid) is
  'INSERT gastos: finanzas cualquier tipo; operador solo globales / pendiente_revision.';

create or replace function public.can_update_gasto_using(p_old_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or (
        public.is_restricted_operador_account()
        and public.gasto_tipo_operador_visible(p_old_tipo)
      )
    );
$$;

comment on function public.can_update_gasto_using(text, uuid) is
  'UPDATE gastos USING: operador solo filas que hoy están en globales / pendiente_revision.';

create or replace function public.can_update_gasto_check(p_new_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_new_empresa_id is not null
    and p_new_empresa_id = public.current_user_empresa_id()
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or public.is_restricted_operador_account()
    );
$$;

comment on function public.can_update_gasto_check(uuid) is
  'UPDATE gastos WITH CHECK: mismo tenant; operador puede reclasificar a cualquier tipo_gasto.';

create or replace function public.can_delete_gasto(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and not public.is_restricted_operador_account()
    and public.current_user_role() in ('admin', 'contador', 'socio');
$$;

comment on function public.can_delete_gasto(uuid) is
  'DELETE gastos: admin/contador/socio del tenant; operador / operador@ bloqueados.';

revoke all on function public.gasto_tipo_operador_visible(text) from public;
revoke all on function public.can_read_gasto(text, uuid) from public;
revoke all on function public.can_insert_gasto(text, uuid) from public;
revoke all on function public.can_update_gasto_using(text, uuid) from public;
revoke all on function public.can_update_gasto_check(uuid) from public;
revoke all on function public.can_delete_gasto(uuid) from public;

grant execute on function public.gasto_tipo_operador_visible(text) to authenticated;
grant execute on function public.can_read_gasto(text, uuid) to authenticated;
grant execute on function public.can_insert_gasto(text, uuid) to authenticated;
grant execute on function public.can_update_gasto_using(text, uuid) to authenticated;
grant execute on function public.can_update_gasto_check(uuid) to authenticated;
grant execute on function public.can_delete_gasto(uuid) to authenticated;

do $$
declare
  pol record;
  n_null bigint;
  n_helpers int;
begin
  select count(*) into n_null from public.gastos where empresa_id is null;
  if n_null > 0 then
    raise warning 'gastos RLS fase1: % filas con empresa_id NULL', n_null;
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
      'can_read_gasto',
      'can_insert_gasto',
      'can_update_gasto_using',
      'can_update_gasto_check',
      'can_delete_gasto',
      'gasto_tipo_operador_visible'
    );
  if n_helpers < 10 then
    raise exception 'gastos RLS fase1: faltan helpers (rls_preparation + vehiculos fix)';
  end if;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'gastos'
  loop
    execute format('drop policy if exists %I on public.gastos', pol.policyname);
  end loop;
end $$;

alter table public.gastos enable row level security;
alter table public.gastos force row level security;

create policy "gastos_select_tenant_role"
  on public.gastos
  for select
  to authenticated
  using (
    public.can_read_gasto(tipo_gasto, empresa_id)
  );

create policy "gastos_insert_tenant_role"
  on public.gastos
  for insert
  to authenticated
  with check (
    public.can_insert_gasto(tipo_gasto, empresa_id)
  );

create policy "gastos_update_tenant_role"
  on public.gastos
  for update
  to authenticated
  using (
    public.can_update_gasto_using(tipo_gasto, empresa_id)
  )
  with check (
    public.can_update_gasto_check(empresa_id)
  );

create policy "gastos_delete_tenant_editors"
  on public.gastos
  for delete
  to authenticated
  using (
    public.can_delete_gasto(empresa_id)
  );

do $$
declare
  n int;
  rls_on boolean;
  forced boolean;
begin
  select c.relrowsecurity, c.relforcerowsecurity, count(p.policyname)
  into rls_on, forced, n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  left join pg_policies p on p.schemaname = 'public' and p.tablename = 'gastos'
  where ns.nspname = 'public' and c.relname = 'gastos' and c.relkind = 'r'
  group by c.relrowsecurity, c.relforcerowsecurity;

  if not coalesce(rls_on, false) then
    raise exception 'gastos RLS fase1: RLS no activo';
  end if;
  if not coalesce(forced, false) then
    raise exception 'gastos RLS fase1: FORCE RLS no activo';
  end if;
  if n <> 4 then
    raise exception 'gastos RLS fase1: se esperaban 4 policies, hay %', n;
  end if;
end $$;
