-- =============================================================================
-- Post-migración Fase 1 — public.conductores (READ-ONLY)
-- =============================================================================
-- Ejecutar después de migration_conductores_rls_fase1.sql
-- =============================================================================

-- 1) RLS ON + FORCE en conductores
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
where n.nspname = 'public' and c.relname = 'conductores' and c.relkind = 'r';

-- 2) Policies (4 esperadas)
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'conductores'
order by cmd, policyname;

select
  count(*) as total,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'conductores_select_tenant_active') = 1
      and count(*) filter (where policyname = 'conductores_insert_tenant_editors') = 1
      and count(*) filter (where policyname = 'conductores_update_tenant_editors') = 1
      and count(*) filter (where policyname = 'conductores_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'conductores';

-- 3) Helper can_mutate_conductores
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_conductores';

-- 4) Datos tenant
select
  count(*) as total_conductores,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas
from public.conductores;

-- 5) Piloto: vehiculos sigue con RLS; conductores no debe afectar otras tablas
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('conductores', 'vehiculos', 'gastos', 'ingresos')
order by 1;

-- 6) Grants authenticated
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'conductores'
  and grantee in ('anon', 'authenticated')
order by 1, 2;

-- =============================================================================
-- Pruebas DevTools (sesión real — no postgres)
-- =============================================================================
select unnest(array[
  'Login OPERADOR: SELECT conductores → filas de su empresa',
  'Login OPERADOR: UPDATE conductores → 0 filas / sin cambio',
  'Login ADMIN: SELECT + UPDATE/INSERT/DELETE según UI Conductores',
  'Inventario vehiculos y gastos siguen funcionando (tablas no tocadas)'
]) as prueba_manual;

/*
// Operador — SELECT OK
await window.supabase.from('conductores').select('id, nombres, apellidos, empresa_id').limit(3)

// Operador — UPDATE debe fallar silencioso (0 filas)
const id = '...' // uuid o bigint según tu BD
await window.supabase.from('conductores').update({ comentarios: 'test-rls' }).eq('id', id).select()

// Admin — UPDATE debe afectar 1 fila
await window.supabase.from('conductores').update({ comentarios: 'ok-admin' }).eq('id', id).select()
*/
