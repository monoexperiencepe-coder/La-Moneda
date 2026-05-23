-- =============================================================================
-- Post-migración Fase 1 — public.financial_audit_logs (READ-ONLY)
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
where n.nspname = 'public' and c.relname = 'financial_audit_logs' and c.relkind = 'r';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'financial_audit_logs'
order by cmd, policyname;

select
  count(*) as policies,
  count(*) filter (where cmd = 'UPDATE') as update_policies,
  case
    when count(*) = 3
      and count(*) filter (where cmd = 'UPDATE') = 0
      and count(*) filter (where policyname = 'financial_audit_logs_select_tenant_finanzas') = 1
      and count(*) filter (where policyname = 'financial_audit_logs_insert_tenant_authenticated') = 1
      and count(*) filter (where policyname = 'financial_audit_logs_delete_admin') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'financial_audit_logs';

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_delete_financial_audit_logs';

select
  count(*) as total_logs,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas
from public.financial_audit_logs;

select unnest(array[
  'RLS ON + FORCE',
  '3 policies: select_tenant_finanzas + insert_tenant_authenticated + delete_admin',
  'Sin policy UPDATE (append-only)',
  'OPERADOR: SELECT → 0 filas',
  'OPERADOR: INSERT al mover/clasificar gasto → OK (user_id = auth.uid())',
  'ADMIN: SELECT historial → OK',
  'ADMIN: DELETE cleanup → OK',
  'Realtime INSERT → HistorialSistema recarga (admin)',
  'Undo / gastosService insertFinancialAuditLog sin error'
]) as prueba_manual;

/*
// Operador
await window.supabase.from('financial_audit_logs').select('id, action_type').limit(5)

// Admin
await window.supabase.from('financial_audit_logs').select('id, action_type').limit(5)
*/
