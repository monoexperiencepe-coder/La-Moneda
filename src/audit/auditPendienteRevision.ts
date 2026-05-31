/**
 * Auditoría SOLO LECTURA: categoría temporal `pendiente_revision`.
 * Consola DEV: await window.auditPendienteRevision()
 */
import type { Gasto } from '../data/types';
import { EMPRESA_ID } from '../config/app';
import { fetchGastosByTipo } from '../services/gastosService';
import { gastoMatchesTipoGasto, tipoGastoEffective } from '../utils/gastosTipoGasto';
import { inferCategoriaFromTipoGasto } from '../utils/factMappers';

const PENDIENTE_TIPO = 'pendiente_revision';

export type AuditPendienteRevisionExample = {
  id: string;
  fecha: string;
  monto: number;
  motivo: string;
  tipo_gasto: string | null;
  tipo_gasto_effective: string | null;
  subtipo_gasto: string | null;
  categoriaKpiFact: string;
  requiere_revision: boolean | null;
  origen_clasificacion: string | null;
  clasificacion_manual: boolean | null;
};

export type AuditPendienteRevisionResult = {
  generatedAt: string;
  dataScope: {
    inMemoryGastosLoaded: number;
    pendienteAlwaysMergedInBootstrap: boolean;
    note: string;
  };
  totalRegistros: number;
  montoTotal: number;
  breakdown: {
    tipoGastoPendienteRevision: { count: number; monto: number };
    tipoGastoRaw: Record<string, { count: number; monto: number }>;
    requiereRevisionTrue: { count: number; monto: number };
    requiereRevisionTrueButNotTipoPendiente: { count: number; monto: number };
    tipoGastoNullOrEmpty: {
      count: number;
      monto: number;
      inferredEffective: Record<string, { count: number; monto: number }>;
      note: string;
    };
  };
  dbSnapshot: {
    fetched: boolean;
    empresaId: string | null;
    count: number;
    monto: number;
    error: string | null;
  };
  examples: AuditPendienteRevisionExample[];
  uiReferences: string[];
  codeReferences: string[];
  safeToHide: boolean;
  safeToDeleteCode: boolean;
  risks: string[];
  recommendation: string;
};

function sumMonto(rows: Gasto[]): number {
  return rows.reduce((s, g) => s + g.monto, 0);
}

function mapExample(g: Gasto): AuditPendienteRevisionExample {
  return {
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    motivo: (g.motivo ?? '').slice(0, 120),
    tipo_gasto: g.tipo_gasto ?? null,
    tipo_gasto_effective: tipoGastoEffective(g),
    subtipo_gasto: g.subtipo_gasto ?? null,
    categoriaKpiFact: inferCategoriaFromTipoGasto(g.tipo),
    requiere_revision: g.requiere_revision ?? null,
    origen_clasificacion: g.origen_clasificacion ?? null,
    clasificacion_manual: g.clasificacion_manual ?? null,
  };
}

function bucketKey(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  return t || '(null/vacío)';
}

/** Referencias UI (pantallas / flujos donde el usuario ve «pendiente de revisión»). */
const UI_REFERENCES: string[] = [
  'Finanzas → Gastos: tarjeta/parrilla «Pendiente de revisión» (GASTO_PARILLA_TABS)',
  'Finanzas → Gastos: pestaña detalle → PendienteRevisionConciliacionPanel (clasificar / lote)',
  'Finanzas → Gastos: modal «Mover categoría» incluye pendiente_revision como destino',
  'Finanzas → Gastos: KPI parrilla vía gastosFinancialSummary.count/total_pendiente_revision',
  'Finanzas → IA clasificación: cola IA_CLASIFICACION_QUEUE_TIPOS (pendiente + globales)',
  'Finanzas → /finanzas/ia-clasificacion: métrica totalPendientes al aplicar sugerencia',
  'Finanzas → /finanzas/revision-clasificacion: gastosPendientesRevision (requiere_revision=true)',
  'Operador restringido: parrilla solo Globales + Pendiente de revisión',
  'NO en ExpenseForm: FINANZA_GASTO_REGISTRO_OPTIONS no incluye pendiente_revision',
  'NO en Inversiones utilidad (pestaña aparte)',
  'Dashboard Inicio: «pendientes» = tareas operaciones, NO tipo_gasto pendiente_revision',
];

/** Referencias código / BD (no borrar sin plan de migración RLS). */
const CODE_REFERENCES: string[] = [
  'src/pages/Finanzas/Gastos.tsx — PENDIENTE_REVISION_TAB, gastosPendienteRevisionAll',
  'src/components/Finanzas/PendienteRevisionConciliacionPanel.tsx',
  'src/hooks/useRegistros.ts — fetchGastosByTipo(pendiente_revision) en bootstrap',
  'src/utils/permissions.ts — OPERADOR_VISIBLE_TIPO_GASTO, FINANZA_MOVE_TARGET',
  'src/utils/gastosFinancialSummary.ts — GASTOS_SUMMARY_TIPOS + RPC total_pendiente_revision',
  'src/utils/gastoLocalMutations.ts — gastoTipoForSummary fallback pendiente_revision',
  'src/services/gastosService.ts — fetchGastosByTipo',
  'src/modules/ai/iaClasificacionTypes.ts — IA_CLASIFICACION_QUEUE_TIPOS',
  'src/modules/ai/tools/runner.ts — listarPendientesClasificacion',
  'src/modules/ai/financialAnalytics.ts — splitGastosByCapa.pendiente',
  'src/audit/auditGastosConciliacion.ts — parrilla pendiente en conciliación',
  'supabase: RLS operador SELECT/UPDATE solo globales + pendiente_revision',
  'supabase: get_gastos_financial_summary + gastos_pendientes_revision (vista)',
  'scripts/clasificar_gastos_financieros.mjs — cola pendiente (CLI)',
];

