/**
 * Import limpio de ingresos desde Excel tabular (sin parser de GASTOS E INGRESOS).
 *
 * Columnas esperadas (fila 1 = cabeceras, primera fila de datos = fila 2):
 *   - placa
 *   - fecha_periodo  (YYYY-MM-DD; típicamente el 1.er día del mes → se guarda el último día del mismo mes)
 *   - ingres           (también acepta: ingreso, monto)
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 * Excel: primer argumento (ruta), o CLEAN_INGRESOS_XLSX / INGRESOS_CLEAN_XLSX en .env.
 * Hoja: --sheet "NOMBRE" (nombre exacto). Si se omite, se elige la primera hoja cuyas cabeceras
 * tengan placa + fecha_periodo/fecha + ingres/ingreso/monto.
 *
 * DRY_RUN=1 por defecto. Import real:
 *   $env:DRY_RUN='0'; node scripts/import_ingresos_clean.mjs "C:\\ruta\\ingresos.xlsx" --sheet "INGRESOS_IMPORT_APP"
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { normPlaca } from './gastos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

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

const env = { ...process.env, ...loadDotEnv() }
const url = (env.VITE_SUPABASE_URL ?? '').trim()
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const chunkSize = Math.max(50, Math.min(500, Number(env.CHUNK_SIZE) || 300))

/**
 * @returns {{ xlsxPath: string | null, sheetName: string | null }}
 */
function parseCli(argv) {
  const args = argv.slice(2)
  let sheetName = null
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--sheet') {
      const v = args[++i]
      if (v == null || String(v).startsWith('--')) throw new Error('--sheet requiere un nombre de hoja, ej: --sheet "INGRESOS_IMPORT_APP"')
      sheetName = String(v).trim()
      continue
    }
    if (a.startsWith('--')) throw new Error(`Argumento desconocido: ${a}`)
    positional.push(a)
  }
  const xlsxPath = positional[0]?.trim() ? positional[0].trim() : null
  return { xlsxPath, sheetName: sheetName?.trim() ? sheetName : null }
}

function resolveXlsxPath(cliPath) {
  if (cliPath) return isAbsolute(cliPath) ? cliPath : resolve(root, cliPath)
  const g = (env.CLEAN_INGRESOS_XLSX || env.INGRESOS_CLEAN_XLSX || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'ingresos_clean.xlsx')
}

function sheetHasImportColumns(ws) {
  if (!ws) return false
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  if (!matrix.length) return false
  const { colPlaca, colFecha, colMonto } = resolveColumns(matrix[0] || [])
  return colPlaca != null && colFecha != null && colMonto != null
}

function pickSheet(wb, explicitSheetName) {
  const names = wb.SheetNames ?? []
  console.log('SheetNames:', JSON.stringify(names))

  if (explicitSheetName != null && String(explicitSheetName).trim() !== '') {
    const want = String(explicitSheetName).trim()
    if (!names.includes(want)) {
      throw new Error(`La hoja indicada en --sheet no existe: "${want}". Hojas disponibles: ${names.join(', ')}`)
    }
    console.log('Hoja usada (--sheet):', want)
    return want
  }

  for (const n of names) {
    if (sheetHasImportColumns(wb.Sheets[n])) {
      console.log('Hoja usada (auto-detectada):', n)
      return n
    }
  }

  throw new Error(
    `Ninguna hoja tiene las columnas requeridas (placa + fecha_periodo/fecha + ingres|ingreso|monto). SheetNames: ${names.join(', ')}`,
  )
}

function foldHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

/** YYYY-MM-DD calendario válido */
function parseFechaPeriodo(raw) {
  if (raw == null || raw === '') return { ok: false, fecha: null, note: 'vacío' }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const p = XLSX.SSF.parse_date_code(raw)
    if (!p || !p.y) return { ok: false, fecha: null, note: 'serial_invalido' }
    const ymd = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
    return validateYmd(ymd) ? { ok: true, fecha: ymd, note: null } : { ok: false, fecha: null, note: 'serial_fuera_calendario' }
  }
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { ok: false, fecha: null, note: 'formato_no_YYYY-MM-DD' }
  return validateYmd(s) ? { ok: true, fecha: s, note: null } : { ok: false, fecha: null, note: 'fecha_invalida' }
}

