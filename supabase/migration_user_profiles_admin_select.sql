-- Permite a admins activos leer todos los perfiles (p. ej. resolución de nombres en auditoría).
-- Ejecutar después de migration_user_profiles.sql

create policy "user_profiles_select_admin_all"
  on public.user_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles self
      where self.id = auth.uid()
        and coalesce(self.is_active, true) = true
        and self.role = 'admin'
    )
  );
