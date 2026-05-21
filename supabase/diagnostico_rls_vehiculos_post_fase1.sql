-- =============================================================================
-- Post-migración Fase 1 — public.vehiculos (READ-ONLY)
-- =============================================================================
-- Ejecutar después de migration_vehiculos_rls_fase1.sql
-- En SQL Editor como postgres verás conteos totales (bypass RLS).
-- Pruebas de rol (operador vs admin) requieren la app o API con JWT real.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) RLS activado solo en vehiculos (piloto)
-- -----------------------------------------------------------------------------
select
  c.relname as tabla,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname = 'vehiculos';

-- Comparar críticas: solo vehiculos debe estar ON (resto OFF en piloto)
select
  c.relname as tabla,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
   where p.schemaname = 'public' and p.tablename = c.relname) as num_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'vehiculos', 'gastos', 'ingresos', 'conductores', 'control_fechas',
    'financial_audit_logs', 'user_profiles'
  )
order by c.relname;

-- -----------------------------------------------------------------------------
-- 2) Policies vehiculos (nombres controlados Fase 1)
-- -----------------------------------------------------------------------------
select
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expr,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'vehiculos'
order by cmd, policyname;

-- Esperado: exactamente 4 policies
select
  count(*) as total_policies,
  count(*) filter (where policyname = 'vehiculos_select_tenant_active') as tiene_select,
  count(*) filter (where policyname = 'vehiculos_insert_tenant_editors') as tiene_insert,
  count(*) filter (where policyname = 'vehiculos_update_tenant_editors') as tiene_update,
  count(*) filter (where policyname = 'vehiculos_delete_tenant_editors') as tiene_delete,
  case
    when count(*) = 4
      and count(*) filter (where policyname = 'vehiculos_select_tenant_active') = 1
      and count(*) filter (where policyname = 'vehiculos_insert_tenant_editors') = 1
      and count(*) filter (where policyname = 'vehiculos_update_tenant_editors') = 1
      and count(*) filter (where policyname = 'vehiculos_delete_tenant_editors') = 1
    then 'OK_FASE1'
    else 'REVISAR_POLICIES'
  end as checklist_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'vehiculos';

-- -----------------------------------------------------------------------------
-- 3) Datos y empresa_id (soporte tenant)
-- -----------------------------------------------------------------------------
select
  count(*) as total_vehiculos,
  count(*) filter (where empresa_id is null) as sin_empresa_id,
  count(distinct empresa_id) as empresas_distintas
from public.vehiculos;

select empresa_id, count(*) as n
from public.vehiculos
group by empresa_id
order by n desc;

-- Perfiles activos por rol (para pruebas manuales en app)
select
  role,
  count(*) as usuarios,
  count(distinct empresa_id) as empresas
from public.user_profiles
where coalesce(is_active, true) = true
group by role
order by role;

-- -----------------------------------------------------------------------------
-- 4) Conteo visible — referencia postgres (bypass RLS)
-- -----------------------------------------------------------------------------
-- Como postgres/service_role: total real en tabla
select count(*) as total_bypass_rls from public.vehiculos;

-- Por empresa (alinear con user_profiles.empresa_id del tester)
select
  v.empresa_id,
  count(*) as vehiculos_en_empresa
from public.vehiculos v
group by v.empresa_id
order by vehiculos_en_empresa desc;

-- -----------------------------------------------------------------------------
-- 5) Helpers RLS (deben existir)
-- -----------------------------------------------------------------------------
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user'
  )
order by p.proname;

-- -----------------------------------------------------------------------------
-- 6) Grants efectivos en vehiculos (anon / authenticated)
-- -----------------------------------------------------------------------------
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'vehiculos'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

select
  has_table_privilege('authenticated', 'public.vehiculos', 'SELECT') as auth_select,
  has_table_privilege('authenticated', 'public.vehiculos', 'INSERT') as auth_insert,
  has_table_privilege('authenticated', 'public.vehiculos', 'UPDATE') as auth_update,
  has_table_privilege('authenticated', 'public.vehiculos', 'DELETE') as auth_delete;

-- -----------------------------------------------------------------------------
-- 7) CHECKLIST MANUAL (app con JWT — no ejecutable solo con postgres)
-- -----------------------------------------------------------------------------
select unnest(array[
  'A) Login ADMIN: Inventario /vehiculos carga flota (count > 0 si hay datos)',
  'B) Login ADMIN: SELECT vehiculos en Network → 200, filas = empresa del perfil',
  'C) Login OPERADOR: misma lectura de flota (SELECT permitido)',
  'D) Login OPERADOR: intentar UPDATE/DELETE (SQL o futura UI) → debe fallar / 0 filas',
  'E) Login CONTADOR/SOCIO: lectura OK; escritura permitida si hay UI/API de mutación',
  'F) Usuario inactivo (is_active=false): lista vacía o error auth',
  'G) Perfil sin empresa_id: lista vacía (current_user_empresa_id NULL)',
  'H) Realtime vehiculos: sigue recibiendo cambios del tenant (RLS en replica)'
]) as prueba_manual_app;

-- -----------------------------------------------------------------------------
-- 8) Prueba UPDATE operador (opcional, reemplazar UUIDs)
-- -----------------------------------------------------------------------------
-- Sustituir :uid_operador y :vehiculo_id antes de ejecutar en entorno de prueba.
-- Desde la app, más fiable: abrir consola con sesión operador y:
--   await supabase.from('vehiculos').update({ marca: 'test' }).eq('id', ID)
-- Esperado: error RLS o 0 rows.
--
-- select id, email, role, empresa_id from public.user_profiles where role = 'operador' limit 5;
