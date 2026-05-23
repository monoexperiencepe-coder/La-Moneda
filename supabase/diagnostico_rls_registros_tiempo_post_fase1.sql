-- Post Fase 1 — public.registros_tiempo (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'registros_tiempo' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'registros_tiempo' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'registros_tiempo_select_tenant_active') = 1
    and count(*) filter (where policyname = 'registros_tiempo_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'registros_tiempo_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'registros_tiempo_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'registros_tiempo';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_registros_tiempo';

select count(*) as total, count(*) filter (where empresa_id is null) as sin_empresa from public.registros_tiempo;

-- DevTools (operador): SELECT ok; INSERT → 0 filas
