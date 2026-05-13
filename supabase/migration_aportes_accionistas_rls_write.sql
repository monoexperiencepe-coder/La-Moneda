-- RLS: INSERT en aportes_accionistas (admin y contador, alineado con canEditFinances).

drop policy if exists "aportes_accionistas_insert_finanzas" on public.aportes_accionistas;
create policy "aportes_accionistas_insert_finanzas"
  on public.aportes_accionistas for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  );
