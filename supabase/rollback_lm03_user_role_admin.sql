-- =============================================================================
-- LM-03 ROLLBACK — revierte objetos LM-03; conserva user_role_change_log (historial).
-- Ejecutar solo en staging/prod tras aprobación. Idempotente donde es posible.
-- =============================================================================

-- 1) RPC y helpers LM-03
drop function if exists public.admin_update_user_role(uuid, text);
drop function if exists public.user_profiles_role_column_unchanged(uuid, text);
drop function if exists public.is_lm_protected_role_manager(uuid);
drop function if exists public.is_lm_role_manager(uuid);

-- 2) Trigger guard
drop trigger if exists trg_guard_user_profiles_role_update on public.user_profiles;
drop function if exists public.guard_user_profiles_role_update();

-- 3) Política audit log LM-03
drop policy if exists "user_role_change_log_select_role_managers" on public.user_role_change_log;

-- 4) Restaurar policy UPDATE admin (sin bloqueo explícito de columna role)
drop policy if exists "user_profiles_update_admin_tenant" on public.user_profiles;
create policy "user_profiles_update_admin_tenant"
  on public.user_profiles
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  );

-- 5) Realtime (opcional — comentar si otros entornos dependen de user_profiles realtime)
do $$
begin
  alter publication supabase_realtime drop table public.user_profiles;
exception when undefined_object then null;
end $$;

-- Historial: NO drop table user_role_change_log (rollback sin pérdida de auditoría).
