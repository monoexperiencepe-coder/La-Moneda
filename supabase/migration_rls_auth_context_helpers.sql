-- =============================================================================
-- RLS auth context — rls_auth_uid() + helpers + debug_rls_context()
-- =============================================================================
-- Objetivo: helpers resuelvan JWT bajo PostgREST y sean diagnosticables en SQL Editor
-- (set_config request.jwt.claim.sub) sin romper seguridad sin sesión.
--
-- NO desactiva RLS. NO modifica datos. NO CASCADE.
-- Objetivo: helpers resuelvan JWT bajo PostgREST y sean diagnosticables en SQL Editor
-- (set_config request.jwt.claim.sub) sin romper seguridad sin sesión.
--
-- Requisito previo opcional: migration_gastos_rls_operador_clasificacion.sql
-- (esta migración es autocontenida e idempotente).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) UID de sesión — auth.uid() + fallback JWT PostgREST / SQL Editor
-- ---------------------------------------------------------------------------
create or replace function public.rls_auth_uid()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    auth.uid(),
    nullif(btrim(current_setting('request.jwt.claim.sub', true)), '')::uuid,
    (
      nullif(btrim(current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub'
    )::uuid
  );
$$;

comment on function public.rls_auth_uid() is
  'UUID del JWT: auth.uid() o request.jwt.claim.sub / claims.sub (PostgREST, diagnóstico).';

-- ---------------------------------------------------------------------------
-- 2) Helpers base — perfil por rls_auth_uid()
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
  where p.id = public.rls_auth_uid()
  limit 1;
$$;

comment on function public.current_user_role() is
  'Rol normalizado del usuario autenticado. NULL sin sesión o sin perfil.';

create or replace function public.current_user_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.empresa_id
  from public.user_profiles p
  where p.id = public.rls_auth_uid()
    and coalesce(p.is_active, false) = true
  limit 1;
$$;

comment on function public.current_user_empresa_id() is
  'empresa_id del usuario activo. NULL sin sesión, inactivo o perfil incompleto.';

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.rls_auth_uid() is null then false
    else coalesce(
      (
        select coalesce(p.is_active, false)
        from public.user_profiles p
        where p.id = public.rls_auth_uid()
        limit 1
      ),
      false
    )
  end;
$$;

comment on function public.is_active_user() is
  'true si rls_auth_uid() tiene perfil activo. Sin sesión → false.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.rls_auth_uid() is null then false
    else coalesce(
      (
        select p.role = 'admin' and coalesce(p.is_active, false)
        from public.user_profiles p
        where p.id = public.rls_auth_uid()
        limit 1
      ),
      false
    )
  end;
$$;

comment on function public.is_admin() is
  'true si el usuario autenticado es admin activo. Sin sesión → false.';

create or replace function public.is_restricted_operador_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.rls_auth_uid() is null then false
    else coalesce(
      (
        select
          lower(trim(p.role::text)) = 'operador'
          or lower(trim(p.email)) = lower(trim(coalesce(
            nullif(current_setting('app.restricted_operador_email', true), ''),
            'operador@lamoneda.com'
          )))
        from public.user_profiles p
        where p.id = public.rls_auth_uid()
        limit 1
      ),
      false
    )
  end;
$$;

comment on function public.is_restricted_operador_account() is
  'true si cuenta operador (rol o email). Sin sesión/perfil → false (is_active_user bloquea acceso).';

-- ---------------------------------------------------------------------------
-- 3) Catálogo tipo_gasto (requerido por can_read_gasto / can_update_gasto_check)
-- ---------------------------------------------------------------------------
create or replace function public.gastos_canonical_tipo_gasto(p_tipo_gasto text, p_has_vehicle boolean)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when nullif(btrim(p_tipo_gasto), '') is null and p_has_vehicle then 'operativo_vehiculo'
    when nullif(btrim(p_tipo_gasto), '') is null then 'gastos_globales'
    when btrim(p_tipo_gasto) = 'financiero' then 'financiero_prestamo'
    when btrim(p_tipo_gasto) = 'inversion' then 'inversion_compra'
    when btrim(p_tipo_gasto) = 'operativo_flota_global' then 'gastos_globales'
    when btrim(p_tipo_gasto) in ('personal_socios', 'personal_socios_familiares', 'personales')
      then 'representacion_interna'
    else btrim(p_tipo_gasto)
  end;
$$;

