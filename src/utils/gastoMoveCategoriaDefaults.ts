import { getSubtiposGasto } from '../data/factCatalog';
import { getFactTiposForFinanza, type FinanzaGastoRegistroValue } from '../data/finanzaGastoRegistro';
import { SUBTIPOS_REPRESENTACION_INTERNA } from '../data/representacionInterna';
import { normalizeRepresentacionInternaSubtipo } from './representacionInternaSubtipoLabel';

const FINANZA_TAB_TIPOS = new Set<string>([
  'operativo_vehiculo',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'gastos_globales',
  'inversion_compra',
]);

/** Categorías financieras que no deben llevar `vehicle_id` en gastos (flota global). */
export function tipoGastoRequiereVehiculo(tipoGasto: string): boolean {
  const t = tipoGasto.trim();
  return t === 'operativo_vehiculo' || t === 'inversion_compra';
}

function catalogSubtiposUnionForFinanza(cat: FinanzaGastoRegistroValue): Set<string> {
  const out = new Set<string>();
  for (const factTipo of getFactTiposForFinanza(cat)) {
    for (const s of getSubtiposGasto(factTipo)) {
      if (s.trim()) out.add(s);
    }
  }
  return out;
}

/** Subtipos aceptados para `tipo_gasto` (finanza) al mover desde la UI. */
export function getValidSubtiposForTipoGastoFinanza(tipoGasto: string): Set<string> {
  const t = tipoGasto.trim();
  const out = new Set<string>();
  if (t === 'representacion_interna') {
    for (const s of SUBTIPOS_REPRESENTACION_INTERNA) out.add(s);
    return out;
  }
  if (!FINANZA_TAB_TIPOS.has(t)) return out;
  const cat = t as FinanzaGastoRegistroValue;
  for (const s of catalogSubtiposUnionForFinanza(cat)) out.add(s);
  if (t === 'financiero_prestamo') {
    out.add('prestamo');
    out.add('cuota');
    out.add('interes');
    out.add('prestamo_interes_banca');
  }
  if (t === 'administrativo_empresa') out.add('administrativo_general');
  if (t === 'gastos_globales') out.add('global_no_asignado');
  if (t === 'inversion_compra') out.add('inversion_compra');
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
      return 'inversion_compra';
    case 'gastos_globales':
      return 'global_no_asignado';
    case 'operativo_vehiculo':
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

/** Ajusta `subtipo_gasto` al catálogo de la categoría destino (nunca deja valores de otra categoría). */
export function normalizeSubtipoForTipoGasto(tipoGasto: string, raw: string): string {
  const trimmed = raw.trim();
  const valid = getValidSubtiposForTipoGastoFinanza(tipoGasto);
  if (valid.size === 0) return trimmed;

  if (tipoGasto.trim() === 'representacion_interna') {
    const n = normalizeRepresentacionInternaSubtipo(trimmed);
    if (n && valid.has(n)) return n;
    return getDefaultSubtipoForTipoGasto(tipoGasto);
  }

  if (!trimmed) return getDefaultSubtipoForTipoGasto(tipoGasto);
  if (valid.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const v of valid) {
    if (v.toLowerCase() === lower) return v;
  }
  return getDefaultSubtipoForTipoGasto(tipoGasto);
}
