/**
 * Detalle de utilidad y desglose de gastos por vehículo (datos reales, sin inventar).
 */
import type { Gasto } from '../../data/types';
import { formatCurrencyByCode } from './dateRange';
import { getCachedFinanzasVehiculoBundle } from './aiToolDataCache';
import { filterGastosForUser, type PermissionUser } from '../../utils/permissions';
import {
  calcularUtilidadRealVehiculo,
  gastoIncluidoEnUtilidadReal,
  UTILIDAD_REAL_TOOLTIP,
} from '../../utils/utilidadReal';
import { tipoGastoEffective } from '../../utils/gastosTipoGasto';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import { findVehicleByDisplayNumber, getVehicleDisplayNumber } from '../../utils/vehicleDisplayNumber';

type MontoRow = { key: string; label: string; total: number; count: number };

function sumGroup(rows: Gasto[], keyFn: (g: Gasto) => string, labelFn: (g: Gasto) => string): MontoRow[] {
  const map = new Map<string, MontoRow>();
  for (const g of rows) {
    const key = keyFn(g);
    const prev = map.get(key) ?? { key, label: labelFn(g), total: 0, count: 0 };
    prev.total += g.monto;
    prev.count += 1;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function gastosVehiculoUtilidad(gastos: readonly Gasto[], vehicleId: number): Gasto[] {
  return gastos.filter(
    (g) => Number(g.vehicleId) === vehicleId && gastoIncluidoEnUtilidadReal(g),
  );
}

function matchGastoFiltro(g: Gasto, filtro: string): boolean {
  const f = filtro.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const parts = [
    g.subtipo_gasto,
    g.motivo,
    g.comentarios,
    tipoGastoEffective(g),
    g.tipo,
    g.subTipo,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return parts.includes(f);
}

function buildConclusion(
  ingresos: number,
  gastos: number,
  utilidad: number,
  topTipo: MontoRow | undefined,
  topSubtipo: MontoRow | undefined,
): string {
  const fmt = (n: number) => formatCurrencyByCode(n, 'PEN');
  if (utilidad >= 0) {
    const driver = topSubtipo?.label ?? topTipo?.label ?? 'gastos operativos';
    return `Utilidad ${fmt(utilidad)} = ingresos ${fmt(ingresos)} − gastos ${fmt(gastos)}. Mayor peso en ${driver} (${fmt(topSubtipo?.total ?? topTipo?.total ?? 0)}).`;
  }
  const driver = topSubtipo?.label ?? topTipo?.label ?? 'gastos operativos';
  return `Utilidad negativa ${fmt(utilidad)}: gastos ${fmt(gastos)} superan ingresos ${fmt(ingresos)}. Principal rubro: ${driver} (${fmt(topSubtipo?.total ?? topTipo?.total ?? 0)}).`;
}

export async function buildUtilidadVehiculoDetallePayload(
  empresaId: string,
  user: PermissionUser,
  numero: number,
): Promise<Record<string, unknown>> {
  const { vehicles, ingresos, gastosAll } = await getCachedFinanzasVehiculoBundle(empresaId);
  const vehicle = findVehicleByDisplayNumber(vehicles, numero);
  if (!vehicle) {
    return {
      encontrado: false,
      numeroUnidad: numero,
      nota: `No se encontró vehículo #${numero}.`,
    };
  }

  const vehicleId = vehicle.id;
  const displayNum = getVehicleDisplayNumber(vehicle);
  const gastosVisibles = filterGastosForUser(user, gastosAll);
  const { ingresosTotal, gastosTotal, utilidadReal } = calcularUtilidadRealVehiculo(
    vehicleId,
    ingresos,
    gastosVisibles,
  );
  const gastosV = gastosVehiculoUtilidad(gastosVisibles, vehicleId);

  const porTipoGasto = sumGroup(
    gastosV,
    (g) => tipoGastoEffective(g) ?? 'sin_tipo',
    (g) => labelTipoGastoFinanciero(tipoGastoEffective(g) ?? '') || 'Sin tipo',
  );
  const porSubtipo = sumGroup(
    gastosV,
    (g) => (g.subtipo_gasto ?? 'sin_subtipo').trim().toLowerCase() || 'sin_subtipo',
    (g) => (g.subtipo_gasto ?? 'Sin subtipo').trim() || 'Sin subtipo',
  );
  const porCategoria = sumGroup(
    gastosV,
    (g) => (g.tipo ?? g.subTipo ?? 'sin_categoria').trim().toLowerCase() || 'sin_categoria',
    (g) => (g.tipo ?? g.subTipo ?? 'Sin categoría').trim() || 'Sin categoría',
  );

  const topRegistros = [...gastosV]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      fecha: g.fecha,
      monto: g.monto,
      monto_formatted: formatCurrencyByCode(g.monto, 'PEN'),
      tipo_gasto: tipoGastoEffective(g),
      subtipo_gasto: g.subtipo_gasto,
      motivo: g.motivo?.slice(0, 80) ?? '',
    }));

  const topTipo = porTipoGasto[0];
  const topSubtipo = porSubtipo[0];

  return {
    _tipo_metrica: 'utilidad_vehiculo_detalle',
    _preserve_summary: true,
    encontrado: true,
    numeroUnidad: displayNum,
    vehicleId,
    placa: vehicle.placa,
    ingresos: ingresosTotal,
    gastos: gastosTotal,
    utilidad: utilidadReal,
    porTipoGasto,
    porCategoria,
    porSubtipo,
    topRegistros,
    cantidadSubtipos: porSubtipo.length,
    conclusion: buildConclusion(ingresosTotal, gastosTotal, utilidadReal, topTipo, topSubtipo),
    fuente: 'calcularUtilidadRealVehiculo + desglose public.gastos',
    nota: UTILIDAD_REAL_TOOLTIP,
    prohibido_inventar: 'Solo mencionar categorías/subtipos presentes en porTipoGasto, porSubtipo o topRegistros.',
  };
}

