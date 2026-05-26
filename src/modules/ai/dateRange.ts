/** Rangos de fecha para consultas del asistente IA. */

export type AiPeriodPreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export type AiDateRange = {
  desde: string;
  hasta: string;
  label: string;
};

const YEAR_PARAM_KEYS = ['anio', 'year', 'año'] as const;

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

export function parseYearValue(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

/** Extrae año de args de tool (anio, year, año o periodo="2025"). */
export function extractYearFromToolArgs(args: Record<string, unknown>): number | null {
  for (const key of YEAR_PARAM_KEYS) {
    const y = parseYearValue(args[key]);
    if (y != null) return y;
  }
  if (typeof args.periodo === 'string') {
    const p = args.periodo.trim();
    if (/^\d{4}$/.test(p)) return parseYearValue(p);
  }
  return null;
}

/**
 * Normaliza parámetros de periodo antes de resolver el rango.
 * Si el usuario pidió un año explícito, fuerza calendario completo YYYY
 * e ignora periodo activo, presets y fechas parciales del modelo.
 */
export function normalizePeriodParams(
  args: Record<string, unknown>,
  explicitYearFromMessage?: number | null,
): Record<string, unknown> {
  const out = { ...args };
  const yearFromArgs = extractYearFromToolArgs(out);
  const forcedYear = explicitYearFromMessage ?? yearFromArgs;

  if (forcedYear != null) {
    out.anio = forcedYear;
    delete out.year;
    delete out.año;
    delete out.periodo;
    delete out.desde;
    delete out.hasta;
    return out;
  }

  const mapped =
    parseYearValue(out.anio) ?? parseYearValue(out.year) ?? parseYearValue(out.año);
  if (mapped != null) {
    out.anio = mapped;
    delete out.year;
    delete out.año;
    if (typeof out.periodo === 'string' && /^\d{4}$/.test(out.periodo.trim())) {
      delete out.periodo;
    }
  }

  return out;
}

export function resolveAiDateRange(args: {
  periodo?: string | null;
  desde?: string | null;
  hasta?: string | null;
  anio?: number | string | null;
  year?: number | string | null;
  año?: number | string | null;
}): AiDateRange {
  const normalized = normalizePeriodParams(args as Record<string, unknown>);
  const now = new Date();
  const currentYear = now.getFullYear();

  const targetYear = parseYearValue(normalized.anio);
  if (targetYear != null && targetYear >= 2000 && targetYear <= currentYear + 1) {
    const isCurrentYear = targetYear === currentYear;
    return {
      desde: `${targetYear}-01-01`,
      hasta: isCurrentYear ? isoDate(now) : `${targetYear}-12-31`,
      label: `Año ${targetYear}`,
    };
  }

  const preset = (normalized.periodo ?? 'month').toString().trim().toLowerCase() as AiPeriodPreset;

  if (preset === 'custom' && normalized.desde && normalized.hasta) {
    return {
      desde: String(normalized.desde).slice(0, 10),
      hasta: String(normalized.hasta).slice(0, 10),
      label: `${String(normalized.desde).slice(0, 10)} → ${String(normalized.hasta).slice(0, 10)}`,
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

export function resolveToolDateRange(
  rawArgs: Record<string, unknown>,
  opts?: { explicitYearFromMessage?: number | null },
): AiDateRange {
  const requested =
    opts?.explicitYearFromMessage ?? extractYearFromToolArgs(rawArgs) ?? null;
  const normalized = normalizePeriodParams(rawArgs, opts?.explicitYearFromMessage);
  const resolved = parseYearValue(normalized.anio);
  const range = resolveAiDateRange(normalized);

  if (import.meta.env.DEV) {
    console.log('[tool:year-requested]', `requested=${requested ?? 'none'}`);
    console.log('[tool:year-resolved]', `resolved=${resolved ?? 'none'}`);
    console.log('[tool:date-range]', `range=${range.desde} → ${range.hasta}`);
  }

  return range;
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
