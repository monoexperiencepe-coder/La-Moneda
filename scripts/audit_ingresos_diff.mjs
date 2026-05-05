/**
 * Compara parser viejo (secuencial) vs parser nuevo (año por color)
 * y explica por qué algunos registros ya no entran.
 *
 * Uso:
 *   node scripts/audit_ingresos_diff.mjs [ruta.xlsx]
 *
 * No usa Supabase.
 */

import { existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import {
  detectIngresoBlocks,
  detectIngresoYearColorMap,
  parseIngresosLong,
} from './gastos_ingresos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

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
  return MESES_ES[normMes(s)] ?? null
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

function parseFechaFlexible(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const p = XLSX.SSF.parse_date_code(raw)
    if (!p || !p.y) return null
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!m) return null
  let yy = Number(m[3])
  const mo = Number(m[2])
  const dd = Number(m[1])
  if (yy < 100) yy += 2000
  if (!Number.isFinite(yy) || !Number.isFinite(mo) || !Number.isFinite(dd)) return null
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
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

function styleColorKey(style) {
  const fg = style?.fgColor
  if (!fg) return null
  if (fg.rgb) return `rgb:${String(fg.rgb).toUpperCase()}`
  if (fg.theme != null) return `theme:${fg.theme}:tint:${fg.tint != null ? String(fg.tint) : '0'}`
  return null
}

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function ingresoSheetName(wb) {
  return wb.SheetNames.find((n) => n.trim().toUpperCase() === 'INGRESOS') || 'INGRESOS '
}

function oldParse(rows) {
  const blocks = detectIngresoBlocks(rows)
  const out = []
  const dataStartRow = 5
  for (const b of blocks) {
    const inicio = parseInicioOpForBlock(rows, b.carCol)
    let year = inicio ? Number(inicio.slice(0, 4)) : 2022
    let monthNumBase = inicio ? Number(inicio.slice(5, 7)) : 4
    if (!Number.isFinite(year) || !Number.isFinite(monthNumBase)) {
      year = 2022
      monthNumBase = 4
    }
    let prevMesIdx = null
    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || []
      const mesLabel = row[b.monthCol]
      const monto = parseMonto(row[b.ingCol])
      if (mesLabel == null || String(mesLabel).trim() === '') continue
      if (monto == null || monto === 0) continue
      const mi = mesNum(mesLabel)
      if (!mi) continue
      if (prevMesIdx != null && (mi < prevMesIdx || (prevMesIdx === 12 && mi === 1))) year++
      prevMesIdx = mi
      out.push({
        placa: b.placa,
        fecha: `${year}-${String(mi).padStart(2, '0')}-01`,
        monto,
        mesLabel: String(mesLabel).trim(),
        excelRow: r + 1,
        ingCol: b.ingCol,
        carCol: b.carCol,
        monthCol: b.monthCol,
      })
    }
  }
  return out
}

function recKey(r) {
  return `${r.placa}|${r.excelRow}|${r.ingCol}|${r.monthCol}|${r.mesLabel}|${r.monto}`
}

function compareWithReasons(rows, ws) {
  const blocks = detectIngresoBlocks(rows)
  const legend = detectIngresoYearColorMap(ws)
  const dataStartRow = 5
  const missing = []
  const reasonsCount = new Map()

  const inc = (k) => reasonsCount.set(k, (reasonsCount.get(k) || 0) + 1)

  for (const b of blocks) {
    const inicio = parseInicioOpForBlock(rows, b.carCol)
    let year = inicio ? Number(inicio.slice(0, 4)) : 2022
    let monthNumBase = inicio ? Number(inicio.slice(5, 7)) : 4
    if (!Number.isFinite(year) || !Number.isFinite(monthNumBase)) {
      year = 2022
      monthNumBase = 4
    }
    let prevMesIdx = null
    let currentYearByColor = null

    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || []
      const mesLabelRaw = row[b.monthCol]
      const monto = parseMonto(row[b.ingCol])
      if (mesLabelRaw == null || String(mesLabelRaw).trim() === '') continue
      if (monto == null || monto === 0) continue
      const mi = mesNum(mesLabelRaw)
      if (!mi) continue

      // Old always includes.
      if (prevMesIdx != null && (mi < prevMesIdx || (prevMesIdx === 12 && mi === 1))) year++
      prevMesIdx = mi
      const oldRow = {
        placa: b.placa,
        fecha: `${year}-${String(mi).padStart(2, '0')}-01`,
        monto,
        mesLabel: String(mesLabelRaw).trim(),
        excelRow: r + 1,
        ingCol: b.ingCol,
        carCol: b.carCol,
        monthCol: b.monthCol,
      }

      // New decision.
      let reason = null
      if (legend.size > 0) {
        const addrMonth = XLSX.utils.encode_cell({ r, c: b.monthCol })
        const addrIngreso = XLSX.utils.encode_cell({ r, c: b.ingCol })
        const ckMonth = styleColorKey(ws[addrMonth]?.s)
        const ckIngreso = styleColorKey(ws[addrIngreso]?.s)
        const yearFromMonth = ckMonth && legend.has(ckMonth) ? legend.get(ckMonth) : null
        const yearFromIngreso = ckIngreso && legend.has(ckIngreso) ? legend.get(ckIngreso) : null
        const yearFromColor = yearFromMonth ?? yearFromIngreso
        if (yearFromColor != null) {
          currentYearByColor = yearFromColor
        } else if (currentYearByColor == null) {
          reason = 'falta de color/año'
        }
      }

      if (reason) {
        missing.push(oldRow)
        inc(reason)
      }
    }
  }

  return { missing, reasonsCount }
}

function main() {
  const path = resolveXlsxPath()
  console.log('=== audit_ingresos_diff ===')
  console.log('Archivo:', path)
  if (!existsSync(path)) throw new Error(`No existe: ${path}`)

  const wb = XLSX.readFile(path, { cellStyles: true })
  const ws = wb.Sheets[ingresoSheetName(wb)]
  if (!ws) throw new Error('No se encontró hoja INGRESOS')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })

  const oldRows = oldParse(rows)
  const { ingresos: newRows } = parseIngresosLong(rows, ws)

  const oldSet = new Map(oldRows.map((r) => [recKey(r), r]))
  const newSet = new Set(newRows.map((r) => recKey({ ...r, monthCol: r.ingCol - 1 })))
  const dropped = [...oldSet.entries()].filter(([k]) => !newSet.has(k)).map(([, r]) => r)

  const { missing, reasonsCount } = compareWithReasons(rows, ws)
  const reasonByKey = new Map(missing.map((r) => [recKey(r), 'falta de color/año']))

  console.log('\n--- Resumen comparación ---')
  console.log('Parser viejo:', oldRows.length)
  console.log('Parser nuevo:', newRows.length)
  console.log('Registros que ya no entran:', dropped.length)
  console.log('\nMotivos:')
  const orderedReasons = [
    'falta de color/año',
    'celda vacía',
    'monto inválido',
    'bloque de vehículo no detectado',
    'otro motivo',
  ]
  for (const r of orderedReasons) {
    const c = reasonsCount.get(r) || 0
    console.log(`  ${r}: ${c}`)
  }

  console.log('\n--- 64 registros que no entran ---')
  for (const r of dropped) {
    console.log(
      JSON.stringify({
        placa: r.placa,
        excel_row: r.excelRow,
        mes: r.mesLabel,
        fecha_vieja: r.fecha,
        monto: r.monto,
        motivo_omision: reasonByKey.get(recKey(r)) || 'otro motivo',
      }),
    )
  }
}

try {
  main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
