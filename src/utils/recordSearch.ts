/**
 * Búsqueda de texto en historiales (frontend): case-insensitive, parcial, sin tildes.
 */
import { cleanOperationalCommentForUi } from './cleanOperationalComment';

/** Campos habituales de observaciones / notas en registros. */
export const RECORD_SEARCH_COMMENT_KEYS = [
  'observaciones',
  'comentario',
  'comentarios',
  'nota',
  'notas',
  'motivo',
  'detalle',
  'detalleOperativo',
  'descripcion',
  'description',
  'remarks',
  'comment',
  'comments',
  'concepto',
  'pagadoA',
  'referencia',
  'titulo',
  'prestamista',
  'codigo',
  'accionista',
  'evento',
] as const;

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Une fragmentos y normaliza para comparar con el query. */
export function buildSearchHaystack(...parts: (string | number | null | undefined)[]): string {
  const raw = parts
    .flatMap((p) => {
      if (p == null || p === '') return [];
      return [String(p)];
    })
    .join(' ');
  return normalizeSearchText(raw);
}

export function matchesSearchHaystack(haystackNormalized: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return haystackNormalized.includes(q);
}

export function matchesSearchQuery(
  haystackParts: (string | number | null | undefined)[],
  query: string,
): boolean {
  return matchesSearchHaystack(buildSearchHaystack(...haystackParts), query);
}

/** Limpia comentarios de gasto para búsqueda y UI (sin metadata ETL). */
export function gastoComentariosForSearch(raw: string | null | undefined): string {
  return cleanOperationalCommentForUi(raw) ?? '';
}

/** Extrae strings buscables de un objeto plano (shallow). */
export function extractSearchablePartsFromRecord(
  record: Record<string, unknown>,
  extraParts: (string | number | null | undefined)[] = [],
): string[] {
  const parts: string[] = extraParts.map((p) => (p == null ? '' : String(p)));

  for (const key of RECORD_SEARCH_COMMENT_KEYS) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) parts.push(v);
  }

  for (const [key, v] of Object.entries(record)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) {
      if (
        RECORD_SEARCH_COMMENT_KEYS.includes(key as (typeof RECORD_SEARCH_COMMENT_KEYS)[number])
        || /coment|observ|nota|motivo|detalle|descrip|remark/i.test(key)
      ) {
        if (!parts.includes(v)) parts.push(v);
      }
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v));
    }
  }

  const excelExtra = record.excelExtra ?? record.excel_extra;
  if (excelExtra && typeof excelExtra === 'object' && !Array.isArray(excelExtra)) {
    for (const val of Object.values(excelExtra as Record<string, unknown>)) {
      if (typeof val === 'string' && val.trim()) parts.push(val);
    }
  }

  return parts;
}

export function recordMatchesSearch(
  record: Record<string, unknown>,
  query: string,
  extraParts: (string | number | null | undefined)[] = [],
): boolean {
  const parts = extractSearchablePartsFromRecord(record, extraParts);
  return matchesSearchQuery(parts, query);
}

/** Haystack normalizado para filas de ingreso en RegistrosTable. */
export function ingresoSearchHaystack(
  i: {
    id: string;
    fecha: string;
    fechaRegistro?: string;
    tipo: string;
    subTipo?: string | null;
    metodoPago: string;
    metodoPagoDetalle: string;
    celularMetodo?: string | null;
    comentarios: string;
    detalleOperativo?: string | null;
    tipoOperacion?: string | null;
    moneda?: string | null;
    pagadoA?: string | null;
  },
  vehicleLabel: string,
): string {
  return buildSearchHaystack(
    i.id,
    i.fecha,
    i.fechaRegistro,
    i.tipo,
    i.subTipo,
    i.metodoPago,
    i.metodoPagoDetalle,
    i.celularMetodo,
    i.comentarios,
    i.detalleOperativo,
    i.tipoOperacion,
    i.moneda,
    i.pagadoA,
    vehicleLabel,
  );
}

/** Haystack normalizado para filas de gasto en RegistrosTable. */
export function gastoSearchHaystack(
  g: {
    id: string;
    fecha: string;
    fechaRegistro?: string;
    tipo: string;
    subTipo?: string | null;
    categoria: string;
    motivo: string;
    pagadoA: string;
    metodoPago: string;
    metodoPagoDetalle: string;
    celularMetodo?: string | null;
    comentarios: string;
    detalleOperativo?: string | null;
    categoriaReal?: string | null;
    subcategoria?: string | null;
    tipo_gasto?: string | null;
    subtipo_gasto?: string | null;
    origen_clasificacion?: string | null;
  },
  vehicleLabel: string,
): string {
  const comentariosLimpios = gastoComentariosForSearch(g.comentarios);
  return buildSearchHaystack(
    g.id,
    g.fecha,
    g.fechaRegistro,
    g.tipo,
    g.subTipo,
    g.categoria,
    g.motivo,
    g.pagadoA,
    g.metodoPago,
    g.metodoPagoDetalle,
    g.celularMetodo,
    comentariosLimpios,
    g.comentarios,
    g.detalleOperativo,
    g.categoriaReal,
    g.subcategoria,
    g.tipo_gasto,
    g.subtipo_gasto,
    g.origen_clasificacion,
    vehicleLabel,
  );
}
