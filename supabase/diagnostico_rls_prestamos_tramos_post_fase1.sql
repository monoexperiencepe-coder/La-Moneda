-- Post Fase 1 — public.prestamos_tramos (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'prestamos_tramos' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'prestamos_tramos' order by cmd;

select count(*) as policies,
  case when count(*) = 4
    and count(*) filter (where policyname = 'prestamos_tramos_select_tenant_finanzas') = 1
    and count(*) filter (where policyname = 'prestamos_tramos_insert_tenant_editors') = 1
    and count(*) filter (where policyname = 'prestamos_tramos_update_tenant_editors') = 1
    and count(*) filter (where policyname = 'prestamos_tramos_delete_tenant_editors') = 1
  then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'prestamos_tramos';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_prestamos_tramos';

select
  count(*) as total_tramos,
  count(*) filter (where empresa_id is null) as sin_empresa,
  count(*) filter (where not exists (
    select 1 from public.prestamos_financieros pf
    where pf.id = t.prestamo_financiero_id and pf.empresa_id = t.empresa_id
  )) as desalineados_con_padre
from public.prestamos_tramos t;

-- Realtime: filter empresa_id=eq.{tenant}
