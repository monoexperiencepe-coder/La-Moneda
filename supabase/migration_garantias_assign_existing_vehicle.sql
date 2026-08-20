-- Impide que una unidad tenga más de una garantía activa dentro del tenant.
create unique index if not exists driver_guarantees_one_active_per_vehicle_uidx
  on public.driver_guarantees (empresa_id, current_vehicle_id)
  where current_vehicle_id is not null
    and closed_at is null
    and status not in ('cerrada', 'devuelta');

-- Asigna una garantía activa sin vehículo a una unidad libre del mismo tenant.
-- Solo actualiza current_vehicle_id y updated_at; no toca conductor, saldos,
-- estado ni movimientos.
create or replace function public.assign_existing_driver_guarantee_vehicle(
  p_guarantee_id bigint,
  p_empresa_id uuid,
  p_vehicle_id bigint
)
returns public.driver_guarantees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_guarantee public.driver_guarantees%rowtype;
begin
  if public.rls_auth_uid() is null or not coalesce(public.is_active_user(), false) then
    raise exception using errcode = '42501', message = 'usuario_no_autenticado';
  end if;

  if lower(trim(coalesce(public.current_user_role(), ''))) not in ('admin', 'contador', 'socio') then
    raise exception using errcode = '42501', message = 'rol_sin_permiso';
  end if;

  v_empresa := public.current_user_empresa_id();
  if v_empresa is null then
    raise exception using errcode = '42501', message = 'empresa_no_configurada';
  end if;

  if p_empresa_id is not null and p_empresa_id <> v_empresa then
    raise exception using errcode = '42501', message = 'empresa_no_coincide';
  end if;

  select * into v_guarantee
  from public.driver_guarantees
  where id = p_guarantee_id
    and empresa_id = v_empresa
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'garantia_no_encontrada';
  end if;

  if v_guarantee.closed_at is not null
     or v_guarantee.status in ('cerrada', 'devuelta') then
    raise exception using errcode = '22023', message = 'garantia_cerrada';
  end if;

  if v_guarantee.current_vehicle_id is not null then
    raise exception using errcode = '22023', message = 'garantia_ya_tiene_vehiculo';
  end if;

  if not exists (
    select 1
    from public.vehiculos
    where id = p_vehicle_id
      and empresa_id = v_empresa
  ) then
    raise exception using errcode = '22023', message = 'vehiculo_no_pertenece_empresa';
  end if;

  if exists (
    select 1
    from public.driver_guarantees
    where empresa_id = v_empresa
      and current_vehicle_id = p_vehicle_id
      and closed_at is null
      and status not in ('cerrada', 'devuelta')
      and id <> p_guarantee_id
  ) then
    raise exception using errcode = '23505', message = 'vehiculo_ya_tiene_garantia_activa';
  end if;

  update public.driver_guarantees
  set current_vehicle_id = p_vehicle_id,
      updated_at = now()
  where id = p_guarantee_id
  returning * into v_guarantee;

  return v_guarantee;
end;
$$;

revoke all on function public.assign_existing_driver_guarantee_vehicle(bigint, uuid, bigint)
  from public, anon;
grant execute on function public.assign_existing_driver_guarantee_vehicle(bigint, uuid, bigint)
  to authenticated;

comment on function public.assign_existing_driver_guarantee_vehicle(bigint, uuid, bigint) is
  'Asigna una garantía activa sin vehículo a una unidad libre del mismo tenant. Solo actualiza current_vehicle_id y updated_at; no modifica conductor, saldos, estado ni movimientos.';
