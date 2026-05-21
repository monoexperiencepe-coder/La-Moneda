-- =============================================================================
-- DIAGNÓSTICO RLS — ESTADO REAL EN SUPABASE (READ-ONLY)
-- =============================================================================
-- Ejecutar en: Supabase → SQL Editor (recomendado: rol postgres / service_role
-- para ver el catálogo completo; también válido como usuario autenticado con
-- permisos de lectura en pg_catalog).
--
-- NO modifica nada. NO crea policies. NO activa RLS.
--
-- Orden sugerido: ejecutar sección por sección o todo el archivo.
-- Resultados: exportar cada result set para comparar con baseline futuro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Metadatos de la ejecución
-- -----------------------------------------------------------------------------
select
  current_database() as database,
  current_user as ejecutado_como,
  session_user as session_user,
  now() as ejecutado_en;

-- -----------------------------------------------------------------------------
-- 1) Tablas public con RLS activado / forzado
-- -----------------------------------------------------------------------------
select
  n.nspname as schema,
  c.relname as tabla,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  case
    when c.relrowsecurity and c.relforcerowsecurity then 'RLS activo (forzado también para owner)'
    when c.relrowsecurity then 'RLS activo'
    else 'RLS desactivado'
  end as estado_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')  -- tablas y particiones
order by c.relrowsecurity desc, c.relname;

-- Resumen conteo
select
  count(*) filter (where c.relrowsecurity) as tablas_con_rls,
  count(*) filter (where not c.relrowsecurity) as tablas_sin_rls,
  count(*) as total_tablas_public
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p');

-- -----------------------------------------------------------------------------
-- 2) Todas las policies existentes (detalle)
-- -----------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- Resumen policies por tabla y comando
select
  tablename,
  cmd,
  count(*) as num_policies,
  string_agg(policyname, ', ' order by policyname) as policy_names
from pg_policies
where schemaname = 'public'
group by tablename, cmd
order by tablename, cmd;

-- -----------------------------------------------------------------------------
-- 3) Tablas public SIN RLS (candidatas “abiertas” si hay grants amplios)
-- -----------------------------------------------------------------------------
select
  c.relname as tabla,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamano_aprox,
  (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  ) as policies_definidas_aunque_rls_off
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by c.relname;

-- -----------------------------------------------------------------------------
-- 4) Tablas CON RLS pero SIN policies (bloqueo total para roles sujetos a RLS)
-- -----------------------------------------------------------------------------
select
  c.relname as tabla,
  c.relforcerowsecurity as rls_forced,
  coalesce(pol.n, 0) as num_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join (
  select tablename, count(*) as n
  from pg_policies
  where schemaname = 'public'
  group by tablename
) pol on pol.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity
  and coalesce(pol.n, 0) = 0
order by c.relname;

-- Cobertura por comando en tablas con RLS (huecos SELECT/INSERT/UPDATE/DELETE)
with rls_tables as (
  select c.relname as tabla
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity
),
cmds as (
  select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL', 'TRUNCATE', 'REFERENCES']) as cmd
)
select
  t.tabla,
  c.cmd,
  coalesce(p.cnt, 0) as policies_para_cmd
from rls_tables t
cross join cmds c
left join (
  select tablename, cmd, count(*) as cnt
  from pg_policies
  where schemaname = 'public'
  group by tablename, cmd
) p on p.tablename = t.tabla and p.cmd = c.cmd
where coalesce(p.cnt, 0) = 0
order by t.tabla, c.cmd;

