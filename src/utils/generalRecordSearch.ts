import { TIPO_INGRESO_EXTRAORDINARIO } from '../data/ingresoAlcanceCatalog';
import { vehicleIdKey } from './vehicleId';

function normalizeQueryLocal(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Registro con campos habituales de vehículo / alcance (gastos, ingresos, operaciones). */
export type GeneralRecordLike = {
  vehicleId?: number | string | null;
  vehicle_id?: number | string | null;
  es_global_flota?: boolean | null;
  esGlobalFlota?: boolean | null;
  esExtraordinario?: boolean | null;
  es_extraordinario?: boolean | null;
  tipo?: string | null;
};

function recordVehicleId(record: GeneralRecordLike): number | string | null | undefined {
  if ('vehicleId' in record && record.vehicleId !== undefined) return record.vehicleId;
  if ('vehicle_id' in record && record.vehicle_id !== undefined) return record.vehicle_id as number | string | null;
  return null;
}

function recordEsGlobalFlota(record: GeneralRecordLike): boolean | null | undefined {
  if (record.es_global_flota !== undefined && record.es_global_flota !== null) return record.es_global_flota;
  if (record.esGlobalFlota !== undefined && record.esGlobalFlota !== null) return record.esGlobalFlota;
  return undefined;
}

function recordEsExtraordinario(record: GeneralRecordLike): boolean | null | undefined {
  if (record.esExtraordinario !== undefined && record.esExtraordinario !== null) return record.esExtraordinario;
  if (record.es_extraordinario !== undefined && record.es_extraordinario !== null) {
    return record.es_extraordinario as boolean;
  }
  return undefined;
}

/**
 * true si el registro no está ligado a un vehículo o está marcado como general/extraordinario.
 * Aplica a gastos generales, flota general, ingresos no vehiculares, etc.
 */
export function isGeneralRecord(record: GeneralRecordLike): boolean {
  if (recordEsGlobalFlota(record) === true) return true;

  const esExtra = recordEsExtraordinario(record);
  if (esExtra === true) return true;

  const tipo = String(record.tipo ?? '').trim().toUpperCase();
  if (tipo === TIPO_INGRESO_EXTRAORDINARIO) return true;

  return vehicleIdKey(recordVehicleId(record)) == null;
}

/** Palabras clave que activan filtro «sin vehículo / generales». */
const GENERAL_SEARCH_PATTERNS: RegExp[] = [
  /\bgenerales?\b/,
  /\bglobal\b/,
  /\bsin\s+vehiculo\b/,
  /\bno\s+vehicular\b/,
];

/** Query normalizado incluye intención de buscar registros generales (sin vehículo). */
export function queryHasGeneralSearchIntent(query: string): boolean {
  const n = normalizeQueryLocal(query);
  if (!n) return false;
  return GENERAL_SEARCH_PATTERNS.some((p) => p.test(n));
}

/** Quita términos de búsqueda «general» y deja el resto para combinar con texto libre. */
export function stripGeneralSearchTerms(query: string): string {
  let n = normalizeQueryLocal(query);
  for (const p of GENERAL_SEARCH_PATTERNS) {
    n = n.replace(p, ' ');
  }
  return n.replace(/\s+/g, ' ').trim();
}

export function splitGeneralSearchQuery(query: string): {
  wantsGeneral: boolean;
  textQuery: string;
} {
  const wantsGeneral = queryHasGeneralSearchIntent(query);
  const textQuery = wantsGeneral ? stripGeneralSearchTerms(query) : normalizeQueryLocal(query);
  return { wantsGeneral, textQuery };
}
