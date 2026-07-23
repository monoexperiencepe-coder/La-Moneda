-- Rollback: revert_guarantee_movement RPC y tipos reversal_*
begin;

drop function if exists public.revert_guarantee_movement(bigint, text, uuid);
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

commit;
