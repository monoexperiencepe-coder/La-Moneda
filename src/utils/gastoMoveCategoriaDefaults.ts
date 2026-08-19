import { getOfficialSubtiposForCategoria as getOfficialEntriesForCategoria } from '../constants/subtipos/officialSubtiposCatalog';
import { resolveCategoriaFinanzaParaSubtipos } from '../constants/subtipos/subtipoCategoria';
import { getSubtiposGasto } from '../data/factCatalog';
import { getFactTiposForFinanza, type FinanzaGastoRegistroValue } from '../data/finanzaGastoRegistro';
import { normalizeRepresentacionInternaSubtipo } from './representacionInternaSubtipoLabel';
import { normalizeOperativoSubtipo } from './operativoSubtipo';
import { normalizeInversionSubtipo } from './inversionSubtipo';
import { normalizeAdministrativoSubtipo } from './administrativoSubtipo';
import { normalizeFinancieroPrestamoSubtipo } from './financieroPrestamoSubtipo';
import { resolveOperativoSubtipoGastoCanon } from './operativoSubtipo';
import { subtipoBelongsToCategoria } from '../constants/subtipos/subtipoBelongsToCategoria';
import {
  TIPO_GASTO_OPERATIVO_FLOTA_GENERAL,
  TIPO_GASTO_OPERATIVO_VEHICULO,
  isOperativoFlotaGeneralTipoGasto,
  isOperativoVehiculoTipoGasto,
} from './operativoTipoGasto';

const FINANZA_TAB_TIPOS = new Set<string>([
  TIPO_GASTO_OPERATIVO_VEHICULO,
  TIPO_GASTO_OPERATIVO_FLOTA_GENERAL,
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'otros_gastos_varios',
  'gastos_globales',
  'inversion_compra',
]);

/** Categorías que exigen `vehicle_id` (solo operativo por vehículo). */
export function tipoGastoRequiereVehiculo(tipoGasto: string, _subtipoGasto?: string | null): boolean {
  return isOperativoVehiculoTipoGasto(tipoGasto.trim());
}

/** Inversión con utilidad: vehículo opcional si se conoce la unidad. */
export function tipoGastoAdmiteVehiculoOpcional(tipoGasto: string): boolean {
  return tipoGasto.trim() === 'inversion_compra';
}

export function tipoGastoUsaSubtipoOperativo(tipoGasto: string): boolean {
  const t = tipoGasto.trim();
  return isOperativoVehiculoTipoGasto(t) || isOperativoFlotaGeneralTipoGasto(t);
}

/** Financieros: subtipo oficial en UI; Tipo Fact se infiere al guardar. */
export function tipoGastoUsaSubtipoFinancieroCanon(tipoGasto: string): boolean {
  return tipoGasto.trim() === 'financiero_prestamo';
}

/** Administrativos: subtipo oficial en UI; Tipo Fact se infiere al guardar. */
export function tipoGastoUsaSubtipoAdministrativoCanon(tipoGasto: string): boolean {
  return tipoGasto.trim() === 'administrativo_empresa';
}

/** Categorías con subtipo oficial en registro / mover / editar (sin Tipo Fact manual). */
export function tipoGastoPermiteEdicionSubtipoOficial(tipoGasto: string): boolean {
  const t = tipoGasto.trim();
  return (
    tipoGastoUsaSubtipoAdministrativoCanon(t)
    || tipoGastoUsaSubtipoFinancieroCanon(t)
    || t === 'inversion_compra'
    || t === 'representacion_interna'
    || tipoGastoUsaSubtipoOperativo(t)
  );
}

/** Valor canónico para selector de edición (aliases legacy → oficial). */
export function resolveSubtipoCanonForGastoEdit(
  tipoGasto: string,
  subtipoGasto: string | null | undefined,
): string {
  const t = tipoGasto.trim();
  const raw = (subtipoGasto ?? '').trim();
  if (!raw) return getDefaultSubtipoForTipoGasto(t);

  if (tipoGastoUsaSubtipoAdministrativoCanon(t)) {
    return normalizeAdministrativoSubtipo(raw) ?? raw;
  }
  if (tipoGastoUsaSubtipoFinancieroCanon(t)) {
    return normalizeFinancieroPrestamoSubtipo(raw) ?? raw;
  }
  if (t === 'inversion_compra') {
    return normalizeInversionSubtipo(raw) ?? raw;
  }
  if (t === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(raw) || raw;
  }
  if (tipoGastoUsaSubtipoOperativo(t)) {
    return normalizeOperativoSubtipo(raw) ?? resolveOperativoSubtipoGastoCanon(raw) ?? raw;
  }
  return raw;
}

