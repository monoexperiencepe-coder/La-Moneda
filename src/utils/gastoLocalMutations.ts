/** Mutaciones locales de gastos: parches de summary + eventos de historial (sin tocar BD). */

import type { Gasto } from '../data/types';
import type { GastosFinancialSummary } from './gastosFinancialSummary';

export type GastoLocalMutationSource = 'user' | 'realtime' | 'undo';

export type ApplyGastoLocalOpts = {
  /** Si false, no dispara reconcile RPC en background (default true). */
  reloadSummary?: boolean;
  /** Si false, no parchea gastosFinancialSummary en memoria (default true). */
  optimisticSummary?: boolean;
  source?: GastoLocalMutationSource;
};

export type GastoMovedLocalOptions = ApplyGastoLocalOpts & {
  movedOutOfView?: boolean;
  /** Alias de movedOutOfView: quitar de gastos[] visibles. */
  removeFromVisible?: boolean;
};

export type GastoHistorialSyncEvent =
  | { kind: 'created'; gasto: Gasto }
  | { kind: 'removed'; id: string; before?: Gasto | null }
  | { kind: 'updated'; before: Gasto; after: Gasto }
  | {
      kind: 'moved';
      before: Gasto;
      after: Gasto;
      movedOutOfView?: boolean;
      removeFromVisible?: boolean;
    };

export function gastoMontoForSummary(monto: number): number {
  return Number.isFinite(monto) ? monto : 0;
}

export function gastoTipoForSummary(g: Pick<Gasto, 'tipo_gasto'>): string {
  const t = (g.tipo_gasto ?? '').trim();
  return t || 'pendiente_revision';
}

function patchTipoBucket(
  summary: GastosFinancialSummary,
  tipo: string,
  montoDelta: number,
  countDelta: number,
): GastosFinancialSummary {
  const base = summary.byTipoGasto[tipo] ?? { monto: 0, count: 0 };
  const nextMonto = base.monto + montoDelta;
  const nextCount = Math.max(0, base.count + countDelta);
  return {
    totalGastos: summary.totalGastos + montoDelta,
    totalCount: Math.max(0, summary.totalCount + countDelta),
    byTipoGasto: {
      ...summary.byTipoGasto,
      [tipo]: { monto: nextMonto, count: nextCount },
    },
  };
}

export function patchSummaryAddGasto(
  summary: GastosFinancialSummary,
  gasto: Gasto,
  includeTipo: (tipo: string) => boolean,
): GastosFinancialSummary {
  const tipo = gastoTipoForSummary(gasto);
  if (!includeTipo(tipo)) return summary;
  return patchTipoBucket(summary, tipo, gastoMontoForSummary(gasto.monto), 1);
}

export function patchSummaryRemoveGasto(
  summary: GastosFinancialSummary,
  gasto: Gasto,
  includeTipo: (tipo: string) => boolean,
): GastosFinancialSummary {
  const tipo = gastoTipoForSummary(gasto);
  if (!includeTipo(tipo)) return summary;
  return patchTipoBucket(summary, tipo, -gastoMontoForSummary(gasto.monto), -1);
}

/** Mueve contador/monto de `before` → `after` (o solo resta si `after` es null). */
export function patchSummaryForGastoMove(
  summary: GastosFinancialSummary,
  before: Gasto,
  after: Gasto | null,
  includeTipo: (tipo: string) => boolean,
): GastosFinancialSummary {
  let next = patchSummaryRemoveGasto(summary, before, includeTipo);
  if (after) next = patchSummaryAddGasto(next, after, includeTipo);
  return next;
}

export function devLogGastoLocalMutation(
  action: 'created' | 'updated' | 'removed' | 'moved',
  payload: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  console.info(`[localMutation:gasto] ${action}`, payload);
}
