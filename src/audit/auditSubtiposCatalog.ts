/**
 * Auditoría DEV de catálogos de subtipos (oficial + merge históricos).
 */
import type { Gasto } from '../data/types';
import {
  getOfficialSubtiposForCategoria,
  type OfficialSubtipoCategoria,
} from '../constants/subtipos/officialSubtiposCatalog';
import { buildUnifiedSubtipoCatalog } from '../constants/subtipos/buildUnifiedSubtipoCatalog';
import { getCanonicalSubtipoDedupeKeyFull } from '../constants/subtipos/subtipoCanonicalResolve';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';

export interface SubtiposAuditPayload {
  officialExpected: string[];
  visibleOptions: string[];
  missingOfficial: string[];
  legacyOnly: string[];
  duplicates: string[];
}

function collectHistoricos(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[],
  categoria: string,
): string[] {
  return [
    ...new Set(
      gastos
        .filter((g) => g.tipo_gasto === categoria)
        .map((g) => g.subtipo_gasto?.trim())
        .filter(Boolean) as string[],
    ),
  ];
}

export function buildSubtiposAuditPayload(
  categoria: OfficialSubtipoCategoria,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] = [],
): SubtiposAuditPayload {
  const officialExpected = getOfficialSubtiposForCategoria(categoria).map((e) => e.value);
  const historicos = collectHistoricos(gastos, categoria);
  const merged = buildUnifiedSubtipoCatalog(categoria, historicos);

  const visibleOfficial = merged.options.filter((o) => !o.isLegacy).map((o) => o.value);
  const visibleAll = merged.options.map((o) => o.value);

  const visibleOfficialKeys = new Set(
    visibleOfficial.map((v) => getCanonicalSubtipoDedupeKeyFull(categoria, v)),
  );

  const missingOfficial = officialExpected.filter(
    (v) => !visibleOfficialKeys.has(getCanonicalSubtipoDedupeKeyFull(categoria, v)),
  );

  const officialKeys = new Set(
    officialExpected.map((v) => getCanonicalSubtipoDedupeKeyFull(categoria, v)),
  );

  const legacyOnly = merged.options
    .filter((o) => o.isLegacy)
    .map((o) => o.value)
    .filter((v) => !officialKeys.has(getCanonicalSubtipoDedupeKeyFull(categoria, v)));

  const seenDedupe = new Map<string, string[]>();
  for (const opt of merged.options) {
    const dk = getCanonicalSubtipoDedupeKeyFull(categoria, opt.value);
    const list = seenDedupe.get(dk) ?? [];
    list.push(`${opt.value}${opt.isLegacy ? ' (legacy)' : ''}`);
    seenDedupe.set(dk, list);
  }
  const duplicates = [...seenDedupe.entries()]
    .filter(([, vals]) => vals.length > 1)
    .map(([dk, vals]) => `${dk}: ${vals.join(' | ')}`);

  return {
    officialExpected,
    visibleOptions: visibleAll,
    missingOfficial,
    legacyOnly,
    duplicates,
  };
}

export function auditSubtiposAdmin(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] = [],
): SubtiposAuditPayload {
  const payload = buildSubtiposAuditPayload('administrativo_empresa', gastos);
  console.log('[subtipos:audit-admin]', payload);
  return payload;
}

export function auditSubtiposRepresentacion(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] = [],
): SubtiposAuditPayload {
  const payload = buildSubtiposAuditPayload('representacion_interna', gastos);
  console.log('[subtipos:audit-representacion]', payload);
  return payload;
}

export function auditSubtiposInversion(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] = [],
): SubtiposAuditPayload {
  const payload = buildSubtiposAuditPayload('inversion_compra', gastos);
  console.log('[subtipos:audit-inversion]', payload);
  return payload;
}

/** Duplicados por clave dedupe cruda (sin canónico). */
export function findRawDedupeCollisions(values: string[]): string[] {
  const seen = new Map<string, string[]>();
  for (const v of values) {
    const dk = subtipoDedupeKey(v);
    const list = seen.get(dk) ?? [];
    list.push(v);
    seen.set(dk, list);
  }
  return [...seen.entries()]
    .filter(([, vals]) => vals.length > 1)
    .map(([dk, vals]) => `${dk}: ${vals.join(' | ')}`);
}