export async function buildGastosVehiculoDesglosePayload(
  empresaId: string,
  user: PermissionUser,
  numero: number,
  filtroTexto?: string,
): Promise<Record<string, unknown>> {
  const { vehicles, gastosAll } = await getCachedFinanzasVehiculoBundle(empresaId);
  const vehicle = findVehicleByDisplayNumber(vehicles, numero);
  if (!vehicle) {
    return {
      encontrado: false,
      numeroUnidad: numero,
      nota: `No se encontró vehículo #${numero}.`,
    };
  }

  const vehicleId = vehicle.id;
  const displayNum = getVehicleDisplayNumber(vehicle);
  const gastosVisibles = filterGastosForUser(user, gastosAll);
  let gastosV = gastosVehiculoUtilidad(gastosVisibles, vehicleId);
  const totalSinFiltro = gastosV.reduce((s, g) => s + g.monto, 0);

  if (filtroTexto?.trim()) {
    gastosV = gastosV.filter((g) => matchGastoFiltro(g, filtroTexto.trim()));
  }

  const total = gastosV.reduce((s, g) => s + g.monto, 0);
  const porTipoGasto = sumGroup(
    gastosV,
    (g) => tipoGastoEffective(g) ?? 'sin_tipo',
    (g) => labelTipoGastoFinanciero(tipoGastoEffective(g) ?? '') || 'Sin tipo',
  );
  const porSubtipo = sumGroup(
    gastosV,
    (g) => (g.subtipo_gasto ?? 'sin_subtipo').trim().toLowerCase() || 'sin_subtipo',
    (g) => (g.subtipo_gasto ?? 'Sin subtipo').trim() || 'Sin subtipo',
  );
  const porCategoria = sumGroup(
    gastosV,
    (g) => (g.tipo ?? g.subTipo ?? 'sin_categoria').trim().toLowerCase() || 'sin_categoria',
    (g) => (g.tipo ?? g.subTipo ?? 'Sin categoría').trim() || 'Sin categoría',
  );
  const topRegistros = [...gastosV]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map((g) => ({
      id: g.id,
      fecha: g.fecha,
      monto: g.monto,
      monto_formatted: formatCurrencyByCode(g.monto, 'PEN'),
      subtipo_gasto: g.subtipo_gasto,
      motivo: g.motivo?.slice(0, 80) ?? '',
    }));

  return {
    _tipo_metrica: 'gastos_vehiculo_desglose',
    _preserve_summary: true,
    encontrado: true,
    numeroUnidad: displayNum,
    vehicleId,
    placa: vehicle.placa,
    filtroTexto: filtroTexto?.trim() || null,
    total,
    total_formatted: formatCurrencyByCode(total, 'PEN'),
    totalSinFiltro,
    porTipoGasto,
    porCategoria,
    porSubtipo,
    cantidadSubtipos: porSubtipo.length,
    topRegistros,
    count: gastosV.length,
    fuente: 'public.gastos (utilidad real, vehicle_id)',
    prohibido_inventar:
      'No listar categorías que no aparezcan en porTipoGasto, porSubtipo, porCategoria o topRegistros.',
  };
}
