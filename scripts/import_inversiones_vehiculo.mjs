/**
 * Importa filas de la hoja VALOR DE INVERSION  del Excel a public.inversiones_vehiculo.
 * NO mezcla con gastos operativos.
 *
 * Antes de import real: aplicar en Supabase SQL de supabase/migration_inversiones_vehiculo.sql
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 * Excel: argumento, o GASTOS_INGRESOS_XLSX / EXCEL_GASTOS_INGRESOS en .env.
 *
 * DRY_RUN=1 por defecto (solo resumen + muestra de filas). Import real:
 *   $env:DRY_RUN='0'; node scripts/import_inversiones_vehiculo.mjs "C:\\ruta\\GASTOS E INGRESOS.xlsx"
 *
 * Resolución de vehicle_id (en orden):
 *   1) Número al final de TIPO CARRO coincide con vehiculos.id de la empresa.
 *   2) Placa tipo XX-999 en el texto → match con vehiculos.placa.
 *   3) Palabras del texto vs "marca modelo" (normalizado, sin acentos).
 *
 * Fecha compra: se valida con scripts/sql_date_normalize.mjs (día inválido → último día del mes).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { loadGastosIngresosWorkbook, extractPlacaFromCarroHeader } from './gastos_ingresos_excel_parse.mjs'
import { normPlaca } from './gastos_excel_parse.mjs'
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
const chunkSize = Math.max(20, Math.min(200, Number(env.CHUNK_SIZE) || 80))

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function normTxt(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchVehiculos(supabase, empresa) {
  const page = 1000
  let from = 0
  const list = []
  for (;;) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa, marca, modelo')
      .eq('empresa_id', empresa)
      .range(from, from + page - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    list.push(...data)
    if (data.length < page) break
    from += page
  }
  return list
}

function placaMap(vehiculos) {
  const m = new Map()
  for (const v of vehiculos) {
    const p = normPlaca(v.placa)
    if (!p) continue
    m.set(p, Number(v.id))
    const flat = p.replace(/-/g, '')
    if (flat !== p) m.set(flat, Number(v.id))
  }
  return m
}

function idSet(vehiculos) {
  return new Set(vehiculos.map((v) => Number(v.id)))
}

/**
 * @returns {{ vehicle_id: number | null, method: string }}
 */
function resolveVehicle(descripcionExcel, vehiculos, byPlaca, ids) {
  const desc = String(descripcionExcel ?? '').trim()
  if (!desc) return { vehicle_id: null, method: 'empty' }

  const mSuffix = desc.match(/(\d+)\s*$/)
  if (mSuffix) {
    const cand = Number(mSuffix[1])
    if (ids.has(cand)) return { vehicle_id: cand, method: 'suffix_as_vehicle_id' }
  }

  const placa = extractPlacaFromCarroHeader(desc)
  if (placa) {
    const p = normPlaca(placa)
    if (p) {
      if (byPlaca.has(p)) return { vehicle_id: byPlaca.get(p), method: 'placa_in_text' }
      const flat = p.replace(/-/g, '')
      if (flat !== p && byPlaca.has(flat)) return { vehicle_id: byPlaca.get(flat), method: 'placa_flat' }
    }
  }

  const nd = normTxt(desc)
  if (nd.length < 2) return { vehicle_id: null, method: 'no_match' }

  let best = null
  let bestScore = 0
  for (const v of vehiculos) {
    const blob = normTxt(`${v.marca ?? ''} ${v.modelo ?? ''} ${v.placa ?? ''}`)
    if (!blob) continue
    const tokens = nd.split(' ').filter((t) => t.length >= 3)
    if (!tokens.length) continue
    let hit = 0
    for (const t of tokens) {
      if (blob.includes(t)) hit++
    }
    const score = hit / tokens.length
    if (score > bestScore) {
      bestScore = score
      best = Number(v.id)
    }
  }
  if (best != null && bestScore >= 0.51) return { vehicle_id: best, method: `fuzzy_marca_modelo_${bestScore.toFixed(2)}` }

  return { vehicle_id: null, method: 'no_match' }
}

