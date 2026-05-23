-- =============================================================================
-- Diagnóstico READ-ONLY — policies UPDATE gastos, grants, triggers
-- =============================================================================
-- Ejecutar en Supabase SQL Editor. NO modifica datos.
-- =============================================================================

-- 1) Todas las policies en public.gastos
select
  policyname,
  cmd,
  permissive,
  roles,
  qual as using_expr,
  with_check as with_check_expr
from pg_policies
where schemaname = 'public' and tablename = 'gastos'
order by cmd, policyname;

-- 2) Solo UPDATE (¿más de una?)
select count(*) as num_update_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'gastos'
  and cmd = 'update';

-- 3) RLS activo
select relname, relrowsecurity, relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'gastos';

-- 4) GRANTs tabla gastos
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'gastos'
order by grantee, privilege_type;

-- 5) ¿authenticated tiene UPDATE?
select exists (
  select 1
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'gastos'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
) as authenticated_has_update;

-- 6) Triggers en gastos (pueden rechazar UPDATE)
select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'gastos'
  and not t.tgisinternal
order by t.tgname;

-- 7) CHECK / FK constraints
select conname, contype, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and rel.relname = 'gastos'
  and c.contype in ('c', 'f')
order by conname;

-- 8) Columnas generadas (UPDATE parcial puede fallar)
select column_name, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name = 'gastos'
  and is_generated <> 'NEVER'
order by ordinal_position;

select unnest(array[
  'OK: una sola policy UPDATE = gastos_update_tenant_role',
  'OK: authenticated tiene privilege UPDATE',
  'MALO: 0 policies UPDATE o USING/WITH CHECK distinto a can_update_gasto_*',
  'MALO: trigger BEFORE UPDATE que raise exception',
  '403 con would_pass_update_policy=true → grants/trigger/columna, no RLS tipo'
]) as interpretacion;
