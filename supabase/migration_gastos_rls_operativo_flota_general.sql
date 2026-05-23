-- =============================================================================
-- RLS gastos — operativo_flota_general + categorías canónicas (idempotente)
-- =============================================================================
-- Objetivo:
--   • Reconocer operativo_flota_general como tipo_gasto válido (lectura/escritura finanzas).
--   • Admin/contador/socio: UPDATE hacia cualquier categoría canónica permitida.
--   • Operador restringido: solo globales + pendiente_revision (USING y WITH CHECK).
--
-- Orden seguro (sin CASCADE):
--   1) DROP POLICY gastos_update_tenant_role
--   2) DROP FUNCTION can_update_gasto_check(uuid)  — firma legacy
--   3) CREATE can_update_gasto_check(text, uuid)
--   4) CREATE POLICY gastos_update_tenant_role
--
-- NO desactiva RLS. NO modifica datos históricos.
-- Requiere: migration_gastos_rls_fase1.sql (+ helpers is_active_user, current_user_*)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Catálogo canónico de tipo_gasto (alias legacy → bucket UI)
-- ---------------------------------------------------------------------------
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

comment on function public.gastos_canonical_tipo_gasto(text, boolean) is
  'Mapea tipo_gasto legacy/null al bucket canónico UI. operativo_flota_general se persiste tal cual.';

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

comment on function public.gasto_tipo_gasto_permitido(text) is
  'true si tipo_gasto (o alias legacy) es una categoría financiera canónica admitida en la app.';

create or replace function public.gasto_tipo_operador_visible(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(trim(coalesce(p_tipo, ''))) in ('gastos_globales', 'pendiente_revision');
$$;

-- ---------------------------------------------------------------------------
-- 2) Helpers RLS — lectura / inserción / actualización (USING)
-- ---------------------------------------------------------------------------
create or replace function public.can_read_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(p.is_active, false)
        and p.empresa_id is not null
        and p_empresa_id = p.empresa_id
        and public.gasto_tipo_gasto_permitido(p_tipo)
        and (
          not (
            lower(trim(p.role::text)) = 'operador'
            or lower(trim(p.email)) = lower(trim(coalesce(
              nullif(current_setting('app.restricted_operador_email', true), ''),
              'operador@lamoneda.com'
            )))
          )
          or public.gasto_tipo_operador_visible(p_tipo)
        )
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.can_insert_gasto(p_tipo text, p_empresa_id uuid)
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
    and public.gasto_tipo_gasto_permitido(p_tipo)
    and (
      (
        not public.is_restricted_operador_account()
        and public.current_user_role() in ('admin', 'contador', 'socio')
      )
      or (
        public.is_restricted_operador_account()
        and public.gasto_tipo_operador_visible(p_tipo)
      )
    );
$$;

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
  'UPDATE USING: finanzas tenant; operador solo filas legibles vía can_read_gasto (OLD).';

-- ---------------------------------------------------------------------------
-- 3) WITH CHECK — orden: policy → función legacy → función nueva → policy
-- ---------------------------------------------------------------------------

-- Paso 1: quitar dependencia de la policy sobre can_update_gasto_check(uuid)
drop policy if exists "gastos_update_tenant_role" on public.gastos;

-- Paso 2: eliminar firma legacy (uuid) si aún existe
drop function if exists public.can_update_gasto_check(uuid);

-- Paso 3: crear / actualizar firma nueva (text, uuid)
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
  'UPDATE gastos WITH CHECK: tenant + categoría destino válida; operador puede clasificar a cualquier tipo permitido (SELECT sigue restringido).';

revoke all on function public.gasto_tipo_gasto_permitido(text) from public;
grant execute on function public.gasto_tipo_gasto_permitido(text) to authenticated;

revoke all on function public.can_update_gasto_check(text, uuid) from public;
grant execute on function public.can_update_gasto_check(text, uuid) to authenticated;

-- Paso 4: recrear policy UPDATE (WITH CHECK usa tipo_gasto destino = fila NEW)
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

-- ---------------------------------------------------------------------------
-- Verificación post-commit (READ-ONLY)
-- ---------------------------------------------------------------------------
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check'
order by args;

select
  case
    when count(*) filter (where pg_get_function_identity_arguments(p.oid) = 'p_tipo_gasto text, p_empresa_id uuid') = 1
      then 'OK_NUEVA_FIRMA'
    else 'REVISAR_FIRMA'
  end as can_update_gasto_check_estado,
  count(*) filter (where pg_get_function_identity_arguments(p.oid) = 'p_new_empresa_id uuid') as legacy_uuid_restante
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check';

select policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'gastos'
  and policyname = 'gastos_update_tenant_role';

select
  public.gasto_tipo_gasto_permitido('operativo_flota_general') as permitido_flota_general,
  public.gasto_tipo_operador_visible('operativo_flota_general') as operador_ve_flota_general;
