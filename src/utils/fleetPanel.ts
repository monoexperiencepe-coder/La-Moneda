import { esControlFechaSinAlertaVencimiento } from '../data/controlFechaCatalog';
import type { Vehicle, Ingreso, ControlFecha, KilometrajeRegistro, Conductor, Pendiente } from '../data/types';
import { todayStr } from './formatting';

/** Días hasta/since fecha ISO (negativo = ya pasó). */
export function diffDaysFromToday(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export type EstadoFlota = 'CRITICO' | 'ALERTA' | 'OK';

export interface FleetPanelRow {
  vehicle: Vehicle;
  estado: EstadoFlota;
  alertaPrincipal: string;
  conductorLabel: string;
  ultimoKm: number | null;
}

const DIAS_ALERTA_SIN_INGRESO = 14;

function fmtTipo(tipo: string): string {
  return tipo.replace(/_/g, ' ');
}

/** Último kilometraje registrado por vehículo (misma heurística que Resumen). */
export function ultimoKmPorVehiculo(kilometrajes: KilometrajeRegistro[], vehicleId: number): number | null {
  const rows = kilometrajes
    .filter((k) => Number(k.vehicleId) === Number(vehicleId))
    .sort((a, b) => {
      const fd = b.fecha.localeCompare(a.fecha);
      if (fd !== 0) return fd;
      return b.id - a.id;
    });
  const km = rows[0]?.kilometraje;
  return km != null ? km : null;
}

/**
 * Nombre para UI: si vienen vacíos desde BD (p. ej. seed incompleto), mostrar documento, celular o texto genérico.
 * No implica que falte el vínculo conductor ↔ vehículo.
 */
export function formatConductorDisplayLabel(c: Conductor): string {
  const nom = `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim();
  if (nom) return nom;
  const doc = String(c.numeroDocumento ?? '').trim();
  if (doc) return doc;
  const cel = String(c.celular ?? '').trim();
  if (cel) return cel;
  return 'Conductor registrado sin nombre';
}

/** Iniciales para avatar cuando nombre/apellido faltan. */
export function conductorDisplayInitials(c: Conductor): string {
  const n = (c.nombres ?? '').trim();
  const a = (c.apellidos ?? '').trim();
  if (n || a) {
    const ch = ((n[0] ?? '') + (a[0] ?? '')).toUpperCase();
    return ch || '?';
  }
  const doc = String(c.numeroDocumento ?? '').trim();
  if (doc.length >= 2) return doc.slice(0, 2).toUpperCase();
  if (doc.length === 1) return doc.toUpperCase();
  const digits = String(c.celular ?? '').replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return '?';
}

export function conductorAsignadoLabel(conductores: Conductor[], vehicleId: number): string {
  const vigentes = conductores.filter(
    (c) => c.vehicleId != null && Number(c.vehicleId) === Number(vehicleId) && c.estado === 'VIGENTE',
  );
  vigentes.sort((a, b) => Number(a.id) - Number(b.id));
  const c = vigentes[0];
  if (!c) return '—';
  return formatConductorDisplayLabel(c);
}

export function buildFleetPanelRows(
  vehicles: Vehicle[],
  ingresos: Ingreso[],
  controlFechas: ControlFecha[],
  kilometrajes: KilometrajeRegistro[],
  conductores: Conductor[],
): FleetPanelRow[] {
  const active = vehicles.filter((v) => v.activo);

  return active
    .map((v) => {
      const fechasV = controlFechas.filter((c) => c.vehicleId != null && Number(c.vehicleId) === Number(v.id));
      const fechasAlerta = fechasV.filter((c) => !esControlFechaSinAlertaVencimiento(c.tipo));
      const vencidos = fechasAlerta
        .filter((c) => diffDaysFromToday(c.fechaVencimiento) < 0)
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
      const proximos = fechasAlerta
        .filter((c) => {
          const d = diffDaysFromToday(c.fechaVencimiento);
          return d >= 0 && d <= 30;
        })
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

      const ingresosV = ingresos
        .filter((i) => Number(i.vehicleId) === Number(v.id))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      const ultimoIngreso = ingresosV[0] ?? null;
      const diasSinIngreso = ultimoIngreso ? Math.abs(diffDaysFromToday(ultimoIngreso.fecha)) : null;

      const estado: EstadoFlota =
        vencidos.length > 0
          ? 'CRITICO'
          : proximos.length > 0 || (diasSinIngreso != null && diasSinIngreso > DIAS_ALERTA_SIN_INGRESO)
            ? 'ALERTA'
            : 'OK';

      let alertaPrincipal = 'Al día';
      if (vencidos.length > 0) {
        const c = vencidos[0];
        alertaPrincipal = `${fmtTipo(c.tipo)} · vencido`;
      } else if (proximos.length > 0) {
        const c = proximos[0];
        alertaPrincipal = `${fmtTipo(c.tipo)} · en ${diffDaysFromToday(c.fechaVencimiento)} días`;
      } else if (diasSinIngreso != null && diasSinIngreso > DIAS_ALERTA_SIN_INGRESO) {
        alertaPrincipal = `Sin ingreso hace ${diasSinIngreso} días`;
      } else if (fechasV.length === 0) {
        alertaPrincipal = 'Sin documentación registrada';
      }

      return {
        vehicle: v,
        estado,
        alertaPrincipal,
        conductorLabel: conductorAsignadoLabel(conductores, v.id),
        ultimoKm: ultimoKmPorVehiculo(kilometrajes, v.id),
      };
    })
    .sort((a, b) => {
      const rank = { CRITICO: 0, ALERTA: 1, OK: 2 };
      const r = rank[a.estado] - rank[b.estado];
      if (r !== 0) return r;
      return a.vehicle.placa.localeCompare(b.vehicle.placa);
    });
}

export interface TodayReviewItem {
  vehicleId: number;
  placa: string;
  marca: string;
  modelo: string;
  detail: string;
}

export interface TodayReviewSnapshot {
  vencidosCount: number;
  porVencerCount: number;
  sinIngresoUmbralDias: number;
  sinIngresoCount: number;
  pendientesAltaActivosCount: number;
  muestraVencidos: TodayReviewItem[];
  muestraPorVencer: TodayReviewItem[];
  muestraSinIngreso: TodayReviewItem[];
  muestraPendientesAlta: { id: number; descripcion: string; vehicleId: number | null }[];
}

function rowToReviewItem(c: ControlFecha, vehicles: Vehicle[]): TodayReviewItem | null {
  if (c.vehicleId == null) return null;
  const vid = Number(c.vehicleId);
  const v = vehicles.find((x) => x.id === vid && x.activo);
  if (!v) return null;
  const d = diffDaysFromToday(c.fechaVencimiento);
  return {
    vehicleId: vid,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    detail: `${fmtTipo(c.tipo)} · ${d < 0 ? 'vencido' : `en ${d} días`}`,
  };
}

export function computeTodayReview(
  vehicles: Vehicle[],
  controlFechas: ControlFecha[],
  ingresos: Ingreso[],
  pendientes: Pendiente[],
  sinIngresoUmbralDias: number = DIAS_ALERTA_SIN_INGRESO,
): TodayReviewSnapshot {
  const activeIds = new Set(vehicles.filter((v) => v.activo).map((v) => v.id));

  const vencidosRows = controlFechas
    .filter(
      (c) =>
        !esControlFechaSinAlertaVencimiento(c.tipo) &&
        c.vehicleId != null &&
        activeIds.has(Number(c.vehicleId)) &&
        diffDaysFromToday(c.fechaVencimiento) < 0,
    )
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  const porVencerRows = controlFechas
    .filter((c) => {
      if (esControlFechaSinAlertaVencimiento(c.tipo)) return false;
      if (c.vehicleId == null || !activeIds.has(Number(c.vehicleId))) return false;
      const d = diffDaysFromToday(c.fechaVencimiento);
      return d >= 0 && d <= 30;
    })
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  const sinIngresoItems: TodayReviewItem[] = [];
  for (const v of vehicles.filter((x) => x.activo)) {
    const ingresosV = ingresos
      .filter((i) => Number(i.vehicleId) === Number(v.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultimo = ingresosV[0];
    const dias = ultimo ? Math.abs(diffDaysFromToday(ultimo.fecha)) : null;
    if (dias != null && dias > sinIngresoUmbralDias) {
      sinIngresoItems.push({
        vehicleId: v.id,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        detail: `${dias} días sin ingreso registrado`,
      });
    }
  }
  sinIngresoItems.sort((a, b) => {
    const da = parseInt(a.detail, 10) || 0;
    const db = parseInt(b.detail, 10) || 0;
    return db - da;
  });

  const pendAlta = pendientes.filter(
    (p) => p.prioridad === 'ALTA' && (p.estado === 'ABIERTO' || p.estado === 'EN_CURSO'),
  );
  pendAlta.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    vencidosCount: vencidosRows.length,
    porVencerCount: porVencerRows.length,
    sinIngresoUmbralDias,
    sinIngresoCount: sinIngresoItems.length,
    pendientesAltaActivosCount: pendAlta.length,
    muestraVencidos: vencidosRows
      .slice(0, 5)
      .map((c) => rowToReviewItem(c, vehicles))
      .filter((x): x is TodayReviewItem => x != null),
    muestraPorVencer: porVencerRows
      .slice(0, 5)
      .map((c) => rowToReviewItem(c, vehicles))
      .filter((x): x is TodayReviewItem => x != null),
    muestraSinIngreso: sinIngresoItems.slice(0, 5),
    muestraPendientesAlta: pendAlta.slice(0, 5).map((p) => ({
      id: p.id,
      descripcion: p.descripcion,
      vehicleId: p.vehicleId,
    })),
  };
}

/** Umbral de días sin ingreso alineado con alertas de flota (Control Global / Operaciones). */
export { DIAS_ALERTA_SIN_INGRESO };
