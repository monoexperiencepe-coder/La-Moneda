/**
 * Auditoría Tipo Fact vs subtipo_gasto (solo lectura / logs DEV).
 * No modifica BD ni UI.
 */
import type { Gasto } from '../data/types';
import { getSubtiposGasto } from '../data/factCatalog';
import {
  getFactTiposForFinanza,
  type FinanzaGastoRegistroValue,
} from '../data/finanzaGastoRegistro';
import {
  getOfficialSubtiposForCategoria,
  type OfficialSubtipoCategoria,
} from '../constants/subtipos/officialSubtiposCatalog';
import { buildUnifiedSubtipoCatalog } from '../constants/subtipos/buildUnifiedSubtipoCatalog';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from '../utils/normKey';
import {
  getDefaultFactTipoSubtipoForAdministrativoSubtipo,
  normalizeAdministrativoSubtipo,
} from '../utils/administrativoSubtipo';
import { normalizeRepresentacionInternaSubtipo } from '../utils/representacionInternaSubtipoLabel';
import {
  getDefaultFactTipoSubtipoForFinancieroSubtipo,
  normalizeFinancieroPrestamoSubtipo,
} from '../utils/financieroPrestamoSubtipo';
import {
  getDefaultFactTipoSubtipoForInversionCanon,
  normalizeInversionSubtipo,
} from '../utils/inversionSubtipo';
import {
  getDefaultFactTipoSubtipoForOperativoCanon,
  normalizeOperativoSubtipo,
} from '../utils/operativoSubtipo';
import {
  REPRESENTACION_INTERNA_FACT_SUBTIPO,
  REPRESENTACION_INTERNA_FACT_TIPO,
} from '../data/representacionInterna';

const AUDIT_CATEGORIAS: OfficialSubtipoCategoria[] = [
  'administrativo_empresa',
  'operativo_vehiculo',
  'operativo_flota_general',
  'representacion_interna',
  'inversion_compra',
  'financiero_prestamo',
];

export interface SubtipoFactMapEntry {
  subtipo: string;
  label: string;
  isLegacy: boolean;
  expectedFactTipo: string | null;
  expectedFactSubtipo: string | null;
  possibleFactTipos: string[];
  status: 'unique' | 'ambiguous' | 'unmapped';
  notes?: string;
}

export interface SubtipoFactMapAudit {
  categoria: OfficialSubtipoCategoria;
  totalSubtipos: number;
  mapped: number;
  unmapped: number;
  ambiguous: number;
  examples: {
    unique: SubtipoFactMapEntry[];
    ambiguous: SubtipoFactMapEntry[];
    unmapped: SubtipoFactMapEntry[];
  };
  entries: SubtipoFactMapEntry[];
}

export interface SubtipoFactDataAudit {
  totalRegistros: number;
  ok: number;
  mismatchTipoFact: number;
  mismatchSubtipoFact: number;
  subtipoNoReconocido: number;
  sinSubtipo: number;
  porCategoria: Record<
    string,
    {
      total: number;
      ok: number;
      mismatchTipoFact: number;
      mismatchSubtipoFact: number;
      subtipoNoReconocido: number;
      sinSubtipo: number;
    }
  >;
  ejemplosCriticos: Array<{
    id?: number | string;
    tipo_gasto: string | null;
    subtipo_gasto: string | null;
    tipoFact: string | null;
    subTipoFact: string | null;
    expectedTipoFact: string | null;
    expectedSubTipoFact: string | null;
    issue: string;
  }>;
}

export interface SubtipoFactImpactEntry {
  file: string;
  usages: string;
  riskLevel: 'low' | 'medium' | 'high';
  canHideFromUI: boolean;
  requiresMigration: boolean;
}

export interface SubtipoFactImpactAudit {
  files: SubtipoFactImpactEntry[];
  usages: string;
  riskLevel: 'low' | 'medium' | 'high';
  canHideFromUI: boolean;
  requiresMigration: boolean;
}

function factSubMatchesFinSub(factSub: string, finSub: string): boolean {
  const a = subtipoDedupeKey(factSub);
  const b = subtipoDedupeKey(finSub);
  if (a === b) return true;
  const nkA = normKey(factSub);
  const nkB = normKey(finSub);
  if (nkA === nkB) return true;
  if (nkA.includes(nkB) || nkB.includes(nkA)) {
    return nkB.length >= 4 || nkA.length >= 4;
  }
  return false;
}

