import type { Conductor, Vehicle } from '../../data/types';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { normalizePlaca, placasMatch } from '../../utils/normalizePlaca';
import {
  findVehicleByDisplayNumber,
  getVehicleDisplayNumber,
} from '../../utils/vehicleDisplayNumber';

function dedupeConductores(conductores: readonly Conductor[]): Conductor[] {
  const seen = new Set<string>();
  const out: Conductor[] = [];
  for (const c of conductores) {
    const key = String(c.id ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export type FlotaResumen = {
  total: number;
  activos: number;
  inactivos: number;
  sinConductor: number;
  disponibles: number;
  conductoresVigentes: number;
  asignados: number;
};

export type VehiculoFlotaCompacto = {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  anio?: number;
  activo: boolean;
  disponible: boolean;
  conductor: string | null;
  conductor_id: string | null;
};

export type ConductorAsignadoRow = {
  conductor_id: string;
  conductor: string;
  vehicle_id: number;
  placa: string;
  marca: string;
  modelo: string;
};

export function isVehiculoActivo(v: Vehicle): boolean {
  return v.activo === true;
}

export function conductoresVigentes(conductores: readonly Conductor[]): Conductor[] {
  return conductores.filter((c) => c.estado === 'VIGENTE');
}

export function conductorVigentePorVehiculo(
  conductores: readonly Conductor[],
  vehicleId: number,
): Conductor | null {
  const vigentes = conductores.filter(
    (c) =>
      c.estado === 'VIGENTE' &&
      c.vehicleId != null &&
      Number(c.vehicleId) === Number(vehicleId),
  );
  vigentes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return vigentes[0] ?? null;
}

function vehiculoTieneConductorVigente(
  conductores: readonly Conductor[],
  vehicleId: number,
): boolean {
  return conductorVigentePorVehiculo(conductores, vehicleId) != null;
}

export function isVehiculoDisponible(
  vehicle: Vehicle,
  conductores: readonly Conductor[],
): boolean {
  return isVehiculoActivo(vehicle) && !vehiculoTieneConductorVigente(conductores, vehicle.id);
}

export function compactVehiculoFlota(
  vehicle: Vehicle,
  conductores: readonly Conductor[],
): VehiculoFlotaCompacto {
  const c = conductorVigentePorVehiculo(conductores, vehicle.id);
  return {
    id: vehicle.id,
    placa: vehicle.placa,
    marca: vehicle.marca,
    modelo: vehicle.modelo,
    anio: vehicle.anio,
    activo: vehicle.activo,
    disponible: isVehiculoDisponible(vehicle, conductores),
    conductor: c ? formatConductorDisplayLabel(c) : null,
    conductor_id: c?.id ?? null,
  };
}

export function buildFlotaResumen(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
): FlotaResumen {
  const activos = vehicles.filter(isVehiculoActivo);
  const inactivos = vehicles.length - activos.length;
  const vigentes = conductoresVigentes(conductores);
  const asignados = vigentes.filter((c) => c.vehicleId != null);
  const activosSinConductor = activos.filter(
    (v) => !vehiculoTieneConductorVigente(conductores, v.id),
  );

  return {
    total: vehicles.length,
    activos: activos.length,
    inactivos,
    sinConductor: activosSinConductor.length,
    disponibles: activosSinConductor.length,
    conductoresVigentes: vigentes.length,
    asignados: asignados.length,
  };
}

export type ConteoConductores = {
  totalConductores: number;
  activos: number;
  inactivos: number;
  /** Conductores VIGENTES con vehicle_id asignado. */
  conductoresAsignados: number;
  /** Conductores VIGENTES sin vehículo asignado. */
  conductoresSinVehiculo: number;
  fuente: 'public.conductores';
};

/** Conteo de conductores (filas únicas en public.conductores; activos = VIGENTE). */
export function buildConteoConductores(conductores: readonly Conductor[]): ConteoConductores {
  const unique = dedupeConductores(conductores);
  const vigentes = unique.filter((c) => c.estado === 'VIGENTE');
  const asignados = vigentes.filter((c) => c.vehicleId != null).length;
  const activos = vigentes.length;
  return {
    totalConductores: unique.length,
    activos,
    inactivos: unique.length - activos,
    conductoresAsignados: asignados,
    conductoresSinVehiculo: vigentes.length - asignados,
    fuente: 'public.conductores',
  };
}

export function getVehiculosDisponibles(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
): VehiculoFlotaCompacto[] {
  return vehicles
    .filter((v) => isVehiculoDisponible(v, conductores))
    .sort((a, b) => a.id - b.id)
    .map((v) => compactVehiculoFlota(v, conductores));
}

export function getVehiculosSinConductor(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
): VehiculoFlotaCompacto[] {
  return vehicles
    .filter((v) => isVehiculoActivo(v) && !vehiculoTieneConductorVigente(conductores, v.id))
    .sort((a, b) => a.id - b.id)
    .map((v) => compactVehiculoFlota(v, conductores));
}

export function getConductoresAsignados(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
): ConductorAsignadoRow[] {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  return conductoresVigentes(conductores)
    .filter((c) => c.vehicleId != null)
    .map((c) => {
      const v = byId.get(Number(c.vehicleId));
      return {
        conductor_id: c.id,
        conductor: formatConductorDisplayLabel(c),
        vehicle_id: Number(c.vehicleId),
        placa: v?.placa ?? '—',
        marca: v?.marca ?? '',
        modelo: v?.modelo ?? '',
      };
    })
    .sort((a, b) => a.placa.localeCompare(b.placa, 'es'));
}

export function findVehiculoByPlaca(
  vehicles: readonly Vehicle[],
  placa: string,
): Vehicle | null {
  const needle = normalizePlaca(placa);
  if (!needle) return null;
  return vehicles.find((v) => placasMatch(v.placa ?? '', needle)) ?? null;
}

export function getVehiculoPorPlaca(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
  placa: string,
): { encontrado: boolean; vehiculo: VehiculoFlotaCompacto | null; placa_buscada: string } {
  const placaNorm = normalizePlaca(placa);
  const v = findVehiculoByPlaca(vehicles, placaNorm);
  return {
    encontrado: v != null,
    placa_buscada: placaNorm,
    vehiculo: v ? compactVehiculoFlota(v, conductores) : null,
  };
}

export function findConductoresByNombreQuery(
  conductores: readonly Conductor[],
  query: string,
): Conductor[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return conductores.filter((c) => {
    const full = `${c.nombres} ${c.apellidos}`.trim().toLowerCase();
    const doc = (c.numeroDocumento ?? '').toLowerCase();
    return (
      full.includes(q) ||
      c.nombres.toLowerCase().includes(q) ||
      c.apellidos.toLowerCase().includes(q) ||
      doc.includes(q)
    );
  });
}

export type ConductorVehiculoLookup = {
  encontrado: boolean;
  criterio: string;
  conductor: {
    id: string;
    nombre: string;
    estado: string;
    vehicle_id: number | null;
  } | null;
  vehiculo: VehiculoFlotaCompacto | null;
  coincidencias_nombre?: Array<{ id: string; nombre: string; vehicle_id: number | null }>;
};

function resolveVehicleIdFromInput(
  vehicles: readonly Vehicle[],
  placaOrVehicleId: string | number,
): number | null {
  if (typeof placaOrVehicleId === 'number' && Number.isFinite(placaOrVehicleId)) {
    return vehicles.some((v) => v.id === placaOrVehicleId) ? placaOrVehicleId : null;
  }
  const raw = String(placaOrVehicleId).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    return vehicles.some((v) => v.id === id) ? id : null;
  }
  const byPlaca = findVehiculoByPlaca(vehicles, raw);
  return byPlaca?.id ?? null;
}

export function getConductorPorVehiculo(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
  placaOrVehicleId: string | number,
): ConductorVehiculoLookup {
  const criterio = String(placaOrVehicleId).trim();
  const vehicleId = resolveVehicleIdFromInput(vehicles, placaOrVehicleId);
  if (vehicleId == null) {
    return { encontrado: false, criterio, conductor: null, vehiculo: null };
  }
  const v = vehicles.find((x) => x.id === vehicleId) ?? null;
  const c = conductorVigentePorVehiculo(conductores, vehicleId);
  return {
    encontrado: c != null || v != null,
    criterio,
    conductor: c
      ? {
          id: c.id,
          nombre: formatConductorDisplayLabel(c),
          estado: c.estado,
          vehicle_id: c.vehicleId,
        }
      : null,
    vehiculo: v ? compactVehiculoFlota(v, conductores) : null,
  };
}

export function getVehiculoPorConductorNombre(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
  nombreQuery: string,
): ConductorVehiculoLookup {
  const criterio = nombreQuery.trim();
  const matches = findConductoresByNombreQuery(conductores, criterio);
  if (matches.length === 0) {
    return { encontrado: false, criterio, conductor: null, vehiculo: null };
  }
  if (matches.length > 1) {
    return {
      encontrado: false,
      criterio,
      conductor: null,
      vehiculo: null,
      coincidencias_nombre: matches.slice(0, 8).map((c) => ({
        id: c.id,
        nombre: formatConductorDisplayLabel(c),
        vehicle_id: c.vehicleId,
      })),
    };
  }
  const c = matches[0];
  const v =
    c.vehicleId != null
      ? vehicles.find((x) => x.id === Number(c.vehicleId)) ?? null
      : null;
  return {
    encontrado: true,
    criterio,
    conductor: {
      id: c.id,
      nombre: formatConductorDisplayLabel(c),
      estado: c.estado,
      vehicle_id: c.vehicleId,
    },
    vehiculo: v ? compactVehiculoFlota(v, conductores) : null,
  };
}

export type VehiculoPorNumeroPayload = {
  encontrado: boolean;
  vehicleId: number | null;
  numeroUnidad: number;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  estado: string | null;
  conductorAsignado: { id: string; nombre: string } | null;
  fuente: 'public.vehiculos';
};

/** Busca vehículo por número visible (numero_unidad) o, en transición, por id técnico. */
export function getVehiculoPorNumero(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
  numero: number,
): VehiculoPorNumeroPayload {
  const v = findVehicleByDisplayNumber(vehicles, numero);
  if (!v) {
    return {
      encontrado: false,
      vehicleId: null,
      numeroUnidad: numero,
      placa: null,
      marca: null,
      modelo: null,
      estado: null,
      conductorAsignado: null,
      fuente: 'public.vehiculos',
    };
  }
  const c = conductorVigentePorVehiculo(conductores, v.id);
  return {
    encontrado: true,
    vehicleId: v.id,
    numeroUnidad: getVehicleDisplayNumber(v),
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    estado: v.activo ? 'activo' : 'inactivo',
    conductorAsignado: c
      ? { id: c.id, nombre: formatConductorDisplayLabel(c) }
      : null,
    fuente: 'public.vehiculos',
  };
}

export type ConductorPorNumeroPayload = {
  encontrado: boolean;
  conductorId: string | null;
  numero: number;
  nombre: string | null;
  estado: string | null;
  vehiculoAsignado: { id: number; placa: string; numeroUnidad: number } | null;
  fuente: 'public.conductores';
};

/** Busca conductor por número de fila en listado (mismo orden que UI: vehicleId asc). */
export function getConductorPorNumero(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
  numero: number,
): ConductorPorNumeroPayload {
  const unique = dedupeConductores(conductores);
  const sorted = [...unique].sort((a, b) => {
    const va = a.vehicleId ?? Number.MAX_SAFE_INTEGER;
    const vb = b.vehicleId ?? Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return String(a.apellidos).localeCompare(String(b.apellidos), 'es');
  });
  const c = sorted[numero - 1] ?? null;
  if (!c) {
    return {
      encontrado: false,
      conductorId: null,
      numero,
      nombre: null,
      estado: null,
      vehiculoAsignado: null,
      fuente: 'public.conductores',
    };
  }
  const v =
    c.vehicleId != null ? vehicles.find((x) => x.id === Number(c.vehicleId)) ?? null : null;
  return {
    encontrado: true,
    conductorId: c.id,
    numero,
    nombre: formatConductorDisplayLabel(c),
    estado: c.estado,
    vehiculoAsignado: v
      ? { id: v.id, placa: v.placa, numeroUnidad: getVehicleDisplayNumber(v) }
      : null,
    fuente: 'public.conductores',
  };
}

/** Log DEV al ejecutar tools de flota. */
export function logFlotaTool(
  tool: string,
  input: Record<string, unknown>,
  resultCount: number,
): void {
  if (!import.meta.env.DEV) return;
  console.log('[flota:tool]', { tool, input, resultCount });
}