function toRow(empresa_id, inv, vehicle_id, method, fechaMeta) {
  const extra = {
    source: 'gastos_ingresos_xlsx',
    sheet: 'VALOR DE INVERSION ',
    row: inv.excelRow,
    match_method: method,
  }
  if (fechaMeta.adjusted && fechaMeta.original) {
    extra.fecha_compra_excel_original = fechaMeta.original
    extra.fecha_compra_ajuste = fechaMeta.note ?? 'clamp_ultimo_dia_mes'
  }
  if (fechaMeta.note && !fechaMeta.fecha) {
    extra.fecha_compra_error = fechaMeta.note
  }
  return {
    empresa_id,
    vehicle_id,
    descripcion_excel: inv.descripcionExcel.slice(0, 2000),
    fecha_compra: fechaMeta.fecha,
    valor_compra_usd: inv.valorCompraUsd,
    gasto_gnv_usd: inv.gastoGnvUsd,
    gasto_notarial_usd: inv.gastoNotarialUsd,
    leg_firmas_usd: inv.legFirmasUsd,
    seguro_usd: inv.seguroUsd,
    gps_usd: inv.gpsUsd,
    fundas_accesorios_usd: inv.fundasAccUsd,
    total_inversion_usd: inv.totalInversionUsd,
    total_inversion_pen: inv.totalInversionPen,
    excel_extra: extra,
  }
}

async function tableReady(supabase) {
  const { error } = await supabase.from('inversiones_vehiculo').select('id').limit(1)
  if (error) {
    const msg = (error.message || '').toLowerCase()
    const missing =
      (msg.includes('relation') && msg.includes('does not exist')) ||
      msg.includes('could not find the table') ||
      msg.includes('schema cache')
    if (missing) return false
    throw new Error(error.message)
  }
  return true
}

async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('inversiones_vehiculo').insert(batch)
    if (error) throw new Error(`[inversiones_vehiculo insert] lote ${i}: ${error.message}`)
    console.log(`  [inversiones_vehiculo] +${batch.length}`)
  }
}

