-- =============================================================================
-- Post-migración — empresas, user_profiles, gastos_pendientes_revision (READ-ONLY)
-- =============================================================================

-- empresas
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
where n.nspname = 'public' and c.relname = 'empresas' and c.relkind = 'r';

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'empresas'
order by cmd, policyname;

select count(*) as policies,
  case when count(*) = 1 and count(*) filter (where policyname = 'empresas_select_tenant') = 1
    then 'OK_FASE1' else 'REVISAR' end as checklist
from pg_policies where schemaname = 'public' and tablename = 'empresas';

-- user_profiles
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
where n.nspname = 'public' and c.relname = 'user_profiles' and c.relkind = 'r';

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'user_profiles'
order by cmd, policyname;

select count(*) as policies,
  case
    when count(*) = 3
      and count(*) filter (where policyname = 'user_profiles_select_own') = 1
      and count(*) filter (where policyname = 'user_profiles_select_admin_tenant') = 1
      and count(*) filter (where policyname = 'user_profiles_update_admin_tenant') = 1
    then 'OK_FASE1'
    else 'REVISAR'
  end as checklist
from pg_policies where schemaname = 'public' and tablename = 'user_profiles';

-- Policies antiguas que NO deben quedar
select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename = 'user_profiles'
  and policyname in (
    'user can read own profile',
    'user can update own profile',
    'user_profiles_select_admin_all'
  );

-- gastos_pendientes_revision (vista)
select
  c.relname,
  c.relkind,
  c.reloptions,
  case
    when c.reloptions @> array['security_invoker=true'] then 'OK_SECURITY_INVOKER'
    else 'REVISAR_INVOKER'
  end as invoker_estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'gastos_pendientes_revision' and c.relkind = 'v';

select pg_get_viewdef('public.gastos_pendientes_revision'::regclass, true) as view_def;

select
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('empresas', 'user_profiles', 'gastos_pendientes_revision')
  and grantee in ('anon', 'authenticated', 'public')
group by grantee, table_name
order by table_name, grantee;

select
  count(*) as total_empresas,
  (select count(*) from public.user_profiles) as total_perfiles,
  (select count(*) from public.user_profiles where empresa_id is null) as perfiles_sin_empresa
from public.empresas;

select id, email, role, is_active, empresa_id
from public.user_profiles
where lower(trim(email)) in ('operador@lamoneda.com', 'admin@lamoneda.com')
   or lower(trim(role)) in ('operador', 'admin')
order by email
limit 20;

select unnest(array[
  'empresas: RLS ON + FORCE + 1 policy SELECT tenant',
  'user_profiles: RLS ON + FORCE + 3 policies (own / admin select / admin update)',
  'Sin policy UPDATE propio → operador no puede mutar su perfil vía API',
  'Login + AuthContext: SELECT propio perfil OK',
  'Admin: SELECT perfiles misma empresa (HistorialSistema lookup)',
  'Operador: SELECT solo su user_profiles (no lista empresa)',
  'anon: sin grants directos en empresas/user_profiles/vista',
  'gastos_pendientes_revision: security_invoker; filas = intersección RLS gastos',
  'App no usa la vista (usa public.gastos) — legacy documentada'
]) as prueba_manual;

/*
-- Sesión autenticada OPERADOR (DevTools)
await window.supabase.from('user_profiles').select('id, email, role, empresa_id').single();
await window.supabase.from('user_profiles').select('id, email').limit(10);
// solo 1 fila (propia)

await window.supabase.from('empresas').select('id, nombre').limit(5);
// 1 fila (su tenant)

await window.supabase.from('gastos_pendientes_revision').select('id, tipo_gasto').limit(5);
// solo pendiente_revision / requiere_revision visibles por RLS gastos

await window.supabase.from('user_profiles').update({ name: 'x' }).eq('id', (await window.supabase.auth.getUser()).data.user.id);
// error RLS

-- Sesión ADMIN
await window.supabase.from('user_profiles').select('id, email, role');
// perfiles de su empresa

await window.supabase.from('empresas').select('*');
// su empresa
*/
