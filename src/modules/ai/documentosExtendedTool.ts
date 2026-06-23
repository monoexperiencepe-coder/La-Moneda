/**
 * Documentación por rango de días y por vehículo.
 */
import { DOC_MODULE_UI_COLUMNS } from '../../data/controlFechaCatalog';
import { fetchLatestControlFechasByVehicle } from '../../services/controlFechasService';
import { fetchVehiculos } from '../../services/vehiculosService';
import type { ControlFecha, TipoControlFecha, Vehicle } from '../../data/types';
import { buildControlFechasPivotMapByTipos } from '../../utils/controlFechasPivot';
import { docColumnTone } from '../../utils/documentacionDocTone';
import { diffDaysFromToday } from '../../utils/fleetPanel';
import { esControlFechaExcluidoDeEstadoVencido } from '../../data/controlFechaCatalog';
import { getVehicleDisplayNumber } from '../../utils/vehicleDisplayNumber';

export const DOCUMENTOS_CRITERIO_INVENTARIO =
  'Inventario completo: celdas documento×vehículo activo con fecha. Semáforo late/soon/ok (excl. GNV instalación, BAT compra, BAT mant.).';

export const ALERTAS_CRITERIO_OPERATIVO =
  'Qué hacer hoy: filas control_fechas vencidas/por vencer (≤30 d, vehículos activos) + sin ingresos + km mant. NO es total de documentos registrados.';

export type DocumentoItem = {
  vehicleId: number;
  placa: string;
  tipo: string;
  label: string;
  fechaVencimiento: string;
  diasRestantes: number;
  estado: 'vencido' | 'por_vencer' | 'vigente';
};

export type DocumentosPorRangoPayload = {
  dias: number;
  cantidad: number;
  count: number;
  criterio: string;
  fuente: string;
  items: DocumentoItem[];
  listaBreve: string[];
  notaComparacionAlertas: string;
  prohibido_inventar: string;
};

export type DocumentosVehiculoPayload = {
  encontrado: boolean;
  numeroUnidad: number;
  vehicleId: number | null;
  placa: string | null;
  faltantes: { tipo: string; label: string }[];
  vencidos: DocumentoItem[];
  porVencer: DocumentoItem[];
  vigentes: DocumentoItem[];
  countFaltantes: number;
  countVencidos: number;
  countPorVencer: number;
  countVigentes: number;
  criterio: string;
  fuente: string;
};

function labelForTipo(tipo: TipoControlFecha): string {
  return DOC_MODULE_UI_COLUMNS.find((c) => c.tipo === tipo)?.label ?? tipo.replace(/_/g, ' ');
}

function buildItemFromPivot(
  v: Vehicle,
  tipo: TipoControlFecha,
  fecha: string,
): DocumentoItem {
  const dias = diffDaysFromToday(fecha);
  const tone = docColumnTone(fecha, tipo);
  let estado: DocumentoItem['estado'] = 'vigente';
  if (tone === 'late') estado = 'vencido';
  else if (tone === 'soon') estado = 'por_vencer';
  return {
    vehicleId: v.id,
    placa: v.placa,
    tipo,
    label: labelForTipo(tipo),
    fechaVencimiento: fecha,
    diasRestantes: dias,
    estado,
  };
}

function rowsPorRangoFromControlFechas(
  vehicles: Vehicle[],
  controlFechas: ControlFecha[],
  dias: number,
): DocumentoItem[] {
  const activeIds = new Set(vehicles.filter((v) => v.activo).map((v) => v.id));
  const items: DocumentoItem[] = [];
  for (const c of controlFechas) {
    if (esControlFechaExcluidoDeEstadoVencido(c.tipo)) continue;
    if (c.vehicleId == null || !activeIds.has(Number(c.vehicleId))) continue;
    const d = diffDaysFromToday(c.fechaVencimiento);
    if (d < 0 || d > dias) continue;
    const v = vehicles.find((x) => x.id === Number(c.vehicleId));
    if (!v) continue;
    items.push(buildItemFromPivot(v, c.tipo, c.fechaVencimiento));
  }
  items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return items;
}