async function main() {
  const xlsxPath = resolveXlsxPath()
  console.log('--- import_inversiones_vehiculo ---')
  console.log('Excel:', xlsxPath)
  console.log('DRY_RUN:', dryRun ? '1 (no inserta)' : '0 (INSERT en inversiones_vehiculo)')

  if (!existsSync(xlsxPath)) throw new Error(`No existe: ${xlsxPath}`)
  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const parsed = loadGastosIngresosWorkbook(xlsxPath)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  if (!dryRun) {
    const ready = await tableReady(supabase)
    if (!ready) {
      console.error('\nLa tabla public.inversiones_vehiculo no existe o no es accesible.')
      console.error('Aplica primero: supabase/migration_inversiones_vehiculo.sql en el SQL editor de Supabase.')
      process.exit(2)
    }
  }

  const vehiculos = await fetchVehiculos(supabase, empresaId)
  const byPlaca = placaMap(vehiculos)
  const ids = idSet(vehiculos)

  const rows = []
  const stats = { conVid: 0, sinVid: 0, byMethod: {} }
  /** @type {{ excelRow: number, descripcion: string, desde: string, hasta: string, note?: string }[]} */
  const fechasCorregidas = []
  /** @type {{ excelRow: number, descripcion: string, raw: string | null, note?: string }[]} */
  const fechasInvalidas = []

  for (const inv of parsed.inversiones) {
    const fechaMeta = normalizeSqlDate(inv.fechaCompra)
    if (fechaMeta.adjusted && fechaMeta.original && fechaMeta.fecha) {
      fechasCorregidas.push({
        excelRow: inv.excelRow,
        descripcion: inv.descripcionExcel,
        desde: fechaMeta.original,
        hasta: fechaMeta.fecha,
        note: fechaMeta.note,
      })
    }
    if (inv.fechaCompra != null && String(inv.fechaCompra).trim() !== '' && !fechaMeta.fecha) {
      fechasInvalidas.push({
        excelRow: inv.excelRow,
        descripcion: inv.descripcionExcel,
        raw: fechaMeta.original,
        note: fechaMeta.note,
      })
    }
    const { vehicle_id, method } = resolveVehicle(inv.descripcionExcel, vehiculos, byPlaca, ids)
    stats.byMethod[method] = (stats.byMethod[method] || 0) + 1
    if (vehicle_id != null) stats.conVid++
    else stats.sinVid++
    rows.push(toRow(empresaId, inv, vehicle_id, method, fechaMeta))
  }

  console.log('\n--- Resumen ---')
  console.log('Filas inversión (Excel):', parsed.inversiones.length)
  console.log('Con vehicle_id resuelto:', stats.conVid)
  console.log('Sin vehicle_id:', stats.sinVid)
  console.log('Por método:', stats.byMethod)
  console.log('Fechas ajustadas (día > último del mes):', fechasCorregidas.length)
  console.log('Fechas no asignables (null en DB):', fechasInvalidas.length)

  if (dryRun) {
    if (fechasCorregidas.length) {
      console.log('\n--- Fechas corregidas (ejemplos; máx. 15) ---')
      for (const c of fechasCorregidas.slice(0, 15)) {
        console.log(`  fila ${c.excelRow} | ${c.descripcion.slice(0, 48)} | ${c.desde} → ${c.hasta}${c.note ? ` (${c.note})` : ''}`)
      }
      if (fechasCorregidas.length > 15) console.log(`  … y ${fechasCorregidas.length - 15} más`)
    } else {
      console.log('\n(Fechas corregidas: ninguna.)')
    }
    if (fechasInvalidas.length) {
      console.log('\n--- Fechas inválidas / no parseables (ejemplos; máx. 10) ---')
      for (const c of fechasInvalidas.slice(0, 10)) {
        console.log(`  fila ${c.excelRow} | ${c.descripcion.slice(0, 40)} | raw=${JSON.stringify(c.raw)} ${c.note ?? ''}`)
      }
    }
  }

  const preview = rows.slice(0, 8)
  console.log('\nMuestra (primeras 8, fecha_compra ya normalizada):')
  for (const r of preview) {
    console.log(
      JSON.stringify({
        descripcion_excel: r.descripcion_excel,
        vehicle_id: r.vehicle_id,
        fecha_compra: r.fecha_compra,
        fecha_ajuste: r.excel_extra?.fecha_compra_ajuste ? `${r.excel_extra.fecha_compra_excel_original}→${r.fecha_compra}` : undefined,
        total_inversion_usd: r.total_inversion_usd,
        match: r.excel_extra?.match_method,
      }),
    )
  }
  if (dryRun && fechasCorregidas.length) {
    const adj = rows.find((r) => r.excel_extra?.fecha_compra_ajuste)
    if (adj) {
      console.log('\nEjemplo JSON (fila con fecha corregida):')
      console.log(
        JSON.stringify({
          descripcion_excel: adj.descripcion_excel,
          vehicle_id: adj.vehicle_id,
          fecha_compra: adj.fecha_compra,
          fecha_ajuste: `${adj.excel_extra.fecha_compra_excel_original}→${adj.fecha_compra}`,
          nota: adj.excel_extra.fecha_compra_ajuste,
          excel_row: adj.excel_extra.row,
        }),
      )
    }
  }

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se insertó nada.')
    let ok = false
    try {
      ok = await tableReady(supabase)
    } catch {
      ok = false
    }
    if (!ok) console.log('Nota: la tabla inversiones_vehiculo aún no está lista; el import real fallará hasta aplicar la migración SQL.')
    console.log('Import real tras validar:  $env:DRY_RUN=\'0\'; node scripts/import_inversiones_vehiculo.mjs "' + xlsxPath + '"')
    return
  }

  console.log('\n--- Importación real ---')
  await insertChunks(supabase, rows)
  console.log('Listo. Filas insertadas:', rows.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
