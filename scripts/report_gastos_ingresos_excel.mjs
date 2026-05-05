/**
 * Reporte solo lectura del Excel "GASTOS E INGRESOS.xlsx".
 *
 * Uso:
 *   node scripts/report_gastos_ingresos_excel.mjs [ruta.xlsx]
 *   node scripts/report_gastos_ingresos_excel.mjs [ruta.xlsx] --with-supabase
 *
 * --with-supabase: usa .env (VITE_EMPRESA_ID + service role) y cuenta cuántos ingresos
 * tendrían vehicle_id resuelto por placa (no inserta).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { loadGastosIngresosWorkbook } from './gastos_ingresos_excel_parse.mjs'
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

async function fetchPlacaToId(supabase, empresaId) {
  const page = 1000
  let from = 0
  const map = new Map()
  for (;;) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa')
      .eq('empresa_id', empresaId)
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const v of data) {
      const p = normPlaca(v.placa)
      if (p) map.set(p, Number(v.id))
    }
    if (data.length < page) break
    from += page
  }
  return map
}

function resolvePath() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const a0 = (argv[0] || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const env = { ...process.env, ...loadDotEnv() }
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

async function main() {
  const withSb = process.argv.includes('--with-supabase')
  const path = resolvePath()
  console.log('=== report_gastos_ingresos_excel ===\n')
  console.log('Archivo:', path)
  if (!existsSync(path)) {
    console.error('No existe el archivo. Pasa la ruta como argumento o define GASTOS_INGRESOS_XLSX en .env')
    process.exit(1)
  }

  const d = loadGastosIngresosWorkbook(path)

  console.log('\n--- 1) Hojas ---')
  console.log(d.sheetNames.join(', '))

  console.log('\n--- 2) Clasificación ---')
  console.log('Ingresos (matriz → filas largas, efectivo por mes y placa):', d.ingresos.length)
  console.log('Gastos caja (hoja GASTOS, sin vehículo):', d.gastosCaja.length)
  console.log('Inversiones / costo por línea (hoja VALOR DE INVERSION):', d.inversiones.length)
  console.log('Bloques de vehículo detectados en INGRESOS:', d.ingresoBlocks.length)

  const ingFechas = d.ingresos.map((x) => x.fecha).sort()
  if (ingFechas.length) {
    console.log('\n--- 3) Ingresos (Excel) ---')
    console.log('Rango fechas (primer día de mes):', ingFechas[0], '→', ingFechas[ingFechas.length - 1])
    const sum = d.ingresos.reduce((s, x) => s + x.monto, 0)
    console.log('Suma montos (PEN asumido en hoja):', sum.toFixed(2))
  }

  const gasFechas = d.gastosCaja.map((x) => x.fecha).sort()
  if (gasFechas.length) {
    console.log('\n--- 4) Gastos caja (no operativos por carro) ---')
    console.log('Rango fechas:', gasFechas[0], '→', gasFechas[gasFechas.length - 1])
    console.log('Suma montos:', d.gastosCaja.reduce((s, x) => s + x.monto, 0).toFixed(2))
  }

  console.log('\n--- 5) Modelo recomendado ---')
  console.log('A) Ingresos: reemplazar `ingresos` de la empresa vía script dedicado (tras validar fechas).')
  console.log('B) Gastos caja: NO mezclar con `gastos` operativos; opciones: tabla `gastos_caja` o categoría+campo origen (definir después).')
  console.log('C) Inversión: tabla nueva `inversiones_vehiculo` (ver supabase/migration_inversiones_vehiculo.sql).')

  if (!withSb) {
    console.log('\n(Sin --with-supabase: no se consultó Supabase.)')
    console.log('Para contar vínculo placa → vehicle_id: node scripts/report_gastos_ingresos_excel.mjs "' + path + '" --with-supabase')
    return
  }

  const env = { ...process.env, ...loadDotEnv() }
  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
  if (!url || !key || !empresaId) throw new Error('Faltan VITE_SUPABASE_URL, service role o VITE_EMPRESA_ID')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const placaToId = await fetchPlacaToId(supabase, empresaId)
  let conVeh = 0
  let sinVeh = 0
  for (const r of d.ingresos) {
    const p = normPlaca(r.placa)
    if (p && placaToId.has(p)) conVeh++
    else sinVeh++
  }
  console.log('\n--- 6) Supabase (empresa actual) ---')
  console.log('Ingresos Excel con placa resuelta a vehículo:', conVeh)
  console.log('Ingresos Excel sin vehículo en BD (placa no encontrada):', sinVeh)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
