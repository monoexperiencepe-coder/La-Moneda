/**
 * Auditoría SOLO LECTURA: conciliación total general Gastos vs suma de categorías.
 * No modifica datos. Usar desde consola: window.auditGastosConciliacion()
 */
import type { Gasto } from '../data/types';
import { gastoMatchesTipoGasto, tipoGastoEffective, tipoGastoUiCanonical } from '../utils/gastosTipoGasto';
import { isCajaNegocioGasto } from '../utils/cajaNegocio';
import { filterRowsByYearMonth } from '../utils/filterByYearMonth';

/** Mismas pestañas que Gastos.tsx (sin inversión en la parrilla). */
const GASTO_TABS_TIPO: { id: string; label: string; tipo_gasto: string }[] = [
  { id: 'op', label: 'Operativos por vehículo', tipo_gasto: 'operativo_vehiculo' },
  { id: 'opf', label: 'Operativo flota general', tipo_gasto: 'operativo_flota_general' },
  { id: 'adm', label: 'Administrativos', tipo_gasto: 'administrativo_empresa' },
  { id: 'fin', label: 'Financieros', tipo_gasto: 'financiero_prestamo' },
  { id: 'pla', label: 'Planilla', tipo_gasto: 'planilla_laboral' },
  { id: 'per', label: 'Representación interna', tipo_gasto: 'representacion_interna' },
  { id: 'glob', label: 'Globales', tipo_gasto: 'gastos_globales' },
];

const INVERSION_TIPO = 'inversion_compra';

const PENDIENTE_REVISION_TIPO = 'pendiente_revision';

const CANONICAL_TIPOS = [
  ...GASTO_TABS_TIPO.map((t) => t.tipo_gasto),
  INVERSION_TIPO,
  PENDIENTE_REVISION_TIPO,
] as const;

export type AuditGastosFilters = {
  year?: string;
  month?: string;
};

function applyFilters(gastos: Gasto[], filters?: AuditGastosFilters): Gasto[] {
  if (!filters?.year) return gastos;
  return filterRowsByYearMonth(gastos, filters.year, filters.month ?? 'ALL');
}

/** Bucket único UI (misma lógica que pestañas Gastos + Inversiones). */
export function assignGastoUiBucket(g: Gasto): string {
  if (gastoMatchesTipoGasto(g, INVERSION_TIPO)) return INVERSION_TIPO;
  for (const t of GASTO_TABS_TIPO) {
    if (gastoMatchesTipoGasto(g, t.tipo_gasto)) return t.tipo_gasto;
  }
  return '__orphan__';
}

function sumMonto(rows: Gasto[]): number {
  return rows.reduce((s, g) => s + g.monto, 0);
}

function dedupeKey(g: Gasto): string {
  const extra = g.excelExtra as Record<string, unknown> | null | undefined;
  const dk = extra?.dedupe_key ?? extra?.dedupeKey ?? extra?.import_key ?? extra?.importKey;
  if (typeof dk === 'string' && dk.trim()) return dk.trim();
  return [
    g.fecha,
    g.monto,
    (g.motivo ?? '').trim(),
    (g.comentarios ?? '').slice(0, 80),
    g.vehicleId ?? '',
    g.tipo_gasto ?? '',
  ].join('|');
}

export type AuditGastosConciliacionResult = {
  filters: AuditGastosFilters | null;
  rowCount: number;
  totalGeneral: number;
  totalPorTipoGastoRaw: Record<string, { count: number; monto: number }>;
  resumenParrilla6: Record<string, { count: number; monto: number }>;
  totalInversion: { count: number; monto: number };
  sumaParrilla6: number;
  sumaParrilla6MasInversion: number;
  sumaUiBuckets: number;
  diferenciaVsBuckets: number;
  diferenciaVsParrilla6: number;
  diferenciaVsParrilla6MasInversion: number;
  orphan: { count: number; monto: number; rows: Gasto[] };
  negativosCero: { count: number; monto: number };
  cajaNegocioEnGastos: { count: number; monto: number };
  posiblesDuplicados: { key: string; count: number; monto: number; ids: string[] }[];
  topExplicadores: ReturnType<typeof mapRowAudit>[];
};

function mapRowAudit(g: Gasto) {
  const extra = g.excelExtra as Record<string, unknown> | null | undefined;
  return {
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    motivo: g.motivo,
    tipo_gasto: g.tipo_gasto ?? null,
    tipo_gasto_effective: tipoGastoEffective(g),
    tipo_gasto_ui: tipoGastoUiCanonical(g),
    ui_bucket: assignGastoUiBucket(g),
    subtipo_gasto: g.subtipo_gasto ?? null,
    categoria: g.categoria,
    tipo: g.tipo,
    sub_tipo: g.subTipo,
    es_global_flota: g.es_global_flota ?? null,
    vehicle_id: g.vehicleId,
    dedupe_key: extra?.dedupe_key ?? extra?.dedupeKey ?? null,
    import_key: extra?.import_key ?? extra?.importKey ?? null,
    comentarios_snip: (g.comentarios ?? '').slice(0, 120),
    es_caja_negocio_texto: isCajaNegocioGasto(g),
    origen_gastos_caja: /gastos_caja\s+id\s*=/i.test(g.comentarios ?? ''),
  };
}

