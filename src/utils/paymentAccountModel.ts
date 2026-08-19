import type { MetodoPagoDetalleRow } from '../data/factCatalog';

export type PaymentAccountMethod = 'Yape' | 'Plin' | 'Transferencia' | 'Efectivo' | 'Otros' | 'Tarjeta';

export interface PaymentAccount {
  id: string; empresaId: string; method: PaymentAccountMethod; label: string;
  phoneNumber: string | null; bankName: string | null; accountNumber: string | null;
  cci: string | null; accountHolder: string | null; paymentNote: string | null;
  isActive: boolean; sortOrder: number; createdAt: string; updatedAt: string; updatedBy: string | null;
}

export type PaymentAccountInput = Pick<PaymentAccount, 'method' | 'label'> & Partial<Pick<PaymentAccount, 'phoneNumber' | 'bankName' | 'accountNumber' | 'cci' | 'accountHolder' | 'paymentNote' | 'isActive' | 'sortOrder'>>;

export function paymentAccountSnapshot(account: PaymentAccount): string | null {
  return account.method === 'Transferencia' ? account.accountNumber : account.phoneNumber;
}

export function paymentAccountToLegacyRow(account: PaymentAccount): MetodoPagoDetalleRow {
  return { id: account.id, metodo: account.method, detalle: account.label, celular: paymentAccountSnapshot(account) ?? '', banco: account.bankName ?? '', paymentAccountId: account.id };
}

export function selectPaymentAccountRows(accounts: PaymentAccount[], method: string, includeInactive = false): MetodoPagoDetalleRow[] {
  return accounts
    .filter((account) => account.method === method && (includeInactive || account.isActive))
    .map(paymentAccountToLegacyRow);
}