-- -----------------------------------------------------------------------------
-- 5) Grants en tablas public — anon, authenticated, service_role
-- -----------------------------------------------------------------------------
select
  grantee,
  table_schema,
  table_name,
  string_agg(distinct privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
group by grantee, table_schema, table_name
order by table_name, grantee;

-- Grants “peligrosos” típicos: anon con escritura o authenticated con TRUNCATE
select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
order by table_name, grantee, privilege_type;

-- Uso de has_table_privilege (muestra efectivo para roles Supabase)
select
  r.rolname as rol,
  c.relname as tabla,
  has_table_privilege(r.rolname, format('public.%I', c.relname), 'SELECT') as puede_select,
  has_table_privilege(r.rolname, format('public.%I', c.relname), 'INSERT') as puede_insert,
  has_table_privilege(r.rolname, format('public.%I', c.relname), 'UPDATE') as puede_update,
  has_table_privilege(r.rolname, format('public.%I', c.relname), 'DELETE') as puede_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (
  select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
) r
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'gastos', 'ingresos', 'vehiculos', 'conductores', 'control_fechas',
    'financial_audit_logs', 'user_profiles', 'kilometrajes', 'pendientes',
    'registros_tiempo', 'prestamos_financieros', 'prestamos_tramos',
    'aportes_accionistas', 'gastos_caja', 'caja_negocio_vehiculo'
  )
order by c.relname, r.rolname;

-- Nota: service_role y postgres suelen BYPASS RLS (no aparece en grants)
select
  rolname,
  rolsuper,
  rolbypassrls
from pg_roles
where rolname in ('postgres', 'service_role', 'authenticator', 'anon', 'authenticated', 'supabase_admin')
order by rolname;

-- -----------------------------------------------------------------------------
-- 6) Conflictos / duplicados / solapamientos
-- -----------------------------------------------------------------------------

-- 6a) Nombres de policy duplicados (no debería ocurrir en una misma tabla)
select
  tablename,
  policyname,
  count(*) as veces
from pg_policies
where schemaname = 'public'
group by tablename, policyname
having count(*) > 1;

-- 6b) Múltiples policies PERMISSIVE para el mismo rol + comando (solapamiento OR)
select
  tablename,
  cmd,
  roles,
  count(*) as num_policies_permisivas,
  string_agg(policyname, ' | ' order by policyname) as policies
from pg_policies
where schemaname = 'public'
  and permissive = 'PERMISSIVE'
group by tablename, cmd, roles
having count(*) > 1
order by count(*) desc, tablename, cmd;

-- 6c) Policies RESTRICTIVE (menos común; revisar interacción)
select *
from pg_policies
where schemaname = 'public'
  and permissive = 'RESTRICTIVE'
order by tablename, policyname;

-- 6d) financial_audit_logs: posible solapamiento SELECT (repo tiene dos migraciones)
select
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'financial_audit_logs'
order by cmd, policyname;

-- 6e) user_profiles: lectura propia + admin all (esperado; verificar ambas existen)
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'user_profiles'
order by cmd, policyname;

