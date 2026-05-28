/**
 * Auditoría SOLO LECTURA: subtipos sospechosos en inversion_compra.
 * No modifica BD. Consola: [audit:inversion-subtipos]
 */
import type { Gasto } from '../data/types';
import { CATEGORIAS_GASTO_LABELS } from '../data/catalogs';
import {
  getInversionSubtipoLabel,
  isInversionSubtipoReconocido,
  normalizeInversionSubtipo,
} from '../utils/inversionSubtipo';
import { gastoMatchesTipoGasto } from '../utils/gastosTipoGasto';
import { normKey } from '../utils/normKey';
import { resolveOperativoSubtipoGastoCanon } from '../utils/operativoSubtipo';

const INVERSION_TIPO = 'inversion_compra';

/** Subtipos operativos/mecánicos que no deberían estar en inversión. */
const OPERATIVO_EN_INVERSION = new Set([
  'motor',
  'bateria',
  'gps_chips',
  'combustible',
  'documentos',
  'multas_tramites',
  'movilidad',
  'mantenimiento',
  'mecanica_mantenimiento',
  'mecanicos',
  'mecanico',
  'accesorios',
  'arreglo_linea_escape',
  'autopartes',
  'llantas',
  'frenos',
  'suspension',
  'electricidad',
  'gnv',
  'aire_acondicionado',
  'interior',
  'impuesto_vehicular',
  'planchado_pintura',
  'otros_operativo',
  'reparacion',
  'reparación',
]);

const COMPRA_VEHICULO_HINTS =
  /\b(compra|adquisicion|adquisición|versa|vehiculo|vehículo|unidad|dolar|dólar|dolares|dólares|cbk|placa)\b/i;
const TERRENO_HINTS = /\b(terreno|lote|predio|inmueble|solar)\b/i;

export type AuditInversionSubtipoEjemplo = {
  id: string;
  fecha: string;
  subtipo_gasto: string | null;
  subtipoLabel: string;
  monto: number;
  motivo: string;
  comentarios: string;
  categoriaKpi: string;
  vehicleId: string | number | null;
  razones: string[];
  suggestedSubtipo: string | null;
  suggestedLabel: string | null;
};

export type AuditInversionSubtiposResult = {
  total: number;
  sospechosos: number;
  ejemplos: AuditInversionSubtipoEjemplo[];
  suggestedMappings: Array<{
    subtipo_gasto: string;
    texto: string;
    suggestedSubtipo: string;
    suggestedLabel: string;
    razones: string[];
  }>;
};

function gastoTexto(g: Gasto): string {
  return [g.motivo, g.comentarios, g.pagadoA, g.detalleOperativo, g.subTipo, g.tipo]
    .filter(Boolean)
    .join(' ');
}

function inferInversionSubtipoFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (TERRENO_HINTS.test(t)) return 'compra_terreno';
  if (COMPRA_VEHICULO_HINTS.test(t)) return 'adquisicion_vehiculo';
  return null;
}

function isOperativoSubtipoEnInversion(raw: string): boolean {
  const nk = normKey(raw);
  if (OPERATIVO_EN_INVERSION.has(nk)) return true;
  const canonOp = resolveOperativoSubtipoGastoCanon(raw);
  return canonOp != null && OPERATIVO_EN_INVERSION.has(canonOp);
}

function kpiEsGastosProvisionales(g: Gasto): boolean {
  return g.categoria === 'GASTOS_PROVISIONALES';
}

export function auditInversionSubtipos(gastos: readonly Gasto[]): AuditInversionSubtiposResult {
  const inversion = gastos.filter((g) => gastoMatchesTipoGasto(g, INVERSION_TIPO));
  const ejemplos: AuditInversionSubtipoEjemplo[] = [];
  const suggestedMappings: AuditInversionSubtiposResult['suggestedMappings'] = [];
  const seenMapping = new Set<string>();

  for (const g of inversion) {
    const st = (g.subtipo_gasto ?? '').trim();
    const texto = gastoTexto(g);

    // Alias legacy u oficial válido (ej. compra_activo_vehiculo → adquisicion_vehiculo): no auditar.
    if (isInversionSubtipoReconocido(st)) {
      continue;
    }

    const razones: string[] = [];
    let suggested: string | null = null;

    if (st && isOperativoSubtipoEnInversion(st)) {
      razones.push('subtipo_operativo_en_inversion');
    } else if (st) {
      razones.push('subtipo_fuera_catalogo_oficial');
    }

    if (kpiEsGastosProvisionales(g)) {
      razones.push('kpi_gastos_provisionales');
    }

    const canonRow = st ? normalizeInversionSubtipo(st) : null;
    const inferred = inferInversionSubtipoFromText(texto);
    if (inferred && (!canonRow || inferred !== canonRow)) {
      razones.push('texto_sugiere_otro_subtipo');
      suggested = inferred;
    }

    if (razones.length === 0) continue;

    if (!suggested && razones.includes('subtipo_operativo_en_inversion')) {
      suggested = inferInversionSubtipoFromText(texto) ?? 'adquisicion_vehiculo';
    }

    const ejemplo: AuditInversionSubtipoEjemplo = {
      id: String(g.id),
      fecha: g.fecha,
      subtipo_gasto: g.subtipo_gasto ?? null,
      subtipoLabel: getInversionSubtipoLabel(st),
      monto: g.monto,
      motivo: g.motivo,
      comentarios: g.comentarios?.slice(0, 120) ?? '',
      categoriaKpi: kpiEsGastosProvisionales(g)
        ? CATEGORIAS_GASTO_LABELS.GASTOS_PROVISIONALES
        : g.categoria,
      vehicleId: g.vehicleId,
      razones,
      suggestedSubtipo: suggested,
      suggestedLabel: suggested ? getInversionSubtipoLabel(suggested) : null,
    };
    ejemplos.push(ejemplo);

    const mapKey = `${st}|${texto.slice(0, 80)}|${suggested ?? ''}`;
    if (suggested && !seenMapping.has(mapKey)) {
      seenMapping.add(mapKey);
      suggestedMappings.push({
        subtipo_gasto: st || '(vacío)',
        texto: texto.slice(0, 160),
        suggestedSubtipo: suggested,
        suggestedLabel: getInversionSubtipoLabel(suggested),
        razones,
      });
    }
  }

  ejemplos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const result: AuditInversionSubtiposResult = {
    total: inversion.length,
    sospechosos: ejemplos.length,
    ejemplos: ejemplos.slice(0, 40),
    suggestedMappings: suggestedMappings.slice(0, 30),
  };

  console.log('[audit:inversion-subtipos]', result);
  return result;
}
