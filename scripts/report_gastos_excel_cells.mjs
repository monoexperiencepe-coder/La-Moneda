/**
 * Lista gastos con procedencia Excel (excel_extra del import `gastos_la_moneda_xlsx`)
 * y muestra la celda aproximada en la hoja GASTOS (fila + columnas fecha/monto).
 *
 * Requiere .env con VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (o alias), VITE_EMPRESA_ID.
 *
 * Uso (PowerShell):
 *   node scripts/report_gastos_excel_cells.mjs
 *   node scripts/report_gastos_excel_cells.mjs --dic 2026
 *   node scripts/report_gastos_excel_cells.mjs --year 1900
 *   node scripts/report_gastos_excel_cells.mjs --monto 250
 *
 * Notas:
 * - col_fecha / col_monto en excel_extra son índices 0-based (columna A = 0), como sheet_to_json.
 * - La cabecera del archivo está en fila 1 de Excel; `row` en excel_extra es la fila Excel del gasto.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

/** Índice 0-based → letra de columna Excel (A, B, … Z, AA, …). */
export function colIndexToLetter(zeroBased) {
  const n = Number(zeroBased)
  if (!Number.isFinite(n) || n < 0) return '?'
  let dividend = n + 1
  let name = ''
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26
    name = String.fromCharCode(65 + modulo) + name
    dividend = Math.floor((dividend - modulo) / 26)
  }
  return name
}

function parseArgs(argv) {
  const out = { dicYear: null, yearEq: null, montoEq: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dic' && argv[i + 1]) {
      out.dicYear = Number(argv[++i])
      continue
    }
    if (a === '--year' && argv[i + 1]) {
      out.yearEq = Number(argv[++i])
      continue
    }
    if (a === '--monto' && argv[i + 1]) {
      out.montoEq = Number(argv[++i])
      continue
    }
  }
  return out
}

function formatRow(ex) {
  if (!ex || typeof ex !== 'object') return null
  if (ex.source !== 'gastos_la_moneda_xlsx') return null
  const row = ex.row
  const cf = ex.col_fecha
  const cm = ex.col_monto
  if (row == null || cf == null || cm == null) return null
  const Lf = colIndexToLetter(cf)
  const Lm = colIndexToLetter(cm)
  return {
    sheet: ex.sheet ?? 'GASTOS',
    excelRow: row,
    celdaFecha: `${Lf}${row}`,
    celdaMonto: `${Lm}${row}`,
    monthHeader: ex.month_header ?? '',
    vehicleLine: (ex.vehicle_line ?? '').slice(0, 80),
    descripcion: (ex.descripcion ?? '').slice(0, 80),
  }
}

const env = { ...process.env, ...loadDotEnv() }
const url = (env.VITE_SUPABASE_URL ?? '').trim()
const serviceKey = (
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()

const flags = parseArgs(process.argv)

async function main() {
  if (!url || !serviceKey) {
    console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
    process.exit(1)
  }
  if (!empresaId) {
    console.error('Falta VITE_EMPRESA_ID')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  let query = supabase
    .from('gastos')
    .select('id, fecha, monto, tipo_gasto, motivo, comentarios, excel_extra')
    .eq('empresa_id', empresaId)
    .not('excel_extra', 'is', null)

  if (Number.isFinite(flags.dicYear)) {
    const y = flags.dicYear
    query = query.gte('fecha', `${y}-12-01`).lte('fecha', `${y}-12-31`)
    console.log(`--- Gastos importados desde Excel con fecha en dic/${y} ---\n`)
  } else if (Number.isFinite(flags.yearEq)) {
    const y = flags.yearEq
    query = query.gte('fecha', `${y}-01-01`).lte('fecha', `${y}-12-31`)
    console.log(`--- Gastos importados desde Excel con año ${y} (fecha en BD) ---\n`)
  } else if (Number.isFinite(flags.montoEq)) {
    const m = flags.montoEq
    query = query.gte('monto', m - 0.005).lte('monto', m + 0.005)
    console.log(`--- Gastos importados desde Excel con monto ≈ ${m} ---\n`)
  } else {
    console.log('--- Últimos 80 gastos con excel_extra (cualquier fecha) ---')
    console.log('Tip: node scripts/report_gastos_excel_cells.mjs --dic 2026')
    console.log('     node scripts/report_gastos_excel_cells.mjs --year 1900')
    console.log('     node scripts/report_gastos_excel_cells.mjs --monto 250\n')
  }

  query = query.order('fecha', { ascending: false }).limit(Number.isFinite(flags.dicYear) || Number.isFinite(flags.yearEq) || Number.isFinite(flags.montoEq) ? 500 : 80)

  const { data, error } = await query
  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const rows = data ?? []
  if (rows.length === 0) {
    console.log('Sin filas. Si el gasto no tiene excel_extra, no vino de import_gastos_reales (app manual, otro script o migración).')
    process.exit(0)
  }

  for (const g of rows) {
    const loc = formatRow(g.excel_extra)
    const src = g.excel_extra?.source
    if (!loc) {
      console.log(`id=${g.id} fecha=${g.fecha} monto=${g.monto} tipo_gasto=${g.tipo_gasto} | excel_extra sin celdas (source=${src ?? '?'})`)
      continue
    }
    console.log(
      [
        `id=${g.id}`,
        `BD fecha=${g.fecha}`,
        `monto=${g.monto}`,
        `tipo_gasto=${g.tipo_gasto ?? ''}`,
        `hoja=${loc.sheet}`,
        `fila Excel=${loc.excelRow}`,
        `celda fecha=${loc.celdaFecha}`,
        `celda monto=${loc.celdaMonto}`,
        `bloque mes="${loc.monthHeader}"`,
        loc.vehicleLine ? `vehículo=${loc.vehicleLine}` : '',
        loc.descripcion ? `desc=${loc.descripcion}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    )
  }

  console.log(`\nTotal listados: ${rows.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
