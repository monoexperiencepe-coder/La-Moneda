-- =============================================================================
-- Post-migración Fase 1 — public.gastos (READ-ONLY)
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
where n.nspname = 'public' and c.relname = 'gastos' and c.relkind = 'r';

select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'gastos'
order by cmd, policyname;

select
  count(*) as policies,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'gastos_select_tenant_role') = 1
      and count(*) filter (where policyname = 'gastos_insert_tenant_role') = 1
      and count(*) filter (where policyname = 'gastos_update_tenant_role') = 1
      and count(*) filter (where policyname = 'gastos_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'gastos';

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'gasto_tipo_operador_visible',
    'can_read_gasto',
    'can_insert_gasto',
    'can_update_gasto_using',
    'can_update_gasto_check',
    'can_delete_gasto'
  )
order by proname;

select
  count(*) as total_gastos,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas,
  count(*) filter (where public.gasto_tipo_operador_visible(tipo_gasto)) as visibles_operador,
  count(*) filter (where not public.gasto_tipo_operador_visible(tipo_gasto)) as solo_finanzas
from public.gastos;

select lower(trim(tipo_gasto)) as tipo, count(*) as n
from public.gastos
group by 1
order by n desc
limit 30;

select id, email, role, is_active, empresa_id
from public.user_profiles
where lower(trim(email)) in ('operador@lamoneda.com', 'admin@lamoneda.com')
   or lower(trim(role)) in ('operador', 'admin', 'contador', 'socio')
order by email
limit 20;

select unnest(array[
  'RLS ON + FORCE en gastos',
  '4 policies: gastos_select/insert/update/delete_tenant_*',
  'ADMIN/contador/socio: SELECT todos los gastos del tenant',
  'OPERADOR/operador@: SELECT solo gastos_globales + pendiente_revision',
  'OPERADOR: INSERT solo globales/pendiente',
  'OPERADOR: UPDATE fila en globales/pendiente → puede mover a otra categoría',
  'OPERADOR: UPDATE fila operativo_vehiculo (no visible) → 0 filas / RLS',
  'OPERADOR: DELETE → bloqueado',
  'ADMIN: mover categoría + undo + audit log OK',
  'Realtime: operador no recibe upsert de categorías no visibles',
  'Finanzas gastos / conciliación / reportes / resumen siguen OK para admin'
]) as prueba_manual;

/*
-- Sesión OPERADOR (DevTools; reemplaza TU_EMPRESA_UUID)
const E = '07593982-08e6-450c-8abe-4bf590609dd7';

await window.supabase.from('gastos').select('id, tipo_gasto, monto').limit(20);
// Solo gastos_globales y pendiente_revision

await window.supabase.from('gastos').select('id, tipo_gasto').eq('tipo_gasto', 'operativo_vehiculo').limit(5);
// []

const { data: row } = await window.supabase.from('gastos')
  .select('id, tipo_gasto').eq('tipo_gasto', 'gastos_globales').limit(1).maybeSingle();
if (row) {
  await window.supabase.from('gastos').update({ tipo_gasto: 'operativo_vehiculo' }).eq('id', row.id).select();
  // OK; luego SELECT ya no devuelve esa fila para operador
}

await window.supabase.from('gastos').delete().eq('id', row?.id ?? -1);
// error / 0 filas

// Sesión ADMIN
await window.supabase.from('gastos').select('id, tipo_gasto').limit(5);
await window.supabase.from('gastos').select('id').eq('tipo_gasto', 'operativo_vehiculo').limit(3);
*/
