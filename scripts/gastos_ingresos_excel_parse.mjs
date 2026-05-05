/**
 * Parser para el Excel "GASTOS E INGRESOS.xlsx" (hojas GASTOS, INGRESOS , VALOR DE INVERSION ).
 * Solo lectura de archivo; sin Supabase.
 */

import { existsSync } from 'fs'
import XLSX from 'xlsx'

const SHEET_GASTOS = 'GASTOS'
const SHEET_INGRESOS = 'INGRESOS '
const SHEET_INV = 'VALOR DE INVERSION '

/** Fechas estrictamente posteriores a esta (YYYY-MM-DD) se consideran sospechosas para import. */
export const INGRESO_FECHA_TOPE_AUDITORIA = '2026-05-31'

export function ingresoFechaEsSospechosa(fecha) {
  return Boolean(fecha && String(fecha) > INGRESO_FECHA_TOPE_AUDITORIA)
}

const MESES_ES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function normMes(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function mesNum(s) {
  const k = normMes(s)
  return MESES_ES[k] ?? null
}

function serialToDateOnly(serial) {
  if (serial == null || typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const p = XLSX.SSF.parse_date_code(serial)
  if (!p || !p.y) return null
  const mm = String(p.m).padStart(2, '0')
  const dd = String(p.d).padStart(2, '0')
  return `${p.y}-${mm}-${dd}`
}

/** DD/MM/YY, DD.MM.YYYY, DD/MM/YYYY */
export function parseFechaFlexible(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return serialToDateOnly(raw)
  const s = String(raw).trim()
  const m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (!m) return null
  let dd = Number(m[1])
  let mo = Number(m[2])
  let yy = Number(m[3])
  if (yy < 100) yy += 2000
  if (!Number.isFinite(dd) || !Number.isFinite(mo) || !Number.isFinite(yy)) return null
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
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

function styleColorKey(style) {
  const fg = style?.fgColor
  if (!fg) return null
  if (fg.rgb) return `rgb:${String(fg.rgb).toUpperCase()}`
  if (fg.theme != null) {
    const tint = fg.tint != null ? String(fg.tint) : '0'
    return `theme:${fg.theme}:tint:${tint}`
  }
  return null
}

export function extractPlacaFromCarroHeader(h) {
  if (!h || typeof h !== 'string') return null
  const m = h.match(/([A-Z0-9]{2,3}-[0-9]{3})/i)
  return m ? m[1].toUpperCase().replace(/\s+/g, '') : null
}

/** @returns {{ carCol: number, placa: string|null, ingCol: number, monthCol: number }[]} */
export function detectIngresoBlocks(rows) {
  const r1 = rows[1] || []
  const r2 = rows[2] || []
  const blocks = []
  for (let c = 0; c < r1.length; c++) {
    const h = r1[c]
    if (!h || typeof h !== 'string') continue
    if (!/carro/i.test(h)) continue
    const placa = extractPlacaFromCarroHeader(h)
    let ingCol = null
    for (let d = c; d < Math.min(c + 10, r2.length); d++) {
      const lab = String(r2[d] ?? '')
        .trim()
        .toUpperCase()
      if (lab.startsWith('INGRESO')) {
        ingCol = d
        break
      }
    }
    if (ingCol == null) continue
    const monthCol = ingCol > 0 ? ingCol - 1 : 0
    blocks.push({ carCol: c, placa, ingCol, monthCol })
  }
  return blocks
}

function parseInicioOpForBlock(rows, carCol) {
  const r3 = rows[3] || []
  const candidates = [r3[carCol], r3[carCol + 1], r3[carCol + 2]].filter(Boolean)
  for (const t of candidates) {
    const d = parseFechaFlexible(t)
    if (d) return d
  }
  return null
}

/**
 * Lee la leyenda de años por color (normalmente en la parte baja de la hoja INGRESOS)
 * y devuelve colorKey -> year.
 */
export function detectIngresoYearColorMap(ws) {
  const out = new Map()
  for (const [addr, cell] of Object.entries(ws || {})) {
    if (addr.startsWith('!')) continue
    const v = cell?.v
    const year = typeof v === 'number' ? v : Number(String(v ?? '').trim())
    if (!Number.isFinite(year)) continue
    if (year < 2018 || year > 2026) continue
    const key = styleColorKey(cell?.s)
    if (!key) continue
    if (!out.has(key)) out.set(key, year)
  }
  return out
}

function encodeCell(r0, c0) {
  return XLSX.utils.encode_cell({ r: r0, c: c0 })
}

/**
 * Por bloque: mayor número de mes (1–12) que tiene celda con color mapeado al año `targetYear`
 * (prioridad año por celda mes, luego por celda ingreso/monto), mismo criterio que el parser principal.
 */
/**
 * Fallback cuando no hay color ni herencia: año desde inicio_operación,
 * con ajuste si mes > último mes coloreado para ese año, o regla global 2026 (mes > 5).
 */
function resolveFallbackInicioYear(inicioYear, mesIdx, maxMesColorParaAnioInicio) {
  if (inicioYear == null) return null
  if (maxMesColorParaAnioInicio != null && mesIdx > maxMesColorParaAnioInicio) {
    return { year: inicioYear - 1, yearSource: 'fallback_inicio_ajustado' }
  }
  if (maxMesColorParaAnioInicio == null && inicioYear === 2026 && mesIdx > 5) {
    return { year: 2025, yearSource: 'fallback_inicio_regla_global_2026' }
  }
  return { year: inicioYear, yearSource: 'fallback_inicio_operacion' }
}

function maxMesConColorParaAnio(rows, b, ws, yearColorMap, targetYear, dataStartRow) {
  if (!ws || targetYear == null || !(targetYear >= 2018 && targetYear <= 2026)) return null
  let maxMi = null
  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r] || []
    const mesLabel = row[b.monthCol]
    const monto = parseMonto(row[b.ingCol])
    if (mesLabel == null || String(mesLabel).trim() === '') continue
    if (monto == null || monto === 0) continue
    const mi = mesNum(mesLabel)
    if (!mi) continue

    const colorMesKey = styleColorKey(ws[encodeCell(r, b.monthCol)]?.s)
    const colorMontoKey = styleColorKey(ws[encodeCell(r, b.ingCol)]?.s)
    const añoPorColorMes = colorMesKey && yearColorMap.has(colorMesKey) ? yearColorMap.get(colorMesKey) : null
    const añoPorColorMonto = colorMontoKey && yearColorMap.has(colorMontoKey) ? yearColorMap.get(colorMontoKey) : null

    let yColor = null
    if (añoPorColorMes != null && añoPorColorMes >= 2018 && añoPorColorMes <= 2026) yColor = añoPorColorMes
    else if (añoPorColorMonto != null && añoPorColorMonto >= 2018 && añoPorColorMonto <= 2026)
      yColor = añoPorColorMonto

    if (yColor === targetYear) {
      if (maxMi == null || mi > maxMi) maxMi = mi
    }
  }
  return maxMi
}

/**
 * Expande la matriz INGRESOS a filas largas (un movimiento por mes y vehículo).
 * `fecha` = primer día del mes del movimiento (contable mensual).
 */
export function parseIngresosLong(rows, ws = null) {
  const blocks = detectIngresoBlocks(rows)
  const out = []
  const dataStartRow = 5
  const yearColorMap = detectIngresoYearColorMap(ws)
  const hasColorLegend = yearColorMap.size > 0

  for (const b of blocks) {
    const inicio = parseInicioOpForBlock(rows, b.carCol)
    const inicioYear = (() => {
      if (!inicio || typeof inicio !== 'string') return null
      const y = Number(inicio.slice(0, 4))
      return Number.isFinite(y) && y >= 2018 && y <= 2026 ? y : null
    })()

    const maxMesColorParaAnioInicio =
      hasColorLegend && ws && inicioYear != null
        ? maxMesConColorParaAnio(rows, b, ws, yearColorMap, inicioYear, dataStartRow)
        : null

    /** Último año inferido solo desde color de celda mes o celda monto (para heredar). */
    let currentYearByColor = null

    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || []
      const mesLabel = row[b.monthCol]
      const monto = parseMonto(row[b.ingCol])
      if (mesLabel == null || String(mesLabel).trim() === '') continue
      if (monto == null || monto === 0) continue
      const mi = mesNum(mesLabel)
      if (!mi) continue

      let colorMesKey = null
      let colorMontoKey = null
      let añoPorColorMes = null
      let añoPorColorMonto = null

      if (ws && hasColorLegend) {
        const addrMonth = encodeCell(r, b.monthCol)
        const addrIngreso = encodeCell(r, b.ingCol)
        colorMesKey = styleColorKey(ws[addrMonth]?.s)
        colorMontoKey = styleColorKey(ws[addrIngreso]?.s)
        if (colorMesKey && yearColorMap.has(colorMesKey)) añoPorColorMes = yearColorMap.get(colorMesKey)
        if (colorMontoKey && yearColorMap.has(colorMontoKey)) añoPorColorMonto = yearColorMap.get(colorMontoKey)
      }

      let year = null
      let yearSource = null

      if (hasColorLegend) {
        // 1) Color celda MES (prioridad absoluta si está en leyenda).
        if (añoPorColorMes != null && añoPorColorMes >= 2018 && añoPorColorMes <= 2026) {
          year = añoPorColorMes
          yearSource = 'color_mes'
          currentYearByColor = añoPorColorMes
        } else if (añoPorColorMonto != null && añoPorColorMonto >= 2018 && añoPorColorMonto <= 2026) {
          // 2) Solo si el mes no tiene color válido: color celda MONTO/INGRESO.
          year = añoPorColorMonto
          yearSource = 'color_monto'
          currentYearByColor = añoPorColorMonto
        } else if (currentYearByColor != null && currentYearByColor >= 2018 && currentYearByColor <= 2026) {
          year = currentYearByColor
          yearSource = 'fallback_heredado'
        } else if (inicioYear != null) {
          const fb = resolveFallbackInicioYear(inicioYear, mi, maxMesColorParaAnioInicio)
          year = fb.year
          yearSource = fb.yearSource
        } else {
          continue
        }
      } else {
        // Sin leyenda de color: mismo fallback que con leyenda (maxMes siempre null aquí → puede aplicar regla global 2026).
        if (inicioYear != null) {
          const fb = resolveFallbackInicioYear(inicioYear, mi, null)
          year = fb.year
          yearSource = fb.yearSource
        } else continue
      }
      if (year == null || year < 2018 || year > 2026) continue

      const fecha = `${year}-${String(mi).padStart(2, '0')}-01`
      const sospechosa = ingresoFechaEsSospechosa(fecha)
      const errorGuardrailFecha = sospechosa
      out.push({
        placa: b.placa,
        fecha,
        monto,
        mesLabel: String(mesLabel).trim(),
        excelRow: r + 1,
        monthCol: b.monthCol,
        ingCol: b.ingCol,
        carCol: b.carCol,
        inicioOperacion: inicio ?? null,
        yearSource,
        colorMesKey,
        colorMontoKey,
        añoPorColorMes,
        añoPorColorMonto,
        añoFinal: year,
        maxMesColorAnioInicio: maxMesColorParaAnioInicio,
        sospechosa,
        errorGuardrailFecha,
      })
    }
  }
  return { blocks, ingresos: out }
}

