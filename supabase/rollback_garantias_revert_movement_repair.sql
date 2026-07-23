-- =============================================================================
-- Rollback: migration_garantias_revert_movement_repair.sql
-- =============================================================================
-- Elimina RPC, helpers, índice de reversión y tipos reversal_* del constraint.
-- NO elimina tablas ni datos de garantías.
-- =============================================================================

begin;

revoke all on function public.revert_guarantee_movement(bigint, text, uuid) from authenticated;
revoke all on function public.revert_guarantee_movement(bigint, text, uuid) from public;
revoke all on function public.revert_guarantee_movement(bigint, text, uuid) from anon;

drop function if exists public.revert_guarantee_movement(bigint, text, uuid);

revoke all on function public.compute_guarantee_from_movements(numeric, bigint) from public;
revoke all on function public.compute_guarantee_from_movements(numeric, bigint) from anon;
revoke all on function public.compute_guarantee_from_movements(numeric, bigint) from authenticated;

drop function if exists public.compute_guarantee_from_movements(numeric, bigint);

drop function if exists public.guarantee_is_sensitive_reversal_type(text);
drop function if exists public.guarantee_is_reversal_row(text, jsonb);
drop function if exists public.guarantee_is_deduction_type(text);
drop function if exists public.guarantee_is_contribution_type(text);

drop index if exists public.guarantee_movements_one_reversal_per_original_uidx;

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
      'required_amount_change'
    )
  );

-- Restaurar grants base de Fase 1
revoke all on table public.guarantee_movements from authenticated;
revoke all on table public.guarantee_movements from anon;

grant select, insert on table public.guarantee_movements to authenticated;

revoke all on table public.driver_guarantees from authenticated;
revoke all on table public.driver_guarantees from anon;

grant select, insert, update on table public.driver_guarantees to authenticated;

alter table public.guarantee_movements enable row level security;
alter table public.driver_guarantees enable row level security;

commit;
