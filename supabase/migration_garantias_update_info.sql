-- Actualiza campos de cabecera no financieros de una garantía activa.
-- Campos editables: driver_id, current_vehicle_id, vehicle_type, notes.
-- Campos protegidos: required_amount, current_balance, total_contributed,
--   total_deducted, movimientos históricos (guarantee_movements es inmutable).
--
-- SECURITY DEFINER: mismo patrón que create_driver_guarantee_with_initial_deposit.
-- Tenant isolation y auth checks explícitos reemplazan la protección RLS.

create or replace function public.update_driver_guarantee_info(
  p_guarantee_id       bigint,
  p_empresa_id         uuid,
  p_driver_id          text,
  p_current_vehicle_id bigint,
  p_vehicle_type       text,
  p_notes              text     default null
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
  v_new_driver      text;
begin
  -- ── 1. Identidad y sesión activa ─────────────────────────────────────────
  v_uid := public.rls_auth_uid();
  if v_uid is null or not coalesce(public.is_active_user(), false) then
    raise exception using errcode = '42501', message = 'usuario_no_autenticado';
  end if;

  -- ── 2. Rol autorizado (admin / contador / socio) ─────────────────────────
  v_role := lower(trim(coalesce(public.current_user_role(), '')));
  if v_role not in ('admin', 'contador', 'socio') then
    raise exception using errcode = '42501', message = 'rol_sin_permiso';
  end if;

  -- ── 3. Tenant isolation ──────────────────────────────────────────────────
  v_profile_empresa := public.current_user_empresa_id();
  if v_profile_empresa is null then
    raise exception using errcode = '42501', message = 'empresa_no_configurada';
  end if;

  if p_empresa_id is not null and p_empresa_id <> v_profile_empresa then
    raise exception using errcode = '42501', message = 'empresa_no_coincide';
  end if;

  v_empresa := v_profile_empresa;

  -- ── 4. Parámetro conductor ───────────────────────────────────────────────
  v_new_driver := nullif(trim(p_driver_id), '');
  if v_new_driver is null then
    raise exception using errcode = '22023', message = 'conductor_obligatorio';
  end if;

  -- ── 5. Tipo de vehículo ──────────────────────────────────────────────────
  if p_vehicle_type not in ('auto', 'camioneta') then
    raise exception using errcode = '22023', message = 'tipo_vehiculo_invalido';
  end if;

  -- ── 6. Garantía existe, pertenece a la empresa y está activa ─────────────
  select * into v_guarantee
  from public.driver_guarantees
  where id         = p_guarantee_id
    and empresa_id = v_empresa;

  if not found then
    raise exception using errcode = '22023', message = 'garantia_no_encontrada';
  end if;

  if v_guarantee.closed_at is not null
     or v_guarantee.status in ('cerrada', 'devuelta') then
    raise exception using errcode = '22023', message = 'garantia_cerrada';
  end if;

  -- ── 7. El conductor nuevo pertenece a esta empresa ───────────────────────
  -- conductores.id es uuid; v_new_driver es text → cast explícito requerido.
  if not exists (
    select 1
    from public.conductores
    where id         = v_new_driver::uuid
      and empresa_id = v_empresa
  ) then
    raise exception using errcode = '22023', message = 'conductor_no_pertenece_empresa';
  end if;

  -- ── 8. Si el conductor cambia, verificar que no tenga otra garantía activa ─
  if v_new_driver <> v_guarantee.driver_id then
    if exists (
      select 1
      from public.driver_guarantees
      where empresa_id = v_empresa
        and driver_id  = v_new_driver
        and closed_at  is null
        and status not in ('cerrada', 'devuelta')
        and id         <> p_guarantee_id
    ) then
      raise exception using errcode = '23505', message = 'conductor_ya_tiene_garantia_activa';
    end if;
  end if;

  -- ── 9. El vehículo pertenece a esta empresa (solo si se indicó) ──────────
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

  -- ── 10. Actualizar solo campos de cabecera no financieros ─────────────────
  --        required_amount, current_balance, total_contributed, total_deducted
  --        NO se tocan. guarantee_movements tampoco se toca.
  update public.driver_guarantees
  set driver_id          = v_new_driver,
      current_vehicle_id = p_current_vehicle_id,
      vehicle_type       = p_vehicle_type,
      notes              = nullif(trim(p_notes), ''),
      updated_at         = now()
  where id = p_guarantee_id
  returning * into v_guarantee;

  return v_guarantee;
end;
$$;

-- Grants
revoke all on function public.update_driver_guarantee_info(bigint, uuid, text, bigint, text, text) from public, anon;
grant execute on function public.update_driver_guarantee_info(bigint, uuid, text, bigint, text, text) to authenticated;

comment on function public.update_driver_guarantee_info(bigint, uuid, text, bigint, text, text) is
  'Edita campos no financieros de una garantía activa (conductor, vehículo, tipo, notas). SECURITY DEFINER con checks explícitos de tenant, rol, conductor y vehículo. No modifica montos ni historial.';
