/**
 * Auditoría DEV: desglose de gastos por vehículo vs clasificación financiera (tipo_gasto).
 * Consola: await window.auditGastosClasificacionVehiculo('PLACA') o await window.auditGastosClasificacionVehiculo(1)
 *
 * Solo lectura — no modifica datos ni fórmulas de producción.
 */
import type { Gasto, Ingreso, Vehicle } from '../data/types';
import { isCajaNegocioGasto } from '../utils/cajaNegocio';
import { calculateFinancialKPIs } from '../utils/calculations';
import { matchesOperativoTipoNormalized } from '../utils/operativoTipoGasto';
import { tipoGastoEffective, tipoGastoUiCanonical } from '../utils/gastosTipoGasto';
import { ingresoMontoPEN } from '../utils/moneda';
import { vehicleIdsEqual } from '../utils/vehicleId';
import { sumIngresosVehiculoTotal } from '../utils/utilidadReal';

export type AuditGastosClasificacionVehiculoInput = {
  vehicles: readonly Vehicle[];
  gastos: readonly Gasto[];
  ingresos?: readonly Ingreso[];
  gastosLoadScope?: 'recent' | 'full';
};

/** Espejo de calculations.ts — canonicalTipoGastoFinanciero (solo auditoría). */
function canonicalTipoGastoFinancieroAudit(g: Gasto): string {
  const raw = (g.tipo_gasto ?? '').trim();
  if (!raw) {
    if (g.vehicleId != null) return 'operativo_vehiculo';
    return '';
  }
  const map: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    personal_socios: 'personal_socios_familiares',
    operativo_flota_global: 'gastos_globales',
  };
  const mapped = map[raw] ?? raw;
  if (mapped === 'personal_socios_familiares' || mapped === 'representacion_interna' || mapped === 'personales') {
    return 'representacion_interna';
  }
  return mapped;
}

export type BucketFinanciero =
  | 'gastos_operativos'
  | 'gastos_financieros'
  | 'gastos_administrativos'
  | 'gastos_inversion'
  | 'gastos_representacion_interna'
  | 'gastos_globales'
  | 'pendiente_revision'
  | 'sin_tipo_gasto'
  | 'otro_tipo_gasto';

function bucketFinancieroForGasto(g: Gasto): BucketFinanciero {
  const t = canonicalTipoGastoFinancieroAudit(g);
  if (!t) return 'sin_tipo_gasto';
  if (t === 'pendiente_revision') return 'pendiente_revision';
  if (matchesOperativoTipoNormalized(t)) return 'gastos_operativos';
  if (t === 'financiero_prestamo') return 'gastos_financieros';
  if (t === 'administrativo_empresa' || t === 'planilla_laboral') return 'gastos_administrativos';
  if (t === 'inversion_compra') return 'gastos_inversion';
  if (t === 'representacion_interna') return 'gastos_representacion_interna';
  if (t === 'gastos_globales') return 'gastos_globales';
  return 'otro_tipo_gasto';
}

