-- =============================================================================
-- Garantías — Revertir movimiento (compensatorio, sin DELETE)
-- =============================================================================
-- Crea RPC transaccional revert_guarantee_movement y tipos reversal_*.
-- NO permite DELETE/TRUNCATE en guarantee_movements.
-- =============================================================================

begin;

-- ── Ampliar tipos de movimiento ─────────────────────────────────────────────
alter table public.guarantee_movements
  drop constraint if exists guarantee_movements_type_chk;

alter table public.guarantee_movements
  add constraint guarantee_movements_type_chk check (
    movement_type in (
      'initial_deposit',
      'deposit',
      'fine_deduction',
      'damage_deduction',
      'repair_deduction',
      'other_deduction',
      'replenishment',
      'adjustment_credit',
      'adjustment_debit',
      'final_refund',
      'required_amount_change',
      'reversal_credit',
      'reversal_debit'
    )
  );

-- Una sola reversión por movimiento original
create unique index if not exists guarantee_movements_one_reversal_per_original_uidx
  on public.guarantee_movements (related_movement_id)
  where coalesce(metadata->>'is_reversal', 'false') = 'true'
    and related_movement_id is not null;

-- Bloqueo explícito DELETE / TRUNCATE
revoke delete, truncate on public.guarantee_movements from authenticated, anon, public;
revoke delete, truncate on public.driver_guarantees from authenticated, anon, public;

-- ── Helper: ¿tipo aporta a total entregado? ─────────────────────────────────
create or replace function public.guarantee_is_contribution_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'initial_deposit', 'deposit', 'replenishment', 'adjustment_credit'
  );
$$;

create or replace function public.guarantee_is_deduction_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'fine_deduction', 'damage_deduction', 'repair_deduction', 'other_deduction'
  );
$$;

create or replace function public.guarantee_is_reversal_row(p_type text, p_metadata jsonb)
returns boolean
language sql
immutable
as $$
  select p_type in ('reversal_credit', 'reversal_debit')
    or coalesce(p_metadata->>'is_reversal', 'false') = 'true';
$$;

create or replace function public.guarantee_is_sensitive_reversal_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'final_refund',
    'adjustment_credit',
    'adjustment_debit',
    'required_amount_change'
  );
$$;