create or replace function public.gasto_tipo_gasto_permitido(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.gastos_canonical_tipo_gasto(p_tipo, false) in (
    'operativo_vehiculo',
    'operativo_flota_general',
    'gastos_globales',
    'administrativo_empresa',
    'financiero_prestamo',
    'planilla_laboral',
    'inversion_compra',
    'representacion_interna',
    'pendiente_revision'
  );
$$;

create or replace function public.gasto_tipo_operador_visible(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(trim(coalesce(p_tipo, ''))) in ('gastos_globales', 'pendiente_revision');
$$;

-- ---------------------------------------------------------------------------
-- 4) Helpers gastos — alineados con operador_clasificacion v2
-- ---------------------------------------------------------------------------
create or replace function public.can_read_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.rls_auth_uid() is null then false
    else coalesce(
      (
        select
          coalesce(p.is_active, false)
          and p.empresa_id is not null
          and p_empresa_id = p.empresa_id
          and public.gasto_tipo_gasto_permitido(p_tipo)
          and (
            not (
              lower(trim(p.role::text)) = 'operador'
              or lower(trim(p.email)) = lower(trim(coalesce(
                nullif(current_setting('app.restricted_operador_email', true), ''),
                'operador@lamoneda.com'
              )))
            )
            or public.gasto_tipo_operador_visible(p_tipo)
          )
        from public.user_profiles p
        where p.id = public.rls_auth_uid()
        limit 1
      ),
      false
    )
  end;
$$;

comment on function public.can_read_gasto(text, uuid) is
  'SELECT gastos: finanzas tenant; operador solo globales/pendiente. Usa rls_auth_uid().';

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
        and public.can_read_gasto(p_old_tipo, p_empresa_id)
      )
    );
$$;

comment on function public.can_update_gasto_using(text, uuid) is
  'UPDATE USING: finanzas tenant; operador solo filas can_read_gasto (OLD).';

create or replace function public.can_update_gasto_check(p_tipo_gasto text, p_empresa_id uuid)
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
    and public.gasto_tipo_gasto_permitido(p_tipo_gasto)
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or public.is_restricted_operador_account()
    );
$$;

comment on function public.can_update_gasto_check(text, uuid) is
  'UPDATE WITH CHECK: destino válido; operador clasifica sin ampliar SELECT.';

-- ---------------------------------------------------------------------------
-- 5) RPC diagnóstico — contexto real bajo JWT del cliente
-- ---------------------------------------------------------------------------
create or replace function public.debug_rls_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := public.rls_auth_uid();
  v_empresa uuid := public.current_user_empresa_id();
  v_profile record;
begin
  select p.id, p.email, p.role, p.is_active, p.empresa_id
  into v_profile
  from public.user_profiles p
  where p.id = v_uid
  limit 1;

  return jsonb_build_object(
    'auth_uid', v_uid,
    'auth_uid_builtin', auth.uid(),
    'jwt_sub_claim', nullif(btrim(current_setting('request.jwt.claim.sub', true)), ''),
    'jwt_role_claim', nullif(btrim(current_setting('request.jwt.claim.role', true)), ''),
    'current_user_empresa_id', v_empresa,
    'current_user_role', public.current_user_role(),
    'is_active_user', public.is_active_user(),
    'is_restricted_operador_account', public.is_restricted_operador_account(),
    'profile', case
      when v_profile.id is not null then jsonb_build_object(
        'id', v_profile.id,
        'email', v_profile.email,
        'role', v_profile.role,
        'is_active', v_profile.is_active,
        'empresa_id', v_profile.empresa_id
      )
      else null
    end,
    'can_read_gastos_globales', public.can_read_gasto('gastos_globales', v_empresa),
    'can_read_operativo_flota_general', public.can_read_gasto('operativo_flota_general', v_empresa),
    'can_update_using_gastos_globales', public.can_update_gasto_using('gastos_globales', v_empresa),
    'can_check_operativo_flota_general', public.can_update_gasto_check('operativo_flota_general', v_empresa),
    'can_check_inversion_compra', public.can_update_gasto_check('inversion_compra', v_empresa)
  );
end;
$$;

comment on function public.debug_rls_context() is
  'Diagnóstico RLS bajo JWT del cliente (PostgREST). Solo authenticated.';

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------
revoke all on function public.rls_auth_uid() from public;
grant execute on function public.rls_auth_uid() to authenticated;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_empresa_id() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_restricted_operador_account() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_empresa_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_restricted_operador_account() to authenticated;

revoke all on function public.can_read_gasto(text, uuid) from public;
grant execute on function public.can_read_gasto(text, uuid) to authenticated;

revoke all on function public.can_update_gasto_using(text, uuid) from public;
grant execute on function public.can_update_gasto_using(text, uuid) to authenticated;

revoke all on function public.can_update_gasto_check(text, uuid) from public;
grant execute on function public.can_update_gasto_check(text, uuid) to authenticated;

revoke all on function public.debug_rls_context() from public;
grant execute on function public.debug_rls_context() to authenticated;

-- Policy gastos UPDATE (idempotente — asegura firma text, uuid)
drop policy if exists "gastos_update_tenant_role" on public.gastos;
drop function if exists public.can_update_gasto_check(uuid);

create policy "gastos_update_tenant_role"
  on public.gastos
  for update
  to authenticated
  using (
    public.can_update_gasto_using(tipo_gasto, empresa_id)
  )
  with check (
    public.can_update_gasto_check(tipo_gasto, empresa_id)
  );

commit;

-- Verificación post-commit
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rls_auth_uid', 'debug_rls_context', 'can_update_gasto_check')
order by proname, args;
