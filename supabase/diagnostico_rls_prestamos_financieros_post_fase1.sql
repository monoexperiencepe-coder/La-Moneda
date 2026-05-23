-- Post Fase 1 — public.prestamos_financieros (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'prestamos_financieros' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'prestamos_financieros' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'prestamos_financieros_select_tenant_finanzas') = 1
    and count(*) filter (where policyname = 'prestamos_financieros_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'prestamos_financieros_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'prestamos_financieros_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'prestamos_financieros';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_prestamos_financieros';

select count(*) as total, count(*) filter (where empresa_id is null) as sin_empresa from public.prestamos_financieros;

-- DevTools operador: SELECT → []; admin: OK