/** Fact tipos cuya lista de subtipos Fact intersecta el subtipo financiero. */
function findFactTiposForFinancialSubtipo(
  categoria: FinanzaGastoRegistroValue,
  subtipoFin: string,
): { tipos: string[]; factSubMatches: Record<string, string[]> } {
  const tipos = getFactTiposForFinanza(categoria);
  const hits: string[] = [];
  const factSubMatches: Record<string, string[]> = {};
  for (const factTipo of tipos) {
    const matched: string[] = [];
    for (const fs of getSubtiposGasto(factTipo)) {
      if (factSubMatchesFinSub(fs, subtipoFin)) matched.push(fs);
    }
    if (matched.length > 0) {
      hits.push(factTipo);
      factSubMatches[factTipo] = matched;
    }
  }
  return { tipos: hits, factSubMatches };
}

/** Prioridad al elegir tipo Fact cuando hay varios (admin/financiero). */
const FACT_TIPO_PRIORITY: Partial<Record<FinanzaGastoRegistroValue, string[]>> = {
  administrativo_empresa: [
    'TRIBUTARIOS / NOTARIALES',
    'GASTOS FIJOS',
    'SEGUROS /DOCUMENTOS',
    'DOCUMENTOS',
    'OTROS GASTOS',
    'COMPRA ACTIVO',
    'DEVOLUCION POR INGRESO TRANSITORIO',
  ],
  financiero_prestamo: ['GASTOS FIJOS', 'OTROS GASTOS', 'TRIBUTARIOS / NOTARIALES'],
};

function pickPreferredFactTipo(
  categoria: FinanzaGastoRegistroValue,
  candidates: string[],
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const order = FACT_TIPO_PRIORITY[categoria] ?? [];
  for (const t of order) {
    if (candidates.includes(t)) return t;
  }
  return candidates[0];
}

export interface InferredFactPair {
  tipo: string | null;
  subTipo: string | null;
  possibleTipos: string[];
  recognized: boolean;
  ambiguous: boolean;
  notes?: string;
}

export function inferFactFromFinancialSubtipo(
  categoria: string,
  subtipoRaw: string | null | undefined,
): InferredFactPair {
  const sub = (subtipoRaw ?? '').trim();
  if (!sub) {
    return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
  }

  const cat = categoria as FinanzaGastoRegistroValue;

  if (cat === 'representacion_interna') {
    const norm = normalizeRepresentacionInternaSubtipo(sub);
    return {
      tipo: REPRESENTACION_INTERNA_FACT_TIPO,
      subTipo: REPRESENTACION_INTERNA_FACT_SUBTIPO,
      possibleTipos: [REPRESENTACION_INTERNA_FACT_TIPO],
      recognized: Boolean(norm || sub),
      ambiguous: false,
      notes: 'Fact fijo; detalle en subtipo_gasto',
    };
  }

  if (cat === 'operativo_vehiculo' || cat === 'operativo_flota_general') {
    const canon = normalizeOperativoSubtipo(sub);
    if (!canon) {
      return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
    }
    const def = getDefaultFactTipoSubtipoForOperativoCanon(canon);
    const altTipos =
      canon === 'combustible'
        ? ['MECÁNICOS', 'ABASTECIMIENTO DE COMBUSTIBLE']
        : [def.tipo];
    return {
      tipo: def.tipo,
      subTipo: def.subTipo,
      possibleTipos: altTipos,
      recognized: true,
      ambiguous: canon === 'combustible',
      notes: canon === 'combustible' ? 'Recargas GLP/GNV → ABASTECIMIENTO; tanque → MECÁNICOS' : undefined,
    };
  }

  if (cat === 'inversion_compra') {
    const canon = normalizeInversionSubtipo(sub);
    if (!canon) {
      return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
    }
    const def = getDefaultFactTipoSubtipoForInversionCanon(canon);
    return {
      tipo: def.tipo,
      subTipo: def.subTipo,
      possibleTipos: [def.tipo],
      recognized: true,
      ambiguous: false,
    };
  }

  if (cat === 'financiero_prestamo') {
    const canon = normalizeFinancieroPrestamoSubtipo(sub);
    if (!canon) {
      return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
    }
    const def = getDefaultFactTipoSubtipoForFinancieroSubtipo(canon);
    return {
      tipo: def.tipo,
      subTipo: def.subTipo,
      possibleTipos: [def.tipo],
      recognized: true,
      ambiguous: canon === 'OTROS / ESPECIFICAR',
    };
  }

  if (cat === 'administrativo_empresa') {
    const canon = normalizeAdministrativoSubtipo(sub);
    if (!canon) {
      return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
    }
    const def = getDefaultFactTipoSubtipoForAdministrativoSubtipo(canon);
    return {
      tipo: def.tipo,
      subTipo: def.subTipo,
      possibleTipos: [def.tipo],
      recognized: true,
      ambiguous: canon === 'OTROS / ESPECIFICAR' || canon === 'administrativo_general',
    };
  }

  return { tipo: null, subTipo: null, possibleTipos: [], recognized: false, ambiguous: false };
}

