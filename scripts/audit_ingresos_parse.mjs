/**
 * Auditoría solo lectura del parse de la hoja INGRESOS del Excel "GASTOS E INGRESOS.xlsx".
 *
 * Objetivo:
 * - reproducir la lógica actual de parseIngresosLong()
 * - mostrar cómo se está infiriendo el año
 * - detectar señales de problema (meses repetidos, años fuera de rango, wraps sospechosos)
 *
 * Uso:
 *   node scripts/audit_ingresos_parse.mjs [ruta.xlsx]
 *
 * Opcional:
 * - usa .env para resolver vehicle_id por placa si están VITE_SUPABASE_URL,
 *   VITE_EMPRESA_ID y SUPABASE_SERVICE_ROLE_KEY
 *
 * NO inserta ni modifica base de datos.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import {
  detectIngresoBlocks,
  detectIngresoYearColorMap,
  parseIngresosLong,
  parseFechaFlexible,
} from './gastos_ingresos_excel_parse.mjs'
import { normPlaca } from './gastos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const DEFAULT_YEAR = 2022
const DEFAULT_MONTH = 4

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

function loadDotEnv() {
  const p = resolve(root, '.env')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

function resolveXlsxPath() {
  const env = { ...process.env, ...loadDotEnv() }
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function getIngresoSheet(workbook) {
  const exact = workbook.SheetNames.find((n) => n === 'INGRESOS ')
  if (exact) return exact
  return workbook.SheetNames.find((n) => n.trim().toUpperCase() === 'INGRESOS') || 'INGRESOS '
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

async function fetchPlacaToId() {
  const env = { ...process.env, ...loadDotEnv() }
  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
  if (!url || !key || !empresaId) return null

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const page = 1000
  let from = 0
  const map = new Map()
  for (;;) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa')
      .eq('empresa_id', empresaId)
      .range(from, from + page - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    for (const v of data) {
      const p = normPlaca(v.placa)
      if (!p) continue
      map.set(p, Number(v.id))
      const flat = p.replace(/-/g, '')
      if (flat !== p) map.set(flat, Number(v.id))
    }
    if (data.length < page) break
    from += page
  }
  return map
}

function lookupVehicleId(placa, placaToId) {
  if (!placaToId) return null
  const p = normPlaca(placa)
  if (!p) return null
  if (placaToId.has(p)) return placaToId.get(p)
  const flat = p.replace(/-/g, '')
  if (flat !== p && placaToId.has(flat)) return placaToId.get(flat)
  return null
}

function summarizeCounts(items) {
  const m = new Map()
  for (const item of items) m.set(item, (m.get(item) || 0) + 1)
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

function plausibleYear(y) {
  const current = new Date().getFullYear()
  return y >= 2015 && y <= current + 1
}

function auditIngresos(rows, placaToId) {
  const blocks = detectIngresoBlocks(rows)
  const dataStartRow = 5
  const records = []
  const issues = {
    repeatedMonthWithoutWrap: [],
    invalidDates: [],
    suspiciousYears: [],
    wraps: [],
    blocksWithoutInicio: [],
  }

  for (const b of blocks) {
    const inicio = parseInicioOpForBlock(rows, b.carCol)
    let year = inicio ? Number(inicio.slice(0, 4)) : DEFAULT_YEAR
    let monthNumBase = inicio ? Number(inicio.slice(5, 7)) : DEFAULT_MONTH
    const inicioFuente = inicio ? `inicio_op=${inicio}` : `fallback=${DEFAULT_YEAR}-${String(DEFAULT_MONTH).padStart(2, '0')}`
    if (!Number.isFinite(year) || !Number.isFinite(monthNumBase)) {
      year = DEFAULT_YEAR
      monthNumBase = DEFAULT_MONTH
    }
    if (!inicio) {
      issues.blocksWithoutInicio.push({
        placa: b.placa,
        carCol: b.carCol,
        monthCol: b.monthCol,
        ingCol: b.ingCol,
      })
    }

    let prevMesIdx = null
    for (let r = dataStartRow; r < rows.length; r++) {
      const row = rows[r] || []
      const mesLabelRaw = row[b.monthCol]
      const monto = parseMonto(row[b.ingCol])
      if (mesLabelRaw == null || String(mesLabelRaw).trim() === '') continue
      if (monto == null || monto === 0) continue
      const mi = mesNum(mesLabelRaw)
      if (!mi) continue

      const mesTexto = String(mesLabelRaw).trim()
      const yearBefore = year
      let wrapApplied = false
      if (prevMesIdx != null && (mi < prevMesIdx || (prevMesIdx === 12 && mi === 1))) {
        year++
        wrapApplied = true
        issues.wraps.push({
          placa: b.placa,
          excelRow: r + 1,
          prevMesIdx,
          mesIdx: mi,
          yearBefore,
          yearAfter: year,
          mesTexto,
        })
      } else if (prevMesIdx != null && mi === prevMesIdx) {
        issues.repeatedMonthWithoutWrap.push({
          placa: b.placa,
          excelRow: r + 1,
          mesTexto,
          year,
          inicioFuente,
        })
      }
      prevMesIdx = mi

      const fecha = `${year}-${String(mi).padStart(2, '0')}-01`
      const vehicleId = lookupVehicleId(b.placa, placaToId)
      const record = {
        vehicleId,
        placa: b.placa,
        mesTexto,
        anioDetectado: year,
        fechaFinal: fecha,
        monto,
        excelRow: r + 1,
        carCol: b.carCol,
        ingCol: b.ingCol,
        inicioOp: inicio,
        inicioFuente,
        yearDerivedByWrap: wrapApplied,
      }
      records.push(record)

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) issues.invalidDates.push(record)
      if (!plausibleYear(year)) issues.suspiciousYears.push(record)
    }
  }

  return { blocks, records, issues }
}

async function main() {
  const path = resolveXlsxPath()
  console.log('=== audit_ingresos_parse ===\n')
  console.log('Archivo:', path)
  if (!existsSync(path)) {
    console.error('No existe el archivo. Pasa la ruta como argumento o define GASTOS_INGRESOS_XLSX en .env')
    process.exit(1)
  }

  const wb = XLSX.readFile(path, { cellStyles: true })
  const ingresoSheet = getIngresoSheet(wb)
  const ws = wb.Sheets[ingresoSheet]
  if (!ws) throw new Error(`No existe la hoja de ingresos: ${ingresoSheet}`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  const placaToId = await fetchPlacaToId()

  const { blocks, records, issues } = auditIngresos(rows, placaToId)
  const { ingresos: ingresosColor } = parseIngresosLong(rows, ws)
  const legend = detectIngresoYearColorMap(ws)

  const fechasOld = records.map((r) => r.fechaFinal).sort()
  const byYearOld = summarizeCounts(records.map((r) => r.anioDetectado))
  const byMonthOld = summarizeCounts(records.map((r) => r.mesTexto))

  const colorRecords = ingresosColor.map((r) => ({
    vehicleId: lookupVehicleId(r.placa, placaToId),
    placa: r.placa,
    mesTexto: r.mesLabel,
    anioDetectado: Number(String(r.fecha).slice(0, 4)),
    fechaFinal: r.fecha,
    monto: r.monto,
  }))
  const fechasColor = colorRecords.map((r) => r.fechaFinal).sort()
  const byYearColor = summarizeCounts(colorRecords.map((r) => r.anioDetectado))
  const byVehicleOld = summarizeCounts(records.map((r) => r.vehicleId ?? `placa:${r.placa ?? 'sin_placa'}`))
  const byVehicleColor = summarizeCounts(colorRecords.map((r) => r.vehicleId ?? `placa:${r.placa ?? 'sin_placa'}`))

  console.log('\n--- Cómo interpreta años hoy (versión anterior) ---')
  console.log('1) Para cada bloque/vehículo, busca una fecha cercana en la fila 4 del bloque (`parseInicioOpForBlock`).')
  console.log(`2) Si no encuentra esa fecha, arranca con fallback ${DEFAULT_YEAR}-${String(DEFAULT_MONTH).padStart(2, '0')}.`)
  console.log('3) Luego recorre los meses hacia abajo y solo sube el año cuando el número de mes baja respecto al anterior (ej. diciembre -> enero, o agosto -> abril).')
  console.log('4) El parser actual NO usa colores del Excel para diferenciar años.')

  console.log('\n--- Detección de año por color (nueva lógica) ---')
  console.log('Leyenda color->año detectada (de celdas con año 2018..2026):', legend.size, 'colores')
  for (const [k, y] of [...legend.entries()].sort((a, b) => a[1] - b[1])) {
    console.log(`  ${y}: ${k}`)
  }
  console.log(
    'En la lógica por color: año de celda mes (si está en leyenda) > año por celda ingreso/monto > heredado del último año por color > inicio_operación del bloque.',
  )

  console.log('\n--- Muestra de 50 registros parseados ---')
  for (const r of records.slice(0, 50)) {
    console.log(
      JSON.stringify({
        vehicle_id: r.vehicleId,
        placa: r.placa,
        mes_detectado: r.mesTexto,
        anio_detectado: r.anioDetectado,
        fecha_final: r.fechaFinal,
        monto: r.monto,
        inicio_op: r.inicioOp,
        fuente_anio: r.inicioFuente,
        anio_por_wrap: r.yearDerivedByWrap,
      }),
    )
  }

  console.log('\n--- Resumen (anterior / secuencial) ---')
  console.log('Bloques detectados:', blocks.length)
  console.log('Registros parseados:', records.length)
  if (fechasOld.length) console.log('Rango de fechas detectado:', fechasOld[0], '→', fechasOld[fechasOld.length - 1])

  console.log('\nRegistros por año:')
  for (const [year, count] of byYearOld) console.log(`  ${year}: ${count}`)

  console.log('\nRegistros por mes:')
  for (const [month, count] of byMonthOld) console.log(`  ${month}: ${count}`)

  console.log('\n--- DRY_RUN comparación (anterior vs color) ---')
  console.log('Registros (old/new):', records.length, '/', colorRecords.length)
  if (fechasOld.length || fechasColor.length) {
    console.log(
      'Rango fechas old/new:',
      `${fechasOld[0] ?? '—'} → ${fechasOld[fechasOld.length - 1] ?? '—'}`,
      '/',
      `${fechasColor[0] ?? '—'} → ${fechasColor[fechasColor.length - 1] ?? '—'}`,
    )
  }
  console.log('\nRegistros por año (new/color):')
  for (const [year, count] of byYearColor) console.log(`  ${year}: ${count}`)
  console.log('\nMuestra 50 (new/color):')
  for (const r of colorRecords.slice(0, 50)) {
    console.log(
      JSON.stringify({
        vehicle_id: r.vehicleId,
        placa: r.placa,
        mes_detectado: r.mesTexto,
        anio_detectado: r.anioDetectado,
        fecha_final: r.fechaFinal,
        monto: r.monto,
      }),
    )
  }
  console.log('\nRegistros por vehículo (top 20 cambios en conteo old vs new):')
  const oldMap = new Map(byVehicleOld)
  const newMap = new Map(byVehicleColor)
  const keys = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs = [...keys]
    .map((k) => ({ k, old: oldMap.get(k) || 0, new: newMap.get(k) || 0 }))
    .filter((x) => x.old !== x.new)
    .sort((a, b) => Math.abs(b.new - b.old) - Math.abs(a.new - a.old))
  if (!diffs.length) {
    console.log('  (sin diferencias en conteo por vehículo)')
  } else {
    for (const d of diffs.slice(0, 20)) {
      console.log(`  ${d.k}: old=${d.old}, new=${d.new}, delta=${d.new - d.old}`)
    }
  }

  console.log('\n--- Problemas detectados ---')
  console.log('Bloques sin fecha base (`inicio_op`) y usando fallback:', issues.blocksWithoutInicio.length)
  console.log('Meses repetidos consecutivos sin cambio de año:', issues.repeatedMonthWithoutWrap.length)
  console.log('Fechas inválidas construidas:', issues.invalidDates.length)
  console.log('Años sospechosos (fuera de rango 2015..año actual+1):', issues.suspiciousYears.length)
  console.log('Cambios de año por wrap de mes:', issues.wraps.length)

  if (issues.blocksWithoutInicio.length) {
    console.log('\nMuestra bloques sin inicio_op (hasta 10):')
    for (const x of issues.blocksWithoutInicio.slice(0, 10)) console.log(JSON.stringify(x))
  }

  if (issues.repeatedMonthWithoutWrap.length) {
    console.log('\nMuestra meses repetidos sin año (hasta 10):')
    for (const x of issues.repeatedMonthWithoutWrap.slice(0, 10)) console.log(JSON.stringify(x))
  }

  if (issues.suspiciousYears.length) {
    console.log('\nMuestra años sospechosos (hasta 10):')
    for (const x of issues.suspiciousYears.slice(0, 10)) {
      console.log(
        JSON.stringify({
          vehicle_id: x.vehicleId,
          placa: x.placa,
          mes_detectado: x.mesTexto,
          anio_detectado: x.anioDetectado,
          fecha_final: x.fechaFinal,
          monto: x.monto,
          fuente_anio: x.inicioFuente,
        }),
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