/**
 * Auditoría: mismo recorrido que parseIngresosLong; registra una fila por cada celda de mes == mesIdx (1 = Enero).
 */
export function collectAuditFilasMes(rows, ws, mesIdx) {
  const blocks = detectIngresoBlocks(rows)
  const entries = []
  const dataStartRow = 5
  const yearColorMap = detectIngresoYearColorMap(ws)
  const hasColorLegend = yearColorMap.size > 0

  const pushOmitidoEnero = (base, motivo) => {
    entries.push({
      ...base,
      añoDetectado: null,
      yearSource: null,
      fechaFinal: null,
      incluido: false,
      motivoOmisión: motivo,
    })
  }

  for (const b of blocks) {
    const inicio = parseInicioOpForBlock(rows, b.carCol)
    const inicioYear = (() => {
      if (!inicio || typeof inicio !== 'string') return null
      const y = Number(inicio.slice(0, 4))
      return Number.isFinite(y) && y >= 2018 && y <= 2026 ? y : null
    })()

    const maxMesColorParaAnioInicio =
      hasColorLegend && ws && inicioYear != null
        ? maxMesConColorParaAnio(rows, b, ws, yearColorMap, inicioYear, dataStartRow)
        : null

    let currentYearByColor = null

    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || []
      const mesLabelRaw = row[b.monthCol]
      const mesLabel = mesLabelRaw != null ? String(mesLabelRaw).trim() : ''
      const monto = parseMonto(row[b.ingCol])
      const excelRow = r + 1

      if (mesLabelRaw == null || mesLabel === '') continue

      const mi = mesNum(mesLabelRaw)

      const baseCommon = {
        placa: b.placa,
        excelRow,
        mesLabel,
        monto,
        inicioOperacion: inicio ?? null,
        maxMesColorAnioInicio: maxMesColorParaAnioInicio,
        colorMesKey: null,
        colorMontoKey: null,
        añoPorColorMes: null,
        añoPorColorMonto: null,
      }

      if (monto == null || monto === 0) {
        if (mi === mesIdx) pushOmitidoEnero(baseCommon, 'monto_vacio_o_cero')
        continue
      }
      if (!mi) continue

      let colorMesKey = null
      let colorMontoKey = null
      let añoPorColorMes = null
      let añoPorColorMonto = null

      if (ws && hasColorLegend) {
        const addrMonth = encodeCell(r, b.monthCol)
        const addrIngreso = encodeCell(r, b.ingCol)
        colorMesKey = styleColorKey(ws[addrMonth]?.s)
        colorMontoKey = styleColorKey(ws[addrIngreso]?.s)
        if (colorMesKey && yearColorMap.has(colorMesKey)) añoPorColorMes = yearColorMap.get(colorMesKey)
        if (colorMontoKey && yearColorMap.has(colorMontoKey)) añoPorColorMonto = yearColorMap.get(colorMontoKey)
      }

      let year = null
      let yearSource = null

      if (hasColorLegend) {
        if (añoPorColorMes != null && añoPorColorMes >= 2018 && añoPorColorMes <= 2026) {
          year = añoPorColorMes
          yearSource = 'color_mes'
          currentYearByColor = añoPorColorMes
        } else if (añoPorColorMonto != null && añoPorColorMonto >= 2018 && añoPorColorMonto <= 2026) {
          year = añoPorColorMonto
          yearSource = 'color_monto'
          currentYearByColor = añoPorColorMonto
        } else if (currentYearByColor != null && currentYearByColor >= 2018 && currentYearByColor <= 2026) {
          year = currentYearByColor
          yearSource = 'fallback_heredado'
        } else if (inicioYear != null) {
          const fb = resolveFallbackInicioYear(inicioYear, mi, maxMesColorParaAnioInicio)
          year = fb.year
          yearSource = fb.yearSource
        } else {
          if (mi === mesIdx)
            pushOmitidoEnero({ ...baseCommon, colorMesKey, colorMontoKey, añoPorColorMes, añoPorColorMonto }, 'sin_color_sin_herencia_sin_inicio_operacion')
          continue
        }
      } else if (inicioYear != null) {
        const fb = resolveFallbackInicioYear(inicioYear, mi, null)
        year = fb.year
        yearSource = fb.yearSource
      } else {
        if (mi === mesIdx)
          pushOmitidoEnero({ ...baseCommon, colorMesKey, colorMontoKey, añoPorColorMes, añoPorColorMonto }, 'sin_leyenda_y_sin_inicio_operacion')
        continue
      }

      if (year == null || year < 2018 || year > 2026) {
        if (mi === mesIdx)
          pushOmitidoEnero(
            { ...baseCommon, colorMesKey, colorMontoKey, añoPorColorMes, añoPorColorMonto },
            `año_fuera_rango(${year})`,
          )
        continue
      }

      const fechaFinal = `${year}-${String(mi).padStart(2, '0')}-01`

      if (mi === mesIdx) {
        entries.push({
          ...baseCommon,
          colorMesKey,
          colorMontoKey,
          añoPorColorMes,
          añoPorColorMonto,
          añoDetectado: year,
          yearSource,
          fechaFinal,
          incluido: true,
          motivoOmisión: null,
        })
      }
    }
  }

  return { blocks, entries }
}