function visibleSubtiposForMapAudit(categoria: OfficialSubtipoCategoria): Array<{
  value: string;
  label: string;
  isLegacy: boolean;
}> {
  const { options } = buildUnifiedSubtipoCatalog(categoria, []);
  return options.map((o) => ({ value: o.value, label: o.label, isLegacy: o.isLegacy }));
}

export function auditSubtipoFactMap(categoria: OfficialSubtipoCategoria): SubtipoFactMapAudit {
  const visible = visibleSubtiposForMapAudit(categoria);
  const entries: SubtipoFactMapEntry[] = visible.map((opt) => {
    const inferred = inferFactFromFinancialSubtipo(categoria, opt.value);
    const status: SubtipoFactMapEntry['status'] = !inferred.recognized
      ? 'unmapped'
      : inferred.ambiguous
        ? 'ambiguous'
        : 'unique';
    return {
      subtipo: opt.value,
      label: opt.label,
      isLegacy: opt.isLegacy,
      expectedFactTipo: inferred.tipo,
      expectedFactSubtipo: inferred.subTipo,
      possibleFactTipos: inferred.possibleTipos,
      status,
      notes: inferred.notes,
    };
  });

  const mapped = entries.filter((e) => e.status === 'unique').length;
  const ambiguous = entries.filter((e) => e.status === 'ambiguous').length;
  const unmapped = entries.filter((e) => e.status === 'unmapped').length;

  return {
    categoria,
    totalSubtipos: entries.length,
    mapped,
    unmapped,
    ambiguous,
    examples: {
      unique: entries.filter((e) => e.status === 'unique').slice(0, 5),
      ambiguous: entries.filter((e) => e.status === 'ambiguous'),
      unmapped: entries.filter((e) => e.status === 'unmapped'),
    },
    entries,
  };
}

export function auditSubtipoFactMapAll(): SubtipoFactMapAudit[] {
  return AUDIT_CATEGORIAS.map((c) => auditSubtipoFactMap(c));
}

function emptyCatStats() {
  return {
    total: 0,
    ok: 0,
    mismatchTipoFact: 0,
    mismatchSubtipoFact: 0,
    subtipoNoReconocido: 0,
    sinSubtipo: 0,
  };
}

