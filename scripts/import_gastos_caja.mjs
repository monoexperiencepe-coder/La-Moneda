/**
 * Importa gastos de caja desde "GASTOS E INGRESOS.xlsx" (hoja GASTOS) a public.gastos_caja.
 * NO escribe en public.gastos (gastos operativos por vehículo).
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 * Excel: argumento, o GASTOS_INGRESOS_XLSX / EXCEL_GASTOS_INGRESOS en .env.
 *
 * DRY_RUN=1 por defecto. Import real (borra gastos_caja de la empresa e inserta de nuevo):
 *   $env:DRY_RUN='0'; node scripts/import_gastos_caja.mjs "C:\\ruta\\GASTOS E INGRESOS.xlsx"
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { loadGastosIngresosWorkbook } from './gastos_ingresos_excel_parse.mjs'
import { normalizeSqlDate } from './sql_date_normalize.mjs'

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

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function toRow(empresa_id, row) {
  const fechaMeta = normalizeSqlDate(row.fecha)
  const fecha = fechaMeta.fecha
  if (!fecha) return null
  const concepto = String(row.observacion ?? '').trim().slice(0, 2000)
  const comentarios = `Excel GASTOS fila ${row.excelRow}`.slice(0, 2000)
  return {
    empresa_id,
    fecha,
    concepto: concepto || '(sin concepto)',
    monto: row.monto,
    categoria: 'CAJA_GENERAL',
    comentarios,
    excel_extra: {
      source: 'gastos_ingresos_xlsx',
      sheet: 'GASTOS',
      row: row.excelRow,
      fecha_excel_raw: fechaMeta.original ?? row.fecha,
      ...(fechaMeta.adjusted ? { fecha_ajuste: fechaMeta.note } : {}),
    },
  }
}

async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('gastos_caja').insert(batch)
    if (error) throw new Error(`[gastos_caja insert] lote ${i}: ${error.message}`)
    console.log(`  [gastos_caja] +${batch.length}`)
  }
}

async function main() {
  const xlsxPath = resolveXlsxPath()
  console.log('--- import_gastos_caja ---')
  console.log('Excel:', xlsxPath)
  console.log('DRY_RUN:', dryRun ? '1 (no borra ni inserta)' : '0 (BORRAR gastos_caja empresa + INSERT)')

  if (!existsSync(xlsxPath)) throw new Error(`No existe: ${xlsxPath}`)
  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const parsed = loadGastosIngresosWorkbook(xlsxPath)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const rows = []
  let skippedFecha = 0
  for (const g of parsed.gastosCaja) {
    const r = toRow(empresaId, g)
    if (!r) {
      skippedFecha++
      continue
    }
    rows.push(r)
  }

  console.log('\nFilas Excel (GASTOS):', parsed.gastosCaja.length)
  console.log('Filas listas para insertar:', rows.length)
  console.log('Omitidas (fecha inválida tras normalizar):', skippedFecha)

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se borró ni insertó nada.')
    console.log('Muestra (5):')
    for (const r of rows.slice(0, 5)) {
      console.log(JSON.stringify({ fecha: r.fecha, concepto: r.concepto, monto: r.monto }))
    }
    console.log('\nImport real:  $env:DRY_RUN=\'0\'; node scripts/import_gastos_caja.mjs "' + xlsxPath + '"')
    return
  }

  console.log('\n--- Importación real ---')
  console.log('Borrando gastos_caja donde empresa_id =', empresaId, '…')
  const { error: delErr } = await supabase.from('gastos_caja').delete().eq('empresa_id', empresaId)
  if (delErr) throw new Error(`[gastos_caja delete] ${delErr.message}`)

  if (rows.length) await insertChunks(supabase, rows)
  console.log('\nListo. Filas insertadas:', rows.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
