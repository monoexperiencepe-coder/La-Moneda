import type { AppRole } from '../data/types';
import { formatCurrency, formatUSD } from './formatting';
import {
  canViewAmountForRecord,
  canViewAmountsGlobal,
  MASKED_AMOUNT_PEN,
  MASKED_AMOUNT_USD,
  resolveRecordCreatedBy,
} from './amountPermissions';

export type AmountRecordContext = {
  createdBy?: string | null;
  createdAt?: string | null;
  excelExtra?: Record<string, unknown> | null;
};

export type GlobalAmountFormatter = (amount: number, currency?: 'PEN' | 'USD') => string;

export function formatAmountDisplay(params: {
  role: AppRole | string | null | undefined;
  userId?: string | null;
  amount: number;
  /** Totales / KPIs / gráficos agregados — nunca visibles para contador. */
  global?: boolean;
  currency?: 'PEN' | 'USD';
  record?: AmountRecordContext | null;
  nowMs?: number;
  /** Prefijo signo (+/−) ya incluido en la cadena devuelta si se pasa. */
  signPrefix?: string;
}): string {
  const { role, userId, amount, global, currency = 'PEN', record, nowMs, signPrefix = '' } = params;

  const canView = global
    ? canViewAmountsGlobal(role)
    : canViewAmountForRecord({
        role,
        userId,
        recordCreatedBy: record ? resolveRecordCreatedBy(record) : null,
        recordCreatedAt: record?.createdAt ?? null,
        nowMs,
      });

  if (!canView) {
    return `${signPrefix}${currency === 'USD' ? MASKED_AMOUNT_USD : MASKED_AMOUNT_PEN}`;
  }

  const formatted = currency === 'USD' ? formatUSD(amount) : formatCurrency(amount);
  return `${signPrefix}${formatted}`;
}
