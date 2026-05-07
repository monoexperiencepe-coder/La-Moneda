-- DELETE en financial_audit_logs: solo administradores activos.
-- Ejecutar después de migration_financial_audit_logs_rls.sql

drop policy if exists "financial_audit_logs_delete_admin" on public.financial_audit_logs;

create policy "financial_audit_logs_delete_admin"
  on public.financial_audit_logs
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true) = true
        and p.role = 'admin'
    )
  );