function resolveVehicle(
  vehicles: readonly Vehicle[],
  idOrPlaca?: number | string,
): Vehicle | null {
  if (idOrPlaca == null || idOrPlaca === '') return vehicles[0] ?? null;
  if (typeof idOrPlaca === 'number' && Number.isFinite(idOrPlaca)) {
    return vehicles.find((v) => v.id === idOrPlaca) ?? null;
  }
  const q = String(idOrPlaca).trim().toUpperCase();
  const byPlaca = vehicles.find((v) => v.placa?.toUpperCase() === q);
  if (byPlaca) return byPlaca;
  const n = Number(q);
  if (Number.isFinite(n)) return vehicles.find((v) => v.id === n) ?? null;
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gastoConcepto(g: Gasto): string {
  const parts = [g.motivo, g.pagadoA, g.comentarios, g.detalleOperativo, g.categoriaReal, g.subcategoria]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
  return parts[0] ?? g.tipo ?? '—';
}

type GrupoAgg = {
  key: string;
  count: number;
  total: number;
  ids: string[];
  fechas: string[];
  conceptos: string[];
};

function pushGrupo(map: Map<string, GrupoAgg>, key: string, g: Gasto): void {
  const prev = map.get(key) ?? { key, count: 0, total: 0, ids: [], fechas: [], conceptos: [] };
  prev.count += 1;
  prev.total += g.monto;
  if (prev.ids.length < 5) prev.ids.push(String(g.id));
  if (prev.fechas.length < 5) prev.fechas.push(g.fecha);
  if (prev.conceptos.length < 3) prev.conceptos.push(gastoConcepto(g));
  map.set(key, prev);
}

function mapToSortedRows(map: Map<string, GrupoAgg>): GrupoAgg[] {
  return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export type AuditGastosClasificacionVehiculoResult = {
  identificacion: {
    vehicleId: number;
    placa: string;
    unidad: string;
    gastos_load_scope: 'recent' | 'full';
    gastos_en_memoria_total: number;
  };
  totales: Record<string, number | string>;
  por_tipo_gasto: GrupoAgg[];
  por_categoria_financiera: GrupoAgg[];
  por_categoria_legacy: GrupoAgg[];
  por_subtipo: GrupoAgg[];
  por_bucket_financiero: GrupoAgg[];
  gastos_problematicos: Record<string, unknown>;
  muestra_gastos: unknown[];
};

export function auditGastosClasificacionVehiculo(
  input: AuditGastosClasificacionVehiculoInput,
  idOrPlaca?: number | string,
): AuditGastosClasificacionVehiculoResult | { error: string } {
  const { vehicles, gastos, ingresos = [], gastosLoadScope = 'recent' } = input;
  const vehicle = resolveVehicle(vehicles, idOrPlaca);
  if (!vehicle) {
    console.warn('[audit:gastos:clasificacion:vehiculo] vehículo no encontrado', { idOrPlaca });
    return { error: 'vehículo no encontrado' };
  }

  const gastosVeh = gastos.filter((g) => vehicleIdsEqual(g.vehicleId, vehicle.id));
  const ingresosVeh = ingresos.filter((i) => vehicleIdsEqual(i.vehicleId, vehicle.id));
  const kpi = calculateFinancialKPIs(ingresosVeh, gastosVeh);

  const ingresos_total = round2(sumIngresosVehiculoTotal(ingresos, vehicle.id));
  const gastos_total_todos = round2(gastosVeh.reduce((s, g) => s + g.monto, 0));

  let gastos_inversion = 0;
  let gastos_representacion = 0;
  let gastos_globales = 0;
  let gastos_pendiente = 0;
  let gastos_sin_tipo = 0;
  let gastos_otro_tipo = 0;

  const porTipo = new Map<string, GrupoAgg>();
  const porCatFin = new Map<string, GrupoAgg>();
  const porCatLegacy = new Map<string, GrupoAgg>();
  const porSubtipo = new Map<string, GrupoAgg>();
  const porBucket = new Map<string, GrupoAgg>();

  const sinTipoGasto: Gasto[] = [];
  const tipoNoCanonico: Gasto[] = [];
  const cajaNegocioConVehicle: Gasto[] = [];
  const globalesConVehicle: Gasto[] = [];
  const noEnUiClasificacion: Gasto[] = [];

  for (const g of gastosVeh) {
    const bucket = bucketFinancieroForGasto(g);
    const tipoRaw = (g.tipo_gasto ?? '').trim() || '(vacío)';
    const tipoCanon = canonicalTipoGastoFinancieroAudit(g) || '(sin canon)';
    const catFin = tipoGastoUiCanonical(g) ?? tipoGastoEffective(g) ?? '(sin categoría financiera)';
    const catLegacy = (g.categoria ?? '').trim() || '(sin categoria legacy)';
    const sub = (g.subtipo_gasto ?? g.subTipo ?? '').trim() || '(sin subtipo)';

    pushGrupo(porTipo, `raw:${tipoRaw} → canon:${tipoCanon}`, g);
    pushGrupo(porCatFin, catFin, g);
    pushGrupo(porCatLegacy, catLegacy, g);
    pushGrupo(porSubtipo, sub, g);
    pushGrupo(porBucket, bucket, g);

    if (bucket === 'gastos_inversion') gastos_inversion += g.monto;
    else if (bucket === 'gastos_representacion_interna') gastos_representacion += g.monto;
    else if (bucket === 'gastos_globales') gastos_globales += g.monto;
    else if (bucket === 'pendiente_revision') gastos_pendiente += g.monto;
    else if (bucket === 'sin_tipo_gasto') gastos_sin_tipo += g.monto;
    else if (bucket === 'otro_tipo_gasto') gastos_otro_tipo += g.monto;

    if (!(g.tipo_gasto ?? '').trim()) sinTipoGasto.push(g);
    if (bucket === 'otro_tipo_gasto') tipoNoCanonico.push(g);
    if (isCajaNegocioGasto(g)) cajaNegocioConVehicle.push(g);
    if (tipoGastoEffective(g) === 'gastos_globales' || g.es_global_flota) globalesConVehicle.push(g);

    const enUiOperFin =
      bucket === 'gastos_operativos' || bucket === 'gastos_financieros';
    if (!enUiOperFin) noEnUiClasificacion.push(g);
  }

  const gastos_operativos = round2(kpi.gastos_operativos);
  const gastos_financieros = round2(kpi.gastos_financieros);
  const gastos_administrativos = round2(kpi.gastos_administrativos);

  const suma_buckets_clasificacion =
    gastos_operativos +
    gastos_financieros +
    gastos_administrativos +
    round2(gastos_inversion) +
    round2(gastos_representacion) +
    round2(gastos_globales) +
    round2(gastos_pendiente) +
    round2(gastos_sin_tipo) +
    round2(gastos_otro_tipo);

  const gastos_sin_clasificar = round2(gastos_total_todos - suma_buckets_clasificacion);

  /** Lo que el dueño ve en el panel (solo operativos + financieros). */
  const diferencia_no_explicada_ui = round2(
    gastos_total_todos - gastos_operativos - gastos_financieros,
  );

  const diferencia_no_explicada_buckets = round2(
    gastos_total_todos -
      gastos_operativos -
      gastos_financieros -
      gastos_administrativos -
      round2(gastos_inversion) -
      round2(gastos_representacion) -
      round2(gastos_globales) -
      round2(gastos_pendiente) -
      round2(gastos_otro_tipo) -
      round2(gastos_sin_tipo),
  );

  const identificacion = {
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    unidad: `#${vehicle.id} ${vehicle.marca} ${vehicle.modelo}`,
    gastos_load_scope: gastosLoadScope,
    gastos_en_memoria_total: gastos.length,
  };

  const totales = {
    ingresos_total,
    gastos_total_todos,
    gastos_operativos,
    gastos_financieros,
    gastos_administrativos,
    gastos_inversion: round2(gastos_inversion),
    gastos_representacion_interna: round2(gastos_representacion),
    gastos_globales_asignados: round2(gastos_globales),
    gastos_pendiente_revision: round2(gastos_pendiente),
    gastos_otro_tipo: round2(gastos_otro_tipo),
    gastos_sin_tipo_gasto: round2(gastos_sin_tipo),
    gastos_sin_clasificar,
    suma_buckets_clasificacion: round2(suma_buckets_clasificacion),
    diferencia_no_explicada_ui,
    diferencia_no_explicada_buckets,
    utilidad_operativa_kpi: round2(kpi.utilidad_operativa),
    utilidad_neta_simple_kpi: round2(kpi.utilidad_neta_simple),
    nota_ui:
      'diferencia_no_explicada_ui = gastos_total − gastos_operativos − gastos_financieros (panel detalle vehículo). El resto suele ser inversión, administrativo, globales, pendiente u otros tipo_gasto.',
  };

  const gastos_problematicos = {
    sin_tipo_gasto: { count: sinTipoGasto.length, total: round2(sinTipoGasto.reduce((s, g) => s + g.monto, 0)) },
    tipo_gasto_no_canonico: {
      count: tipoNoCanonico.length,
      total: round2(tipoNoCanonico.reduce((s, g) => s + g.monto, 0)),
      tipos: [...new Set(tipoNoCanonico.map((g) => g.tipo_gasto ?? '(vacío)'))],
    },
    caja_negocio_texto_con_vehicle_id: {
      count: cajaNegocioConVehicle.length,
      total: round2(cajaNegocioConVehicle.reduce((s, g) => s + g.monto, 0)),
    },
    globales_o_es_global_con_vehicle_id: {
      count: globalesConVehicle.length,
      total: round2(globalesConVehicle.reduce((s, g) => s + g.monto, 0)),
    },
    en_total_pero_no_en_panel_oper_fin: {
      count: noEnUiClasificacion.length,
      total: round2(noEnUiClasificacion.reduce((s, g) => s + g.monto, 0)),
      desglose_por_bucket: mapToSortedRows(porBucket).filter(
        (r) => r.key !== 'gastos_operativos' && r.key !== 'gastos_financieros',
      ),
    },
  };

  const muestra_gastos = noEnUiClasificacion.slice(0, 25).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    tipo_gasto_raw: g.tipo_gasto,
    tipo_gasto_canon: canonicalTipoGastoFinancieroAudit(g),
    categoria_financiera: tipoGastoUiCanonical(g) ?? tipoGastoEffective(g),
    categoria_legacy: g.categoria,
    subtipo: g.subtipo_gasto ?? g.subTipo,
    concepto: gastoConcepto(g),
    bucket: bucketFinancieroForGasto(g),
    es_caja_negocio_texto: isCajaNegocioGasto(g),
    es_global_flota: g.es_global_flota ?? false,
  }));

  const result: AuditGastosClasificacionVehiculoResult = {
    identificacion,
    totales,
    por_tipo_gasto: mapToSortedRows(porTipo),
    por_categoria_financiera: mapToSortedRows(porCatFin),
    por_categoria_legacy: mapToSortedRows(porCatLegacy),
    por_subtipo: mapToSortedRows(porSubtipo),
    por_bucket_financiero: mapToSortedRows(porBucket),
    gastos_problematicos,
    muestra_gastos,
  };

  console.group('[audit:gastos:clasificacion:vehiculo]');
  console.log(identificacion);
  console.groupEnd();

  console.group('[audit:gastos:clasificacion:totales]');
  console.log(totales);
  console.groupEnd();

  console.group('[audit:gastos:clasificacion:por_tipo]');
  console.table(
    result.por_tipo_gasto.map((r) => ({
      grupo: r.key,
      count: r.count,
      total: round2(r.total),
      ids: r.ids.join(', '),
    })),
  );
  console.groupEnd();

  console.group('[audit:gastos:clasificacion:por_bucket]');
  console.table(
    result.por_bucket_financiero.map((r) => ({
      bucket: r.key,
      count: r.count,
      total: round2(r.total),
    })),
  );
  console.groupEnd();

  console.group('[audit:gastos:clasificacion:no_clasificados]');
  console.log(gastos_problematicos);
  console.log(
    'Explicación UI (oper + fin):',
    result.por_bucket_financiero
      .filter((r) => r.key !== 'gastos_operativos' && r.key !== 'gastos_financieros')
      .map((r) => ({ bucket: r.key, total: round2(r.total), count: r.count })),
  );
  console.groupEnd();

  console.group('[audit:gastos:clasificacion:muestra]');
  console.table(muestra_gastos);
  console.groupEnd();

  console.warn('[audit:gastos:clasificacion:result]', result);
  return result;
}