const RISKS_ALWAYS: string[] = [
  'RLS operador@ depende de pendiente_revision: ocultar UI sin retirar políticas deja acceso BD vía API.',
  'Bootstrap carga siempre fetchGastosByTipo(pendiente_revision): ocultar tarjeta no elimina la query.',
  'gastosPendientesRevision (context) filtra requiere_revision=true, distinto de tipo_gasto pendiente_revision.',
  'gastoTipoForSummary usa pendiente_revision si tipo_gasto vacío: afecta parches optimistas de summary.',
  'IA y RPC classify_gasto_operador permiten mover desde/hacia pendiente_revision.',
];

export function runAuditPendienteRevision(gastos: Gasto[]): Omit<
  AuditPendienteRevisionResult,
  'dbSnapshot' | 'safeToHide' | 'safeToDeleteCode' | 'recommendation' | 'risks'
> {
  const pendienteRows = gastos.filter((g) => gastoMatchesTipoGasto(g, PENDIENTE_TIPO));
  const totalRegistros = pendienteRows.length;
  const montoTotal = sumMonto(pendienteRows);

  const tipoGastoRaw: Record<string, { count: number; monto: number }> = {};
  for (const g of pendienteRows) {
    const k = bucketKey(g.tipo_gasto);
    const cur = tipoGastoRaw[k] ?? { count: 0, monto: 0 };
    cur.count += 1;
    cur.monto += g.monto;
    tipoGastoRaw[k] = cur;
  }

  const requiereTrue = gastos.filter((g) => g.requiere_revision === true);
  const requiereNotPendiente = requiereTrue.filter((g) => !gastoMatchesTipoGasto(g, PENDIENTE_TIPO));

  const nullTipo = gastos.filter((g) => !(g.tipo_gasto ?? '').trim());
  const inferredEffective: Record<string, { count: number; monto: number }> = {};
  for (const g of nullTipo) {
    const eff = tipoGastoEffective(g) ?? '(sin inferencia)';
    const cur = inferredEffective[eff] ?? { count: 0, monto: 0 };
    cur.count += 1;
    cur.monto += g.monto;
    inferredEffective[eff] = cur;
  }

  const examples = [...pendienteRows]
    .sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
    .slice(0, 25)
    .map(mapExample);

  return {
    generatedAt: new Date().toISOString(),
    dataScope: {
      inMemoryGastosLoaded: gastos.length,
      pendienteAlwaysMergedInBootstrap: true,
      note:
        'En vista «reciente», pendiente_revision y gastos_globales se cargan completos vía fetchGastosByTipo; el resto es muestra reciente.',
    },
    totalRegistros,
    montoTotal,
    breakdown: {
      tipoGastoPendienteRevision: { count: totalRegistros, monto: montoTotal },
      tipoGastoRaw,
      requiereRevisionTrue: { count: requiereTrue.length, monto: sumMonto(requiereTrue) },
      requiereRevisionTrueButNotTipoPendiente: {
        count: requiereNotPendiente.length,
        monto: sumMonto(requiereNotPendiente),
      },
      tipoGastoNullOrEmpty: {
        count: nullTipo.length,
        monto: sumMonto(nullTipo),
        inferredEffective,
        note:
          'tipo_gasto null/vacío NO entra en pestaña pendiente_revision (se infiere operativo_vehiculo o gastos_globales).',
      },
    },
    examples,
    uiReferences: UI_REFERENCES,
    codeReferences: CODE_REFERENCES,
  };
}

