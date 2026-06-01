import type { FinancialAuditLog } from '../data/types';
import type { Vehicle } from '../data/types';
import { toDateOnlyString } from './formatting';
import { labelTipoGastoFinanciero } from './tipoGastoLabels';
import { getSubtipoFinancieroLabel } from './subtipoFinancieroLabel';
import { vehicleIdAuditScalar } from './uuidColumn';
import { TIPOS_CONTROL_FECHA_OPTIONS } from '../data/controlFechaCatalog';

function controlFechaTipoLabel(tipo: unknown): string {
  const t = String(tipo ?? '').trim();
  if (!t) return '—';
  return TIPOS_CONTROL_FECHA_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

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
    log.entityType === 'ingreso'
      ? 'Ing.'
      : log.entityType === 'gasto'
        ? 'Gasto'
        : log.entityType === 'kilometraje'
          ? 'Km'
          : log.entityType === 'control_fecha'
            ? 'Doc.'
            : log.entityType.slice(0, 12);

  const merged: Record<string, unknown> = {
    ...(log.oldData ?? {}),
    ...(log.newData ?? {}),
  };

  if (log.entityType === 'kilometraje') {
    const veh = vehicleLabel(vehicles, merged.vehicle_id);
    const fecha = fechaCompact(toDateOnlyString(merged.fecha));
    const km =
      merged.kilometraje != null && merged.kilometraje !== ''
        ? `${Number(merged.kilometraje).toLocaleString('es-PE')} km`
        : merged.km_mantenimiento != null && merged.km_mantenimiento !== ''
          ? `mant. ${Number(merged.km_mantenimiento).toLocaleString('es-PE')} km`
          : '';
    return ['Km', veh, fecha, km].filter(Boolean).join(' · ') || `Km · #${log.entityId}`;
  }

  if (log.entityType === 'control_fecha') {
    const veh = vehicleLabel(vehicles, merged.vehicle_id);
    const tipo = controlFechaTipoLabel(merged.tipo);
    const venc = fechaCompact(toDateOnlyString(merged.fecha_vencimiento));
    return ['Doc.', veh, tipo, venc].filter((p) => p !== '' && p !== '—').join(' · ') || `Doc. · #${log.entityId}`;
  }

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

const GENERIC_MOVE_REASON_RE =
  /mover gasto de categor[ií]a|conciliaci[oó]n pendiente|correcci[oó]n manual/i;

function isGenericMoveReason(reason: string): boolean {
  return GENERIC_MOVE_REASON_RE.test(reason);
}

/** Resumen legible del cambio (columna «Cambio realizado» en historial del sistema). */
export function formatAuditChangeSummary(log: FinancialAuditLog, vehicles: Vehicle[]): string {
  const before = log.oldData ?? {};
  const after = log.newData ?? {};

  if (log.actionType === 'move_category' || log.actionType === 'undo_move_category') {
    const parts: string[] = [];
    const fromTipo = labelTipoGastoFinanciero(before.tipo_gasto as string | null | undefined);
    const toTipo = labelTipoGastoFinanciero(after.tipo_gasto as string | null | undefined);
    if (fromTipo !== toTipo) {
      parts.push(`${fromTipo} → ${toTipo}`);
    } else if (toTipo !== '—') {
      parts.push(toTipo);
    }

    const beforeVeh = vehicleIdAuditScalar(before.vehicle_id);
    const afterVeh = vehicleIdAuditScalar(after.vehicle_id);
    if (beforeVeh !== afterVeh) {
      const fromLbl = vehicleLabel(vehicles, beforeVeh);
      const toLbl = vehicleLabel(vehicles, afterVeh);
      if (toLbl !== '—') {
        parts.push(beforeVeh != null && fromLbl !== toLbl ? `Vehículo: ${fromLbl} → ${toLbl}` : `Vehículo: ${toLbl}`);
      } else if (fromLbl !== '—') {
        parts.push(`Vehículo: ${fromLbl} → —`);
      }
    } else if (afterVeh != null) {
      const vl = vehicleLabel(vehicles, afterVeh);
      if (vl !== '—') parts.push(`Vehículo: ${vl}`);
    }

    const toSub = getSubtipoFinancieroLabel(
      after.subtipo_gasto as string | null | undefined,
      after.tipo_gasto as string | null | undefined,
    );
    const fromSub = getSubtipoFinancieroLabel(
      before.subtipo_gasto as string | null | undefined,
      before.tipo_gasto as string | null | undefined,
    );
    if (toSub !== '—' || fromSub !== '—') {
      if (fromSub !== toSub && fromSub !== '—') {
        parts.push(`Subtipo: ${fromSub} → ${toSub}`);
      } else if (toSub !== '—') {
        parts.push(`Subtipo: ${toSub}`);
      }
    }

    const motivo = log.reason?.trim();
    if (motivo && !isGenericMoveReason(motivo)) {
      parts.push(motivo);
    }
    return parts.length > 0 ? parts.join(' · ') : (motivo || '—');
  }

  if (log.actionType === 'change_vehicle_id') {
    const o = log.oldData?.vehicle_id ?? before.vehicle_id;
    const n = log.newData?.vehicle_id ?? after.vehicle_id;
    return `${vehicleLabel(vehicles, o)} → ${vehicleLabel(vehicles, n)}`;
  }

  if (log.actionType === 'change_amount') {
    const om = log.oldData?.monto ?? before.monto;
    const nm = log.newData?.monto ?? after.monto;
    const fmt = (x: unknown) => {
      const v = Number(x);
      return Number.isNaN(v) ? '?' : v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
    };
    return `S/${fmt(om)} → S/${fmt(nm)}`;
  }

  if (log.actionType === 'fix_classification') {
    const fromTipo = labelTipoGastoFinanciero(before.tipo_gasto as string | null | undefined);
    const toTipo = labelTipoGastoFinanciero(after.tipo_gasto as string | null | undefined);
    if (fromTipo !== toTipo) return `${fromTipo} → ${toTipo}`;
  }

  if (log.entityType === 'kilometraje' || log.entityType === 'control_fecha') {
    return log.reason?.trim() || formatAuditEntitySummary(log, vehicles);
  }

  return log.reason?.trim() || '—';
}

export function formatAuditUserDisplay(userId: string, lookup: Map<string, { name: string; email: string }>): string {
  const row = lookup.get(userId);
  const label = row?.name?.trim() || row?.email?.trim();
  if (label) return label;
  if (!userId) return '—';
  return `${userId.slice(0, 8)}…`;
}