/** Normaliza subtipo elegido en edición antes de persistir. */
export function normalizeSubtipoCanonForGastoSave(tipoGasto: string, canon: string): string {
  const trimmed = canon.trim();
  if (!trimmed) return getDefaultSubtipoForTipoGasto(tipoGasto);
  if (!subtipoBelongsToCategoria(tipoGasto, trimmed)) {
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }
  return resolveSubtipoCanonForGastoEdit(tipoGasto, trimmed);
}

function catalogSubtiposUnionForFinanza(cat: FinanzaGastoRegistroValue): Set<string> {
  return new Set(getOfficialEntriesForCategoria(cat).map((o) => o.value));
}

/** Subtipos aceptados para `tipo_gasto` (finanza) al mover desde la UI. */
export function getValidSubtiposForTipoGastoFinanza(tipoGasto: string): Set<string> {
  const t = tipoGasto.trim();
  const out = new Set<string>();
  const cat = resolveCategoriaFinanzaParaSubtipos(t);
  if (!cat || !FINANZA_TAB_TIPOS.has(cat)) return out;
  for (const s of catalogSubtiposUnionForFinanza(cat)) out.add(s);
  return out;
}

/**
 * Subtipo por defecto al cambiar la categoría destino en «Mover gasto».
 * Debe ser siempre válido para `tipo_gasto` según `getValidSubtiposForTipoGastoFinanza`.
 */
export function getDefaultSubtipoForTipoGasto(tipoGasto: string): string {
  const t = tipoGasto.trim();
  switch (t) {
    case 'representacion_interna':
      return 'ALMUERZOS SOCIOS';
    case 'financiero_prestamo':
      return 'PRÉSTAMO';
    case 'administrativo_empresa':
      return 'administrativo_general';
    case 'inversion_compra':
      return 'adquisicion_vehiculo';
    case 'otros_gastos_varios':
      return 'OTROS /ESPECIFICAR';
    case 'gastos_globales':
      return 'global_no_asignado';
    case TIPO_GASTO_OPERATIVO_VEHICULO:
    case TIPO_GASTO_OPERATIVO_FLOTA_GENERAL:
      return 'OTROS / ESPECIFICAR';
    case 'planilla_laboral': {
      const cat = t as FinanzaGastoRegistroValue;
      const tipos = getFactTiposForFinanza(cat);
      for (const factTipo of tipos) {
        const subs = getSubtiposGasto(factTipo);
        const first = subs.find((s) => s.trim());
        if (first) return first;
      }
      return '';
    }
    default:
      return '';
  }
}

/** Ajusta `subtipo_gasto` al catálogo de la categoría destino; preserva históricos reconocibles. */
export function normalizeSubtipoForTipoGasto(tipoGasto: string, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed && !subtipoBelongsToCategoria(tipoGasto, trimmed)) {
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }
  const valid = getValidSubtiposForTipoGastoFinanza(tipoGasto);

  if (tipoGasto.trim() === 'representacion_interna') {
    const n = normalizeRepresentacionInternaSubtipo(trimmed);
    if (n && (valid.size === 0 || valid.has(n))) return n;
    if (trimmed) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  if (tipoGastoUsaSubtipoOperativo(tipoGasto)) {
    const n = normalizeOperativoSubtipo(trimmed);
    if (n) return n;
    const lower = trimmed.toLowerCase();
    if (valid.size > 0) {
      for (const v of valid) {
        if (v.toLowerCase() === lower) return v;
      }
    }
    if (trimmed && subtipoBelongsToCategoria(tipoGasto, trimmed)) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  // Inversión: normalizar al canónico
  if (tipoGasto.trim() === 'inversion_compra') {
    const n = normalizeInversionSubtipo(trimmed);
    if (n) return n;
    if (trimmed && subtipoBelongsToCategoria(tipoGasto, trimmed)) return trimmed;
    return 'adquisicion_vehiculo';
  }

  if (tipoGasto.trim() === 'administrativo_empresa') {
    const n = normalizeAdministrativoSubtipo(trimmed);
    if (n) return n;
    const lower = trimmed.toLowerCase();
    if (valid.size > 0) {
      for (const v of valid) {
        if (v.toLowerCase() === lower) return v;
      }
    }
    if (trimmed && subtipoBelongsToCategoria(tipoGasto, trimmed)) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  if (tipoGasto.trim() === 'financiero_prestamo') {
    const n = normalizeFinancieroPrestamoSubtipo(trimmed);
    if (n) return n;
    if (trimmed && subtipoBelongsToCategoria(tipoGasto, trimmed)) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  if (valid.size === 0) return trimmed;
  if (!trimmed) return getDefaultSubtipoForTipoGasto(tipoGasto);
  if (valid.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const v of valid) {
    if (v.toLowerCase() === lower) return v;
  }
  if (subtipoBelongsToCategoria(tipoGasto, trimmed)) return trimmed;
  return getDefaultSubtipoForTipoGasto(tipoGasto);
}