export function auditSubtipoFactData(
  gastos: readonly Pick<
    Gasto,
    'id' | 'tipo_gasto' | 'subtipo_gasto' | 'tipo' | 'subTipo'
  >[],
): SubtipoFactDataAudit {
  const porCategoria: SubtipoFactDataAudit['porCategoria'] = Object.fromEntries(
    AUDIT_CATEGORIAS.map((c) => [c, emptyCatStats()]),
  );
  const ejemplosCriticos: SubtipoFactDataAudit['ejemplosCriticos'] = [];
  let totalRegistros = 0;
  let ok = 0;
  let mismatchTipoFact = 0;
  let mismatchSubtipoFact = 0;
  let subtipoNoReconocido = 0;
  let sinSubtipo = 0;

  const pushEjemplo = (
    g: Pick<Gasto, 'id' | 'tipo_gasto' | 'subtipo_gasto' | 'tipo' | 'subTipo'>,
    issue: string,
    inferred: InferredFactPair,
  ) => {
    if (ejemplosCriticos.length >= 25) return;
    ejemplosCriticos.push({
      id: g.id,
      tipo_gasto: g.tipo_gasto ?? null,
      subtipo_gasto: g.subtipo_gasto ?? null,
      tipoFact: g.tipo ?? null,
      subTipoFact: g.subTipo ?? null,
      expectedTipoFact: inferred.tipo,
      expectedSubTipoFact: inferred.subTipo,
      issue,
    });
  };

  for (const g of gastos) {
    const cat = (g.tipo_gasto ?? '').trim() as OfficialSubtipoCategoria;
    if (!AUDIT_CATEGORIAS.includes(cat)) continue;

    totalRegistros += 1;
    const stats = porCategoria[cat];
    stats.total += 1;

    const sub = (g.subtipo_gasto ?? '').trim();
    if (!sub) {
      sinSubtipo += 1;
      stats.sinSubtipo += 1;
      pushEjemplo(g, 'sin_subtipo', inferFactFromFinancialSubtipo(cat, ''));
      continue;
    }

    const inferred = inferFactFromFinancialSubtipo(cat, sub);
    if (!inferred.recognized) {
      subtipoNoReconocido += 1;
      stats.subtipoNoReconocido += 1;
      pushEjemplo(g, 'subtipo_no_reconocido', inferred);
      continue;
    }

    const actualTipo = (g.tipo ?? '').trim();
    const actualSub = (g.subTipo ?? '').trim();
    const tipoOk =
      !actualTipo
      || !inferred.tipo
      || actualTipo === inferred.tipo
      || inferred.possibleTipos.includes(actualTipo);
    const subOk =
      !actualSub
      || !inferred.subTipo
      || factSubMatchesFinSub(actualSub, inferred.subTipo)
      || factSubMatchesFinSub(actualSub, sub);

    if (!tipoOk) {
      mismatchTipoFact += 1;
      stats.mismatchTipoFact += 1;
      pushEjemplo(g, 'mismatch_tipo_fact', inferred);
      continue;
    }
    if (!subOk) {
      mismatchSubtipoFact += 1;
      stats.mismatchSubtipoFact += 1;
      pushEjemplo(g, 'mismatch_subtipo_fact', inferred);
      continue;
    }

    ok += 1;
    stats.ok += 1;
  }

  return {
    totalRegistros,
    ok,
    mismatchTipoFact,
    mismatchSubtipoFact,
    subtipoNoReconocido,
    sinSubtipo,
    porCategoria,
    ejemplosCriticos,
  };
}

