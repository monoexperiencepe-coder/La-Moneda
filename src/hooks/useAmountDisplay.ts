import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Gasto, Ingreso } from '../data/types';
import {
  canViewAmountForRecord,
  canViewAmountsGlobal,
  CONTADOR_24H_VISIBILITY_HINT,
  isContadorTemporaryRecordAmountVisible,
  resolveRecordCreatedBy,
} from '../utils/amountPermissions';
import {
  formatAmountDisplay,
  type AmountRecordContext,
} from '../utils/displayAmount';
import { permissionUserFromAuth } from '../utils/permissions';

function recordCtx(
  record: Pick<Gasto, 'createdAt' | 'excelExtra'> & { createdBy?: string | null },
): AmountRecordContext {
  return {
    createdBy: resolveRecordCreatedBy(record),
    createdAt: record.createdAt,
    excelExtra: record.excelExtra ?? null,
  };
}

export function useAmountDisplay() {
  const { user, profile } = useAuth();
  const role = profile?.role ?? user.role;
  const userId = profile?.id ?? (user.id !== 'guest' ? user.id : null);
  const permissionUser = permissionUserFromAuth(user, profile?.email);

  return useMemo(() => {
    const canViewGlobal = canViewAmountsGlobal(role);

    const formatGlobalAmount = (amount: number, currency: 'PEN' | 'USD' = 'PEN') =>
      formatAmountDisplay({ role, userId, amount, global: true, currency });

    const formatRecordAmount = (
      amount: number,
      record: AmountRecordContext | Gasto | Ingreso | null | undefined,
      opts?: { currency?: 'PEN' | 'USD'; signPrefix?: string },
    ) => {
      const ctx =
        record && 'excelExtra' in record
          ? recordCtx(record as Gasto)
          : (record as AmountRecordContext | null | undefined);
      return formatAmountDisplay({
        role,
        userId,
        amount,
        record: ctx,
        currency: opts?.currency,
        signPrefix: opts?.signPrefix,
      });
    };

    const canViewRecordAmount = (record: AmountRecordContext | Gasto | Ingreso | null | undefined) => {
      const ctx =
        record && 'excelExtra' in record
          ? recordCtx(record as Gasto)
          : (record as AmountRecordContext | null | undefined);
      return canViewAmountForRecord({
        role,
        userId,
        recordCreatedBy: ctx ? resolveRecordCreatedBy(ctx) : null,
        recordCreatedAt: ctx?.createdAt ?? null,
      });
    };

    const showContador24hHint = (record: AmountRecordContext | Gasto | Ingreso | null | undefined) => {
      const ctx =
        record && 'excelExtra' in record
          ? recordCtx(record as Gasto)
          : (record as AmountRecordContext | null | undefined);
      return isContadorTemporaryRecordAmountVisible({
        role,
        userId,
        recordCreatedBy: ctx ? resolveRecordCreatedBy(ctx) : null,
        recordCreatedAt: ctx?.createdAt ?? null,
      });
    };

    return {
      role,
      userId,
      permissionUser,
      canViewGlobal,
      canViewGlobalAmounts: canViewGlobal,
      formatGlobalAmount,
      formatRecordAmount,
      canViewRecordAmount,
      showContador24hHint,
      contador24hHint: CONTADOR_24H_VISIBILITY_HINT,
    };
  }, [role, userId, permissionUser, profile?.email, user]);
}
