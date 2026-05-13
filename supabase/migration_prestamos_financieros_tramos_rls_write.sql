-- RLS: INSERT/UPDATE en préstamos y tramos para quienes editan finanzas.
-- Alineado con canEditFinances en la app: solo admin y contador (no socio/operador).

drop policy if exists "prestamos_financieros_insert_finanzas" on public.prestamos_financieros;
create policy "prestamos_financieros_insert_finanzas"
  on public.prestamos_financieros for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  );

drop policy if exists "prestamos_financieros_update_finanzas" on public.prestamos_financieros;
create policy "prestamos_financieros_update_finanzas"
  on public.prestamos_financieros for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  );

drop policy if exists "prestamos_tramos_insert_finanzas" on public.prestamos_tramos;
create policy "prestamos_tramos_insert_finanzas"
  on public.prestamos_tramos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
    and exists (
      select 1 from public.prestamos_financieros pf
      where pf.id = prestamos_tramos.prestamo_financiero_id
    )
  );

drop policy if exists "prestamos_tramos_update_finanzas" on public.prestamos_tramos;
create policy "prestamos_tramos_update_finanzas"
  on public.prestamos_tramos for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
    and exists (
      select 1 from public.prestamos_financieros pf
      where pf.id = prestamos_tramos.prestamo_financiero_id
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
    and exists (
      select 1 from public.prestamos_financieros pf
      where pf.id = prestamos_tramos.prestamo_financiero_id
    )
  );

comment on policy "prestamos_financieros_insert_finanzas" on public.prestamos_financieros is
  'Alta de préstamo desde app o SQL; rol admin|contador.';
comment on policy "prestamos_financieros_update_finanzas" on public.prestamos_financieros is
  'Edición de condiciones del préstamo; rol admin|contador.';
comment on policy "prestamos_tramos_insert_finanzas" on public.prestamos_tramos is
  'Alta de tramo ligado a préstamo existente; rol admin|contador.';
comment on policy "prestamos_tramos_update_finanzas" on public.prestamos_tramos is
  'Edición de tramos; rol admin|contador.';
