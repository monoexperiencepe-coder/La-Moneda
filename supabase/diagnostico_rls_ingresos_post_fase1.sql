-- =============================================================================
-- Post-migración Fase 1 — public.ingresos (READ-ONLY)
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
where n.nspname = 'public' and c.relname = 'ingresos' and c.relkind = 'r';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'ingresos'
order by cmd, policyname;

select
  count(*) as policies,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'ingresos_select_tenant_finanzas') = 1
      and count(*) filter (where policyname = 'ingresos_insert_tenant_editors') = 1
      and count(*) filter (where policyname = 'ingresos_update_tenant_editors') = 1
      and count(*) filter (where policyname = 'ingresos_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public' and tablename = 'ingresos';

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'can_mutate_ingresos';

select
  count(*) as total_ingresos,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas
from public.ingresos;

-- Perfiles (ajustar emails en prueba manual)
select id, email, role, is_active, empresa_id
from public.user_profiles
where lower(trim(email)) in ('operador@lamoneda.com', 'admin@lamoneda.com')
   or lower(trim(role)) in ('operador', 'admin')
order by email
limit 20;

select unnest(array[
  'RLS ON + FORCE en ingresos',
  '4 policies: ingresos_select_tenant_finanzas + insert/update/delete_tenant_editors',
  'OPERADOR / operador@: SELECT ingresos → 0 filas (bloqueado)',
  'OPERADOR: INSERT/UPDATE/DELETE → 0 filas o error RLS',
  'ADMIN / contador / socio: SELECT tenant OK',
  'ADMIN: INSERT ingreso → OK',
  'Finanzas → Ingresos UI carga para admin',
  'Operador: app no rompe (ingresos=[] en contexto; sin ruta finanzas/ingresos)'
]) as prueba_manual;

/*
// Sesión OPERADOR (DevTools)
await window.supabase.from('ingresos').select('id, monto, fecha').limit(5)
await window.supabase.from('ingresos').insert({
  empresa_id: 'TU_EMPRESA_UUID',
  fecha: '2026-05-18',
  fecha_registro: '2026-05-18',
  vehicle_id: 1,
  tipo: 'test',
  metodo_pago: 'efectivo',
  metodo_pago_detalle: '',
  signo: '+',
  monto: 1,
  comentarios: 'rls-test'
}).select()

// Sesión ADMIN
await window.supabase.from('ingresos').select('id, monto').limit(5)
*/
