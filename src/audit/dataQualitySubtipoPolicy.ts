/**
 * Política conservadora para conciliación automática de subtipos (data quality).
 */
import type { OfficialSubtipoCategoria } from './auditSubtipoFact';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from '../utils/normKey';
import { isFinancieroLegacySuspiciousSubtipo } from '../utils/financieroPrestamoSubtipo';
export type DataQualityConfidenceLevel = 'high' | 'medium' | 'low';

export function hasRealSubtipoChange(
  fromRaw: string,
  toRaw: string | null | undefined,
): boolean {
  if (!toRaw) return false;
  const from = fromRaw.trim();
  const to = toRaw.trim();
  if (!from || from === '(vacío)') return true;
  if (subtipoDedupeKey(from) === subtipoDedupeKey(to)) return false;
  if (normKey(from) === normKey(to)) return false;
  return true;
}

export function transitionKey(categoria: string, from: string, to: string): string {
  return `${categoria}|${from}→${to}`;
}

function fromNormKeys(raw: string): string[] {
  const nk = normKey(raw);
  const flat = nk.replace(/\s+/g, '_');
  const dk = subtipoDedupeKey(raw);
  return [nk, flat, dk];
}

/** Alias con destino inequívoco — únicos candidatos a confianza alta y lote. */
export function isSafeHighSubtipoAlias(
  cat: OfficialSubtipoCategoria,
  fromRaw: string,
  toCanon: string,
): boolean {
  const toDk = subtipoDedupeKey(toCanon);
  const keys = fromNormKeys(fromRaw);

  if (cat === 'administrativo_empresa') {
    const rules: Array<{ from: string[]; toDk: string }> = [
      {
        from: [
          'oficina_documentos',
          'oficina',
          'oficina_documento',
          'papeleria',
          'papeletria',
          'utiles_de_oficina',
          'utilies_de_oficina',
        ],
        toDk: subtipoDedupeKey('OFICINA'),
      },
      { from: ['administrativo'], toDk: subtipoDedupeKey('administrativo_general') },
      { from: ['suanrp'], toDk: subtipoDedupeKey('SUNARP') },
    ];
    return rules.some(
      (r) => toDk === r.toDk && keys.some((k) => r.from.includes(k) || r.from.includes(subtipoDedupeKey(k))),
    );
  }

  if (cat === 'inversion_compra') {
    const rules: Array<{ from: string[]; toDk: string }> = [
      {
        from: ['compra_activo_vehiculo', 'compra_activo', 'compra_de_activo_vehiculo'],
        toDk: subtipoDedupeKey('adquisicion_vehiculo'),
      },
    ];
    return rules.some(
      (r) => toDk === r.toDk && keys.some((k) => r.from.includes(k) || r.from.includes(subtipoDedupeKey(k))),
    );
  }

  return false;
}

function cuotaCompraActivoTextoClaro(texto: string): boolean {
  const t = normKey(texto);
  return (
    t.includes('activo')
    || t.includes('vehiculo')
    || t.includes('vehículo')
    || (t.includes('compra') && (t.includes('activo') || t.includes('vehiculo') || t.includes('vehículo')))
  );
}

/** Ajusta confianza: alta solo para alias seguros; casos ambiguos → medium/low. */
export function refineDataQualityConfidence(
  cat: OfficialSubtipoCategoria,
  subtipoActual: string,
  canon: string | null,
  texto: string,
  base: DataQualityConfidenceLevel,
): DataQualityConfidenceLevel {
  if (!canon || !hasRealSubtipoChange(subtipoActual, canon)) {
    return base;
  }

  const fromNk = normKey(subtipoActual.replace('(vacío)', ''));

  if (cat === 'administrativo_empresa') {
    if (fromNk === 'tributario' || fromNk === 'tributarios') {
      return 'medium';
    }
    if (isSafeHighSubtipoAlias(cat, subtipoActual, canon)) {
      return 'high';
    }
    if (base === 'high') return 'medium';
    return base;
  }

  if (cat === 'financiero_prestamo') {
    if (isFinancieroLegacySuspiciousSubtipo(subtipoActual)) {
      return 'low';
    }
    if (fromNk === 'cuota' || fromNk === 'cuotas') {
      if (canon === 'CUOTA COMPRA DE ACTIVOS' && cuotaCompraActivoTextoClaro(texto)) {
        return 'high';
      }
      return 'medium';
    }
    if (isSafeHighSubtipoAlias(cat, subtipoActual, canon)) {
      return 'high';
    }
    if (base === 'high') return 'medium';
    return base;
  }

  if (isSafeHighSubtipoAlias(cat, subtipoActual, canon)) {
    return 'high';
  }
  if (base === 'high') return 'medium';
  return base;
}

export function isAutoApplyEligible(
  confidence: DataQualityConfidenceLevel,
  subtipoActual: string,
  subtipoSugerido: string | null,
): boolean {
  return confidence === 'high' && hasRealSubtipoChange(subtipoActual, subtipoSugerido);
}
