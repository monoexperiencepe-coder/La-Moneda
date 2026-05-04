/**
 * Parser compartido: hoja ancha GASTOS (fecha|monto por mes).
 * Usado por import_gastos_reales.mjs y audit_gastos_por_vehiculo.mjs.
 *
 * Cabeceras "VERSA 20 BRA-504" pueden tener números en columnas >A: se detectan aparte para no perder el bloque.
 */

import { existsSync } from 'fs'
import XLSX from 'xlsx'

export function normPlaca(p) {
  if (p == null || typeof p !== 'string') return ''
  const s = p.trim().toUpperCase().replace(/\s+/g, '').replace(/[()[\]]/g, '')
  if (s === '—' || s === '-' || s === '–') return ''
  return s
}

function placaLookupKeysFromExtracted(extracted) {
  const n = normPlaca(extracted)
  if (!n) return []
  const keys = [n]
  const noHyphen = n.replace(/-/g, '')
  if (noHyphen && noHyphen !== n) keys.push(noHyphen)
  if (n.includes('-')) return [...new Set(keys)]
  const m3 = n.match(/^([A-Z]{3})([0-9]{3})$/)
  if (m3) keys.push(`${m3[1]}-${m3[2]}`)
  const m2 = n.match(/^([A-Z]{2})([0-9]{4})$/)
  if (m2) keys.push(`${m2[1]}-${m2[2]}`)
  const m4 = n.match(/^([A-Z])([A-Z0-9]{2})([0-9]{3})$/)
  if (m4) keys.push(`${m4[1]}${m4[2]}-${m4[3]}`)
  return [...new Set(keys)]
}

export function lookupPlacaInMap(extracted, placaToId) {
  for (const k of placaLookupKeysFromExtracted(extracted)) {
    if (placaToId.has(k)) return placaToId.get(k)
  }
  return null
}

export function normNumeroInterno(s) {
  if (s == null) return ''
  const t = String(s).trim()
  if (!t) return ''
  return t.replace(/^0+/, '') || '0'
}

function serialToDateOnly(serial) {
  if (serial == null || typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const p = XLSX.SSF.parse_date_code(serial)
  if (!p || !p.y) return null
  const mm = String(p.m).padStart(2, '0')
  const dd = String(p.d).padStart(2, '0')
  return `${p.y}-${mm}-${dd}`
}

function fixGastoCategoria(tipo) {
  const t = (tipo || '').toUpperCase()
  if (['GASTOS FIJOS', 'FIJO', 'SUELDO', 'SEGURO'].some((x) => t.includes(x))) return 'GASTOS_FIJOS'
  if (['DOCUMENT', 'TRIBUT', 'SOAT', 'RT-', 'AFOCAT', 'NOTARIAL', 'IMPUESTO'].some((x) => t.includes(x))) {
    return 'GASTOS_TRIBUTARIOS'
  }
  if (t.includes('OTROS GASTOS')) return 'GASTOS_PROVISIONALES'
  return 'GASTOS_MECANICOS'
}

function parseMonto(cell) {
  if (typeof cell === 'number' && Number.isFinite(cell)) return Math.abs(cell)
  if (typeof cell === 'string') {
    const s = cell.replace(/S\/?\s*/gi, '').replace(/,/g, '').trim()
    const n = Number.parseFloat(s)
    return Number.isFinite(n) ? Math.abs(n) : null
  }
  return null
}

function rowHasNumericOrMoneyInValueColumns(row) {
  for (let i = 1; i < row.length; i++) {
    const v = row[i]
    if (typeof v === 'number' && Number.isFinite(v)) return true
    if (typeof v === 'string' && parseMonto(v) != null) return true
  }
  return false
}

const FECHA_MIN_YEAR = 1990
const FECHA_MAX_YEAR = 2100

function parseFechaCell(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return serialToDateOnly(raw)
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
    if (dmy) {
      const dd = String(dmy[1]).padStart(2, '0')
      const mm = String(dmy[2]).padStart(2, '0')
      return `${dmy[3]}-${mm}-${dd}`
    }
    const n = Number.parseFloat(s.replace(',', '.'))
    if (Number.isFinite(n) && n > 25000 && n < 65000) {
      const d = serialToDateOnly(n)
      if (d) return d
    }
  }
  return null
}

