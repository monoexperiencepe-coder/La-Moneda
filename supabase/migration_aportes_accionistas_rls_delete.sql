-- RLS: DELETE en aportes_accionistas (mismo criterio que INSERT: admin y contador).

drop policy if exists "aportes_accionistas_delete_finanzas" on public.aportes_accionistas;
create policy "aportes_accionistas_delete_finanzas"
  on public.aportes_accionistas for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  );
