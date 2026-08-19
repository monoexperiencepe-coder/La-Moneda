import { supabase } from '../lib/supabase';
import type { PaymentAccount, PaymentAccountInput, PaymentAccountMethod } from '../utils/paymentAccountModel';
export type { PaymentAccount, PaymentAccountInput, PaymentAccountMethod } from '../utils/paymentAccountModel';

type DbRow = Record<string, unknown>;

const SELECT_COLUMNS = 'id, empresa_id, method, label, phone_number, bank_name, account_number, cci, account_holder, payment_note, is_active, sort_order, created_at, updated_at, updated_by';

function nullable(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function fromDb(row: DbRow): PaymentAccount {
  return {
    id: String(row.id),
    empresaId: String(row.empresa_id),
    method: String(row.method) as PaymentAccountMethod,
    label: String(row.label),
    phoneNumber: nullable(row.phone_number),
    bankName: nullable(row.bank_name),
    accountNumber: nullable(row.account_number),
    cci: nullable(row.cci),
    accountHolder: nullable(row.account_holder),
    paymentNote: nullable(row.payment_note),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    updatedBy: nullable(row.updated_by),
  };
}

function toDb(input: PaymentAccountInput, empresaId: string, userId: string): DbRow {
  return {
    empresa_id: empresaId,
    method: input.method,
    label: input.label.trim(),
    phone_number: nullable(input.phoneNumber),
    bank_name: nullable(input.bankName),
    account_number: nullable(input.accountNumber),
    cci: nullable(input.cci),
    account_holder: nullable(input.accountHolder),
    payment_note: nullable(input.paymentNote),
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0,
    updated_by: userId,
  };
}

export async function fetchPaymentAccounts(empresaId: string): Promise<PaymentAccount[]> {
  const { data, error } = await supabase
    .from('payment_accounts')
    .select(SELECT_COLUMNS)
    .eq('empresa_id', empresaId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DbRow[]).map(fromDb);
}

export async function createPaymentAccount(empresaId: string, userId: string, input: PaymentAccountInput): Promise<PaymentAccount> {
  const { data, error } = await supabase
    .from('payment_accounts')
    .insert(toDb(input, empresaId, userId))
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return fromDb(data as DbRow);
}

export async function updatePaymentAccount(id: string, empresaId: string, userId: string, input: PaymentAccountInput): Promise<PaymentAccount> {
  const { data, error } = await supabase
    .from('payment_accounts')
    .update(toDb(input, empresaId, userId))
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return fromDb(data as DbRow);
}
