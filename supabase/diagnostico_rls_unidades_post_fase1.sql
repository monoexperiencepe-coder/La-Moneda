-- =============================================================================
-- Post-migración Fase 1 — public.unidades (READ-ONLY)
-- =============================================================================
-- Ejecutar después de migration_unidades_rls_fase1.sql
-- =============================================================================

select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  case
    when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1'
    when c.relrowsecurity then 'RLS_ON_SIN_FORCE'
    else 'CRITICO_RLS_OFF'
  end as estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'unidades' and c.relkind = 'r';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'unidades'
order by cmd, policyname;

select
  count(*) as total,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'unidades_select_tenant_active') = 1
      and count(*) filter (where policyname = 'unidades_insert_tenant_editors') = 1
      and count(*) filter (where policyname = 'unidades_update_tenant_editors') = 1
      and count(*) filter (where policyname = 'unidades_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'unidades';

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_unidades';

select
  count(*) as total_unidades,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas
from public.unidades;

select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('unidades', 'vehiculos', 'conductores', 'gastos', 'ingresos')
order by 1;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'unidades'
  and grantee in ('anon', 'authenticated')
order by 1, 2;

select unnest(array[
  'Login OPERADOR: SELECT unidades → filas de su empresa',
  'Login OPERADOR: DELETE/INSERT unidades → 0 filas o error',
  'Login ADMIN: Control Global / operaciones con conteo unidades OK',
  'vehiculos + conductores RLS sin cambios'
]) as prueba_manual;

/*
await window.supabase.from('unidades').select('id, numero_interno, marca, modelo').limit(3)
await window.supabase.from('unidades').delete().eq('id', 'UUID').select()
*/