export function runAuditGastosConciliacion(
  gastos: Gasto[],
  filters?: AuditGastosFilters,
): AuditGastosConciliacionResult {
  const rows = applyFilters(gastos, filters);

  const totalGeneral = sumMonto(rows);

  const totalPorTipoGastoRaw: Record<string, { count: number; monto: number }> = {};
  for (const g of rows) {
    const raw = (g.tipo_gasto ?? '').trim() || '(null/vacío→inferido)';
    const key =
      raw === '(null/vacío→inferido)'
        ? g.vehicleId != null
          ? '(null/vacío→inferido operativo)'
          : '(null/vacío→inferido global)'
        : raw;
    const cur = totalPorTipoGastoRaw[key] ?? { count: 0, monto: 0 };
    cur.count += 1;
    cur.monto += g.monto;
    totalPorTipoGastoRaw[key] = cur;
  }

  const PARILLA_TIPOS = [...GASTO_TABS_TIPO, { tipo_gasto: PENDIENTE_REVISION_TIPO, label: 'Pendiente revisión' }];
  const resumenParrilla6: Record<string, { count: number; monto: number }> = {};
  for (const t of PARILLA_TIPOS) {
    const matched = rows.filter((g) => gastoMatchesTipoGasto(g, t.tipo_gasto));
    resumenParrilla6[t.tipo_gasto] = { count: matched.length, monto: sumMonto(matched) };
  }

  const invRows = rows.filter((g) => gastoMatchesTipoGasto(g, INVERSION_TIPO));
  const totalInversion = { count: invRows.length, monto: sumMonto(invRows) };

  const sumaParrilla6 = GASTO_TABS_TIPO.reduce((s, t) => s + (resumenParrilla6[t.tipo_gasto]?.monto ?? 0), 0);
  const sumaPendiente = resumenParrilla6[PENDIENTE_REVISION_TIPO]?.monto ?? 0;
  const sumaParrilla6MasInversion = sumaParrilla6 + sumaPendiente + totalInversion.monto;

  const byBucket = new Map<string, Gasto[]>();
  for (const g of rows) {
    const b = assignGastoUiBucket(g);
    const list = byBucket.get(b) ?? [];
    list.push(g);
    byBucket.set(b, list);
  }
  const sumaUiBuckets = [...byBucket.entries()]
    .filter(([k]) => k !== '__orphan__')
    .reduce((s, [, list]) => s + sumMonto(list), 0);

  const orphanRows = byBucket.get('__orphan__') ?? [];
  const orphan = { count: orphanRows.length, monto: sumMonto(orphanRows), rows: orphanRows };

  const negRows = rows.filter((g) => g.monto <= 0);
  const negativosCero = { count: negRows.length, monto: sumMonto(negRows) };

  const cajaRows = rows.filter((g) => isCajaNegocioGasto(g));
  const cajaNegocioEnGastos = { count: cajaRows.length, monto: sumMonto(cajaRows) };

  const dupMap = new Map<string, { ids: string[]; monto: number }>();
  for (const g of rows) {
    const k = dedupeKey(g);
    const cur = dupMap.get(k) ?? { ids: [], monto: 0 };
    cur.ids.push(g.id);
    cur.monto += g.monto;
    dupMap.set(k, cur);
  }
  const posiblesDuplicados = [...dupMap.entries()]
    .filter(([, v]) => v.ids.length > 1)
    .map(([key, v]) => ({ key, count: v.ids.length, monto: v.monto, ids: v.ids }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 30);

  const explicadores = [
    ...orphanRows,
    ...rows.filter((g) => {
      const eff = tipoGastoEffective(g) ?? '';
      return eff && !CANONICAL_TIPOS.includes(eff as (typeof CANONICAL_TIPOS)[number]);
    }),
  ];
  const seen = new Set<string>();
  const uniqueExplicadores: Gasto[] = [];
  for (const g of explicadores) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    uniqueExplicadores.push(g);
  }
  uniqueExplicadores.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
  const topExplicadores = uniqueExplicadores.slice(0, 50).map(mapRowAudit);

  return {
    filters: filters ?? null,
    rowCount: rows.length,
    totalGeneral,
    totalPorTipoGastoRaw,
    resumenParrilla6,
    totalInversion,
    sumaParrilla6,
    sumaParrilla6MasInversion,
    sumaUiBuckets,
    diferenciaVsBuckets: totalGeneral - sumaUiBuckets,
    diferenciaVsParrilla6: totalGeneral - sumaParrilla6,
    diferenciaVsParrilla6MasInversion: totalGeneral - sumaParrilla6MasInversion,
    orphan,
    negativosCero,
    cajaNegocioEnGastos,
    posiblesDuplicados,
    topExplicadores,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function printAuditGastosConciliacion(result: AuditGastosConciliacionResult): void {
  const f = result.filters;
  console.group('[audit] Gastos — conciliación total vs categorías');
  console.log(
    'Filtros:',
    f?.year ? `año=${f.year} mes=${f.month ?? 'ALL'}` : 'ninguno (mismo dataset que «total tabla» en header)',
  );
  console.log('Registros:', result.rowCount);

  console.group('A) Total general (header Gastos: suma de todos los gastos cargados)');
  console.log('S/ ' + fmt(result.totalGeneral));
  console.groupEnd();

  console.group('B) Total por tipo_gasto (valor crudo en BD + inferencia si null)');
  console.table(
    Object.entries(result.totalPorTipoGastoRaw)
      .sort((a, b) => b[1].monto - a[1].monto)
      .map(([tipo, v]) => ({ tipo_gasto: tipo, registros: v.count, monto: v.monto })),
  );
  console.groupEnd();

  console.group('C) Suma categorías parrilla (6 tarjetas en /finanzas/gastos)');
  for (const t of GASTO_TABS_TIPO) {
    const d = result.resumenParrilla6[t.tipo_gasto];
    console.log(`${t.label}: ${d.count} reg · S/ ${fmt(d.monto)}`);
  }
  console.log('SUBTOTAL 6 tarjetas: S/ ' + fmt(result.sumaParrilla6));
  const pend = result.resumenParrilla6[PENDIENTE_REVISION_TIPO];
  if (pend) {
    console.log(`Pendiente revisión: ${pend.count} reg · S/ ${fmt(pend.monto)}`);
  }
  console.groupEnd();

  console.group('C2) Inversión con utilidad (pestaña aparte, NO en parrilla)');
  console.log(
    `${result.totalInversion.count} reg · S/ ${fmt(result.totalInversion.monto)} (tipo_gasto inversion_compra)`,
  );
  console.log('Suma 6 tarjetas + inversión: S/ ' + fmt(result.sumaParrilla6MasInversion));
  console.groupEnd();

  console.group('D) Diferencias exactas');
  console.log('totalGeneral − suma(6 tarjetas):', fmt(result.diferenciaVsParrilla6));
  console.log('totalGeneral − suma(6 + pendiente + inversión):', fmt(result.diferenciaVsParrilla6MasInversion));
  console.log('totalGeneral − suma(ui buckets canónicos):', fmt(result.diferenciaVsBuckets));
  if (Math.abs(result.diferenciaVsParrilla6MasInversion) < 0.01) {
    console.log(
      '%c✓ Con 6 tarjetas + pendiente revisión + inversión el total debería cuadrar.',
      'color:#059669;font-weight:bold',
    );
  }
  console.groupEnd();

  console.group('E) Conteo por bucket UI (asignación única)');
  const bucketRows = [
    ...GASTO_TABS_TIPO.map((t) => ({
      bucket: t.label,
      tipo: t.tipo_gasto,
      ...(result.resumenParrilla6[t.tipo_gasto] ?? { count: 0, monto: 0 }),
    })),
    { bucket: 'Inversión', tipo: INVERSION_TIPO, ...result.totalInversion },
    { bucket: 'HUÉRFANO (sin categoría UI)', tipo: '__orphan__', ...result.orphan },
  ];
  console.table(bucketRows);
  console.groupEnd();

  console.group('F) Señales adicionales');
  console.log('Montos ≤ 0:', result.negativosCero.count, '· S/', fmt(result.negativosCero.monto));
  console.log(
    'Texto «caja negocio» en fila gastos (siguen en total tabla):',
    result.cajaNegocioEnGastos.count,
    '· S/',
    fmt(result.cajaNegocioEnGastos.monto),
  );
  console.log('Posibles duplicados (misma fecha+monto+motivo+…):', result.posiblesDuplicados.length, 'grupos');
  if (result.posiblesDuplicados.length > 0) {
    console.table(result.posiblesDuplicados.slice(0, 15));
  }
  console.groupEnd();

  if (result.orphan.count > 0) {
    console.group('G) Huérfanos — explican diferencia si persisten tras sumar inversión');
    console.table(result.orphan.rows.slice(0, 30).map(mapRowAudit));
    console.groupEnd();
  }

  console.group('H) Top 50 registros que explican diferencia (huérfanos + tipo_gasto no canónico)');
  console.table(result.topExplicadores);
  console.groupEnd();

  console.groupEnd();
}

export function auditGastosConciliacion(
  getGastos: () => Gasto[],
  filters?: AuditGastosFilters,
): AuditGastosConciliacionResult {
  const result = runAuditGastosConciliacion(getGastos(), filters);
  printAuditGastosConciliacion(result);
  return result;
}
