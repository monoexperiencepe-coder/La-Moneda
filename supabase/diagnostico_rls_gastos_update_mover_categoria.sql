-- =============================================================================
-- Diagnóstico READ-ONLY — 403 al mover categoría (UPDATE public.gastos)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor.
--
-- Sección A: catálogo (no requiere auth).
-- Sección B: simular sesión JWT (descomentar UUID de user_profiles).
--   Tras migration_rls_auth_context_helpers.sql, set_config('request.jwt.claim.sub')
--   alimenta public.rls_auth_uid() aunque auth.uid() nativo sea NULL.
-- Sección C/D: helpers como usuario simulado.
-- =============================================================================

-- ─── A1) RLS gastos ───────────────────────────────────────────────────────
select
  c.relname,
  c.relrowsecurity as rls_on,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'gastos';

select
  policyname,
  cmd,
  roles,
  permissive,
  qual as using_expr,
  with_check as with_check_expr
from pg_policies
where schemaname = 'public' and tablename = 'gastos'
order by cmd, policyname;

select
  policyname,
  case
    when with_check like '%can_update_gasto_check(tipo_gasto, empresa_id)%' then 'OK_NUEVA_FIRMA'
    when with_check like '%can_update_gasto_check(empresa_id)%' then 'LEGACY_SOLO_UUID'
    else 'REVISAR_WITH_CHECK'
  end as with_check_checklist,
  case
    when qual like '%can_update_gasto_using(tipo_gasto, empresa_id)%' then 'OK_USING_HELPER'
    else 'REVISAR_USING'
  end as using_checklist
from pg_policies
where schemaname = 'public'
  and tablename = 'gastos'
  and policyname = 'gastos_update_tenant_role';

-- ─── A2) Firmas can_update_gasto_check (legacy vs nueva) ─────────────────
select
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  case
    when pg_get_function_identity_arguments(p.oid) = 'p_tipo_gasto text, p_empresa_id uuid' then 'OK_NUEVA'
    when pg_get_function_identity_arguments(p.oid) in ('p_new_empresa_id uuid', 'p_empresa_id uuid') then 'LEGACY_UUID'
    else 'OTRA'
  end as estado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check'
order by args;

-- ─── A3) Definiciones actuales (helpers auth + UPDATE) ────────────────────
select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'rls_auth_uid';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'debug_rls_context';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'current_user_empresa_id';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check'
  and pg_get_function_identity_arguments(p.oid) = 'p_tipo_gasto text, p_empresa_id uuid';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_using';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_read_gasto';

select pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_restricted_operador_account';

-- ─── A4) Dependencias policy → funciones ──────────────────────────────────
select
  pol.policyname,
  fn.proname as function_name,
  pg_get_function_identity_arguments(fn.oid) as function_args
from pg_policy pol
join pg_class tbl on tbl.oid = pol.polrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
cross join lateral unnest(pol.polroles) as role_oid
join pg_depend d on d.refobjid = tbl.oid
join pg_proc fn on fn.oid = d.objid
join pg_namespace fn_ns on fn_ns.oid = fn.pronamespace
where ns.nspname = 'public'
  and tbl.relname = 'gastos'
  and pol.polname = 'gastos_update_tenant_role'
  and fn_ns.nspname = 'public'
  and fn.proname like 'can_update_gasto%';

-- ─── A5) Catálogo tipo_gasto ──────────────────────────────────────────────
select
  t.raw,
  public.gastos_canonical_tipo_gasto(t.raw, false) as canon,
  public.gasto_tipo_gasto_permitido(t.raw) as permitido,
  public.gasto_tipo_operador_visible(t.raw) as visible_operador
from (
  values
    ('gastos_globales'),
    ('pendiente_revision'),
    ('operativo_flota_global'),
    ('operativo_flota_general'),
    ('operativo_vehiculo'),
    ('inversion_compra'),
    ('financiero'),
    ('financiero_prestamo')
) as t(raw)
order by t.raw;

-- ─── A6) Perfiles conocidos (sin auth) ────────────────────────────────────
select id, email, role, is_active, empresa_id
from public.user_profiles
where lower(trim(email)) in ('operador@lamoneda.com', 'admin@lamoneda.com')
   or lower(trim(role)) in ('operador', 'admin', 'contador', 'socio')
