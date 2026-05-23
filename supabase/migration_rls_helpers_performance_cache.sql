-- =============================================================================
-- RLS helpers — caché de perfil por transacción + summary SECURITY DEFINER
-- =============================================================================
-- Problema: helpers anidados (is_active_user + current_user_empresa_id +
-- is_restricted_operador + can_read_gasto) hacían N lookups user_profiles por fila.
--
-- Solución:
--   • rls_auth_uid() y rls_profile_cache_ensure() cargan 1 vez por transacción (GUC local).
--   • can_read_gasto / can_update_* leen solo GUC + funciones IMMUTABLE.
--   • get_gastos_financial_summary: SECURITY DEFINER con validación explícita de tenant/rol.
--
-- NO desactiva RLS. NO modifica datos. NO CASCADE.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Índices (idempotente — asegurar que existen post-migración)
-- ---------------------------------------------------------------------------
create index if not exists gastos_empresa_id_idx
  on public.gastos (empresa_id);

create index if not exists gastos_empresa_id_fecha_id_desc_idx
  on public.gastos (empresa_id, fecha desc, id desc);

create index if not exists gastos_empresa_id_kpi_cover_idx
  on public.gastos (empresa_id)
  include (monto, tipo_gasto, vehicle_id);

create index if not exists user_profiles_empresa_id_idx
  on public.user_profiles (empresa_id);

create index if not exists user_profiles_role_idx
  on public.user_profiles (role);

create index if not exists user_profiles_active_id_idx
  on public.user_profiles (id)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 1) UID — caché en GUC transaccional
-- ---------------------------------------------------------------------------
create or replace function public.rls_auth_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cached text;
  v_uid uuid;
begin
  v_cached := nullif(btrim(current_setting('app.rls_auth_uid', true)), '');
  if v_cached is not null then
    return v_cached::uuid;
  end if;

  v_uid := coalesce(
    auth.uid(),
    nullif(btrim(current_setting('request.jwt.claim.sub', true)), '')::uuid,
    (
      nullif(btrim(current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub'
    )::uuid
  );

  perform set_config('app.rls_auth_uid', coalesce(v_uid::text, ''), true);
  return v_uid;
end;
$$;

comment on function public.rls_auth_uid() is
  'UUID JWT (auth.uid o claim.sub). Cacheado en app.rls_auth_uid por transacción.';

-- ---------------------------------------------------------------------------
-- 2) Caché de perfil — 1 SELECT user_profiles por transacción
-- ---------------------------------------------------------------------------
create or replace function public.rls_profile_cache_ensure()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_operador_email text;
  v_empresa_id uuid;
  v_role text;
  v_is_active boolean;
  v_is_restricted boolean;
begin
  if current_setting('app.rls_cache_v', true) = '1' then
    return;
  end if;

  v_uid := public.rls_auth_uid();
  v_operador_email := lower(trim(coalesce(
    nullif(current_setting('app.restricted_operador_email', true), ''),
    'operador@lamoneda.com'
  )));
  perform set_config('app.rls_operador_email', v_operador_email, true);

  if v_uid is null then
    perform set_config('app.rls_is_active', 'f', true);
    perform set_config('app.rls_is_restricted', 'f', true);
    perform set_config('app.rls_empresa_id', '', true);
    perform set_config('app.rls_role', '', true);
    perform set_config('app.rls_cache_v', '1', true);
    return;
  end if;

  select
    p.empresa_id,
    lower(trim(p.role::text)),
    coalesce(p.is_active, false),
    (
      lower(trim(p.role::text)) = 'operador'
      or lower(trim(p.email)) = v_operador_email
    )
  into v_empresa_id, v_role, v_is_active, v_is_restricted
  from public.user_profiles p
  where p.id = v_uid
  limit 1;

  if not found then
    perform set_config('app.rls_is_active', 'f', true);
    perform set_config('app.rls_is_restricted', 'f', true);
    perform set_config('app.rls_empresa_id', '', true);
    perform set_config('app.rls_role', '', true);
  else
    perform set_config('app.rls_is_active', case when v_is_active then 't' else 'f' end, true);
    perform set_config('app.rls_is_restricted', case when v_is_restricted then 't' else 'f' end, true);
    perform set_config('app.rls_empresa_id', coalesce(v_empresa_id::text, ''), true);
    perform set_config('app.rls_role', coalesce(v_role, ''), true);
  end if;

  perform set_config('app.rls_cache_v', '1', true);
end;
$$;

comment on function public.rls_profile_cache_ensure() is
  'Carga user_profiles una vez por transacción en GUCs app.rls_* (hot path RLS).';

-- ---------------------------------------------------------------------------
-- 3) Helpers base — solo GUC (sin SELECT por llamada)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rls_profile_cache_ensure();
  return nullif(current_setting('app.rls_role', true), '');