/** Gastos de caja (no por vehículo): OBSERVACION, FECHA, MONTO desde fila 3 (índice 2). */
export function parseGastosCaja(rows) {
  const out = []
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || []
    const obs = typeof row[0] === 'string' ? row[0].trim() : row[0] != null ? String(row[0]) : ''
    const fechaRaw = row[1]
    const monto = parseMonto(row[2])
    if (!obs && monto == null) continue
    if (monto == null || monto === 0) continue
    let fecha = parseFechaFlexible(fechaRaw)
    if (!fecha && typeof fechaRaw === 'number') fecha = serialToDateOnly(fechaRaw)
    if (!fecha) continue
    out.push({ observacion: obs || '(sin texto)', fecha, monto, excelRow: r + 1 })
  }
  return out
}

/** Hoja VALOR DE INVERSION : una fila por línea de costo de inversión por tipo de carro. */
export function parseInversionesValor(rows) {
  if (!rows.length) return []
  const hdr = (rows[0] || []).map((c) => String(c ?? '').trim())

  const colTipo = hdr.indexOf('TIPO CARRO')
  const colF = hdr.indexOf('F.COMPRA')
  const colVal = hdr.findIndex((h) => h.includes('VALOR') && h.includes('US'))
  const colGnv = hdr.findIndex((h) => h.replace(/\s+/g, '').toUpperCase() === 'G.GNV')
  const colNot = hdr.findIndex((h) => h.replace(/\s+/g, '').toUpperCase() === 'G.NOTARIAL')
  const colLeg = hdr.findIndex((h) => h.toLowerCase().includes('leg.firmas') || h.toLowerCase().includes('leg firmas'))
  const colSeg = hdr.findIndex((h) => h.toLowerCase().includes('seguro'))
  const colGps = hdr.findIndex((h) => h.replace(/\s+/g, '').toUpperCase().includes('GPS'))
  const colFund = hdr.findIndex((h) => h.toLowerCase().includes('fundas') || h.toLowerCase().includes('acc'))
  const colTot = hdr.findIndex((h) => h.includes('TOTAL') && h.includes('INV'))
  const colPen = hdr.findIndex((h) => h === 's/' || h.toLowerCase() === 's/.')

  const out = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const tipo = colTipo >= 0 ? String(row[colTipo] ?? '').trim() : ''
    if (!tipo) continue
    const fcompra = colF >= 0 ? parseFechaFlexible(row[colF]) : null
    const pick = (c) => (c >= 0 ? row[c] : null)
    const num = (v) => {
      if (v == null || v === '') return null
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(/,/g, ''))
      return Number.isFinite(n) ? n : null
    }
    out.push({
      descripcionExcel: tipo,
      fechaCompra: fcompra,
      valorCompraUsd: num(pick(colVal)),
      gastoGnvUsd: num(pick(colGnv)),
      gastoNotarialUsd: num(pick(colNot)),
      legFirmasUsd: num(pick(colLeg)),
      seguroUsd: num(pick(colSeg)),
      gpsUsd: num(pick(colGps)),
      fundasAccUsd: num(pick(colFund)),
      totalInversionUsd: num(pick(colTot)),
      totalInversionPen: num(pick(colPen >= 0 ? colPen : hdr.length - 1)),
      excelRow: r + 1,
    })
  }
  return out
}

