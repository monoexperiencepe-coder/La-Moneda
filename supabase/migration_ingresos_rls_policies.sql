-- Políticas RLS para public.ingresos según roles en user_profiles.
-- Ejecutar después de migration_user_profiles.sql (y tener filas de perfil por usuario).
--
-- SELECT: admin, socio, contador, operador (lectura operativa y financiera).
-- INSERT: admin, contador, operador (alta desde campo / UI).
-- UPDATE / DELETE: solo admin y contador (socio y operador sin mutación ni borrado).

alter table public.ingresos enable row level security;

drop policy if exists "ingresos_select_finanzas" on public.ingresos;
drop policy if exists "ingresos_insert_finanzas" on public.ingresos;
drop policy if exists "ingresos_update_finanzas_editors" on public.ingresos;
drop policy if exists "ingresos_delete_finanzas_editors" on public.ingresos;

create policy "ingresos_select_finanzas"
  on public.ingresos for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'socio', 'contador', 'operador')
    )
  );

create policy "ingresos_insert_finanzas"
  on public.ingresos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador', 'operador')
    )
  );

create policy "ingresos_update_finanzas_editors"
  on public.ingresos for update
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

create policy "ingresos_delete_finanzas_editors"
  on public.ingresos for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'contador')
    )
  );
