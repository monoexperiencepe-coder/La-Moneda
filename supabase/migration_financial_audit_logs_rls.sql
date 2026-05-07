-- Políticas RLS para financial_audit_logs.
-- Ejecutar después de: migration_financial_audit_logs.sql y migration_user_profiles.sql

alter table public.financial_audit_logs enable row level security;

drop policy if exists "financial_audit_logs_insert_own" on public.financial_audit_logs;
drop policy if exists "financial_audit_logs_select_admin" on public.financial_audit_logs;

-- INSERT: cada usuario autenticado solo puede registrar auditoría con su propio user_id (uuid texto).
create policy "financial_audit_logs_insert_own"
  on public.financial_audit_logs
  for insert
  to authenticated
  with check ((auth.uid())::text = user_id);

-- SELECT: solo perfiles admin activos pueden leer el historial completo.
create policy "financial_audit_logs_select_admin"
  on public.financial_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true) = true
        and p.role = 'admin'
    )
  );
