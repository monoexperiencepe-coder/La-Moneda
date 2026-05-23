-- =============================================================================
-- Fase 1 RLS piloto — bloque financiamiento
--   public.prestamos_financieros
--   public.prestamos_tramos
--   public.aportes_accionistas
-- =============================================================================
-- Requisitos: migration_rls_preparation.sql + is_restricted_operador_account
-- SELECT: tenant + admin/contador/socio (nunca operador ni operador@)
-- INSERT/UPDATE/DELETE: can_mutate_* + tenant (tramos: coherencia con préstamo padre)
-- Idempotente. NO toca gastos, ingresos, financial_audit_logs, otras tablas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de mutación
-- ---------------------------------------------------------------------------
create or replace function public.can_mutate_prestamos_financieros()
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

create or replace function public.can_mutate_prestamos_tramos()
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

create or replace function public.can_mutate_aportes_accionistas()
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

comment on function public.can_mutate_prestamos_financieros() is
  'Escritura préstamos financieros: admin/contador/socio; nunca operador ni operador@.';
comment on function public.can_mutate_prestamos_tramos() is
  'Escritura tramos: admin/contador/socio; nunca operador ni operador@.';
comment on function public.can_mutate_aportes_accionistas() is
  'Escritura aportes: admin/contador/socio; nunca operador ni operador@.';

revoke all on function public.can_mutate_prestamos_financieros() from public;
revoke all on function public.can_mutate_prestamos_tramos() from public;
revoke all on function public.can_mutate_aportes_accionistas() from public;
grant execute on function public.can_mutate_prestamos_financieros() to authenticated;
grant execute on function public.can_mutate_prestamos_tramos() to authenticated;
grant execute on function public.can_mutate_aportes_accionistas() to authenticated;

-- ---------------------------------------------------------------------------
-- Macro: reemplazar policies por tabla
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  sel_name text;
  ins_name text;
  upd_name text;
  del_name text;
  mutate_fn text;
begin
  foreach t in array array['prestamos_financieros', 'prestamos_tramos', 'aportes_accionistas'] loop
    mutate_fn := case t
      when 'prestamos_financieros' then 'public.can_mutate_prestamos_financieros()'
      when 'prestamos_tramos' then 'public.can_mutate_prestamos_tramos()'
      else 'public.can_mutate_aportes_accionistas()'
    end;

    sel_name := t || '_select_tenant_finanzas';
    ins_name := t || '_insert_tenant_editors';
    upd_name := t || '_update_tenant_editors';
    del_name := t || '_delete_tenant_editors';

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.is_active_user() = true
        and empresa_id = public.current_user_empresa_id()
        and public.current_user_role() in (''admin'', ''contador'', ''socio'')
        and not public.is_restricted_operador_account()
      )',
      sel_name, t
    );

    if t = 'prestamos_tramos' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
          and exists (
            select 1 from public.prestamos_financieros pf
            where pf.id = prestamo_financiero_id
              and pf.empresa_id = public.current_user_empresa_id()
          )
        )',
        ins_name, t, mutate_fn
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
          and exists (
            select 1 from public.prestamos_financieros pf
            where pf.id = prestamo_financiero_id
              and pf.empresa_id = public.current_user_empresa_id()
          )
        ) with check (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
          and exists (
            select 1 from public.prestamos_financieros pf
            where pf.id = prestamo_financiero_id
              and pf.empresa_id = public.current_user_empresa_id()
          )
        )',
        upd_name, t, mutate_fn, mutate_fn
      );
    else
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
        )',
        ins_name, t, mutate_fn
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
        ) with check (
          public.is_active_user() = true
          and %s = true
          and empresa_id = public.current_user_empresa_id()
        )',
        upd_name, t, mutate_fn, mutate_fn
      );
    end if;

    execute format(
      'create policy %I on public.%I for delete to authenticated using (
        public.is_active_user() = true
        and %s = true
        and empresa_id = public.current_user_empresa_id()
      )',
      del_name, t, mutate_fn
    );
  end loop;
end $$;

comment on policy "prestamos_financieros_select_tenant_finanzas" on public.prestamos_financieros is
  'Fase 1: lectura préstamos por tenant y rol finanzas.';
comment on policy "prestamos_tramos_select_tenant_finanzas" on public.prestamos_tramos is
  'Fase 1: lectura tramos por tenant (empresa_id denormalizado).';
comment on policy "aportes_accionistas_select_tenant_finanzas" on public.aportes_accionistas is
  'Fase 1: lectura aportes por tenant y rol finanzas.';

-- Verificación
do $$
declare
  t text;
  n int;
  rls_on boolean;
  forced boolean;
begin
  foreach t in array array['prestamos_financieros', 'prestamos_tramos', 'aportes_accionistas'] loop
    select c.relrowsecurity, c.relforcerowsecurity into rls_on, forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relkind = 'r';

    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;

    if not coalesce(rls_on, false) then
      raise exception 'financiamiento RLS fase1: % sin RLS', t;
    end if;
    if not coalesce(forced, false) then
      raise exception 'financiamiento RLS fase1: % sin FORCE RLS', t;
    end if;
    if n < 4 then
      raise exception 'financiamiento RLS fase1: % policies=% (esperadas 4)', t, n;
    end if;
  end loop;
end $$;