-- ── Recalcular saldos desde movimientos (fuente de verdad) ──────────────────
create or replace function public.compute_guarantee_from_movements(
  p_required_amount numeric,
  p_guarantee_id bigint
)
returns table (
  total_contributed numeric,
  total_deducted numeric,
  total_refunded numeric,
  current_balance numeric,
  pending_amount numeric,
  refundable_amount numeric,
  status text,
  has_active_final_refund boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_contributed numeric := 0;
  v_total_deducted numeric := 0;
  v_total_refunded numeric := 0;
  v_balance numeric := 0;
  v_deduction_sum numeric := 0;
  v_replenishment_sum numeric := 0;
  v_has_final_refund boolean := false;
  v_has_reverted_final boolean := false;
  v_status text;
  v_pending numeric;
  v_refundable numeric;
  v_gap boolean;
  rec record;
  v_amt numeric;
  v_is_rev boolean;
  v_orig_type text;
begin
  for rec in
    select
      m.movement_type,
      m.direction,
      m.amount,
      m.metadata,
      m.related_movement_id
    from public.guarantee_movements m
    where m.guarantee_id = p_guarantee_id
    order by m.created_at asc, m.id asc
  loop
    if rec.movement_type = 'required_amount_change' then
      continue;
    end if;

    v_amt := round(abs(coalesce(rec.amount, 0))::numeric, 2);
    if v_amt <= 0 then
      continue;
    end if;

    v_is_rev := public.guarantee_is_reversal_row(rec.movement_type, rec.metadata);
    v_orig_type := coalesce(rec.metadata->>'original_movement_type', rec.movement_type);

    if rec.direction = 'credit' then
      v_balance := round(v_balance + v_amt, 2);
      if v_is_rev then
        if public.guarantee_is_deduction_type(v_orig_type) or v_orig_type = 'adjustment_debit' then
          v_total_deducted := round(v_total_deducted - v_amt, 2);
        end if;
        if v_orig_type = 'final_refund' then
          v_total_refunded := round(v_total_refunded - v_amt, 2);
          v_has_reverted_final := true;
        end if;
        if v_orig_type = 'replenishment' then
          v_replenishment_sum := round(v_replenishment_sum - v_amt, 2);
        end if;
        if public.guarantee_is_deduction_type(v_orig_type) then
          v_deduction_sum := round(v_deduction_sum - v_amt, 2);
        end if;
      else
        if public.guarantee_is_contribution_type(rec.movement_type) then
          v_total_contributed := round(v_total_contributed + v_amt, 2);
        end if;
        if rec.movement_type = 'replenishment' then
          v_replenishment_sum := round(v_replenishment_sum + v_amt, 2);
        end if;
      end if;
    else
      v_balance := round(v_balance - v_amt, 2);
      if v_is_rev then
        if public.guarantee_is_contribution_type(v_orig_type) then
          v_total_contributed := round(v_total_contributed - v_amt, 2);
        end if;
      else
        if public.guarantee_is_deduction_type(rec.movement_type) or rec.movement_type = 'adjustment_debit' then
          v_total_deducted := round(v_total_deducted + v_amt, 2);
        end if;
        if public.guarantee_is_deduction_type(rec.movement_type) then
          v_deduction_sum := round(v_deduction_sum + v_amt, 2);
        end if;
        if rec.movement_type = 'final_refund' then
          v_total_refunded := round(v_total_refunded + v_amt, 2);
          v_has_final_refund := true;
        end if;
      end if;
    end if;
  end loop;

  v_total_contributed := greatest(v_total_contributed, 0);
  v_total_deducted := greatest(v_total_deducted, 0);
  v_total_refunded := greatest(v_total_refunded, 0);

  v_pending := round(greatest(0, p_required_amount - v_balance), 2);
  v_refundable := round(greatest(0, v_balance), 2);
  v_gap := v_deduction_sum > v_replenishment_sum + 0.001;

  v_has_active_final_refund := v_has_final_refund and not v_has_reverted_final;

  if v_has_active_final_refund and v_balance <= 0.001 then
    v_status := 'devuelta';
  elsif v_total_contributed <= 0 and v_balance <= 0 then
    v_status := 'sin_garantia';
  elsif v_gap and v_balance < p_required_amount - 0.001 then
    v_status := 'con_descuentos_pendientes';
  elsif v_pending <= 0.001 and v_balance + 0.001 >= p_required_amount then
    v_status := 'completa';
  elsif v_total_contributed > 0 and v_pending > 0.001 then
    if v_pending >= p_required_amount - 0.001 then
      v_status := 'pendiente';
    else
      v_status := 'incompleta';
    end if;
  else
    v_status := 'pendiente';
  end if;

  return query
  select
    v_total_contributed,
    v_total_deducted,
    v_total_refunded,
    v_balance,
    v_pending,
    v_refundable,
    v_status,
    v_has_active_final_refund;
end;
$$;

-- ── RPC: revertir movimiento ────────────────────────────────────────────────
create or replace function public.revert_guarantee_movement(
  p_movement_id bigint,
  p_reason text,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role text;
  v_empresa uuid;
  v_orig public.guarantee_movements%rowtype;
  v_guarantee public.driver_guarantees%rowtype;
  v_existing_reversal bigint;
  v_reversal_type text;
  v_reversal_direction text;
  v_new_mov public.guarantee_movements%rowtype;
  v_computed record;
  v_reason text;
  v_sim_balance numeric;
begin
  v_uid := public.rls_auth_uid();
  v_role := public.current_user_role();
  v_empresa := coalesce(p_empresa_id, public.current_user_empresa_id());
  v_reason := nullif(btrim(p_reason), '');

  if v_uid is null or not public.is_active_user() then
    return jsonb_build_object('ok', false, 'error', 'usuario_no_autenticado');
  end if;

  if v_role not in ('admin', 'contador', 'socio') then
    return jsonb_build_object('ok', false, 'error', 'rol_sin_permiso');
  end if;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'error', 'empresa_no_configurada');
  end if;

  if p_movement_id is null or not (p_movement_id > 0) then
    return jsonb_build_object('ok', false, 'error', 'movimiento_invalido');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'motivo_reversion_obligatorio');
  end if;

  select *
  into v_orig
  from public.guarantee_movements
  where id = p_movement_id
    and empresa_id = v_empresa
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'movimiento_no_encontrado');
  end if;

  if public.guarantee_is_reversal_row(v_orig.movement_type, v_orig.metadata) then
    return jsonb_build_object('ok', false, 'error', 'no_revertir_reversion');
  end if;

  if v_orig.movement_type = 'required_amount_change' then
    return jsonb_build_object('ok', false, 'error', 'tipo_no_reversible');
  end if;

  select id
  into v_existing_reversal
  from public.guarantee_movements
  where related_movement_id = v_orig.id
    and coalesce(metadata->>'is_reversal', 'false') = 'true'
  limit 1;

  if v_existing_reversal is not null then
    return jsonb_build_object('ok', false, 'error', 'movimiento_ya_revertido');
  end if;

  if public.guarantee_is_sensitive_reversal_type(v_orig.movement_type) then
    if v_role <> 'admin' then
      return jsonb_build_object('ok', false, 'error', 'reversion_sensible_solo_admin');
    end if;
  elsif v_role <> 'admin' then
    if v_orig.created_by is null or v_orig.created_by <> v_uid then
      return jsonb_build_object('ok', false, 'error', 'solo_revertir_propios_movimientos');
    end if;
  end if;

  select *
  into v_guarantee
  from public.driver_guarantees
  where id = v_orig.guarantee_id
    and empresa_id = v_empresa
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'garantia_no_encontrada');
  end if;

  if v_guarantee.closed_at is not null
     and v_orig.movement_type <> 'final_refund'
     and v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'garantia_cerrada_revertir_devolucion_primero');
  end if;

  if v_orig.direction = 'credit' then
    v_reversal_type := 'reversal_debit';
    v_reversal_direction := 'debit';
    v_sim_balance := (
      select c.current_balance
      from public.compute_guarantee_from_movements(v_guarantee.required_amount, v_guarantee.id) c
    ) - v_orig.amount;
  else
    v_reversal_type := 'reversal_credit';
    v_reversal_direction := 'credit';
    v_sim_balance := (
      select c.current_balance
      from public.compute_guarantee_from_movements(v_guarantee.required_amount, v_guarantee.id) c
    ) + v_orig.amount;
  end if;

  if v_sim_balance < -0.001 then
    return jsonb_build_object(
      'ok', false,
      'error', 'reversion_genera_saldo_negativo',
      'balance_resultante', round(v_sim_balance, 2)
    );
  end if;

  insert into public.guarantee_movements (
    empresa_id,
    guarantee_id,
    driver_id,
    vehicle_id,
    movement_type,
    amount,
    direction,
    observation,
    reason,
    related_movement_id,
    created_by,
    movement_date,
    metadata
  )
  values (
    v_empresa,
    v_orig.guarantee_id,
    v_orig.driver_id,
    v_orig.vehicle_id,
    v_reversal_type,
    v_orig.amount,
    v_reversal_direction,
    format('Reversión de movimiento #%s (%s)', v_orig.id, v_orig.movement_type),
    v_reason,
    v_orig.id,
    v_uid,
    (timezone('America/Lima', now()))::date,
    jsonb_build_object(
      'is_reversal', true,
      'original_movement_id', v_orig.id,
      'original_movement_type', v_orig.movement_type,
      'reversed_by', v_uid::text,
      'reversed_at', now()
    )
  )
  returning * into v_new_mov;

  select *
  into v_computed
  from public.compute_guarantee_from_movements(v_guarantee.required_amount, v_guarantee.id);

  if v_computed.total_contributed < -0.001
     or v_computed.total_deducted < -0.001
     or v_computed.total_refunded < -0.001 then
    raise exception 'reversion_genera_totales_incoherentes';
  end if;

  update public.driver_guarantees
  set
    current_balance = v_computed.current_balance,
    total_contributed = v_computed.total_contributed,
    total_deducted = v_computed.total_deducted,
    status = v_computed.status,
    closed_at = case
      when v_computed.has_active_final_refund then coalesce(closed_at, now())
      else null
    end,
    updated_at = now()
  where id = v_guarantee.id
    and empresa_id = v_empresa;

  return jsonb_build_object(
    'ok', true,
    'reversal_movement_id', v_new_mov.id,
    'original_movement_id', v_orig.id,
    'guarantee_id', v_guarantee.id,
    'current_balance', v_computed.current_balance,
    'total_contributed', v_computed.total_contributed,
    'total_deducted', v_computed.total_deducted,
    'status', v_computed.status
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'movimiento_ya_revertido');
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', 'reversion_fallida',
      'detail', sqlerrm
    );
end;
$$;

comment on function public.revert_guarantee_movement(bigint, text, uuid) is
  'Crea movimiento compensatorio (reversal_*) sin DELETE. Permisos: admin cualquiera; socio/contador solo propios; sensibles solo admin.';

grant execute on function public.revert_guarantee_movement(bigint, text, uuid) to authenticated;

commit;
