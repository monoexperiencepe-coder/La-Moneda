/**
 * Auditoría read-only subtipos administrativo_empresa.
 */
import type { Gasto } from '../data/types';
import { mapSubtipoToFactTipo } from '../constants/subtipos/mapSubtipoToFactTipo';
import { normKey } from '../utils/normKey';
import {
  getDefaultFactTipoSubtipoForAdministrativoSubtipo,
  isAdministrativoSubtipoLegacyOnly,
  normalizeAdministrativoSubtipo,
  type AdministrativoSubtipoCanon,
} from '../utils/administrativoSubtipo';

export type AdminSubtipoConfidence = 'alta' | 'media' | 'baja';

export interface AdministrativoSubtipoSuggestion {
  id?: number | string;
  subtipoActual: string;
  tipoFactActual: string | null;
  subTipoFactActual: string | null;
  subtipoOficialSugerido: AdministrativoSubtipoCanon | null;
  tipoFactSugerido: string | null;
  subTipoFactSugerido: string | null;
  confianza: AdminSubtipoConfidence;
  razon: string;
  legacyOnly: boolean;
}

export interface AdministrativosSubtiposAuditPayload {
  total: number;
  porSubtipoActual: Record<string, number>;
  suggestedMappings: AdministrativoSubtipoSuggestion[];
  lowConfidence: AdministrativoSubtipoSuggestion[];
  legacyOnly: AdministrativoSubtipoSuggestion[];
  examples: AdministrativoSubtipoSuggestion[];
}

function collectText(
  g: Pick<Gasto, 'subtipo_gasto' | 'motivo' | 'comentarios' | 'pagadoA' | 'tipo' | 'subTipo'>,
): string {
  return [g.subtipo_gasto, g.motivo, g.comentarios, g.pagadoA, g.tipo, g.subTipo]
    .filter(Boolean)
    .join(' ');
}

export function suggestAdministrativoFromGasto(
  g: Pick<
    Gasto,
    'id' | 'subtipo_gasto' | 'motivo' | 'comentarios' | 'pagadoA' | 'tipo' | 'subTipo'
  >,
): AdministrativoSubtipoSuggestion {
  const actual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
  const texto = collectText(g);
  const legacyOnly = isAdministrativoSubtipoLegacyOnly(actual);

  let sugerido = normalizeAdministrativoSubtipo(actual) ?? normalizeAdministrativoSubtipo(texto);
  let confianza: AdminSubtipoConfidence = 'alta';
  let razon = 'normalización canónica';

  if (!sugerido && legacyOnly) {
    const nk = normKey(texto);
    if (nk.includes('oficina') || nk.includes('papeler') || nk.includes('utiles')) {
      sugerido = 'OFICINA';
      confianza = 'media';
      razon = 'texto sugiere oficina / papelería';
    } else if (nk.includes('sunat')) {
      sugerido = 'SUNAT';
      confianza = 'alta';
      razon = 'texto menciona SUNAT';
    } else if (nk.includes('sunarp') || nk.includes('suanrp')) {
      sugerido = 'SUNARP';
      confianza = 'alta';
      razon = 'texto menciona SUNARP';
    } else if (nk.includes('notarial') || nk.includes('tramite')) {
      sugerido = 'TRÁMITES NOTARIALES';
      confianza = 'media';
      razon = 'texto sugiere trámite notarial';
    } else {
      sugerido = 'administrativo_general';
      confianza = 'baja';
      razon = 'legacy sin mapping seguro → administrativo_general';
    }
  }

  const fact =
    sugerido != null
      ? getDefaultFactTipoSubtipoForAdministrativoSubtipo(sugerido)
      : mapSubtipoToFactTipo('administrativo_empresa', actual);

  const tipoFact = (g.tipo ?? '').trim() || null;
  const subTipoFact = (g.subTipo ?? '').trim() || null;
  if (
    sugerido
    && fact
    && tipoFact === fact.tipo
    && subTipoFact
    && normKey(subTipoFact) === normKey(fact.subTipo)
  ) {
    confianza = 'alta';
    razon = 'subtipo y Fact coherentes';
  } else if (sugerido && fact && (tipoFact !== fact.tipo || subTipoFact !== fact.subTipo)) {
    if (confianza === 'alta') confianza = 'media';
    razon = 'subtipo oficial sugerido; Fact actual difiere';
  }

  return {
    id: g.id,
    subtipoActual: actual,
    tipoFactActual: tipoFact,
    subTipoFactActual: subTipoFact,
    subtipoOficialSugerido: sugerido,
    tipoFactSugerido: fact?.tipo ?? null,
    subTipoFactSugerido: fact?.subTipo ?? null,
    confianza,
    razon,
    legacyOnly,
  };
}

export function auditAdministrativosSubtipos(
  gastos: readonly Pick<
    Gasto,
    | 'id'
    | 'tipo_gasto'
    | 'subtipo_gasto'
    | 'motivo'
    | 'comentarios'
    | 'pagadoA'
    | 'tipo'
    | 'subTipo'
  >[],
): AdministrativosSubtiposAuditPayload {
  const rows = gastos.filter((g) => g.tipo_gasto === 'administrativo_empresa');
  const porSubtipoActual: Record<string, number> = {};
  const suggestedMappings: AdministrativoSubtipoSuggestion[] = [];
  const lowConfidence: AdministrativoSubtipoSuggestion[] = [];
  const legacyOnly: AdministrativoSubtipoSuggestion[] = [];

  for (const g of rows) {
    const actual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
    porSubtipoActual[actual] = (porSubtipoActual[actual] ?? 0) + 1;

    const entry = suggestAdministrativoFromGasto(g);
    const canon = normalizeAdministrativoSubtipo(actual);
    const aligned =
      canon
      && entry.subtipoOficialSugerido
      && canon === entry.subtipoOficialSugerido
      && entry.tipoFactActual === entry.tipoFactSugerido;

    if (aligned && entry.confianza === 'alta') continue;

    suggestedMappings.push(entry);
    if (entry.legacyOnly) legacyOnly.push(entry);
    if (entry.confianza === 'baja' || entry.confianza === 'media') lowConfidence.push(entry);
  }

  return {
    total: rows.length,
    porSubtipoActual,
    suggestedMappings,
    lowConfidence,
    legacyOnly,
    examples: suggestedMappings.slice(0, 25),
  };
}

export function logAdministrativosSubtiposAudit(
  gastos: readonly Pick<
    Gasto,
    | 'id'
    | 'tipo_gasto'
    | 'subtipo_gasto'
    | 'motivo'
    | 'comentarios'
    | 'pagadoA'
    | 'tipo'
    | 'subTipo'
  >[],
): AdministrativosSubtiposAuditPayload {
  const payload = auditAdministrativosSubtipos(gastos);
  console.log('[administrativos:audit-subtipos]', payload);
  return payload;
}
