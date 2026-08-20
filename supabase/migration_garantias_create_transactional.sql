-- Alta atómica de garantía y entrega inicial.
-- Requiere compute_guarantee_from_movements(numeric, bigint), instalada por
-- migration_garantias_revert_movement_repair.sql.
--
-- SECURITY DEFINER: necesario para invocar compute_guarantee_from_movements,
-- que es un helper interno sin GRANT a authenticated (diseño intencional).
-- Tenant isolation y auth checks explícitos reemplazan la protección RLS.
-- Mismo patrón de seguridad que revert_guarantee_movement.

create or replace function public.create_driver_guarantee_with_initial_deposit(
  p_empresa_id         uuid,
  p_driver_id          text,
  p_current_vehicle_id bigint,
  p_vehicle_type       text,
  p_required_amount    numeric,
  p_initial_amount     numeric  default 0,
  p_notes              text     default null,
  p_movement_date      date     default null
)
returns public.driver_guarantees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid             uuid;
  v_role            text;
  v_profile_empresa uuid;
  v_empresa         uuid;
  v_guarantee       public.driver_guarantees%rowtype;
  v_computed        record;
begin
  -- ── 1. Identidad y sesión activa ─────────────────────────────────────────
  v_uid := public.rls_auth_uid();
  if v_uid is null or not coalesce(public.is_active_user(), false) then
    raise exception using errcode = '42501', message = 'usuario_no_autenticado';
  end if;

  -- ── 2. Rol autorizado ────────────────────────────────────────────────────
  v_role := lower(trim(coalesce(public.current_user_role(), '')));
  if v_role not in ('admin', 'contador', 'socio') then
    raise exception using errcode = '42501', message = 'rol_sin_permiso';
  end if;

  -- ── 3. Tenant isolation ──────────────────────────────────────────────────
  v_profile_empresa := public.current_user_empresa_id();

  -- La empresa viene siempre del perfil autenticado, nunca del parámetro.
  if v_profile_empresa is null then
    raise exception using errcode = '42501', message = 'empresa_no_configurada';
  end if;

  -- Si el llamante envía p_empresa_id, debe coincidir exactamente con el perfil.
  if p_empresa_id is not null and p_empresa_id <> v_profile_empresa then
    raise exception using errcode = '42501', message = 'empresa_no_coincide';
  end if;

  v_empresa := v_profile_empresa;

  -- ── 4. Validaciones de negocio ───────────────────────────────────────────
  if nullif(trim(p_driver_id), '') is null then
    raise exception using errcode = '22023', message = 'conductor_obligatorio';
  end if;

  if p_vehicle_type not in ('auto', 'camioneta') then
    raise exception using errcode = '22023', message = 'tipo_vehiculo_invalido';
  end if;

  if p_required_amount is null or p_required_amount < 0 then
    raise exception using errcode = '22023', message = 'monto_requerido_invalido';
  end if;

  if p_initial_amount is null or p_initial_amount < 0 then
    raise exception using errcode = '22023', message = 'monto_inicial_invalido';
  end if;

  -- ── 5. El conductor pertenece a esta empresa ─────────────────────────────
  if not exists (
    select 1
    from public.conductores
    where id          = trim(p_driver_id)
      and empresa_id  = v_empresa
  ) then
    raise exception using errcode = '22023', message = 'conductor_no_pertenece_empresa';
  end if;

  -- ── 6. El vehículo pertenece a esta empresa (solo si se indicó) ──────────
  if p_current_vehicle_id is not null then
    if not exists (
      select 1
      from public.vehiculos
      where id         = p_current_vehicle_id
        and empresa_id = v_empresa
    ) then
      raise exception using errcode = '22023', message = 'vehiculo_no_pertenece_empresa';
    end if;
  end if;

  -- ── 7. Transacción: crear garantía ───────────────────────────────────────
  insert into public.driver_guarantees (
    empresa_id, driver_id, current_vehicle_id, vehicle_type, required_amount,
    current_balance, total_contributed, total_deducted, status, notes, created_by
  ) values (
    v_empresa, trim(p_driver_id), p_current_vehicle_id, p_vehicle_type,
    round(p_required_amount, 2), 0, 0, 0, 'sin_garantia',
    nullif(trim(p_notes), ''), v_uid
  )
  returning * into v_guarantee;

  -- ── 8. Depósito inicial opcional ─────────────────────────────────────────
  if p_initial_amount > 0 then
    insert into public.guarantee_movements (
      empresa_id, guarantee_id, driver_id, vehicle_id, movement_type,
      direction, amount, observation, created_by, movement_date
    ) values (
      v_empresa, v_guarantee.id, v_guarantee.driver_id,
      p_current_vehicle_id, 'initial_deposit', 'credit',
      round(p_initial_amount, 2), 'Entrega inicial', v_uid,
      coalesce(p_movement_date, (timezone('America/Lima', now()))::date)
    );
  end if;

  -- ── 9. Recalcular saldos (helper interno sin GRANT a authenticated) ───────
  select * into strict v_computed
  from public.compute_guarantee_from_movements(v_guarantee.required_amount, v_guarantee.id);

  update public.driver_guarantees
  set current_balance   = v_computed.current_balance,
      total_contributed = v_computed.total_contributed,
      total_deducted    = v_computed.total_deducted,
      status            = v_computed.status,
      updated_at        = now()
  where id = v_guarantee.id
  returning * into v_guarantee;

  return v_guarantee;
end;
$$;

-- Grants: solo authenticated puede invocar el RPC público.
-- compute_guarantee_from_movements sigue sin GRANT a authenticated (helper interno).
revoke all on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) from public, anon;
grant execute on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) to authenticated;

comment on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) is 'Crea garantía, depósito inicial opcional y saldos derivados en una transacción. SECURITY DEFINER con checks explícitos de tenant, rol, conductor y vehículo.';
