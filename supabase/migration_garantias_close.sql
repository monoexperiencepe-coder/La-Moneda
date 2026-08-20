-- Cierra una garantía activa sin tocar movimientos ni saldos.
-- Uso: retirar un conductor de la flota cuando ya no tiene relación laboral.
-- El saldo residual (si hay) queda en el historial; el dueño debe resolverlo
-- financieramente por separado (descuento o devolución antes de cerrar).
--
-- SECURITY DEFINER: mismo patrón que create_driver_guarantee_with_initial_deposit.
-- Tenant isolation y auth checks explícitos reemplazan la protección RLS.

create or replace function public.close_driver_guarantee(
  p_guarantee_id   bigint,
  p_empresa_id     uuid,
  p_reason         text  default null
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

  -- ── 4. Garantía existe y pertenece a la empresa ──────────────────────────
  select * into v_guarantee
  from public.driver_guarantees
  where id         = p_guarantee_id
    and empresa_id = v_empresa;

  if not found then
    raise exception using errcode = '22023', message = 'garantia_no_encontrada';
  end if;

  -- ── 5. La garantía debe estar activa ─────────────────────────────────────
  if v_guarantee.closed_at is not null
     or v_guarantee.status in ('cerrada', 'devuelta') then
    raise exception using errcode = '22023', message = 'garantia_ya_cerrada';
  end if;

  -- ── 6. Cerrar: set closed_at + status='cerrada' ──────────────────────────
  -- No se tocan guarantee_movements ni saldos derivados.
  -- Si queda saldo positivo es responsabilidad del dueño resolverlo antes
  -- o después; el historial lo deja legible.
  update public.driver_guarantees
  set closed_at  = now(),
      status     = 'cerrada',
      notes      = case
                     when nullif(trim(p_reason), '') is not null
                     then coalesce(nullif(trim(notes), '') || ' | ', '') || trim(p_reason)
                     else notes
                   end,
      updated_at = now()
  where id = p_guarantee_id
  returning * into v_guarantee;

  return v_guarantee;
end;
$$;

-- Grants
revoke all on function public.close_driver_guarantee(bigint, uuid, text) from public, anon;
grant execute on function public.close_driver_guarantee(bigint, uuid, text) to authenticated;

comment on function public.close_driver_guarantee(bigint, uuid, text) is
  'Cierra una garantía activa (status=cerrada, closed_at=now). No toca movimientos ni saldos. '
  'SECURITY DEFINER con checks explícitos de tenant, rol y estado activo.';
