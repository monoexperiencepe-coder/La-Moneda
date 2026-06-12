export const formatCurrency = (amount: number, currency = 'S/'): string => {
  return `${currency} ${amount.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatUSD = (amount: number): string => {
  return `US$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Zona horaria de negocio (presentación UI; no altera datos en Supabase). */
export const PERU_TIME_ZONE = 'America/Lima';

/** Fecha calendario de negocio (`YYYY-MM-DD`); no convierte instantes UTC. */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

function parseInstant(isoOrTimestamp: string): Date | null {
  const raw = isoOrTimestamp.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Solo fecha calendario en Lima a partir de un instante ISO/UTC (`created_at`). */
export function formatInstantDatePe(isoOrTimestamp: string | null | undefined): string {
  if (isoOrTimestamp == null || String(isoOrTimestamp).trim() === '') return '—';
  const d = parseInstant(String(isoOrTimestamp));
  if (!d) return '—';
  return d.toLocaleDateString('es-PE', {
    timeZone: PERU_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Fecha y hora en español (Perú / Lima); útil para `created_at`. Vacío o inválido → em dash. */
export function formatDateTimePe(isoOrTimestamp: string | null | undefined): string {
  if (isoOrTimestamp == null || String(isoOrTimestamp).trim() === '') return '—';
  const d = parseInstant(String(isoOrTimestamp));
  if (!d) return '—';
  return d.toLocaleString('es-PE', {
    timeZone: PERU_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const formatDateLong = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const getMonthName = (month: number): string => {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return months[month - 1] ?? '';
};

/** Fecha calendario de hoy en Perú (YYYY-MM-DD), sin desfase UTC. */
export const todayStr = (): string => {
  return new Date().toLocaleDateString('en-CA', { timeZone: PERU_TIME_ZONE });
};

/** Mañana en calendario Perú (YYYY-MM-DD). */
export const tomorrowStr = (): string => {
  const t = todayStr();
  const d = new Date(`${t}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Año mínimo para registros operativos (kilometraje, movimientos). */
export const REGISTRO_FECHA_MIN_YEAR = 2020;

export function registroFechaInputBounds(): { min: string; max: string } {
  const maxYear = Number(todayStr().slice(0, 4)) + 1;
  return {
    min: `${REGISTRO_FECHA_MIN_YEAR}-01-01`,
    max: `${maxYear}-12-31`,
  };
}

/** Días calendario entre dos fechas YYYY-MM-DD (to − from). */
export function diffCalendarDays(from: string, to: string): number {
  const a = new Date(from.slice(0, 10) + 'T00:00:00').getTime();
  const b = new Date(to.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Valida fecha de formulario (input type=date → YYYY-MM-DD).
 * Evita años absurdos (ej. 3222) y fechas imposibles.
 */
export function validateRegistroFechaInput(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const norm = toDateOnlyString(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    return { ok: false, error: 'Fecha no válida. Usa el selector de fecha.' };
  }
  const y = Number(norm.slice(0, 4));
  const m = Number(norm.slice(5, 7));
  const d = Number(norm.slice(8, 10));
  const check = new Date(`${norm}T12:00:00`);
  if (
    Number.isNaN(check.getTime()) ||
    check.getFullYear() !== y ||
    check.getMonth() + 1 !== m ||
    check.getDate() !== d
  ) {
    return { ok: false, error: 'Fecha no válida (día o mes incorrecto).' };
  }
  const maxYear = new Date().getFullYear() + 1;
  if (y < REGISTRO_FECHA_MIN_YEAR || y > maxYear) {
    return {
      ok: false,
      error: `El año debe estar entre ${REGISTRO_FECHA_MIN_YEAR} y ${maxYear}.`,
    };
  }
  return { ok: true, value: norm };
}

/**
 * Normaliza columnas `date` / ISO / objeto Date a `YYYY-MM-DD` para filtros y joins.
 * Evita que `String(Date)` ("Mon Apr 29...") rompa comparaciones de strings en resúmenes.
 */
export function toDateOnlyString(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return s.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = value;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(value).slice(0, 10);
}

export const isExpiringSoon = (dateStr: string, days = 30): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const diff = (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

export const isExpired = (dateStr: string): boolean => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
};

/** Monto compacto encima de barras en gráficos (legible sin saturar). */
export function formatMontoGraficoBarra(n: number): string {
  if (n === 0) return '';
  if (n >= 1_000_000) {
    return `S/${(n / 1_000_000).toLocaleString('es-PE', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}M`;
  }
  if (n >= 1000) {
    return `S/${(n / 1000).toLocaleString('es-PE', { maximumFractionDigits: n >= 100_000 ? 0 : 1, minimumFractionDigits: 0 })}k`;
  }
  return formatCurrency(n);
}
