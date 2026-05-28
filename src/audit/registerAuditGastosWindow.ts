import type { Gasto } from '../data/types';
import { auditGastosConciliacion, type AuditGastosFilters } from './auditGastosConciliacion';
import { auditInversionSubtipos } from './auditInversionSubtipos';

declare global {
  interface Window {
  /** Auditoría SOLO LECTURA. Ej: auditGastosConciliacion() o auditGastosConciliacion({ year: '2025' }) */
    auditGastosConciliacion: (filters?: AuditGastosFilters) => ReturnType<typeof auditGastosConciliacion>;
    /** Subtipos sospechosos en inversion_compra (solo lectura). */
    auditInversionSubtipos: () => ReturnType<typeof auditInversionSubtipos>;
  }
}

export function registerAuditGastosWindow(getGastos: () => Gasto[]): void {
  window.auditGastosConciliacion = (filters?: AuditGastosFilters) =>
    auditGastosConciliacion(getGastos, filters);
  window.auditInversionSubtipos = () => auditInversionSubtipos(getGastos());

  console.info(
    '[audit] window.auditGastosConciliacion() y window.auditInversionSubtipos() — solo lectura',
  );
}
