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
  /** Año concreto (ej: 2024). Tiene prioridad si se proporciona y difiere del año actual. */
  anio?: number | string | null;
}): AiDateRange {
  const now = new Date();
  const currentYear = now.getFullYear();

  // If a specific year is provided, use its full range
  const targetYear = args.anio != null ? Math.trunc(Number(args.anio)) : null;
  if (targetYear != null && Number.isFinite(targetYear) && targetYear >= 2000 && targetYear <= currentYear + 1) {
    const isCurrentYear = targetYear === currentYear;
    return {
      desde: `${targetYear}-01-01`,
      hasta: isCurrentYear ? isoDate(now) : `${targetYear}-12-31`,
      label: `Año ${targetYear}`,
    };
  }

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
    return { desde: `${currentYear}-01-01`, hasta, label: `Año ${currentYear}` };
  }

  const desde = `${currentYear}-${pad(now.getMonth() + 1)}-01`;
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

export type CurrencyTotal = {
  total: number;
  count: number;
};

/** Agrupa totales por moneda. Rows sin campo moneda se clasifican como PEN. */
export function sumMontosByCurrency<T extends { monto: number; moneda?: string | null }>(
  rows: T[],
): Record<string, CurrencyTotal> {
  const result: Record<string, CurrencyTotal> = {};
  for (const row of rows) {
    const currency = row.moneda?.toUpperCase()?.trim() || 'PEN';
    const entry = result[currency] ?? { total: 0, count: 0 };
    entry.total += Number.isFinite(row.monto) ? row.monto : 0;
    entry.count += 1;
    result[currency] = entry;
  }
  return result;
}

/** Formatea monto con símbolo correcto: PEN → S/ xxx, USD → US$ xxx */
export function formatCurrencyByCode(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const formatted = abs.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cur = currency.toUpperCase();
  if (cur === 'USD') return `${sign}US$ ${formatted}`;
  return `${sign}S/ ${formatted}`;
}
