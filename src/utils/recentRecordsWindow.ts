import type { Gasto, Ingreso } from '../data/types';

export type RecentHoursOption = 24 | 48 | 72;

export const RECENT_HOURS_OPTIONS: RecentHoursOption[] = [24, 48, 72];

type DatedRecord = {
  fecha: string;
  fechaRegistro: string;
  createdAt?: string;
};

/** Instant del registro para ventanas rolling (prefer createdAt, luego fecha registro). */
export function recordTimestampMs(record: DatedRecord): number {
  const created = record.createdAt?.trim();
  if (created) {
    const ms = Date.parse(created);
    if (!Number.isNaN(ms)) return ms;
  }

  const fr = (record.fechaRegistro || record.fecha || '').trim();
  if (!fr) return 0;

  if (fr.includes('T') || /\d{1,2}:\d{2}/.test(fr)) {
    const ms = Date.parse(fr);
    if (!Number.isNaN(ms)) return ms;
  }

  const dateOnly = fr.slice(0, 10);
  const ms = new Date(`${dateOnly}T12:00:00-05:00`).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function filterIngresosRecentHours(
  ingresos: readonly Ingreso[],
  hours: RecentHoursOption,
  nowMs = Date.now(),
): Ingreso[] {
  const cutoff = nowMs - hours * 3_600_000;
  return ingresos
    .filter((r) => {
      const ms = recordTimestampMs(r);
      return ms >= cutoff && ms <= nowMs + 60_000;
    })
    .sort((a, b) => recordTimestampMs(b) - recordTimestampMs(a));
}

export function filterGastosRecentHours(
  gastos: readonly Gasto[],
  hours: RecentHoursOption,
  nowMs = Date.now(),
): Gasto[] {
  const cutoff = nowMs - hours * 3_600_000;
  return gastos
    .filter((r) => {
      const ms = recordTimestampMs(r);
      return ms >= cutoff && ms <= nowMs + 60_000;
    })
    .sort((a, b) => recordTimestampMs(b) - recordTimestampMs(a));
}

export function recentRangeStats(total: number, count: number, hours: RecentHoursOption) {
  const promedioRegistro = count > 0 ? total / count : 0;
  const promedioDia = hours > 0 ? total / (hours / 24) : 0;
  const promedioHora = hours > 0 ? total / hours : 0;
  return { total, count, promedioRegistro, promedioDia, promedioHora };
}
