-- Post Fase 1 — public.caja_negocio_vehiculo (READ-ONLY)
select c.relrowsecurity, c.relforcerowsecurity,
  case when c.relrowsecurity and c.relforcerowsecurity then 'OK_FASE1' else 'REVISAR' end as estado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'caja_negocio_vehiculo' and c.relkind = 'r';

select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'caja_negocio_vehiculo' order by cmd;

select count(*) as policies,
  case when count(*) = 4 then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'caja_negocio_vehiculo';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_caja_negocio_vehiculo';

select count(*) as total, count(*) filter (where empresa_id is null) as sin_empresa from public.caja_negocio_vehiculo;

-- Realtime: empresa-registros + filter empresa_id
