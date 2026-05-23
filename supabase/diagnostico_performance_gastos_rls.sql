-- =============================================================================
-- Diagnóstico READ-ONLY — performance carga inicial Gastos (RLS Fase 1)
-- =============================================================================
-- Objetivo: medir si el cuello de botella está en índices, policies RLS o volumen.
-- NO modifica datos, policies ni RLS. Solo lectura + EXPLAIN ANALYZE.
--
-- Cómo usar:
--   1) Ejecutar secciones A–D en Supabase SQL Editor (service_role o postgres).
--   2) Para EXPLAIN con RLS real (sección E): sustituir UUIDs y ejecutar como
--      usuario autenticado (ver comentarios) o con JWT simulado.
--   3) Comparar tiempos con logs DEV del frontend:
--      [perf] fetchGastos, [perf] fetchGastos page, [perf] bootstrap.total
--
-- Tenant piloto (ajustar si aplica):
--   07593982-08e6-450c-8abe-4bf590609dd7
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Volumen y cardinalidad
-- ---------------------------------------------------------------------------
select
  count(*) as total_gastos,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas,
  pg_size_pretty(pg_total_relation_size('public.gastos')) as heap_plus_indexes,
  pg_size_pretty(pg_relation_size('public.gastos')) as heap_only
from public.gastos;

select
  empresa_id,
  count(*) as n,
  min(fecha) as fecha_min,
  max(fecha) as max_fecha,
  count(*) filter (where public.gasto_tipo_operador_visible(tipo_gasto)) as visibles_operador
from public.gastos
group by 1
order by n desc;

-- ---------------------------------------------------------------------------
-- B) Índices existentes — public.gastos
-- ---------------------------------------------------------------------------
select
  i.relname as index_name,
  pg_get_indexdef(i.oid) as index_def,
  pg_size_pretty(pg_relation_size(i.oid)) as index_size,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  s.seq_scan,
  s.seq_tup_read
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index ix on ix.indrelid = t.oid
join pg_class i on i.oid = ix.indexrelid
left join pg_stat_user_tables s on s.relid = t.oid
where n.nspname = 'public'
  and t.relname = 'gastos'
  and t.relkind = 'r'
order by i.relname;

-- Checklist índices recomendados (OK = existe índice usable)
with wanted(pattern) as (
  values
    ('%empresa_id%'),
    ('%empresa_id%tipo_gasto%'),
    ('%fecha%'),
    ('%created_at%')
),
existing as (
  select pg_get_indexdef(i.oid) as def
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  join pg_index ix on ix.indrelid = t.oid
  join pg_class i on i.oid = ix.indexrelid
  where n.nspname = 'public' and t.relname = 'gastos'
)
select
  w.pattern as indice_sugerido,
  case
    when exists (select 1 from existing e where e.def ilike w.pattern) then 'OK_EXISTE'
    else 'FALTA_REVISAR'
  end as estado
from wanted w;

-- ---------------------------------------------------------------------------
-- C) Índices existentes — public.user_profiles (helpers RLS)
-- ---------------------------------------------------------------------------
select
  i.relname as index_name,
  pg_get_indexdef(i.oid) as index_def,
  pg_size_pretty(pg_relation_size(i.oid)) as index_size
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index ix on ix.indrelid = t.oid
join pg_class i on i.oid = ix.indexrelid
where n.nspname = 'public'
  and t.relname = 'user_profiles'
  and t.relkind = 'r'
order by i.relname;

with wanted(col) as (
  values ('id'), ('email'), ('empresa_id'), ('role')
),
existing as (
  select pg_get_indexdef(i.oid) as def
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  join pg_index ix on ix.indrelid = t.oid
  join pg_class i on i.oid = ix.indexrelid
  where n.nspname = 'public' and t.relname = 'user_profiles'
)
select
  w.col as columna_clave,
  case
    when w.col = 'id' then 'OK_PK'
    when exists (select 1 from existing e where e.def ilike '%(' || w.col || ')%' or e.def ilike '%(' || w.col || ',%') then 'OK_EXISTE'
    else 'FALTA_REVISAR'
  end as estado
from wanted w;

-- ---------------------------------------------------------------------------
-- D) Helpers RLS: volatilidad (STABLE esperado) y definición
-- ---------------------------------------------------------------------------
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  case p.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
  end as volatility,
  p.prosecdef as security_definer,
  case
    when p.provolatile = 's' then 'OK_STABLE'
    else 'REVISAR_VOLATILIDAD'
  end as checklist
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_restricted_operador_account',
    'can_read_gasto',
    'gasto_tipo_operador_visible'
  )