order by email
limit 20;

-- ─── A7) Distribución tipo_gasto en filas movibles ────────────────────────
select
  btrim(coalesce(tipo_gasto, '')) as tipo_gasto,
  count(*) as n
from public.gastos
where btrim(coalesce(tipo_gasto, '')) in (
  'gastos_globales', 'pendiente_revision', 'operativo_flota_global', ''
)
   or tipo_gasto is null
group by 1
order by n desc;

-- =============================================================================
-- B) Simular JWT (descomentar, reemplazar UUID, ejecutar bloque completo)
-- =============================================================================
/*
begin;
select set_config('request.jwt.claim.sub', 'PEGAR_UUID_USER_PROFILES_AQUI', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- C) Contexto sesión simulada (rls_auth_uid + helpers)
select
  auth.uid() as auth_uid_builtin,
  public.rls_auth_uid() as rls_auth_uid,
  public.current_user_role() as current_user_role,
  public.current_user_empresa_id() as current_user_empresa_id,
  public.is_active_user() as is_active_user,
  public.is_restricted_operador_account() as is_restricted_operador;

select id, email, role, is_active, empresa_id
from public.user_profiles
where id = public.rls_auth_uid();

-- D) Evaluar helpers UPDATE (empresa_id = tenant del perfil simulado)
select
  public.can_read_gasto('gastos_globales', public.current_user_empresa_id()) as read_globales,
  public.can_read_gasto('operativo_flota_general', public.current_user_empresa_id()) as read_flota_general,
  public.can_update_gasto_using('gastos_globales', public.current_user_empresa_id()) as using_globales,
  public.can_update_gasto_using('pendiente_revision', public.current_user_empresa_id()) as using_pendiente,
  public.can_update_gasto_using('operativo_flota_global', public.current_user_empresa_id()) as using_legacy_global,
  public.can_update_gasto_check('operativo_flota_general', public.current_user_empresa_id()) as check_flota_general,
  public.can_update_gasto_check('inversion_compra', public.current_user_empresa_id()) as check_inversion_compra,
  public.can_update_gasto_check('gastos_globales', public.current_user_empresa_id()) as check_globales;

-- E) Fila ejemplo vs helpers (solo con JWT simulado — sin esto todo can_* = false)
select
  g.id,
  g.tipo_gasto,
  g.empresa_id,
  public.gasto_tipo_operador_visible(g.tipo_gasto) as visible_operador,
  public.gasto_tipo_gasto_permitido(g.tipo_gasto) as tipo_permitido,
  public.can_read_gasto(g.tipo_gasto, g.empresa_id) as can_read,
  public.can_update_gasto_using(g.tipo_gasto, g.empresa_id) as can_update_using,
  public.can_update_gasto_check('operativo_flota_general', g.empresa_id) as can_check_flota,
  public.can_update_gasto_check('inversion_compra', g.empresa_id) as can_check_inversion
from public.gastos g
where btrim(coalesce(g.tipo_gasto, '')) in ('gastos_globales', 'pendiente_revision')
order by g.fecha desc nulls last, g.id desc
limit 5;

rollback;
*/

-- ─── F) Checklist interpretación ──────────────────────────────────────────
select unnest(array[
  'SIN JWT: rls_auth_uid NULL → can_* false (normal en SQL Editor sección A)',
  'CON set_config sub: rls_auth_uid debe coincidir con user_profiles.id',
  'App: supabase.rpc(''debug_rls_context'') bajo sesión real del operador/admin',
  'OK: solo existe can_update_gasto_check(p_tipo_gasto text, p_empresa_id uuid)',
  'OK: WITH CHECK = can_update_gasto_check(tipo_gasto, empresa_id)',
  'OK: USING = can_update_gasto_using(tipo_gasto, empresa_id)',
  'OPERADOR: using_globales=true, check_flota_general=true, read_flota_general=false',
  'ADMIN: using_globales=true, check_flota_general=true, read_flota_general=true',
  '403 USING: can_update_gasto_using false (OLD no legible o empresa_id ≠ perfil)',
  '403 WITH CHECK: destino no permitido o empresa_id ≠ current_user_empresa_id()',
  '403 contexto: current_user_empresa_id NULL → revisar perfil is_active/empresa_id'
]) as interpretacion;
