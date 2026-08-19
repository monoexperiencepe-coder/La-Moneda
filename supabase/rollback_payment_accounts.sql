-- Rollback manual. No afecta snapshots históricos metodo_pago/metodo_pago_detalle/celular_metodo.
drop index if exists public.ingresos_payment_account_id_idx;
drop index if exists public.gastos_payment_account_id_idx;
alter table public.ingresos drop column if exists payment_account_id;
alter table public.gastos drop column if exists payment_account_id;
drop table if exists public.payment_accounts;
drop function if exists public.touch_payment_account();
