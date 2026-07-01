/**
 * Detalle de alertas automáticas (listas completas, no solo conteo).
 */
import { esControlFechaExcluidoDeEstadoVencido } from '../../data/controlFechaCatalog';
import type { ControlFecha, Ingreso, Vehicle } from '../../data/types';
import { fetchLatestControlFechasByVehicle } from '../../services/controlFechasService';
import { fetchIngresos } from '../../services/ingresosService';
import { fetchKilometrajes } from '../../services/kilometrajesService';
import { fetchVehiculos } from '../../services/vehiculosService';
import { diffDaysFromToday, DIAS_ALERTA_SIN_INGRESO } from '../../utils/fleetPanel';
import { buildKmControlRows, kmMantenimientoAlertDetail } from '../../utils/kmMantenimientoControl';
import { getVehicleDisplayNumber } from '../../utils/vehicleDisplayNumber';

export type AlertasDetalleTipo =
  | 'documentos_vencidos'
  | 'documentos_por_vencer'
  | 'sin_ingresos'
  | 'mantenimientos'
  | 'todos';

export type AlertaDetalleItem = {
  vehiculo: number;
  placa: string;
  motivo: string;
  diasRestantes: number | null;
  /** Compat legacy / auditoría */
  vehicleId: number;
  numeroUnidad: number;
  detail: string;
  categoria: AlertasDetalleTipo;
  marca: string;
  modelo: string;
};

export type AlertasDetallePayload = {
  _tipo_metrica: 'alertas_detalle';
  tipo: AlertasDetalleTipo;
  dias: number | null;
  count: number;
  items: AlertaDetalleItem[];
  fuente: string;
  sinIngresoUmbralDias: number;
  nota: string;
};

const DEFAULT_DIAS_POR_VENCER = 30;

function fmtTipo(tipo: string): string {
  return tipo.replace(/_/g, ' ');
}

function makeItem(
  vehicleId: number,
  numeroUnidad: number,
  placa: string,
  motivo: string,
  diasRestantes: number | null,
  categoria: AlertasDetalleTipo,
  marca: string,
  modelo: string,
): AlertaDetalleItem {
  return {
    vehiculo: numeroUnidad,
    placa,
    motivo,
    diasRestantes,
    vehicleId,
    numeroUnidad,
    detail: motivo,
    categoria,
    marca,
    modelo,
  };
}

function rowToItem(
  c: ControlFecha,
  vehicles: Vehicle[],
  categoria: AlertasDetalleTipo,
): AlertaDetalleItem | null {
  if (c.vehicleId == null) return null;
  const vid = Number(c.vehicleId);
  const v = vehicles.find((x) => x.id === vid && x.activo);
  if (!v) return null;
  const d = diffDaysFromToday(c.fechaVencimiento);
  const motivo =
    d < 0
      ? `${fmtTipo(c.tipo)} · vencido hace ${Math.abs(d)} días (${c.fechaVencimiento})`
      : `${fmtTipo(c.tipo)} · vence en ${d} días (${c.fechaVencimiento})`;
  return makeItem(vid, getVehicleDisplayNumber(v), v.placa, motivo, d, categoria, v.marca, v.modelo);
}

