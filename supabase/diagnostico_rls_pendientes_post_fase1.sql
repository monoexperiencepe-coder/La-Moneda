-- Post Fase 1 — public.pendientes (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'pendientes' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'pendientes' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'pendientes_select_tenant_active') = 1
    and count(*) filter (where policyname = 'pendientes_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'pendientes_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'pendientes_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'pendientes';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_pendientes';

select count(*) as total, count(*) filter (where empresa_id is null) as sin_empresa from public.pendientes;

-- DevTools (operador): SELECT ok; INSERT/UPDATE/DELETE → 0 filas