export function loadGastosIngresosWorkbook(path) {
  if (!existsSync(path)) throw new Error(`No existe: ${path}`)
  // Importante: necesitamos estilos para inferir año por color en INGRESOS.
  const wb = XLSX.readFile(path, { cellStyles: true })
  const sheetIngresos = wb.SheetNames.includes(SHEET_INGRESOS)
    ? SHEET_INGRESOS
    : wb.SheetNames.find((n) => n.trim().toUpperCase() === 'INGRESOS') || 'INGRESOS '
  const sheetInv = wb.SheetNames.includes(SHEET_INV)
    ? SHEET_INV
    : wb.SheetNames.find((n) => n.toUpperCase().includes('INVERSION')) || SHEET_INV

  const wsG = wb.Sheets[SHEET_GASTOS]
  const wsI = wb.Sheets[sheetIngresos]
  const wsV = wb.Sheets[sheetInv]

  const rowsG = wsG ? XLSX.utils.sheet_to_json(wsG, { header: 1, raw: true, defval: null }) : []
  const rowsI = wsI ? XLSX.utils.sheet_to_json(wsI, { header: 1, raw: true, defval: null }) : []
  const rowsV = wsV ? XLSX.utils.sheet_to_json(wsV, { header: 1, raw: true, defval: null }) : []

  const gastosCaja = parseGastosCaja(rowsG)
  const { blocks, ingresos } = parseIngresosLong(rowsI, wsI)
  const inversiones = parseInversionesValor(rowsV)

  return {
    path,
    sheetNames: wb.SheetNames,
    gastosCaja,
    ingresoBlocks: blocks,
    ingresos,
    inversiones,
  }
}
