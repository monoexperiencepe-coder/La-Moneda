-- =============================================================================
-- Post-migración Fase 1 — public.kilometrajes (READ-ONLY)
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
where n.nspname = 'public' and c.relname = 'kilometrajes' and c.relkind = 'r';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'kilometrajes'
order by cmd, policyname;

select
  count(*) as total,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'kilometrajes_select_tenant_active') = 1
      and count(*) filter (where policyname = 'kilometrajes_insert_tenant_editors') = 1
      and count(*) filter (where policyname = 'kilometrajes_update_tenant_editors') = 1
      and count(*) filter (where policyname = 'kilometrajes_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'kilometrajes';

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_kilometrajes';

select
  count(*) as total_km,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas,
  count(distinct vehicle_id) as vehiculos_con_km
from public.kilometrajes;

select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('kilometrajes', 'vehiculos', 'conductores', 'unidades', 'gastos')
order by 1;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'kilometrajes'
  and grantee in ('anon', 'authenticated')
order by 1, 2;

-- Realtime: canal empresa-registros filtra empresa_id; RLS filtra por JWT en replica
select unnest(array[
  'OPERADOR: SELECT kilometrajes en Control Global / Mantenimiento (lectura KMS)',
  'OPERADOR: INSERT en kilometrajes → 0 filas (formulario Mantenimiento bloqueado por RLS si intenta guardar)',
  'ADMIN: registrar y borrar KM en Mantenimiento → OK',
  'Realtime: badge actualizado en vivo al cambiar KM (misma sesión admin)',
  'Dashboard Inicio / alertas operativas siguen leyendo kilometrajes del contexto'
]) as prueba_manual;

/*
// Operador
await window.supabase.from('kilometrajes').select('id, vehicle_id, fecha, kilometraje').limit(5)
await window.supabase.from('kilometrajes').insert({
  vehicle_id: 1,
  fecha: '2026-05-18',
  fecha_registro: '2026-05-18',
  kilometraje: 99999,
  descripcion: 'test-rls'
}).select()

// Admin — insert debe devolver 1 fila
*/