-- -----------------------------------------------------------------------------
-- 7) Tablas críticas — matriz de seguridad
-- -----------------------------------------------------------------------------
with criticas(tabla, criticidad, rls_esperada_repo) as (
  values
    ('gastos', 'CRITICO', 'NO (solo empresa_id; sin ENABLE RLS en migraciones repo)'),
    ('ingresos', 'CRITICO', 'SI (migration_ingresos_rls_policies.sql)'),
    ('vehiculos', 'CRITICO', 'NO'),
    ('conductores', 'CRITICO', 'NO'),
    ('control_fechas', 'CRITICO', 'NO (migration_control_fechas_kilometrajes.sql)'),
    ('financial_audit_logs', 'CRITICO', 'SI (varias migraciones)'),
    ('user_profiles', 'ALTO', 'SI'),
    ('kilometrajes', 'ALTO', 'NO'),
    ('pendientes', 'MEDIO', 'NO'),
    ('registros_tiempo', 'MEDIO', 'NO'),
    ('prestamos_financieros', 'ALTO', 'SI'),
    ('prestamos_tramos', 'ALTO', 'SI'),
    ('aportes_accionistas', 'ALTO', 'SI'),
    ('gastos_caja', 'MEDIO', 'NO'),
    ('caja_negocio_vehiculo', 'MEDIO', 'NO')
),
estado as (
  select
    c.relname as tabla,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced,
    coalesce(pol.total, 0) as total_policies,
    coalesce(pol.select_n, 0) as pol_select,
    coalesce(pol.insert_n, 0) as pol_insert,
    coalesce(pol.update_n, 0) as pol_update,
    coalesce(pol.delete_n, 0) as pol_delete
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join (
    select
      tablename,
      count(*) as total,
      count(*) filter (where cmd in ('SELECT', 'ALL')) as select_n,
      count(*) filter (where cmd in ('INSERT', 'ALL')) as insert_n,
      count(*) filter (where cmd in ('UPDATE', 'ALL')) as update_n,
      count(*) filter (where cmd in ('DELETE', 'ALL')) as delete_n
    from pg_policies
    where schemaname = 'public'
    group by tablename
  ) pol on pol.tablename = c.relname
  where n.nspname = 'public'
    and c.relkind = 'r'
)
select
  cr.tabla,
  cr.criticidad,
  cr.rls_esperada_repo,
  exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = cr.tabla and c.relkind = 'r') as existe_en_bd,
  e.rls_enabled,
  e.rls_forced,
  e.total_policies,
  e.pol_select,
  e.pol_insert,
  e.pol_update,
  e.pol_delete,
  case
    when not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = cr.tabla and c.relkind = 'r')
      then 'TABLA_NO_EXISTE'
    when cr.tabla in ('gastos', 'vehiculos', 'conductores', 'control_fechas')
         and not e.rls_enabled
      then 'ABIERTA_SIN_RLS — cualquier rol con GRANT accede a todas las filas'
    when e.rls_enabled and e.total_policies = 0
      then 'RLS_SIN_POLICIES — bloqueo para authenticated/anon (salvo bypass)'
    when e.rls_enabled and e.pol_select = 0
      then 'RLS_SIN_SELECT — lectura denegada salvo bypass'
    when cr.tabla = 'ingresos' and e.rls_enabled and e.total_policies > 0
      then 'RLS_PARCIAL — revisar si filtra empresa_id (repo: solo rol)'
    else 'REVISAR_MANUAL'
  end as diagnostico
from criticas cr
left join estado e on e.tabla = cr.tabla
order by
  case cr.criticidad when 'CRITICO' then 1 when 'ALTO' then 2 when 'MEDIO' then 3 else 4 end,
  cr.tabla;

-- Grants efectivos solo en críticas (anon / authenticated)
select
  c.relname as tabla,
  has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') as anon_select,
  has_table_privilege('anon', format('public.%I', c.relname), 'INSERT') as anon_insert,
  has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') as auth_select,
  has_table_privilege('authenticated', format('public.%I', c.relname), 'INSERT') as auth_insert,
  has_table_privilege('authenticated', format('public.%I', c.relname), 'UPDATE') as auth_update,
  has_table_privilege('authenticated', format('public.%I', c.relname), 'DELETE') as auth_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'gastos', 'ingresos', 'vehiculos', 'conductores', 'control_fechas', 'financial_audit_logs'
  )
order by c.relname;

-- empresa_id en críticas (prep RLS — no es policy pero afecta diseño)
select
  c.table_name as tabla,
  col.data_type as empresa_id_tipo,
  col.is_nullable,
  (select count(*) from information_schema.tables t
   where t.table_schema = 'public' and t.table_name = c.table_name) as tabla_existe
from (
  values
    ('gastos'), ('ingresos'), ('vehiculos'), ('conductores'), ('control_fechas'),
    ('financial_audit_logs'), ('user_profiles')
) as expected(table_name)
left join information_schema.columns col
  on col.table_schema = 'public'
  and col.table_name = expected.table_name
  and col.column_name = 'empresa_id'
order by expected.table_name;

-- Helpers RLS (Fase 0 prep — deben existir antes de nuevas policies)
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_role',
    'current_user_empresa_id',
    'is_active_user',
    'is_admin'
  )
order by p.proname;

-- Vistas public (pueden exponer datos aunque la tabla base tenga RLS)
select
  c.relname as vista,
  c.relkind,
  pg_get_viewdef(c.oid, true) as definicion
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and (
    c.relname ilike '%gasto%'
    or c.relname ilike '%ingreso%'
    or c.relname ilike '%pendiente%'
  )
order by c.relname;

-- -----------------------------------------------------------------------------
-- FIN — Guardar resultados de secciones 1, 2, 4, 5, 6b, 7 como baseline.
-- -----------------------------------------------------------------------------
