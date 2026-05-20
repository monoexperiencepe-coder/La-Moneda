import type { Gasto } from '../data/types';
import { auditGastosConciliacion, type AuditGastosFilters } from './auditGastosConciliacion';

declare global {
  interface Window {
  /** Auditoría SOLO LECTURA. Ej: auditGastosConciliacion() o auditGastosConciliacion({ year: '2025' }) */
    auditGastosConciliacion: (filters?: AuditGastosFilters) => ReturnType<typeof auditGastosConciliacion>;
  }
}

export function registerAuditGastosWindow(getGastos: () => Gasto[]): void {
  window.auditGastosConciliacion = (filters?: AuditGastosFilters) =>
    auditGastosConciliacion(getGastos, filters);

  console.info(
    '[audit] window.auditGastosConciliacion() disponible — conciliación Gastos (solo lectura)',
  );
}
