/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { getDetallesMetodoPago as getLegacyAccounts, type MetodoPagoDetalleRow } from '../data/factCatalog';
import {
  createPaymentAccount,
  fetchPaymentAccounts,
  updatePaymentAccount,
  type PaymentAccount,
  type PaymentAccountInput,
} from '../services/paymentSettingsService';
import { selectPaymentAccountRows } from '../utils/paymentAccountModel';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'error';

interface PaymentSettingsValue {
  accounts: PaymentAccount[];
  status: LoadStatus;
  error: string | null;
  usingLegacyFallback: boolean;
  getAccountsForMethod: (method: string, includeInactive?: boolean) => MetodoPagoDetalleRow[];
  findAccount: (method: string, label: string) => MetodoPagoDetalleRow | undefined;
  reload: () => Promise<void>;
  save: (id: string | null, input: PaymentAccountInput) => Promise<PaymentAccount>;
}

const PaymentSettingsContext = createContext<PaymentSettingsValue | null>(null);
const cache = new Map<string, PaymentAccount[]>();
const inflight = new Map<string, Promise<PaymentAccount[]>>();

function loadOnce(empresaId: string, force = false): Promise<PaymentAccount[]> {
  if (!force && cache.has(empresaId)) return Promise.resolve(cache.get(empresaId)!);
  if (!force && inflight.has(empresaId)) return inflight.get(empresaId)!;
  const promise = fetchPaymentAccounts(empresaId)
    .then((rows) => {
      cache.set(empresaId, rows);
      return rows;
    })
    .finally(() => inflight.delete(empresaId));
  inflight.set(empresaId, promise);
  return promise;
}

export const PaymentSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id ?? '';
  const userId = profile?.id ?? '';
  const [accounts, setAccounts] = useState<PaymentAccount[]>(() => cache.get(empresaId) ?? []);
  const [status, setStatus] = useState<LoadStatus>(empresaId ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const reload = useCallback(async () => {
    if (!empresaId) return;
    setStatus('loading');
    setError(null);
    try {
      const rows = await loadOnce(empresaId, true);
      if (!mounted.current) return;
      setAccounts(rows);
      setStatus('ready');
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración de pagos.');
      setStatus('fallback');
    }
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) {
      queueMicrotask(() => {
        if (!mounted.current) return;
        setAccounts([]);
        setStatus('idle');
      });
      return;
    }
    const cached = cache.get(empresaId);
    if (cached) {
      queueMicrotask(() => {
        if (!mounted.current) return;
        setAccounts(cached);
        setStatus('ready');
      });
      return;
    }
    void loadOnce(empresaId).then((rows) => {
      if (!mounted.current) return;
      setAccounts(rows);
      setStatus('ready');
    }).catch((cause) => {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración de pagos.');
      setStatus('fallback');
    });
  }, [empresaId]);

  const getAccountsForMethod = useCallback((method: string, includeInactive = false) => {
    if (status === 'ready') {
      return selectPaymentAccountRows(accounts, method, includeInactive);
    }
    return getLegacyAccounts(method);
  }, [accounts, status]);

  const findAccount = useCallback((method: string, label: string) => {
    const normalized = label.trim().replace(/\s+/g, ' ');
    return getAccountsForMethod(method, true).find((row) => row.detalle.trim().replace(/\s+/g, ' ') === normalized);
  }, [getAccountsForMethod]);

  const save = useCallback(async (id: string | null, input: PaymentAccountInput) => {
    if (!empresaId || !userId) throw new Error('No hay una empresa o usuario autenticado.');
    const saved = id
      ? await updatePaymentAccount(id, empresaId, userId, input)
      : await createPaymentAccount(empresaId, userId, input);
    setAccounts((current) => {
      const next = id ? current.map((row) => row.id === saved.id ? saved : row) : [...current, saved];
      next.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
      cache.set(empresaId, next);
      return next;
    });
    setStatus('ready');
    return saved;
  }, [empresaId, userId]);

  const value = useMemo<PaymentSettingsValue>(() => ({
    accounts, status, error, usingLegacyFallback: status === 'fallback', getAccountsForMethod,
    findAccount, reload, save,
  }), [accounts, status, error, getAccountsForMethod, findAccount, reload, save]);

  return <PaymentSettingsContext.Provider value={value}>{children}</PaymentSettingsContext.Provider>;
};

export function usePaymentSettings(): PaymentSettingsValue {
  const value = useContext(PaymentSettingsContext);
  if (!value) throw new Error('usePaymentSettings debe usarse dentro de PaymentSettingsProvider');
  return value;
}