function validateYmd(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const [y, mo, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100
}

/** Último día del mes calendario de `fecha` (YYYY-MM-DD). Ej: 2026-01-01 → 2026-01-31; 2024-02-01 → 2024-02-29 */
function endOfMonthDate(fecha) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const [y, mo] = fecha.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function parseMontoClean(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw).replace(/,/g, '.').replace(/[^\d.-]/g, '').trim()
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function resolveColumns(headerRow) {
  const idx = {}
  for (let c = 0; c < headerRow.length; c++) {
    const k = foldHeader(headerRow[c])
    if (!k) continue
    idx[k] = c
  }
  const colPlaca = idx.placa ?? idx['patente'] ?? null
  let colFecha = idx.fecha_periodo ?? idx.fecha ?? idx['fecha_period'] ?? null
  let colMonto =
    idx.ingres ??
    idx.ingreso ??
    idx.monto ??
    idx.importe ??
    idx['ingresos'] ??
    null

  return { colPlaca, colFecha, colMonto, idx }
}

async function fetchPlacaToId(supabase, empresa) {
  const page = 1000
  let from = 0
  const map = new Map()
  for (;;) {
    const { data, error } = await supabase.from('vehiculos').select('id, placa').eq('empresa_id', empresa).range(from, from + page - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    for (const v of data) {
      const p = normPlaca(v.placa)
      if (!p) continue
      const id = Number(v.id)
      map.set(p, id)
      const flat = p.replace(/-/g, '')
      if (flat !== p) map.set(flat, id)
    }
    if (data.length < page) break
    from += page
  }
  return map
}

function lookupVid(placa, placaToId) {
  const p = normPlaca(placa)
  if (!p) return null
  if (placaToId.has(p)) return placaToId.get(p)
  const flat = p.replace(/-/g, '')
  if (flat !== p && placaToId.has(flat)) return placaToId.get(flat)
  return null
}

function toIngresoRow(empresa_id, { fecha, vehicle_id, monto, comentarios, excel_extra }) {
  return {
    empresa_id,
    fecha,
    fecha_registro: fecha,
    vehicle_id,
    tipo: 'ALQUILER',
    sub_tipo: null,
    fecha_desde: null,
    fecha_hasta: null,
    metodo_pago: 'Efectivo',
    metodo_pago_detalle: 'Excel import limpio (import_ingresos_clean.mjs)',
    celular_metodo: null,
    signo: '+',
    monto,
    moneda: 'PEN',
    tipo_cambio: null,
    monto_pen_referencia: monto,
    comentarios: comentarios.slice(0, 2000),
    detalle_operativo: null,
    tipo_operacion: null,
    estado_pago: null,
    excel_extra,
  }
}

async function countIngresos(supabase, empresa) {
  const { count, error } = await supabase.from('ingresos').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('ingresos').insert(batch)
    if (error) throw new Error(`[ingresos insert] lote ${i}: ${error.message}`)
    console.log(`  [ingresos] +${batch.length} (total ${Math.min(i + chunkSize, rows.length)}/${rows.length})`)
  }
}

function summarizeByYear(rows) {
  const m = new Map()
  for (const r of rows) {
    const y = Number(String(r.fecha ?? '').slice(0, 4))
    if (!Number.isFinite(y)) continue
    m.set(y, (m.get(y) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0])
}

async function main() {
  const cli = parseCli(process.argv)
  const xlsxPath = resolveXlsxPath(cli.xlsxPath)
  console.log('--- import_ingresos_clean ---')
  console.log('Excel:', xlsxPath)
  if (cli.sheetName) console.log('--sheet:', cli.sheetName)
  console.log('DRY_RUN:', dryRun ? '1 (no borra ni inserta)' : '0 (BORRAR ingresos empresa + INSERT)')

  if (!existsSync(xlsxPath)) throw new Error(`No existe: ${xlsxPath}`)
  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const wb = XLSX.readFile(xlsxPath)
  const sheetName = pickSheet(wb, cli.sheetName)
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Hoja vacía o inexistente: ${sheetName}`)
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  if (matrix.length < 2) throw new Error('El Excel debe tener cabecera y al menos una fila de datos')

  const { colPlaca, colFecha, colMonto } = resolveColumns(matrix[0] || [])
  if (colPlaca == null || colFecha == null || colMonto == null) {
    console.error('Cabeceras detectadas en fila 1:', (matrix[0] || []).map((h) => foldHeader(h)).filter(Boolean))
    throw new Error(
      'Faltan columnas: se requiere placa, fecha_periodo (o fecha), y ingres|ingreso|monto. Revisa la fila 1 del Excel.',
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const current = await countIngresos(supabase, empresaId)
  console.log('\nIngresos actuales en Supabase (esta empresa):', current)

  const placaToId = await fetchPlacaToId(supabase, empresaId)
  const omitidos = []
  const rows = []
  let totalFilasDatos = 0

  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] || []
    const excelRow = i + 1
    const placaRaw = line[colPlaca]
    const fechaRaw = line[colFecha]
    const montoRaw = line[colMonto]

    const allEmpty = [placaRaw, fechaRaw, montoRaw].every((c) => c == null || String(c).trim() === '')
    if (allEmpty) continue

    totalFilasDatos++

    const placa = normPlaca(placaRaw != null ? String(placaRaw) : '')
    if (!placa) {
      omitidos.push({ excelRow, motivo: 'placa_vacia', placa: placaRaw, fecha: fechaRaw, monto: montoRaw })
      continue
    }

    const fd = parseFechaPeriodo(fechaRaw)
    if (!fd.ok) {
      omitidos.push({ excelRow, motivo: `fecha_invalida:${fd.note}`, placa, fecha: fechaRaw, monto: montoRaw })
      continue
    }

    const monto = parseMontoClean(montoRaw)
    if (monto == null || !(monto > 0)) {
      omitidos.push({ excelRow, motivo: 'monto_invalido_o_no_positivo', placa, fecha: fd.fecha, monto: montoRaw })
      continue
    }

    const vid = lookupVid(placa, placaToId)
    if (vid == null) {
      omitidos.push({ excelRow, motivo: 'placa_sin_vehicle_id', placa, fecha: fd.fecha, monto })
      continue
    }

    const fechaOriginal = fd.fecha
    const fechaFinal = endOfMonthDate(fechaOriginal)
    if (!fechaFinal) {
      omitidos.push({ excelRow, motivo: 'fin_de_mes_invalido', placa, fecha: fechaOriginal, monto })
      continue
    }

    const comentarios = `Import limpio — Excel fila ${excelRow} — ${placa}`
    rows.push(
      toIngresoRow(empresaId, {
        fecha: fechaFinal,
        vehicle_id: vid,
        monto,
        comentarios,
        excel_extra: {
          source: 'import_ingresos_clean',
          sheet: sheetName,
          row: excelRow,
          placa_excel: placa,
          fecha_periodo_original: fechaOriginal,
          fecha_periodo_fin_mes: fechaFinal,
        },
      }),
    )
  }

  const fechasFinales = rows.map((r) => r.fecha).filter(Boolean).sort()
  const minFechaFinal = fechasFinales[0] ?? null
  const maxFechaFinal = fechasFinales[fechasFinales.length - 1] ?? null
  const fechasOrig = rows.map((r) => r.excel_extra?.fecha_periodo_original).filter(Boolean).sort()
  const minFechaOrig = fechasOrig[0] ?? null
  const maxFechaOrig = fechasOrig[fechasOrig.length - 1] ?? null
  const byYear = summarizeByYear(rows)

  console.log('\n--- Resumen (parse limpio) ---')
  console.log('Total filas de datos (no vacías):', totalFilasDatos)
  console.log('Filas listas para insertar:', rows.length)
  console.log('Filas omitidas:', omitidos.length)
  console.log('Min fecha original (Excel):', minFechaOrig ?? '—')
  console.log('Max fecha original (Excel):', maxFechaOrig ?? '—')
  console.log('Min fecha FINAL guardada (fin de mes):', minFechaFinal ?? '—')
  console.log('Max fecha FINAL guardada (fin de mes):', maxFechaFinal ?? '—')
  console.log('Conteo por año (según fecha final):')
  for (const [y, c] of byYear) console.log(`  ${y}: ${c}`)

  if (omitidos.length) {
    console.log('\nOmitidos (muestra hasta 30):')
    for (const o of omitidos.slice(0, 30)) {
      console.log(`  fila ${o.excelRow} ${o.motivo} placa=${o.placa ?? ''} fecha=${o.fecha ?? ''} monto=${o.monto ?? ''}`)
    }
    if (omitidos.length > 30) console.log(`  … (${omitidos.length - 30} más)`)
  }

  if (dryRun) {
    console.log('\n--- DRY_RUN: fecha original → fecha final (fin de mes) ---')
    const muestra = Math.min(40, rows.length)
    for (let j = 0; j < muestra; j++) {
      const r = rows[j]
      const orig = r.excel_extra?.fecha_periodo_original ?? '—'
      const fin = r.fecha
      const pl = r.excel_extra?.placa_excel ?? ''
      const er = r.excel_extra?.row ?? ''
      console.log(`  fila_excel=${er} placa=${pl}  ${orig} → ${fin}`)
    }
    if (rows.length > muestra) console.log(`  … (${rows.length - muestra} más)`)
    console.log('Min fecha original:', minFechaOrig ?? '—')
    console.log('Max fecha original:', maxFechaOrig ?? '—')
    console.log('Min fecha final guardada:', minFechaFinal ?? '—')
    console.log('Max fecha final guardada:', maxFechaFinal ?? '—')

    console.log('\n✓ DRY_RUN: no se borró ni insertó nada.')
    console.log('Import real:  $env:DRY_RUN=\'0\'; node scripts/import_ingresos_clean.mjs "' + xlsxPath + '"')
    return
  }

  console.log('\n--- Importación real ---')
  console.log('Borrando ingresos donde empresa_id =', empresaId, '…')
  const { error: delErr } = await supabase.from('ingresos').delete().eq('empresa_id', empresaId)
  if (delErr) throw new Error(`[ingresos delete] ${delErr.message}`)

  const afterDel = await countIngresos(supabase, empresaId)
  console.log('Ingresos tras borrado:', afterDel, '(esperado 0)')

  if (rows.length) await insertChunks(supabase, rows)
  const final = await countIngresos(supabase, empresaId)
  console.log('\nListo. Ingresos finales:', final, '(esperado', rows.length + ')')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
