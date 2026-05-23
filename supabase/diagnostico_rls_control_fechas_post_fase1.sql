-- Post Fase 1 — public.control_fechas + RPC (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'control_fechas' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'control_fechas' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'control_fechas_select_tenant_active') = 1
    and count(*) filter (where policyname = 'control_fechas_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'control_fechas_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'control_fechas_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'control_fechas';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('can_mutate_control_fechas', 'fetch_latest_control_fechas_by_vehicle');

select p.proname, p.prosecdef,
  case when not p.prosecdef then 'OK_RPC_INVOKER_RLS' else 'REVISAR_RPC_DEFINER' end as rpc_security
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fetch_latest_control_fechas_by_vehicle';

select count(*) as total, count(distinct vehicle_id) as vehiculos, count(distinct tipo) as tipos
from public.control_fechas;

select unnest(array[
  'Documentación / vencimientos: carga tabla',
  'Control Global: alertas',
  'Inicio: computeTodayReview',
  'Historial paginado en panel',
  'Operador: SELECT sí, INSERT/DELETE no',
  'Realtime control_fechas'
]) as prueba_manual;

/*
await window.supabase.rpc('fetch_latest_control_fechas_by_vehicle', { p_empresa_id: 'TU_EMPRESA_UUID' })
await window.supabase.from('control_fechas').select('id, tipo, fecha_vencimiento').limit(5)
*/