end;
$$;

create or replace function public.current_user_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rls_profile_cache_ensure();
  if current_setting('app.rls_is_active', true) <> 't' then
    return null;
  end if;
  return nullif(current_setting('app.rls_empresa_id', true), '')::uuid;
end;
$$;

create or replace function public.is_active_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rls_profile_cache_ensure();
  return current_setting('app.rls_is_active', true) = 't';
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rls_profile_cache_ensure();
  return current_setting('app.rls_is_active', true) = 't'
    and current_setting('app.rls_role', true) = 'admin';
end;
$$;

create or replace function public.is_restricted_operador_account()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.rls_profile_cache_ensure();
  return current_setting('app.rls_is_restricted', true) = 't';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Gastos — hot path sin lookups anidados
-- ---------------------------------------------------------------------------
create or replace function public.can_read_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa text;
begin
  perform public.rls_profile_cache_ensure();

  if current_setting('app.rls_is_active', true) <> 't' then
    return false;
  end if;

  v_empresa := current_setting('app.rls_empresa_id', true);
  if p_empresa_id is null or v_empresa = '' or p_empresa_id::text <> v_empresa then
    return false;
  end if;

  if not public.gasto_tipo_gasto_permitido(p_tipo) then
    return false;
  end if;

  if current_setting('app.rls_is_restricted', true) = 't' then
    return public.gasto_tipo_operador_visible(p_tipo);
  end if;

  return true;
end;
$$;

comment on function public.can_read_gasto(text, uuid) is
  'SELECT gastos: 1 carga de perfil/tx; operador solo globales/pendiente.';

create or replace function public.can_update_gasto_using(p_old_tipo text, p_empresa_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa text;
  v_role text;
begin
  perform public.rls_profile_cache_ensure();

  if current_setting('app.rls_is_active', true) <> 't' then
    return false;
  end if;

  v_empresa := current_setting('app.rls_empresa_id', true);
  if p_empresa_id is null or v_empresa = '' or p_empresa_id::text <> v_empresa then
    return false;
  end if;

  if current_setting('app.rls_is_restricted', true) = 't' then
    return public.gasto_tipo_operador_visible(p_old_tipo);
  end if;

  v_role := current_setting('app.rls_role', true);
  return v_role in ('admin', 'contador', 'socio');
end;
$$;

create or replace function public.can_update_gasto_check(p_tipo_gasto text, p_empresa_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa text;
  v_role text;
begin
  perform public.rls_profile_cache_ensure();

  if current_setting('app.rls_is_active', true) <> 't' then
    return false;
  end if;

  v_empresa := current_setting('app.rls_empresa_id', true);
  if p_empresa_id is null or v_empresa = '' or p_empresa_id::text <> v_empresa then
    return false;
  end if;

  if not public.gasto_tipo_gasto_permitido(p_tipo_gasto) then
    return false;
  end if;

  if current_setting('app.rls_is_restricted', true) = 't' then
    return true;
  end if;

  v_role := current_setting('app.rls_role', true);
  return v_role in ('admin', 'contador', 'socio');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) KPI summary — SECURITY DEFINER (sin RLS fila a fila)
-- ---------------------------------------------------------------------------
create or replace function public.get_gastos_financial_summary(p_empresa_id uuid)
returns table (
  total_gastos numeric,
  total_count bigint,
  total_operativo_vehiculo numeric,
  count_operativo_vehiculo bigint,
  total_operativo_flota_general numeric,
  count_operativo_flota_general bigint,
  total_administrativo_empresa numeric,
  count_administrativo_empresa bigint,
  total_financiero_prestamo numeric,
  count_financiero_prestamo bigint,
  total_planilla_laboral numeric,
  count_planilla_laboral bigint,
  total_inversion_compra numeric,
  count_inversion_compra bigint,
  total_representacion_interna numeric,
  count_representacion_interna bigint,
  total_gastos_globales numeric,
  count_gastos_globales bigint,
  total_pendiente_revision numeric,
  count_pendiente_revision bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa text;
  v_restricted boolean;
begin
  perform public.rls_profile_cache_ensure();

  if current_setting('app.rls_is_active', true) <> 't' then
    return query select 0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint,
      0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint,
      0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint;
    return;
  end if;

  v_empresa := current_setting('app.rls_empresa_id', true);
  if p_empresa_id is null or v_empresa = '' or p_empresa_id::text <> v_empresa then
    return query select 0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint,
      0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint,
      0::numeric, 0::bigint, 0::numeric, 0::bigint, 0::numeric, 0::bigint;
    return;
  end if;

  v_restricted := current_setting('app.rls_is_restricted', true) = 't';

  return query
  with scoped as (
    select
      g.monto,
      public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) as tipo_canon
    from public.gastos g
    where g.empresa_id = p_empresa_id
      and (
        not v_restricted
        or public.gasto_tipo_operador_visible(g.tipo_gasto)
      )
  ),
  by_tipo as (
    select
      s.tipo_canon,
      sum(s.monto)::numeric as total_monto,
      count(*)::bigint as row_count
    from scoped s
    group by s.tipo_canon
  )
  select
    coalesce(sum(bt.total_monto), 0)::numeric,
    coalesce(sum(bt.row_count), 0)::bigint,
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'operativo_vehiculo'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'operativo_vehiculo'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'operativo_flota_general'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'operativo_flota_general'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'administrativo_empresa'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'administrativo_empresa'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'financiero_prestamo'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'financiero_prestamo'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'planilla_laboral'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'planilla_laboral'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'inversion_compra'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'inversion_compra'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'representacion_interna'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'representacion_interna'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'gastos_globales'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'gastos_globales'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'pendiente_revision'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'pendiente_revision'), 0)
  from by_tipo bt;
