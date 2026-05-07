import type { FinancialAuditLog } from '../data/types';
import type { Vehicle } from '../data/types';
import { toDateOnlyString } from './formatting';

function vehicleLabel(vehicles: Vehicle[], vehicleId: unknown): string {
  if (vehicleId == null || vehicleId === '') return '—';
  const id = typeof vehicleId === 'number' ? vehicleId : Number(vehicleId);
  if (Number.isNaN(id)) return '—';
  const v = vehicles.find((x) => x.id === id);
  if (!v) return `#${id}`;
  const p = v.placa?.trim();
  if (p) return p;
  const mm = `${v.marca} ${v.modelo}`.trim();
  return mm || `#${id}`;
}

function formatMontoCompact(monto: unknown, moneda: unknown): string {
  const n = typeof monto === 'number' ? monto : Number(monto);
  if (Number.isNaN(n)) return '';
  const m = String(moneda ?? 'PEN').toUpperCase();
  const frac = Math.abs(n % 1) > 1e-9;
  const s = n.toLocaleString('es-PE', {
    minimumFractionDigits: frac ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return m === 'USD' ? `US$${s}` : `S/${s}`;
}

function fechaCompact(isoDay: string): string {
  if (!isoDay) return '';
  const d = new Date(isoDay + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

/** Una línea corta: tipo · vehículo · fecha · monto (snake_case en payloads de auditoría). */
export function formatAuditEntitySummary(log: FinancialAuditLog, vehicles: Vehicle[]): string {
  const typeTag =
    log.entityType === 'ingreso' ? 'Ing.' : log.entityType === 'gasto' ? 'Gasto' : log.entityType.slice(0, 12);

  const merged: Record<string, unknown> = {
    ...(log.oldData ?? {}),
    ...(log.newData ?? {}),
  };

  if (log.actionType === 'change_vehicle_id') {
    const o = log.oldData?.vehicle_id;
    const n = log.newData?.vehicle_id;
    return `${typeTag} · ${vehicleLabel(vehicles, o)} → ${vehicleLabel(vehicles, n)}`;
  }

  if (log.actionType === 'change_amount') {
    const om = log.oldData?.monto;
    const nm = log.newData?.monto;
    const fmt = (x: unknown) => {
      const v = Number(x);
      return Number.isNaN(v) ? '?' : v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
    };
    return `${typeTag} · S/${fmt(om)} → S/${fmt(nm)}`;
  }

  const fechaRaw = merged.fecha ?? merged.fecha_movimiento;
  const fecha = fechaCompact(toDateOnlyString(fechaRaw));
  const veh = vehicleLabel(vehicles, merged.vehicle_id);
  const money = formatMontoCompact(merged.monto, merged.moneda);

  const parts = [typeTag, veh, fecha, money].filter((p) => p !== '');
  const line = parts.join(' · ');
  if (line === typeTag || line === `${typeTag} · —`) {
    return `${typeTag} · #${log.entityId.slice(0, 8)}…`;
  }
  return line;
}

export function formatAuditUserDisplay(userId: string, lookup: Map<string, { name: string; email: string }>): string {
  const row = lookup.get(userId);
  const label = row?.name?.trim() || row?.email?.trim();
  if (label) return label;
  if (!userId) return '—';
  return `${userId.slice(0, 8)}…`;
}
