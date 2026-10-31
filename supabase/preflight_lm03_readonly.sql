-- LM-03 preflight (SOLO LECTURA) — ejecutar en SQL Editor antes de migración.
-- Project ref esperado: cqzwyckbhqfpgtbtizkr

-- 1) Identidades gestores
select id, email, role, is_active, empresa_id
from public.user_profiles
where id in (
  '2418065a-e7b1-41b6-840d-b49dfa353285'::uuid,
  '9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f'::uuid,
  'd666cb8f-8788-4579-8da2-eb19bbbb31c6'::uuid
)
order by email;

-- 2) Distribución de roles (no debe cambiar tras migración)
select role, count(*) from public.user_profiles group by role order by role;

-- 3) Objetos LM-03 ya presentes?
select to_regclass('public.user_role_change_log') as audit_log_table;

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_lm_role_manager',
    'admin_update_user_role',
    'guard_user_profiles_role_update',
    'user_profiles_role_column_unchanged'
  )
order by 1;

select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_profiles'
  and not t.tgisinternal
  and tgname = 'trg_guard_user_profiles_role_update';

select policyname, cmd, qual is not null as has_using, with_check is not null as has_check
from pg_policies
where schemaname = 'public' and tablename = 'user_profiles'
order by policyname;

-- 4) Realtime publication
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'user_profiles';

-- 5) Dependencias mínimas
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_active_user', 'is_admin', 'current_user_empresa_id')
order by 1;