export const SUBTIPO_FACT_IMPACT_ENTRIES: SubtipoFactImpactEntry[] = [
  {
    file: 'src/components/Forms/ExpenseForm.tsx',
    usages: 'UI manual Tipo+Subtipo Fact (admin/financiero/planilla/globales); autoderiva operativo/inversión/rep',
    riskLevel: 'high',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/components/Tables/RegistrosTable.tsx',
    usages: 'Edición con selects tipoFact/subtipoFact; inferCategoriaFromTipoGasto al cambiar tipo',
    riskLevel: 'high',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/constants/gastosSubtipos.ts',
    usages: 'buildSubtipoFormSelectOptions filtra subtipo por tipo Fact seleccionado',
    riskLevel: 'high',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/utils/factMappers.ts',
    usages: 'inferCategoriaFromTipoGasto(tipo Fact) → bucket KPI gráficos',
    riskLevel: 'medium',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/pages/Finanzas/Resumen.tsx',
    usages: 'KPIs por tipo_gasto (RPC); no agrupa por tipo Fact',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/utils/gastosFinancialSummary.ts',
    usages: 'Totales por tipo_gasto desde RPC',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/pages/Finanzas/Gastos.tsx',
    usages: 'Tabs/filtros por subtipo_gasto; ranking subtipo; historial',
    riskLevel: 'medium',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/modules/ai/tools/runner.ts',
    usages: 'Agregados y clasificación por tipo_gasto/subtipo_gasto',
    riskLevel: 'medium',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/modules/ai/financialAnalytics.ts',
    usages: 'OPEX/CAPEX por tipo_gasto',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/utils/gastoClasificacionSugerencia.ts',
    usages: 'Sugerencias usan tipo+subtipo Fact y tipo_gasto',
    riskLevel: 'medium',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/utils/parseQuickEntry.ts',
    usages: 'Entrada rápida resuelve tipo/subtipo Fact',
    riskLevel: 'medium',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/utils/reportesExport.ts',
    usages: 'Export incluye columnas tipo y subTipo Fact',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/services/supabaseMappers.ts',
    usages: 'Persistencia tipo/subTipo en BD',
    riskLevel: 'high',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/utils/recordSearch.ts',
    usages: 'Búsqueda indexa tipo Fact',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
  {
    file: 'src/pages/Finanzas/RevisionClasificacion.tsx',
    usages: 'Revisión clasificación IA',
    riskLevel: 'medium',
    canHideFromUI: false,
    requiresMigration: false,
  },
  {
    file: 'src/audit/auditGastosConciliacion.ts',
    usages: 'Conciliación muestra tipo Fact',
    riskLevel: 'low',
    canHideFromUI: true,
    requiresMigration: false,
  },
];

export function auditSubtipoFactImpact(): SubtipoFactImpactAudit {
  const high = SUBTIPO_FACT_IMPACT_ENTRIES.filter((e) => e.riskLevel === 'high').length;
  const riskLevel = high >= 3 ? 'high' : high >= 1 ? 'medium' : 'low';
  return {
    files: SUBTIPO_FACT_IMPACT_ENTRIES,
    usages: `${SUBTIPO_FACT_IMPACT_ENTRIES.length} archivos con dependencia directa o indirecta de tipo/subTipo Fact`,
    riskLevel,
    canHideFromUI: false,
    requiresMigration: false,
  };
}

export function logSubtipoFactMapAudit(categoria?: OfficialSubtipoCategoria): void {
  const audits = categoria ? [auditSubtipoFactMap(categoria)] : auditSubtipoFactMapAll();
  for (const a of audits) {
    console.log('[subtipo-fact:audit-map]', {
      categoria: a.categoria,
      totalSubtipos: a.totalSubtipos,
      mapped: a.mapped,
      unmapped: a.unmapped,
      ambiguous: a.ambiguous,
      examples: a.examples,
    });
  }
}

export function logSubtipoFactDataAudit(
  gastos: readonly Pick<Gasto, 'id' | 'tipo_gasto' | 'subtipo_gasto' | 'tipo' | 'subTipo'>[],
): SubtipoFactDataAudit {
  const payload = auditSubtipoFactData(gastos);
  console.log('[subtipo-fact:audit-data]', payload);
  return payload;
}

export function logSubtipoFactImpactAudit(): SubtipoFactImpactAudit {
  const payload = auditSubtipoFactImpact();
  console.log('[subtipo-fact:impact]', payload);
  return payload;
}

export function logSubtipoFactAuditFull(
  gastos: readonly Pick<Gasto, 'id' | 'tipo_gasto' | 'subtipo_gasto' | 'tipo' | 'subTipo'>[],
): void {
  logSubtipoFactMapAudit();
  logSubtipoFactDataAudit(gastos);
  logSubtipoFactImpactAudit();
}

/** Resumen ejecutivo para informe (sin gastos reales). */
export type { OfficialSubtipoCategoria };

export function summarizeSubtipoFactInferability(): {
  porCategoria: Array<{
    categoria: string;
    total: number;
    uniquePct: number;
    ambiguousPct: number;
    unmappedPct: number;
  }>;
  globalUniquePct: number;
} {
  const audits = auditSubtipoFactMapAll();
  const porCategoria = audits.map((a) => ({
    categoria: a.categoria,
    total: a.totalSubtipos,
    uniquePct: a.totalSubtipos ? Math.round((a.mapped / a.totalSubtipos) * 100) : 0,
    ambiguousPct: a.totalSubtipos ? Math.round((a.ambiguous / a.totalSubtipos) * 100) : 0,
    unmappedPct: a.totalSubtipos ? Math.round((a.unmapped / a.totalSubtipos) * 100) : 0,
  }));
  const total = audits.reduce((s, a) => s + a.totalSubtipos, 0);
  const mapped = audits.reduce((s, a) => s + a.mapped, 0);
  return {
    porCategoria,
    globalUniquePct: total ? Math.round((mapped / total) * 100) : 0,
  };
}
