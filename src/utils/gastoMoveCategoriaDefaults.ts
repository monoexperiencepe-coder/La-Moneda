import { getOfficialSubtiposForCategoria as getOfficialEntriesForCategoria } from '../constants/subtipos/officialSubtiposCatalog';
import { resolveCategoriaFinanzaParaSubtipos } from '../constants/subtipos/subtipoCategoria';
import { getSubtiposGasto } from '../data/factCatalog';
import { getFactTiposForFinanza, type FinanzaGastoRegistroValue } from '../data/finanzaGastoRegistro';
import { normalizeRepresentacionInternaSubtipo } from './representacionInternaSubtipoLabel';
import { normalizeOperativoSubtipo } from './operativoSubtipo';
import { normalizeInversionSubtipo } from './inversionSubtipo';
import { normalizeAdministrativoSubtipo } from './administrativoSubtipo';
import { inversionSubtipoRequiereVehiculo } from './inversionSubtipo';
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
  'gastos_globales',
  'inversion_compra',
]);

/** Categorías que exigen `vehicle_id` (inversión solo si el subtipo es vehicular). */
export function tipoGastoRequiereVehiculo(tipoGasto: string, subtipoGasto?: string | null): boolean {
  const t = tipoGasto.trim();
  if (isOperativoVehiculoTipoGasto(t)) return true;
  if (t === 'inversion_compra') {
    return inversionSubtipoRequiereVehiculo(subtipoGasto ?? 'adquisicion_vehiculo');
  }
  return false;
}

export function tipoGastoUsaSubtipoOperativo(tipoGasto: string): boolean {
  const t = tipoGasto.trim();
  return isOperativoVehiculoTipoGasto(t) || isOperativoFlotaGeneralTipoGasto(t);
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
      return 'gasto_representacion';
    case 'financiero_prestamo':
      return 'prestamo';
    case 'administrativo_empresa':
      return 'administrativo_general';
    case 'inversion_compra':
      return 'adquisicion_vehiculo';
    case 'gastos_globales':
      return 'global_no_asignado';
    case TIPO_GASTO_OPERATIVO_VEHICULO:
    case TIPO_GASTO_OPERATIVO_FLOTA_GENERAL:
      return 'motor';
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
    if (trimmed) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  // Inversión: normalizar al canónico
  if (tipoGasto.trim() === 'inversion_compra') {
    const n = normalizeInversionSubtipo(trimmed);
    if (n) return n;
    if (trimmed) return trimmed;
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
    if (trimmed) return trimmed;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  if (valid.size === 0) return trimmed;
  if (!trimmed) return getDefaultSubtipoForTipoGasto(tipoGasto);
  if (valid.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const v of valid) {
    if (v.toLowerCase() === lower) return v;
  }
  return trimmed;
}
