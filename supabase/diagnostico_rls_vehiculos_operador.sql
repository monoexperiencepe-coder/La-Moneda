-- =============================================================================
-- Diagnóstico RLS vehiculos — operador vs escritura (READ-ONLY)
-- =============================================================================
-- Parte A: catálogo (postgres / SQL Editor).
-- Parte B: pruebas con JWT (DevTools, sesión operador@ logueada).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1) RLS realmente activo en vehiculos
-- -----------------------------------------------------------------------------
select
  c.relname as tabla,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  case
    when c.relrowsecurity and c.relforcerowsecurity then 'OK_RLS_FORZADO'
    when c.relrowsecurity then 'RLS_ON (sin FORCE)'
    else 'CRITICO_RLS_OFF'
  end as estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'vehiculos'
  and c.relkind = 'r';

-- -----------------------------------------------------------------------------
-- A2) Policies vehiculos (buscar ALL / UPDATE permisivas / operador)
-- -----------------------------------------------------------------------------
select
  policyname,
  cmd,
  permissive,
  roles,
  qual as using_expr,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'vehiculos'
order by cmd, policyname;

select
  count(*) filter (where cmd = 'ALL') as policies_all,
  count(*) filter (where cmd = 'UPDATE') as policies_update,
  count(*) as total
from pg_policies
where schemaname = 'public'
  and tablename = 'vehiculos';

-- Expresiones que mencionan operador (no debería haber 'operador' en WITH CHECK de escritura)
select policyname, cmd, with_check, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'vehiculos'
  and (
    coalesce(with_check, '') ilike '%operador%'
    or coalesce(qual, '') ilike '%operador%'
  );

-- -----------------------------------------------------------------------------
-- A3) Helpers existentes
-- -----------------------------------------------------------------------------
select
  p.proname as funcion,
  pg_get_functiondef(p.oid) as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_admin',
    'is_restricted_operador_account',
    'can_mutate_vehiculos'
  )
order by p.proname;

-- -----------------------------------------------------------------------------
-- A4) Perfil operador@ en user_profiles (causa #1 si role ≠ operador)
-- -----------------------------------------------------------------------------
select
  id,
  email,
  role,
  lower(trim(role::text)) as role_normalizado,
  is_active,
  empresa_id,
  case
    when lower(trim(role::text)) = 'operador' then 'rol_operador_ok'
    when lower(trim(role::text)) in ('admin', 'contador', 'socio') then 'ALERTA: rol permite escritura RLS antigua'
    else 'rol_desconocido'
  end as diagnostico_rol,
  case
    when lower(trim(email)) = 'operador@lamoneda.com' then 'email_operador_restringido'
    else 'otro_email'
  end as diagnostico_email
from public.user_profiles
where lower(trim(email)) like '%operador%'
   or lower(trim(role::text)) = 'operador'
order by email;

-- Simulación: qué devolverían helpers SI auth.uid() fuera el id del operador@
-- (reemplazar :uid por id real de la fila anterior)
/*
select
  p.id,
  p.email,
  p.role,
  lower(trim(p.role::text)) in ('admin', 'contador', 'socio') as rol_en_lista_escritura,
  lower(trim(p.role::text)) = 'operador' as es_operador_rol
from public.user_profiles p
where p.id = 'UUID_OPERADOR'::uuid;
*/

-- -----------------------------------------------------------------------------
-- A5) Grants authenticated en vehiculos (con RLS OFF = UPDATE libre)
-- -----------------------------------------------------------------------------
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'vehiculos'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

select
  has_table_privilege('authenticated', 'public.vehiculos', 'SELECT') as auth_select,
  has_table_privilege('authenticated', 'public.vehiculos', 'UPDATE') as auth_update;

-- Nota: GRANT UPDATE + RLS OFF = operador puede mutar aunque existan policies inactivas.

-- -----------------------------------------------------------------------------
-- A6) Otras tablas críticas siguen sin RLS (piloto solo vehiculos)
-- -----------------------------------------------------------------------------
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('gastos', 'ingresos', 'conductores', 'user_profiles')
order by 1;

-- =============================================================================
-- B) Pruebas con JWT (F12 Console, npm run dev, login operador@)
-- =============================================================================
-- Requiere migration_vehiculos_rls_fase1_fix.sql aplicada.
--
-- 1) Helpers efectivos para TU sesión (no postgres):
/*
const { data: u } = await window.supabase.auth.getUser()
const uid = u?.user?.id
const { data: prof } = await window.supabase.from('user_profiles').select('email,role,is_active,empresa_id').eq('id', uid).single()
console.log('perfil', prof)

const { data: veh, error: e1 } = await window.supabase.from('vehiculos').select('id, placa, marca, empresa_id').limit(3)
console.log('SELECT', { veh, e1 })

const { data: up, error: e2, count } = await window.supabase
  .from('vehiculos')
  .update({ marca: 'test-rls-operador' })
  .eq('id', 1)
  .select('id, marca')
console.log('UPDATE', { up, e2, count })
// Esperado: up=[] o null, error puede ser null con 0 filas; marca en BD NO debe cambiar
*/

-- 2) Verificar fila id=1 tras intento UPDATE:
/*
const { data: row } = await window.supabase.from('vehiculos').select('id, marca').eq('id', 1).single()
console.log('fila', row)
*/

-- 3) Repetir UPDATE como admin/contador → debe afectar 1 fila si can_mutate_vehiculos=true

select unnest(array[
  'Paso 1: Ejecutar migration_vehiculos_rls_fase1_fix.sql en Supabase',
  'Paso 2: A1 debe mostrar OK_RLS_FORZADO',
  'Paso 3: A4 operador@ debe tener role=operador O fix manual si era socio/admin',
  'Paso 4: DevTools B1 UPDATE operador → 0 filas / sin cambio en marca',
  'Paso 5: DevTools B1 SELECT operador → filas de su empresa_id'
]) as checklist_manual;
