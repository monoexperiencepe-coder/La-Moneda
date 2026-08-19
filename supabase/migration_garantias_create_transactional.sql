-- Alta atómica de garantía y entrega inicial.
-- Requiere compute_guarantee_from_movements(numeric, bigint), instalada por
-- migration_garantias_revert_movement_repair.sql.

create or replace function public.create_driver_guarantee_with_initial_deposit(
  p_empresa_id uuid,
  p_driver_id text,
  p_current_vehicle_id bigint,
  p_vehicle_type text,
  p_required_amount numeric,
  p_initial_amount numeric default 0,
  p_notes text default null,
  p_movement_date date default null
)
returns public.driver_guarantees
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_guarantee public.driver_guarantees%rowtype;
  v_computed record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'usuario_no_autenticado';
  end if;
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

  insert into public.driver_guarantees (
    empresa_id, driver_id, current_vehicle_id, vehicle_type, required_amount,
    current_balance, total_contributed, total_deducted, status, notes, created_by
  ) values (
    p_empresa_id, trim(p_driver_id), p_current_vehicle_id, p_vehicle_type,
    round(p_required_amount, 2), 0, 0, 0, 'sin_garantia',
    nullif(trim(p_notes), ''), v_user_id
  )
  returning * into v_guarantee;

  if p_initial_amount > 0 then
    insert into public.guarantee_movements (
      empresa_id, guarantee_id, driver_id, vehicle_id, movement_type,
      direction, amount, observation, created_by, movement_date
    ) values (
      p_empresa_id, v_guarantee.id, v_guarantee.driver_id,
      p_current_vehicle_id, 'initial_deposit', 'credit',
      round(p_initial_amount, 2), 'Entrega inicial', v_user_id,
      coalesce(p_movement_date, (timezone('America/Lima', now()))::date)
    );
  end if;

  select * into strict v_computed
  from public.compute_guarantee_from_movements(v_guarantee.required_amount, v_guarantee.id);

  update public.driver_guarantees
  set current_balance = v_computed.current_balance,
      total_contributed = v_computed.total_contributed,
      total_deducted = v_computed.total_deducted,
      status = v_computed.status,
      updated_at = now()
  where id = v_guarantee.id
  returning * into v_guarantee;

  return v_guarantee;
end;
$$;

revoke all on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) from public, anon;
grant execute on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) to authenticated;

comment on function public.create_driver_guarantee_with_initial_deposit(
  uuid, text, bigint, text, numeric, numeric, text, date
) is 'Crea garantía, depósito inicial opcional y saldos derivados en una transacción.';
