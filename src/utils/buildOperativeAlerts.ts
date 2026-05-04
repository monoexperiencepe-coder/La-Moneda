import type { ControlFecha, Ingreso, Vehicle } from '../data/types';
import { esControlFechaSinAlertaVencimiento } from '../data/controlFechaCatalog';
import { formatCurrency, formatDate, todayStr } from './formatting';
import { ingresoMontoPEN } from './moneda';

/** Ventana para alertar vencimientos (control_fechas), alineado a Control Global. */
export const DIAS_ALERTA_VENCIMIENTO = 30;

/** Sin ningún ingreso con fecha de movimiento >= hoy − N → alerta. */
export const DIAS_SIN_INGRESOS_ALERTA = 14;

const MAX_ALERTAS_INGRESO_PENDIENTE = 80;
const MAX_ALERTAS_VENCIMIENTO = 150;
const MAX_ALERTAS_SIN_INGRESOS = 60;

export type OperativeAlertKind = 'INGRESO_PENDIENTE' | 'VENCIMIENTO' | 'SIN_INGRESOS';

export interface OperativeAlertItem {
  kind: OperativeAlertKind;
  id: string;
  severity: 'alta' | 'media';
  title: string;
  detail: string;
  href: string;
}

function diffDaysFromToday(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function vehicleLabel(v: Vehicle | undefined): string {
  if (!v) return '—';
  return `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`;
}

function cutoffSinIngresos(): string {
  const d = new Date(todayStr() + 'T12:00:00');
  d.setDate(d.getDate() - DIAS_SIN_INGRESOS_ALERTA);
  return d.toISOString().slice(0, 10);
}

/**
 * Alertas derivadas de datos Supabase/contexto (sin llamadas de red).
 */
export function buildOperativeAlerts(
  ingresos: Ingreso[],
  controlFechas: ControlFecha[],
  vehicles: Vehicle[],
): OperativeAlertItem[] {
  const out: OperativeAlertItem[] = [];
  const activeVehicles = vehicles.filter((v) => v.activo);
  const byId = new Map(activeVehicles.map((v) => [v.id, v]));

  /* 1) Ingresos con cobro/pago marcado pendiente */
  const pendientesIng = ingresos.filter((i) => i.estadoPago === 'PENDIENTE');
  pendientesIng.sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const i of pendientesIng.slice(0, MAX_ALERTAS_INGRESO_PENDIENTE)) {
    const v = byId.get(i.vehicleId);
    const pen = ingresoMontoPEN(i);
    const monedaLbl = i.moneda === 'USD' ? `≈ ${formatCurrency(pen)} ref.` : formatCurrency(i.monto);
    out.push({
      kind: 'INGRESO_PENDIENTE',
      id: `ing-pend-${i.id}`,
      severity: 'alta',
      title: `${i.tipo} · ${vehicleLabel(v)}`,
      detail: `${monedaLbl} · Mov. ${formatDate(i.fecha)}`,
      href: '/finanzas/ingresos',
    });
  }

  /* 2) Vencimientos próximos o ya vencidos (control_fechas) */
  const vencRows = controlFechas.filter((c) => {
    if (esControlFechaSinAlertaVencimiento(c.tipo)) return false;
    const d = diffDaysFromToday(c.fechaVencimiento);
    return d <= DIAS_ALERTA_VENCIMIENTO;
  });
  vencRows.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  for (const c of vencRows.slice(0, MAX_ALERTAS_VENCIMIENTO)) {
    const d = diffDaysFromToday(c.fechaVencimiento);
    const v = c.vehicleId != null ? byId.get(c.vehicleId) : undefined;
    const diasTxt =
      d < 0 ? `vencido hace ${Math.abs(d)} día${Math.abs(d) !== 1 ? 's' : ''}` : `en ${d} día${d !== 1 ? 's' : ''}`;
    out.push({
      kind: 'VENCIMIENTO',
      id: `cf-${c.id}`,
      severity: d < 0 ? 'alta' : 'media',
      title: `${c.tipo} · ${vehicleLabel(v)}`,
      detail: `Vence ${formatDate(c.fechaVencimiento)} (${diasTxt})`,
      href: '/operaciones/control-global',
    });
  }

  /* 3) Vehículos activos sin ingreso reciente (por fecha de movimiento) */
  const cutoff = cutoffSinIngresos();
  const lastIngresoByVehicle = new Map<number, string>();
  for (const i of ingresos) {
    const prev = lastIngresoByVehicle.get(i.vehicleId);
    const f = i.fecha.slice(0, 10);
    if (!prev || f > prev) lastIngresoByVehicle.set(i.vehicleId, f);
  }

  function daysSinceIngreso(lastIso: string): number {
    return Math.max(0, -diffDaysFromToday(lastIso));
  }

  type SinIng = { vehicle: Vehicle; last: string | null };
  const sinIng: SinIng[] = [];
  for (const v of activeVehicles) {
    const last = lastIngresoByVehicle.get(v.id) ?? null;
    if (!last || last < cutoff) {
      sinIng.push({ vehicle: v, last });
    }
  }
  sinIng.sort((a, b) => {
    if (!a.last && !b.last) return a.vehicle.id - b.vehicle.id;
    if (!a.last) return -1;
    if (!b.last) return 1;
    return daysSinceIngreso(b.last) - daysSinceIngreso(a.last);
  });

  for (const { vehicle: v, last } of sinIng.slice(0, MAX_ALERTAS_SIN_INGRESOS)) {
    const detail = last
      ? `Último ingreso ${formatDate(last)} (hace ${daysSinceIngreso(last)} día${daysSinceIngreso(last) !== 1 ? 's' : ''}; umbral ${DIAS_SIN_INGRESOS_ALERTA})`
      : `Sin ingresos registrados`;
    out.push({
      kind: 'SIN_INGRESOS',
      id: `sin-ing-${v.id}`,
      severity: last ? 'media' : 'alta',
      title: vehicleLabel(v),
      detail,
      href: '/finanzas/ingresos',
    });
  }

  return out;
}

export function countAlertsByKind(items: OperativeAlertItem[]): Record<OperativeAlertKind, number> {
  const init: Record<OperativeAlertKind, number> = {
    INGRESO_PENDIENTE: 0,
    VENCIMIENTO: 0,
    SIN_INGRESOS: 0,
  };
  for (const i of items) init[i.kind]++;
  return init;
}
