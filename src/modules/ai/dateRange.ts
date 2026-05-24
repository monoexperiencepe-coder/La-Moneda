/** Rangos de fecha para consultas del asistente IA. */

export type AiPeriodPreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export type AiDateRange = {
  desde: string;
  hasta: string;
  label: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function resolveAiDateRange(args: {
  periodo?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): AiDateRange {
  const now = new Date();
  const preset = (args.periodo ?? 'month').trim().toLowerCase() as AiPeriodPreset;

  if (preset === 'custom' && args.desde && args.hasta) {
    return {
      desde: args.desde.slice(0, 10),
      hasta: args.hasta.slice(0, 10),
      label: `${args.desde.slice(0, 10)} → ${args.hasta.slice(0, 10)}`,
    };
  }

  const hasta = isoDate(now);

  if (preset === 'today') {
    return { desde: hasta, hasta, label: 'Hoy' };
  }

  if (preset === 'week') {
    return { desde: isoDate(startOfWeek(now)), hasta, label: 'Esta semana' };
  }

  if (preset === 'year') {
    return { desde: `${now.getFullYear()}-01-01`, hasta, label: `Año ${now.getFullYear()}` };
  }

  const desde = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  return { desde, hasta, label: 'Este mes' };
}

export function filterByDateRange<T extends { fecha: string }>(
  rows: T[],
  range: AiDateRange,
): T[] {
  return rows.filter((r) => {
    const f = r.fecha.slice(0, 10);
    return f >= range.desde && f <= range.hasta;
  });
}

export function sumMontos<T extends { monto: number }>(rows: T[]): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(r.monto) ? r.monto : 0), 0);
}