export async function buildDocumentosPorRangoPayload(
  empresaId: string,
  dias = 7,
  limit = 25,
): Promise<DocumentosPorRangoPayload> {
  const cap = Math.max(1, Math.min(limit, 100));
  const [vehicles, controlFechas] = await Promise.all([
    fetchVehiculos(empresaId),
    fetchLatestControlFechasByVehicle(empresaId),
  ]);
  const items = rowsPorRangoFromControlFechas(vehicles, controlFechas, dias);
  const byVehicleId = new Map(vehicles.map((v) => [v.id, v]));
  const listaBreve = items.slice(0, cap).map((it) => {
    const v = byVehicleId.get(it.vehicleId);
    const unit = v ? getVehicleDisplayNumber(v) : it.vehicleId;
    return `#${unit} ${it.placa} — ${it.label} vence ${it.fechaVencimiento} (${it.diasRestantes} d)`;
  });

  return {
    dias,
    cantidad: items.length,
    count: items.length,
    criterio: `Documentos que vencen en los próximos ${dias} días (0–${dias} d desde hoy), vehículos activos.`,
    fuente: 'public.control_fechas (última fecha por vehículo+tipo)',
    items: items.slice(0, cap),
    listaBreve,
    notaComparacionAlertas: ALERTAS_CRITERIO_OPERATIVO,
    prohibido_inventar:
      'No inventar alertas desactivadas o resueltas: esos estados no existen en los datos.',
  };
}

export async function buildDocumentosVehiculoPayload(
  empresaId: string,
  numero: number,
): Promise<DocumentosVehiculoPayload> {
  const [vehicles, controlFechas] = await Promise.all([
    fetchVehiculos(empresaId),
    fetchLatestControlFechasByVehicle(empresaId),
  ]);
  const vehicle = vehicles.find((v) => v.id === numero) ?? null;
  if (!vehicle) {
    return {
      encontrado: false,
      numeroUnidad: numero,
      vehicleId: null,
      placa: null,
      faltantes: [],
      vencidos: [],
      porVencer: [],
      vigentes: [],
      countFaltantes: 0,
      countVencidos: 0,
      countPorVencer: 0,
      countVigentes: 0,
      criterio: DOCUMENTOS_CRITERIO_INVENTARIO,
      fuente: 'public.control_fechas',
    };
  }

  const tipos = DOC_MODULE_UI_COLUMNS.map((c) => c.tipo);
  const pivot = buildControlFechasPivotMapByTipos(controlFechas, tipos);
  const doc = pivot.get(numero);

  const faltantes: { tipo: string; label: string }[] = [];
  const vencidos: DocumentoItem[] = [];
  const porVencer: DocumentoItem[] = [];
  const vigentes: DocumentoItem[] = [];

  for (const { tipo, label } of DOC_MODULE_UI_COLUMNS) {
    const fecha = doc?.[tipo];
    const tone = docColumnTone(fecha, tipo);
    if (tone === 'empty') {
      faltantes.push({ tipo, label });
      continue;
    }
    if (tone === 'neutral' || tone === 'mant' || !fecha) continue;
    const item = buildItemFromPivot(vehicle, tipo, fecha);
    if (item.estado === 'vencido') vencidos.push(item);
    else if (item.estado === 'por_vencer') porVencer.push(item);
    else vigentes.push(item);
  }

  return {
    encontrado: true,
    numeroUnidad: numero,
    vehicleId: numero,
    placa: vehicle.placa,
    faltantes,
    vencidos,
    porVencer,
    vigentes,
    countFaltantes: faltantes.length,
    countVencidos: vencidos.length,
    countPorVencer: porVencer.length,
    countVigentes: vigentes.length,
    criterio: DOCUMENTOS_CRITERIO_INVENTARIO,
    fuente: 'public.control_fechas + módulo Documentación',
  };
}
