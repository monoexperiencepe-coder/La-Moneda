-- =============================================================================
-- Diagnóstico READ-ONLY — performance RLS gastos (post migration_rls_helpers_performance_cache)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor.
-- Sección A: índices y definiciones.
-- Sección B: EXPLAIN (descomentar UUID operador/admin para JWT simulado).
-- =============================================================================

-- A1) Índices críticos
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('gastos', 'user_profiles')
  and (
    indexname like 'gastos_empresa%'
    or indexname like 'user_profiles%'
    or indexname = 'user_profiles_pkey'
  )
order by tablename, indexname;

-- A2) Funciones hot path
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.provolatile as volatility
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rls_auth_uid',
    'rls_profile_cache_ensure',
    'can_read_gasto',
    'can_update_gasto_using',
    'get_gastos_financial_summary'
  )
order by p.proname, args;

-- A3) get_gastos_financial_summary debe ser SECURITY DEFINER
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) like '%rls_profile_cache_ensure%' as uses_profile_cache
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_gastos_financial_summary';

-- =============================================================================
-- B) EXPLAIN ANALYZE — descomentar bloque, pegar UUID y empresa_id
-- =============================================================================
/*
begin;
select set_config('request.jwt.claim.sub', 'PEGAR_UUID_USER_PROFILES', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Warm cache
select public.rls_profile_cache_ensure();

explain (analyze, buffers, format text)
select *
from public.gastos g
where g.empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
order by g.fecha desc, g.id desc
limit 1000;

explain (analyze, buffers, format text)
select *
from public.get_gastos_financial_summary('07593982-08e6-450c-8abe-4bf590609dd7'::uuid);

-- Helpers timing (debe ser < 5 ms total tras cache)
select public.debug_rls_context() -> 'timing_ms' as timing_ms;

rollback;
*/

select unnest(array[
  'OK fetchGastosRecent: Index Scan gastos_empresa_id_fecha_id_desc_idx (no Seq Scan masivo)',
  'OK summary: Function Scan get_gastos_financial_summary + Index Only/Bitmap en gastos',
  'OK can_read_gasto: sin Nested Loop a user_profiles por fila (solo GUC)',
  'MALO: Seq Scan on gastos con miles de filas filtradas por RLS',
  'MALO: timing_ms.profile_cache_ensure > 50ms repetido en misma transacción'
]) as interpretacion;
