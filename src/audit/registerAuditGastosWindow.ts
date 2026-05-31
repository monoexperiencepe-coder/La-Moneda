import type { Gasto } from '../data/types';
import { auditGastosConciliacion, type AuditGastosFilters } from './auditGastosConciliacion';
import { auditInversionSubtipos } from './auditInversionSubtipos';
import {
  auditPendienteRevision,
  type AuditPendienteRevisionResult,
} from './auditPendienteRevision';

declare global {
  interface Window {
  /** Auditoría SOLO LECTURA. Ej: auditGastosConciliacion() o auditGastosConciliacion({ year: '2025' }) */
    auditGastosConciliacion: (filters?: AuditGastosFilters) => ReturnType<typeof auditGastosConciliacion>;
    /** Subtipos sospechosos en inversion_compra (solo lectura). */
    auditInversionSubtipos: () => ReturnType<typeof auditInversionSubtipos>;
    /** Cola pendiente_revision: conteo, ejemplos, UI/código, safeToHide (async). */
    auditPendienteRevision: () => Promise<AuditPendienteRevisionResult>;
  }
}

export function registerAuditGastosWindow(getGastos: () => Gasto[]): void {
  window.auditGastosConciliacion = (filters?: AuditGastosFilters) =>
    auditGastosConciliacion(getGastos, filters);
  window.auditInversionSubtipos = () => auditInversionSubtipos(getGastos());
  window.auditPendienteRevision = () => auditPendienteRevision(getGastos);

  console.info(
    '[audit] auditGastosConciliacion() | auditInversionSubtipos() | await auditPendienteRevision()',
  );
}