end;
$$;

comment on function public.get_gastos_financial_summary(uuid) is
  'KPIs gastos: SECURITY DEFINER + validación tenant/rol; operador solo globales/pendiente.';

revoke all on function public.rls_profile_cache_ensure() from public;
grant execute on function public.rls_profile_cache_ensure() to authenticated;

revoke all on function public.get_gastos_financial_summary(uuid) from public;
grant execute on function public.get_gastos_financial_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) debug_rls_context — más checks + timing helpers
-- ---------------------------------------------------------------------------
create or replace function public.debug_rls_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_empresa uuid;
  v_profile record;
  t0 timestamptz := clock_timestamp();
  t1 timestamptz;
  t2 timestamptz;
  ms_cache double precision;
  ms_read double precision;
begin
  perform public.rls_profile_cache_ensure();
  t1 := clock_timestamp();
  ms_cache := extract(epoch from (t1 - t0)) * 1000.0;

  v_uid := public.rls_auth_uid();
  v_empresa := public.current_user_empresa_id();

  select p.id, p.email, p.role, p.is_active, p.empresa_id
  into v_profile
  from public.user_profiles p
  where p.id = v_uid
  limit 1;

  t2 := clock_timestamp();
  ms_read := extract(epoch from (t2 - t1)) * 1000.0;

  return jsonb_build_object(
    'auth_uid', v_uid,
    'auth_uid_builtin', auth.uid(),
    'jwt_sub_claim', nullif(btrim(current_setting('request.jwt.claim.sub', true)), ''),
    'jwt_role_claim', nullif(btrim(current_setting('request.jwt.claim.role', true)), ''),
    'profile_cache_loaded', current_setting('app.rls_cache_v', true) = '1',
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
    'can_read_pendiente_revision', public.can_read_gasto('pendiente_revision', v_empresa),
    'can_read_operativo_flota_general', public.can_read_gasto('operativo_flota_general', v_empresa),
    'can_update_using_gastos_globales', public.can_update_gasto_using('gastos_globales', v_empresa),
    'can_check_operativo_flota_general', public.can_update_gasto_check('operativo_flota_general', v_empresa),
    'can_check_inversion_compra', public.can_update_gasto_check('inversion_compra', v_empresa),
    'timing_ms', jsonb_build_object(
      'profile_cache_ensure', round(ms_cache::numeric, 3),
      'helpers_after_cache', round(ms_read::numeric, 3),
      'total', round((extract(epoch from (clock_timestamp() - t0)) * 1000.0)::numeric, 3)
    )
  );
end;
$$;

analyze public.gastos;
analyze public.user_profiles;

commit;

-- Verificación índices + funciones
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('gastos', 'user_profiles')
  and indexname in (
    'gastos_empresa_id_fecha_id_desc_idx',
    'gastos_empresa_id_kpi_cover_idx',
    'user_profiles_empresa_id_idx',
    'user_profiles_role_idx',
    'user_profiles_active_id_idx'
  )
order by indexname;

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rls_profile_cache_ensure', 'get_gastos_financial_summary', 'can_read_gasto')
order by 1, 2;