order by p.proname;

-- Cada helper hace SELECT en user_profiles por auth.uid() — debe usar PK id (uuid).
select
  p.proname,
  left(pg_get_functiondef(p.oid), 400) as definition_preview
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_restricted_operador_account'
  )
order by p.proname;

-- ---------------------------------------------------------------------------
-- E) EXPLAIN ANALYZE — query equivalente al frontend (PostgREST)
-- ---------------------------------------------------------------------------
-- Sustituir:
--   :empresa_id  → UUID tenant
--   :admin_uid   → user_profiles.id del admin
--   :operador_uid → user_profiles.id del operador
--
-- Para simular sesión autenticada en SQL Editor (Postgres local / extensiones):
--   select set_config('request.jwt.claim.sub', ':admin_uid', true);
--   set local role authenticated;
--
-- NOTA: En SQL Editor como service_role/postgres, RLS puede estar BYPASSED.
--       Los planes de abajo miden scan de tabla + índices base.
--       Para overhead RLS real, ejecutar como rol authenticated con JWT.

-- E1) Admin — equivalente fetchGastos página 1 (1000 filas)
-- Reemplazar UUIDs antes de ejecutar:
/*
\set empresa_id '07593982-08e6-450c-8abe-4bf590609dd7'
explain (analyze, buffers, verbose)
select *
from public.gastos g
where g.empresa_id = :'empresa_id'::uuid
order by g.fecha desc, g.id desc
limit 1000;
*/

-- E2) Operador — filas visibles (globales + pendiente_revision)
/*
explain (analyze, buffers, verbose)
select *
from public.gastos g
where g.empresa_id = :'empresa_id'::uuid
  and public.gasto_tipo_operador_visible(g.tipo_gasto)
order by g.fecha desc, g.id desc
limit 1000;
*/

-- E3) Conteo por tipo (KPI parrilla — costo agregación cliente)
/*
select lower(trim(tipo_gasto)) as tipo, count(*) as n, sum(monto) as total
from public.gastos
where empresa_id = :'empresa_id'::uuid
group by 1
order by n desc;
*/

-- Plantilla sin psql variables (copiar/pegar con UUID literal):
explain (analyze, buffers)
select *
from public.gastos g
where g.empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
order by g.fecha desc, g.id desc
limit 1000;

-- ---------------------------------------------------------------------------
-- F) Política SELECT gastos — referencia rápida
-- ---------------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'gastos'
order by cmd, policyname;

-- ---------------------------------------------------------------------------
-- G) Índices sugeridos (NO se aplican aquí — solo referencia para migración futura)
-- ---------------------------------------------------------------------------
-- Ejecutar manualmente SOLO tras validar EXPLAIN y consenso (fuera de este script):
--
-- create index if not exists gastos_empresa_id_idx
--   on public.gastos (empresa_id);
--
-- create index if not exists gastos_empresa_id_tipo_gasto_idx
--   on public.gastos (empresa_id, tipo_gasto);
--
-- create index if not exists gastos_empresa_id_fecha_id_idx
--   on public.gastos (empresa_id, fecha desc, id desc);
--
-- create index if not exists gastos_fecha_idx
--   on public.gastos (fecha);
--
-- create index if not exists gastos_created_at_idx
--   on public.gastos (created_at);
--
-- create index if not exists user_profiles_email_lower_idx
--   on public.user_profiles (lower(trim(email)));
--
-- create index if not exists user_profiles_role_idx
--   on public.user_profiles (role);
--
-- user_profiles(id) → PK existente
-- user_profiles(empresa_id) → user_profiles_empresa_id_idx (migration_rls_preparation)

select unnest(array[
  'Comparar [perf] fetchGastos total vs EXPLAIN ANALYZE limit 1000',
  'Si fetchGastos >> EXPLAIN: red/network/PostgREST/paginación serial',
  'Si EXPLAIN lento + Seq Scan on gastos: falta índice empresa_id + sort',
  'Si helpers RLS no STABLE: REVISAR (deberían ser STABLE)',
  'Si operador lento: filtro tipo_gasto — considerar índice parcial',
  'Si KPI Gastos KPI * ms < 50: cuello NO está en render React'
]) as interpretacion;