export async function auditPendienteRevision(
  getGastos: () => Gasto[],
  options?: { empresaId?: string | null; skipDb?: boolean },
): Promise<AuditPendienteRevisionResult> {
  const gastos = getGastos();
  const core = runAuditPendienteRevision(gastos);
  const empresaId = (options?.empresaId ?? EMPRESA_ID).trim() || null;

  let dbSnapshot: AuditPendienteRevisionResult['dbSnapshot'] = {
    fetched: false,
    empresaId,
    count: 0,
    monto: 0,
    error: null,
  };

  if (!options?.skipDb && empresaId) {
    try {
      const rows = await fetchGastosByTipo(PENDIENTE_TIPO, empresaId);
      dbSnapshot = {
        fetched: true,
        empresaId,
        count: rows.length,
        monto: sumMonto(rows),
        error: null,
      };
    } catch (e) {
      dbSnapshot = {
        fetched: false,
        empresaId,
        count: 0,
        monto: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else if (!empresaId) {
    dbSnapshot.error = 'Sin VITE_EMPRESA_ID / empresaId: solo conteo en memoria.';
  }

  const dbCount = dbSnapshot.fetched ? dbSnapshot.count : core.totalRegistros;
  const safeToHide = core.totalRegistros === 0 && dbCount === 0;

  const risks = [...RISKS_ALWAYS];
  if (core.breakdown.requiereRevisionTrue.count > 0) {
    risks.push(
      `${core.breakdown.requiereRevisionTrue.count} filas con requiere_revision=true (pueden seguir en /revision-clasificacion aunque ocultes la tarjeta).`,
    );
  }
  if (core.breakdown.tipoGastoNullOrEmpty.count > 0) {
    risks.push(
      `${core.breakdown.tipoGastoNullOrEmpty.count} gastos con tipo_gasto vacío (no son pendiente_revision; revisar inferencia).`,
    );
  }
  if (dbSnapshot.fetched && dbSnapshot.count !== core.totalRegistros) {
    risks.push(
      `Memoria (${core.totalRegistros}) ≠ BD (${dbSnapshot.count}): recarga gastos o ejecuta loadGastosFull antes de ocultar.`,
    );
  }

  let recommendation: string;
  if (safeToHide) {
    recommendation =
      'totalRegistros=0: se puede ocultar la tarjeta/pestaña en UI. Mantener fallback interno, RLS, fetchGastosByTipo y RPC summary; no borrar código crítico aún.';
  } else {
    recommendation =
      `Quedan ${dbCount} registro(s) con tipo_gasto=pendiente_revision (S/ ${(dbSnapshot.fetched ? dbSnapshot.monto : core.montoTotal).toFixed(2)}). Clasificar/mover antes de ocultar; ver examples.`;
  }

  const result: AuditPendienteRevisionResult = {
    ...core,
    dbSnapshot,
    safeToHide,
    safeToDeleteCode: false,
    risks,
    recommendation,
  };

  printAuditPendienteRevision(result);
  return result;
}

function fmt(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function printAuditPendienteRevision(result: AuditPendienteRevisionResult): void {
  console.group('[audit] pendiente_revision — solo lectura');
  console.log('Generado:', result.generatedAt);
  console.log('Alcance:', result.dataScope.note);
  console.log('Gastos en memoria (total cargados):', result.dataScope.inMemoryGastosLoaded);

  console.group('1) Registros tipo_gasto = pendiente_revision');
  console.log('totalRegistros:', result.totalRegistros);
  console.log('montoTotal: S/', fmt(result.montoTotal));
  if (Object.keys(result.breakdown.tipoGastoRaw).length > 0) {
    console.table(
      Object.entries(result.breakdown.tipoGastoRaw).map(([tipo, v]) => ({
        tipo_gasto_raw: tipo,
        registros: v.count,
        monto: v.monto,
      })),
    );
  }
  console.groupEnd();

  console.group('2) Colas relacionadas (no equivalen a la tarjeta)');
  console.log(
    'requiere_revision=true:',
    result.breakdown.requiereRevisionTrue.count,
    '· S/',
    fmt(result.breakdown.requiereRevisionTrue.monto),
  );
  console.log(
    'requiere_revision=true pero tipo ≠ pendiente_revision:',
    result.breakdown.requiereRevisionTrueButNotTipoPendiente.count,
  );
  console.log(
    'tipo_gasto null/vacío:',
    result.breakdown.tipoGastoNullOrEmpty.count,
    '—',
    result.breakdown.tipoGastoNullOrEmpty.note,
  );
  if (Object.keys(result.breakdown.tipoGastoNullOrEmpty.inferredEffective).length > 0) {
    console.table(
      Object.entries(result.breakdown.tipoGastoNullOrEmpty.inferredEffective).map(([eff, v]) => ({
        inferido_como: eff,
        registros: v.count,
        monto: v.monto,
      })),
    );
  }
  console.groupEnd();

  console.group('3) Verificación BD (fetchGastosByTipo)');
  console.log(result.dbSnapshot);
  console.groupEnd();

  console.group('4) Decisión');
  console.log('%c' + result.recommendation, safeStyle(result.safeToHide));
  console.log('safeToHide:', result.safeToHide);
  console.log('safeToDeleteCode:', result.safeToDeleteCode, '(siempre false: RLS/operador/IA)');
  console.groupEnd();

  if (result.examples.length > 0) {
    console.group('5) Ejemplos (hasta 25, mayor monto)');
    console.table(result.examples);
    console.groupEnd();
  }

  console.group('6) Referencias UI');
  result.uiReferences.forEach((r) => console.log('·', r));
  console.groupEnd();

  console.group('7) Referencias código / BD');
  result.codeReferences.forEach((r) => console.log('·', r));
  console.groupEnd();

  console.group('8) Riesgos');
  result.risks.forEach((r) => console.warn(r));
  console.groupEnd();

  console.groupEnd();
}

function safeStyle(ok: boolean): string {
  return ok
    ? 'color:#059669;font-weight:bold'
    : 'color:#b45309;font-weight:bold';
}
