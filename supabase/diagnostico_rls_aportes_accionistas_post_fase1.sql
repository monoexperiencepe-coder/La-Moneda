-- Post Fase 1 — public.aportes_accionistas (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'aportes_accionistas' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'aportes_accionistas' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'aportes_accionistas_select_tenant_finanzas') = 1
    and count(*) filter (where policyname = 'aportes_accionistas_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'aportes_accionistas_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'aportes_accionistas_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'aportes_accionistas';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_aportes_accionistas';

select count(*) as total, count(*) filter (where empresa_id is null) as sin_empresa from public.aportes_accionistas;

-- DevTools: operador SELECT → []; admin INSERT aporte → OK; realtime aportes panel
