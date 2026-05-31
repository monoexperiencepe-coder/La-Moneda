/**
 * Auditoría read-only de subtipos financiero_prestamo (históricos + sugerencias).
 */
import type { Gasto } from '../data/types';
import { normKey } from '../utils/normKey';
import {
  isFinancieroLegacySuspiciousSubtipo,
  normalizeFinancieroPrestamoSubtipo,
  type FinancieroPrestamoSubtipoOfficial,
} from '../utils/financieroPrestamoSubtipo';

export type FinancieroSubtipoConfidence = 'alta' | 'media' | 'baja';

export interface FinancieroSubtipoSuggestion {
  subtipoActual: string;
  subtipoOficialSugerido: FinancieroPrestamoSubtipoOfficial | null;
  confianza: FinancieroSubtipoConfidence;
  razon: string;
  textoAnalizado: string;
}

export interface FinancierosSubtiposAuditPayload {
  total: number;
  porSubtipoActual: Record<string, number>;
  suggestedMappings: FinancieroSubtipoSuggestion[];
  lowConfidence: FinancieroSubtipoSuggestion[];
  examples: FinancieroSubtipoSuggestion[];
}

const BANK_TOKENS = [
  'tarjeta',
  'bcp',
  'bbva',
  'interbank',
  'scotiabank',
  'pichincha',
  'oh',
  'visa',
  'mastercard',
];

function collectText(g: Pick<Gasto, 'subtipo_gasto' | 'motivo' | 'comentarios' | 'pagadoA' | 'tipo' | 'subTipo'>): string {
  return [g.subtipo_gasto, g.motivo, g.comentarios, g.pagadoA, g.tipo, g.subTipo]
    .filter(Boolean)
    .join(' ');
}

export function suggestFinancieroFromText(text: string): {
  sugerido: FinancieroPrestamoSubtipoOfficial | null;
  confianza: FinancieroSubtipoConfidence;
  razon: string;
} {
  const nk = normKey(text);
  if (!nk) {
    return { sugerido: null, confianza: 'baja', razon: 'sin texto' };
  }

  const direct = normalizeFinancieroPrestamoSubtipo(text);
  if (direct) {
    return { sugerido: direct, confianza: 'alta', razon: 'normalización canónica' };
  }

  if (nk.includes('alquiler')) {
    return { sugerido: 'ALQUILERES', confianza: 'alta', razon: 'texto menciona alquiler' };
  }
  if (nk.includes('membres')) {
    return { sugerido: 'MEMBRESÍAS', confianza: 'alta', razon: 'texto menciona membresía' };
  }
  if (nk.includes('mantenimiento') && nk.includes('cuota')) {
    return { sugerido: 'CUOTA DE MANTENIMIENTO', confianza: 'alta', razon: 'cuota + mantenimiento' };
  }
  if (nk.includes('mantenimiento')) {
    return { sugerido: 'CUOTA DE MANTENIMIENTO', confianza: 'media', razon: 'texto menciona mantenimiento' };
  }
  if (
    nk.includes('compra activo')
    || nk.includes('compra de activo')
    || (nk.includes('cuota') && (nk.includes('activo') || nk.includes('vehiculo') || nk.includes('vehículo')))
    || (nk.includes('compra') && nk.includes('vehiculo'))
  ) {
    return { sugerido: 'CUOTA COMPRA DE ACTIVOS', confianza: 'alta', razon: 'compra de activo / vehículo' };
  }
  if (nk.includes('interes') || nk.includes('interés')) {
    return { sugerido: 'INTERESES', confianza: 'alta', razon: 'texto menciona interés' };
  }
  if (nk.includes('prestamo') || nk.includes('préstamo')) {
    return { sugerido: 'PRÉSTAMO', confianza: 'alta', razon: 'texto menciona préstamo' };
  }

  if (BANK_TOKENS.some((t) => nk.includes(t))) {
    if (nk.includes('interes')) {
      return { sugerido: 'INTERESES', confianza: 'media', razon: 'banco/tarjeta + interés' };
    }
    return { sugerido: 'PRÉSTAMO', confianza: 'media', razon: 'banco/tarjeta (posible préstamo)' };
  }

  if (isFinancieroLegacySuspiciousSubtipo(text)) {
    return { sugerido: 'PRÉSTAMO', confianza: 'baja', razon: 'legacy tarjeta_banco — revisar manualmente' };
  }

  if (nk === 'cuota' || nk === 'cuotas') {
    return { sugerido: 'CUOTA COMPRA DE ACTIVOS', confianza: 'baja', razon: 'cuota sin contexto (default compra activos)' };
  }

  return { sugerido: 'OTROS / ESPECIFICAR', confianza: 'baja', razon: 'sin patrón claro' };
}

export function auditFinancierosSubtipos(
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
): FinancierosSubtiposAuditPayload {
  const rows = gastos.filter(
    (g) => g.tipo_gasto === 'financiero_prestamo' || g.tipo_gasto === 'financiero',
  );
  const porSubtipoActual: Record<string, number> = {};
  const suggestedMappings: FinancieroSubtipoSuggestion[] = [];
  const lowConfidence: FinancieroSubtipoSuggestion[] = [];

  for (const g of rows) {
    const actual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
    porSubtipoActual[actual] = (porSubtipoActual[actual] ?? 0) + 1;

    const texto = collectText(g);
    const { sugerido, confianza, razon } = suggestFinancieroFromText(texto);
    const canonActual = normalizeFinancieroPrestamoSubtipo(actual);
    if (canonActual && sugerido && canonActual === sugerido) continue;

    const entry: FinancieroSubtipoSuggestion = {
      subtipoActual: actual,
      subtipoOficialSugerido: sugerido,
      confianza,
      razon,
      textoAnalizado: texto.slice(0, 120),
    };
    suggestedMappings.push(entry);
    if (confianza === 'baja' || confianza === 'media') {
      lowConfidence.push(entry);
    }
  }

  return {
    total: rows.length,
    porSubtipoActual,
    suggestedMappings,
    lowConfidence,
    examples: suggestedMappings.slice(0, 25),
  };
}

export function logFinancierosSubtiposAudit(
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
): FinancierosSubtiposAuditPayload {
  const payload = auditFinancierosSubtipos(gastos);
  console.log('[financieros:audit-subtipos]', payload);
  return payload;
}