function finalizeCalendarDateForInsert(tentativeYmd) {
  if (tentativeYmd == null || typeof tentativeYmd !== 'string') return { ok: false }
  const m = tentativeYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { ok: false }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return { ok: false }
  if (y < FECHA_MIN_YEAR || y > FECHA_MAX_YEAR) return { ok: false }
  if (mo < 1 || mo > 12) return { ok: false }
  const last = new Date(y, mo, 0).getDate()
  if (d < 1) return { ok: false }
  if (d > last) {
    const fixed = `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return { ok: true, fecha: fixed, clamped: true, tentative: tentativeYmd }
  }
  return { ok: true, fecha: tentativeYmd, clamped: false }
}

const PLACA_BODY = `(?:[A-Z]{2,3}-[0-9]{2,4}|[A-Z][A-Z0-9]{2}-[0-9]{3}|[A-Z][A-Z0-9]{2}[0-9]{3}|[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{4})`

function normalizeVehicleHeaderText(line) {
  return String(line ?? '')
    .trim()
    .toUpperCase()
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractPlaca(line) {
  const normalized = normalizeVehicleHeaderText(line)
  if (!normalized) return null
  const re = new RegExp(`\\b(${PLACA_BODY})\\b`, 'g')
  let last = null
  let m
  while ((m = re.exec(normalized)) !== null) last = m[1]
  return last
}

function extractCarNoBeforePlaca(line) {
  const normalized = normalizeVehicleHeaderText(line)
  const m = normalized.match(new RegExp(`(\\d{1,3})\\s+${PLACA_BODY}\\b`))
  return m ? normNumeroInterno(m[1]) : null
}

function buildMonthHeaders(row0) {
  const headers = []
  for (let c = 2; c < row0.length; c += 2) {
    const label = row0[c]
    headers.push({ colFecha: c, colMonto: c + 1, label: typeof label === 'string' ? label.trim() : String(label ?? '') })
  }
  return headers
}

/**
 * Cabecera tipo "VERSA 20 BRA-504" con números en columnas >A (Excel suele dejar basura/metadata).
 * Sin esto, `hasNumeric` es true y la fila no entra en cabecera: los gastos siguientes se cargan al carro anterior.
 */
function isVehicleCabeceraConNumerosEnFila(desc) {
  if (!desc) return false
  const t = desc.trim()
  const u = t.toUpperCase()
  if (!/^(VERSA|YARIS|RIO|SOLUTO|VERNA|NISSAN|KIA|TOYOTA|HYUNDAI)\b/.test(u)) return false
  if (!extractPlaca(t)) return false
  return /\d{1,3}\s+[A-Za-z0-9]{1,3}-/.test(t)
}

/**
 * @param {string} path
 * @param {{ silentWarnings?: boolean }} [options]
 */
export function parseWorkbook(path, options = {}) {
  const { silentWarnings = false } = options
  if (!existsSync(path)) throw new Error(`No existe el archivo: ${path}`)
  const wb = XLSX.readFile(path)
  const sheetName = wb.SheetNames.includes('GASTOS') ? 'GASTOS' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  if (!rows.length) throw new Error('Hoja vacía')
  const monthHeaders = buildMonthHeaders(rows[0] || [])

  const out = []
  let currentVehicleLine = ''
  let currentPlaca = null
  let currentCarNo = null
  let skippedNoDate = 0
  let skippedNoVehicleContext = 0
  let vehicleHeaderRows = 0
  let dateClampedCount = 0
  let dateOmittedInvalidCount = 0
  const dateClampSamples = []
  const dateOmittedSamples = []
  const MAX_DATE_SAMPLES = 25
  let llantaMotivoHeaderSkipped = 0
  /** Tras omitir fila “llanta” como cabecera: gastos siguientes con contexto de vehículo válido (antes quedarían con cabecera llanta errónea). */
  let afterLlantaSkipPending = false
  let gastosHeredanVehiculoTrasFilaLlanta = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const a = row[0]
    const desc = typeof a === 'string' ? a.trim() : ''
    const hasNumeric = rowHasNumericOrMoneyInValueColumns(row)

    if (desc && hasNumeric && isVehicleCabeceraConNumerosEnFila(desc)) {
      afterLlantaSkipPending = false
      currentVehicleLine = desc
      currentPlaca = extractPlaca(desc)
      currentCarNo = extractCarNoBeforePlaca(desc)
      vehicleHeaderRows++
      continue
    }

    /** Columna A sin montos: suele ser cabecera de vehículo; llantas es motivo, no cambiar contexto. */
    if (desc && !hasNumeric && isLlantaGastoMotivoLine(desc)) {
      llantaMotivoHeaderSkipped++
      afterLlantaSkipPending = true
      continue
    }

    if (desc && !hasNumeric) {
      afterLlantaSkipPending = false
      currentVehicleLine = desc
      currentPlaca = extractPlaca(desc)
      currentCarNo = extractCarNoBeforePlaca(desc)
      vehicleHeaderRows++
      continue
    }

    if (!hasNumeric) continue
    if (!currentVehicleLine) {
      skippedNoVehicleContext++
      continue
    }

    for (const { colFecha, colMonto, label } of monthHeaders) {
      const rawFecha = row[colFecha]
      const rawMonto = row[colMonto]
      const monto = parseMonto(rawMonto)
      if (monto == null || monto === 0) continue

      const tentative = parseFechaCell(rawFecha)
      if (!tentative) {
        skippedNoDate++
        continue
      }
      const fin = finalizeCalendarDateForInsert(tentative)
      if (!fin.ok) {
        dateOmittedInvalidCount++
        if (dateOmittedSamples.length < MAX_DATE_SAMPLES) {
          dateOmittedSamples.push(
            `tentativa=${tentative} fila=${r + 1} mes="${label}" desc=${(desc || '').slice(0, 36)}`,
          )
        }
        continue
      }
      const fecha = fin.fecha
      if (fin.clamped) {
        dateClampedCount++
        if (dateClampSamples.length < MAX_DATE_SAMPLES) {
          dateClampSamples.push(`${fin.tentative} → ${fin.fecha} (fila ${r + 1}, mes "${label}")`)
        }
      }

      const tipo = desc.slice(0, 80) || 'GASTO'
      const categoria = fixGastoCategoria(desc)
      const comentarios = `[${label}] ${currentVehicleLine} — ${desc}`.slice(0, 2000)

      if (afterLlantaSkipPending) gastosHeredanVehiculoTrasFilaLlanta++

      out.push({
        fecha,
        fecha_registro: fecha,
        vehicle_placa: currentPlaca,
        vehicle_car_no: currentCarNo,
        vehicle_line: currentVehicleLine,
        tipo,
        sub_tipo: null,
        fecha_desde: null,
        fecha_hasta: null,
        metodo_pago: 'Otro',
        metodo_pago_detalle: 'Excel GASTOS LA MONEDA',
        celular_metodo: null,
        categoria,
        motivo: desc.slice(0, 500) || tipo,
        signo: '-',
        monto,
        pagado_a: '',
        comentarios,
        detalle_operativo: null,
        categoria_real: null,
        subcategoria: null,
        excel_extra: {
          source: 'gastos_la_moneda_xlsx',
          sheet: sheetName,
          row: r + 1,
          col_fecha: colFecha,
          col_monto: colMonto,
          month_header: label,
          vehicle_line: currentVehicleLine,
          descripcion: desc,
          ...(fin.clamped ? { fecha_celda_invalida: fin.tentative, fecha_ajustada_a_ultimo_dia_mes: true } : {}),
        },
      })
    }
  }

  if (!silentWarnings && dateClampedCount > 0) {
    console.warn(
      `[gastos import] ${dateClampedCount} fecha(s) fuera del mes fueron ajustadas al último día válido (ejemplos abajo en resumen DRY_RUN).`,
    )
  }
  if (!silentWarnings && dateOmittedInvalidCount > 0) {
    console.warn(
      `[gastos import] ${dateOmittedInvalidCount} celda(s) con fecha no válida omitidas (mes/año fuera de rango o día < 1).`,
    )
  }

  let gastosVehicleLineLlanta = 0
  for (const g of out) {
    if (isLlantaGastoMotivoLine(g.vehicle_line)) gastosVehicleLineLlanta++
  }

  return {
    sheetName,
    monthBlocks: monthHeaders.length,
    totalRows: rows.length,
    parsed: out,
    vehicleHeaderRows,
    llantaMotivoHeaderSkipped,
    gastosHeredanVehiculoTrasFilaLlanta,
    gastosVehicleLineLlanta,
    skippedNoDate,
    skippedNoVehicleContext,
    dateClampedCount,
    dateOmittedInvalidCount,
    dateClampSamples,
    dateOmittedSamples,
  }
}

/** Normaliza cabecera vehicle_line para coincidir con claves del JSON de alias. */
export function normalizeVehicleLineForAlias(s) {
  if (s == null) return ''
  return String(s).trim().toUpperCase().replace(/\s+/g, ' ')
}

/**
 * Texto en columna A que es motivo de gasto (llantas), no cabecera de vehículo.
 * Usa la misma normalización que alias (trim, mayúsculas, espacios colapsados).
 */
export function isLlantaGastoMotivoLine(desc) {
  const n = normalizeVehicleLineForAlias(desc)
  if (!n) return false
  const exact = new Set([
    '2 LLANTAS',
    'LLANTA',
    'LLANTAS',
    'COMPRA LLANTA',
    'COMPRA LLANTAS',
    'CAMBIO LLANTA',
    'CAMBIO DE LLANTAS',
    'CAMBIO DE LLANTA',
    'COMPRA DE LLANTA',
    'COMPRA DE LLANTAS',
  ])
  if (exact.has(n)) return true
  if (/^\d+\s+LLANTAS?$/.test(n)) return true
  if (/^COMPRA(\s+DE)?\s+LLANTAS?$/.test(n)) return true
  if (/^CAMBIO(\s+DE)?\s+LLANTAS?$/.test(n)) return true
  return false
}

/**
 * @param {Record<string, unknown>} obj claves = texto cabecera Excel, valores = vehicle_id (número)
 * @returns {Map<string, number>}
 */
export function buildAliasVehicleMapFromJson(obj) {
  const m = new Map()
  if (!obj || typeof obj !== 'object') return m
  for (const [k, v] of Object.entries(obj)) {
    const nk = normalizeVehicleLineForAlias(k)
    const id = Number(v)
    if (!nk || !Number.isFinite(id)) continue
    m.set(nk, id)
  }
  return m
}

/**
 * @param {Map<string, number> | null | undefined} aliasLineToVid mapa cabecera normalizada → vehicle_id
 */
export function resolveVehicleId(g, placaToId, carNoToIds, aliasLineToVid = null) {
  let vid = null
  let fromPlaca = false
  let fromCarNo = false
  let fromAlias = false
  if (g.vehicle_placa) {
    const idPlaca = lookupPlacaInMap(g.vehicle_placa, placaToId)
    if (idPlaca != null) {
      vid = idPlaca
      fromPlaca = true
    }
  }
  if (vid == null && g.vehicle_car_no) {
    const set = carNoToIds.get(g.vehicle_car_no)
    if (set && set.size === 1) {
      vid = [...set][0]
      fromCarNo = true
    }
  }
  if (vid == null && aliasLineToVid && aliasLineToVid.size > 0 && g.vehicle_line && !g.vehicle_placa) {
    const k = normalizeVehicleLineForAlias(g.vehicle_line)
    const idAlias = aliasLineToVid.get(k)
    if (idAlias != null && Number.isFinite(idAlias)) {
      vid = idAlias
      fromAlias = true
    }
  }
  return { vid, fromPlaca, fromCarNo, fromAlias }
}

export function classifySinVehiculo(g, placaToId, carNoToIds) {
  const set = g.vehicle_car_no ? carNoToIds.get(g.vehicle_car_no) : null

  if (g.vehicle_car_no && set && set.size > 1) return 'num_interno_ambiguo'

  if (g.vehicle_placa && normPlaca(g.vehicle_placa) && lookupPlacaInMap(g.vehicle_placa, placaToId) == null) {
    return 'placa_no_en_supabase'
  }

  if (g.vehicle_car_no && (!set || set.size === 0)) return 'num_interno_sin_coincidencia'

  if (g.vehicle_placa && !normPlaca(g.vehicle_placa)) return 'placa_vacia_o_invalida'

  return 'sin_placa_regex_ni_num_util'
}
