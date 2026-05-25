import {
  esControlFechaSinAlertaVencimiento,
  TIPOS_CONTROL_FECHA_OPTIONS,
} from '../data/controlFechaCatalog';
import { formatDate } from './formatting';
import { diffDaysFromToday } from './fleetPanel';
import type { ControlFecha, TipoControlFecha } from '../data/types';

/** Normaliza texto para búsqueda en historial documentario (tildes, guiones, espacios). */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/[-_/·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Versión compacta sin espacios (placas ANF-599 → anf599). */
export function normalizeSearchTextCompact(text: string): string {
  return normalizeSearchText(text).replace(/\s+/g, '');
}

function tipoLabel(tipo: TipoControlFecha): string {
  return TIPOS_CONTROL_FECHA_OPTIONS.find((o) => o.value === tipo)?.label ?? tipo.replace(/_/g, ' ');
}

const TIPO_EXTRA_ALIASES: Partial<Record<TipoControlFecha, string[]>> = {
  SOAT: ['soat', 'seguro'],
  RT_PARTICULAR: ['rt', 'revision tecnica', 'particular', 'rev tecnica'],
  RT_TAXI: ['rt', 'revision tecnica', 'taxi', 'rev tecnica'],
  AFOCAT_TAXI: ['afocat', 'taxi'],
  INSTALACION_GNV: ['gnv', 'instalacion gnv', 'inst gnv', 'gas natural'],
  CERT_GNV_ANUAL: ['gnv', 'cert gnv', 'certificado gnv', 'anual gnv'],
  QUINQUENAL_GNV: ['gnv', 'quinquenal', 'quinquenal gnv'],
  PERMISO_ATU: ['permiso', 'atu', 'permiso atu', 'autoridad transporte'],
  CREDENCIAL_ATU_BREVETE: ['credencial', 'atu', 'brevete', 'cred atu'],
  VENC_BREVETE: ['brevete', 'venc brevete', 'vencimiento brevete', 'licencia conducir'],
  GPS: ['gps', 'rastreo'],
  IMPUESTO: ['impuesto', 'impuesto vehicular'],
  BAT_MANT_REALIZADO: ['bateria', 'bat', 'mant bateria'],
  BAT_COMPRA_NUEVA: ['bateria', 'bat', 'compra bateria'],
  OTRO_VENCIMIENTO: ['otro', 'vencimiento'],
};

function estadoSearchTerms(dias: number, sinVenc: boolean): string[] {
  if (sinVenc) return ['referencia', 'sin vencimiento', 'fecha referencia', 'al dia'];
  if (dias < 0) return ['vencido', 'vencida', 'atrasado', 'atrasada', `${Math.abs(dias)} d venc`, 'dias vencidos'];
  if (dias <= 30) return ['por vencer', 'proximo', 'proxima', 'alerta', `${dias} d`, 'dias restantes', '30 dias'];
  return ['al dia', 'vigente', 'ok', `${dias} d`, 'dias restantes'];
}

export type DocumentacionSearchContext = {
  vehicleLabel: string;
  placa?: string | null;
  marca?: string | null;
  modelo?: string | null;
  vehicleId?: number | null;
};

function buildDocumentacionSearchBlob(row: ControlFecha, ctx: DocumentacionSearchContext): {
  spaced: string;
  compact: string;
} {
  const dias = diffDaysFromToday(row.fechaVencimiento);
  const sinVenc = esControlFechaSinAlertaVencimiento(row.tipo);
  const label = tipoLabel(row.tipo);
  const tipoRaw = row.tipo.replace(/_/g, ' ');
  const placa = ctx.placa?.trim() ?? '';
  const placaSpaced = placa.replace(/-/g, ' ');
  const marca = ctx.marca?.trim() ?? '';
  const modelo = ctx.modelo?.trim() ?? '';
  const vid = ctx.vehicleId;

  const parts: string[] = [
    String(row.id),
    row.tipo,
    tipoRaw,
    label,
    row.comentarios,
    row.fechaVencimiento,
    formatDate(row.fechaVencimiento),
    row.fechaRegistro,
    ctx.vehicleLabel,
    placa,
    placaSpaced,
    marca,
    modelo,
    vid != null ? String(vid) : '',
    vid != null ? `vehiculo ${vid}` : '',
    vid != null ? `unidad ${vid}` : '',
    vid != null ? `carro ${vid}` : '',
    vid != null ? `#${vid}` : '',
    ...estadoSearchTerms(dias, sinVenc),
    ...(TIPO_EXTRA_ALIASES[row.tipo] ?? []),
  ];

  const spaced = normalizeSearchText(parts.filter(Boolean).join(' '));
  const compact = normalizeSearchTextCompact(parts.filter(Boolean).join(' '));
  return { spaced, compact };
}

function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokenMatchesBlob(token: string, spaced: string, compact: string): boolean {
  if (!token) return true;
  const tokenCompact = normalizeSearchTextCompact(token);
  if (/^\d+$/.test(token)) {
    return (
      spaced.includes(` ${token} `) ||
      spaced.startsWith(`${token} `) ||
      spaced.endsWith(` ${token}`) ||
      spaced === token ||
      compact.includes(tokenCompact)
    );
  }
  return spaced.includes(token) || compact.includes(tokenCompact);
}

/**
 * Búsqueda multi-palabra en historial documentario.
 * Todas las palabras del query deben aparecer en el blob (tipo, placa, vehículo, estado, id, etc.).
 */
export function matchesDocumentacionSearch(
  row: ControlFecha,
  query: string,
  ctx: DocumentacionSearchContext,
): boolean {
  const q = query.trim();
  if (!q) return true;

  const tokens = queryTokens(q);
  if (tokens.length === 0) return true;

  const { spaced, compact } = buildDocumentacionSearchBlob(row, ctx);

  return tokens.every((token) => tokenMatchesBlob(token, ` ${spaced} `, compact));
}

/** Etiqueta de tipo para fila de historial (sin ID técnico). */
export function documentacionHistorialTipoLabel(tipo: TipoControlFecha): string {
  return tipoLabel(tipo);
}

/** Línea de vehículo para fila de historial. */
export function documentacionHistorialVehiculoLine(ctx: DocumentacionSearchContext): string {
  if (ctx.placa && (ctx.marca || ctx.modelo)) {
    return `${ctx.placa} · ${[ctx.marca, ctx.modelo].filter(Boolean).join(' ')}`;
  }
  if (ctx.placa) return ctx.placa;
  return ctx.vehicleLabel.replace(/^#\d+\s*/, '').trim() || 'Sin vehículo';
}