function buildSinIngresoItems(vehicles: Vehicle[], ingresos: Ingreso[], umbral: number): AlertaDetalleItem[] {
  const items: AlertaDetalleItem[] = [];
  for (const v of vehicles.filter((x) => x.activo)) {
    const ingresosV = ingresos
      .filter((i) => Number(i.vehicleId) === Number(v.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultimo = ingresosV[0];
    const dias = ultimo ? Math.abs(diffDaysFromToday(ultimo.fecha)) : null;
    if (dias != null && dias > umbral) {
      items.push(
        makeItem(
          v.id,
          getVehicleDisplayNumber(v),
          v.placa,
          `${dias} días sin ingreso registrado`,
          dias,
          'sin_ingresos',
          v.marca,
          v.modelo,
        ),
      );
    }
  }
  items.sort((a, b) => (b.diasRestantes ?? 0) - (a.diasRestantes ?? 0));
  return items;
}

function buildMantenimientoItems(
  vehicles: Vehicle[],
  kilometrajes: Awaited<ReturnType<typeof fetchKilometrajes>>,
): AlertaDetalleItem[] {
  const activeIds = new Set(vehicles.filter((v) => v.activo).map((v) => v.id));
  const kmRows = kilometrajes?.length ? buildKmControlRows(kilometrajes) : [];
  const items: AlertaDetalleItem[] = [];
  for (const r of kmRows) {
    if (!r.alertaVariacion || !activeIds.has(r.vehicleId)) continue;
    const v = vehicles.find((x) => x.id === r.vehicleId && x.activo);
    if (!v || r.diffKm == null) continue;
    const motivo = kmMantenimientoAlertDetail(r);
    items.push(
      makeItem(
        r.vehicleId,
        getVehicleDisplayNumber(v),
        v.placa,
        motivo,
        null,
        'mantenimientos',
        v.marca,
        v.modelo,
      ),
    );
  }
  return items;
}

export async function buildAlertasDetallePayload(
  empresaId: string,
  tipo: AlertasDetalleTipo = 'todos',
  limit = 50,
  diasHorizonte = DEFAULT_DIAS_POR_VENCER,
): Promise<AlertasDetallePayload> {
  const [vehicles, controlFechas, ingresos, kilometrajes] = await Promise.all([
    fetchVehiculos(empresaId),
    fetchLatestControlFechasByVehicle(empresaId),
    fetchIngresos(empresaId),
    fetchKilometrajes(empresaId),
  ]);

  const activeIds = new Set(vehicles.filter((v) => v.activo).map((v) => v.id));
  const cap = Math.max(1, Math.min(limit, 200));
  const dias =
    tipo === 'documentos_por_vencer' || tipo === 'todos'
      ? Math.max(1, Math.min(Math.trunc(diasHorizonte), 365))
      : null;

  const vencidosRows = controlFechas
    .filter(
      (c) =>
        !esControlFechaExcluidoDeEstadoVencido(c.tipo) &&
        c.vehicleId != null &&
        activeIds.has(Number(c.vehicleId)) &&
        diffDaysFromToday(c.fechaVencimiento) < 0,
    )
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  const porVencerHorizonte = dias ?? DEFAULT_DIAS_POR_VENCER;
  const porVencerRows = controlFechas
    .filter((c) => {
      if (esControlFechaExcluidoDeEstadoVencido(c.tipo)) return false;
      if (c.vehicleId == null || !activeIds.has(Number(c.vehicleId))) return false;
      const d = diffDaysFromToday(c.fechaVencimiento);
      return d >= 0 && d <= porVencerHorizonte;
    })
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  const vencidos = vencidosRows
    .map((c) => rowToItem(c, vehicles, 'documentos_vencidos'))
    .filter((x): x is AlertaDetalleItem => x != null);

  const porVencer = porVencerRows
    .map((c) => rowToItem(c, vehicles, 'documentos_por_vencer'))
    .filter((x): x is AlertaDetalleItem => x != null);

  const sinIngresos = buildSinIngresoItems(vehicles, ingresos, DIAS_ALERTA_SIN_INGRESO);
  const mantenimientos = buildMantenimientoItems(vehicles, kilometrajes);

  let items: AlertaDetalleItem[];
  switch (tipo) {
    case 'documentos_vencidos':
      items = vencidos;
      break;
    case 'documentos_por_vencer':
      items = porVencer;
      break;
    case 'sin_ingresos':
      items = sinIngresos;
      break;
    case 'mantenimientos':
      items = mantenimientos;
      break;
    default:
      items = [...vencidos, ...porVencer, ...sinIngresos, ...mantenimientos];
      break;
  }

  return {
    _tipo_metrica: 'alertas_detalle',
    tipo,
    dias,
    count: items.length,
    items: items.slice(0, cap),
    fuente: 'computeTodayReview (detalle completo)',
    sinIngresoUmbralDias: DIAS_ALERTA_SIN_INGRESO,
    nota: 'Listado detallado de alertas automáticas. Para conteos usar getAlertasAutomaticas.',
  };
}
