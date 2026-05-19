import { useDeferredValue } from 'react';

/**
 * Mantiene el valor anterior visible mientras React recalcula (filtros, búsqueda).
 * Evita flash vacío y sensación de freeze.
 */
export function useDeferredRecalc<T>(value: T): { deferred: T; isRecalculating: boolean } {
  const deferred = useDeferredValue(value);
  return { deferred, isRecalculating: deferred !== value };
}
