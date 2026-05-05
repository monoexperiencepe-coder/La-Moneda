/**
 * Normaliza fechas tipo SQL date (YYYY-MM-DD) para Postgres:
 * si el día supera el último día del mes, se ajusta (p. ej. 2022-02-29 → 2022-02-28).
 */

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function formatYmd(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * @param {string | null | undefined} ymd
 * @returns {{ fecha: string | null, original: string | null, adjusted: boolean, note?: string }}
 */
export function normalizeSqlDate(ymd) {
  if (ymd == null || String(ymd).trim() === '') {
    return { fecha: null, original: null, adjusted: false }
  }
  const s = String(ymd).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) {
    return { fecha: null, original: s, adjusted: false, note: 'formato_no_es_YYYY-MM-DD' }
  }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return { fecha: null, original: s, adjusted: false, note: 'parse_numerico_invalido' }
  }
  if (mo < 1 || mo > 12 || d < 1) {
    return { fecha: null, original: s, adjusted: false, note: 'mes_o_dia_fuera_de_rango' }
  }
  const maxD = lastDayOfMonth(y, mo)
  if (d <= maxD) {
    return { fecha: formatYmd(y, mo, d), original: s, adjusted: false }
  }
  return {
    fecha: formatYmd(y, mo, maxD),
    original: s,
    adjusted: true,
    note: `dia_${d}_ajustado_a_ultimo_dia_mes_${maxD}`,
  }
}
