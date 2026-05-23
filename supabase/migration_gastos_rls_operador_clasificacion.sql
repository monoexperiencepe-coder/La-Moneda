-- =============================================================================
-- RLS gastos — operador clasifica hacia cualquier categoría válida (v2, idempotente)
-- =============================================================================
-- Regla:
--   • SELECT operador: solo gastos_globales + pendiente_revision (sin cambio).
--   • UPDATE USING operador: solo filas que puede LEER (can_read_gasto OLD).
--   • UPDATE WITH CHECK operador: cualquier tipo_gasto permitido (clasificación).
--   • Admin/contador/socio: USING/WITH CHECK sin restricción extra de lectura.
--
-- Orden seguro: DROP POLICY → DROP legacy (uuid) → helpers → CREATE POLICY
-- NO CASCADE. NO desactiva RLS. NO modifica datos.
-- =============================================================================

begin;

-- Canonical (requerido por gasto_tipo_gasto_permitido)
create or replace function public.gastos_canonical_tipo_gasto(p_tipo_gasto text, p_has_vehicle boolean)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when nullif(btrim(p_tipo_gasto), '') is null and p_has_vehicle then 'operativo_vehiculo'
    when nullif(btrim(p_tipo_gasto), '') is null then 'gastos_globales'
    when btrim(p_tipo_gasto) = 'financiero' then 'financiero_prestamo'
    when btrim(p_tipo_gasto) = 'inversion' then 'inversion_compra'
    when btrim(p_tipo_gasto) = 'operativo_flota_global' then 'gastos_globales'
    when btrim(p_tipo_gasto) in ('personal_socios', 'personal_socios_familiares', 'personales')
      then 'representacion_interna'
    else btrim(p_tipo_gasto)
  end;
$$;

create or replace function public.gasto_tipo_gasto_permitido(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.gastos_canonical_tipo_gasto(p_tipo, false) in (
    'operativo_vehiculo',
    'operativo_flota_general',
    'gastos_globales',
    'administrativo_empresa',
    'financiero_prestamo',
    'planilla_laboral',
    'inversion_compra',
    'representacion_interna',
    'pendiente_revision'
  );
$$;

create or replace function public.gasto_tipo_operador_visible(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(trim(coalesce(p_tipo, ''))) in ('gastos_globales', 'pendiente_revision');
$$;

-- USING: operador solo filas legibles; finanzas sin gate extra en tipo OLD
create or replace function public.can_update_gasto_using(p_old_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or (
        public.is_restricted_operador_account()
        and public.can_read_gasto(p_old_tipo, p_empresa_id)
      )
    );
$$;

comment on function public.can_update_gasto_using(text, uuid) is
  'UPDATE USING: finanzas tenant; operador solo filas que can_read_gasto permite (OLD).';

-- WITH CHECK: operador puede clasificar a cualquier categoría válida
create or replace function public.can_update_gasto_check(p_tipo_gasto text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_active_user() = true
    and p_empresa_id is not null
    and p_empresa_id = public.current_user_empresa_id()
    and public.gasto_tipo_gasto_permitido(p_tipo_gasto)
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or public.is_restricted_operador_account()
    );
$$;

comment on function public.can_update_gasto_check(text, uuid) is
  'UPDATE WITH CHECK: destino válido; operador clasifica sin ampliar SELECT.';

revoke all on function public.gasto_tipo_gasto_permitido(text) from public;
grant execute on function public.gasto_tipo_gasto_permitido(text) to authenticated;

revoke all on function public.can_update_gasto_using(text, uuid) from public;
grant execute on function public.can_update_gasto_using(text, uuid) to authenticated;

-- Policy: soltar dependencia legacy antes de DROP FUNCTION (uuid)
drop policy if exists "gastos_update_tenant_role" on public.gastos;
drop function if exists public.can_update_gasto_check(uuid);

revoke all on function public.can_update_gasto_check(text, uuid) from public;
grant execute on function public.can_update_gasto_check(text, uuid) to authenticated;

create policy "gastos_update_tenant_role"
  on public.gastos
  for update
  to authenticated
  using (
    public.can_update_gasto_using(tipo_gasto, empresa_id)
  )
  with check (
    public.can_update_gasto_check(tipo_gasto, empresa_id)
  );

commit;

-- Verificación post-commit
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check'
order by args;

select policyname, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'gastos'
  and policyname = 'gastos_update_tenant_role';
