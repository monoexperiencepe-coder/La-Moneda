/**
 * Auditoría: gastos por cabecera de vehículo en Excel vs Supabase (solo lectura, consola).
 *
 * Uso:
 *   node scripts/audit_gastos_por_vehiculo.mjs [ruta.xlsx]
 *
 * Por defecto intenta (en orden): argumento, GASTOS_XLSX, ./GASTOS LA MONEDA (2).xlsx,
 * %USERPROFILE%/Downloads/GASTOS LA MONEDA (2).xlsx
 *
 * Requiere .env como import_gastos_reales (VITE_SUPABASE_URL, VITE_EMPRESA_ID, service role).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute, join } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import {
  parseWorkbook,
  resolveVehicleId,
  classifySinVehiculo,
  normPlaca,
  normNumeroInterno,
  buildAliasVehicleMapFromJson,
} from './gastos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const aliasJsonPath = resolve(__dirname, 'gastos_alias_vehicle_map.json')

function loadGastosAliasVehicleMap() {
  if (!existsSync(aliasJsonPath)) return new Map()
  try {
    return buildAliasVehicleMapFromJson(JSON.parse(readFileSync(aliasJsonPath, 'utf8')))
  } catch {
    return new Map()
  }
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

const env = { ...process.env, ...loadDotEnv() }
const url = (env.VITE_SUPABASE_URL ?? '').trim()
const serviceKey = (
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()

const argvArg = (process.argv[2] || '').trim()

function resolveXlsxPath() {
  if (argvArg) {
    return isAbsolute(argvArg) ? argvArg : resolve(root, argvArg)
  }
  if ((env.GASTOS_XLSX || '').trim()) {
    const g = env.GASTOS_XLSX.trim()
    return isAbsolute(g) ? g : resolve(root, g)
  }
  const inRoot = resolve(root, 'GASTOS LA MONEDA (2).xlsx')
  if (existsSync(inRoot)) return inRoot
  const inDownloads = join(homedir(), 'Downloads', 'GASTOS LA MONEDA (2).xlsx')
  if (existsSync(inDownloads)) return inDownloads
  return inRoot
}

const xlsxPath = resolveXlsxPath()

async function fetchAllVehiculos(supabase, empresa) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa')
      .eq('empresa_id', empresa)
      .range(from, from + page - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

async function fetchAllUnidades(supabase, empresa) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('unidades')
      .select('vehicle_id, numero_interno')
      .eq('empresa_id', empresa)
      .range(from, from + page - 1)
    if (error) throw new Error(`[unidades] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

async function fetchAllGastos(supabase, empresa) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('gastos')
      .select('id, vehicle_id, monto')
      .eq('empresa_id', empresa)
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`[gastos] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

function buildPlacaToId(vehiculos) {
  const placaToId = new Map()
  for (const v of vehiculos) {
    const p = normPlaca(v.placa)
    if (!p) continue
    const id = Number(v.id)
    placaToId.set(p, id)
    const flat = p.replace(/-/g, '')
    if (flat !== p) placaToId.set(flat, id)
  }
  return placaToId
}

function buildCarNoToIds(unidades) {
  const carNoToIds = new Map()
  for (const u of unidades) {
    const key = normNumeroInterno(u.numero_interno)
    if (!key || u.vehicle_id == null) continue
    const vid = Number(u.vehicle_id)
    if (!Number.isFinite(vid)) continue
    if (!carNoToIds.has(key)) carNoToIds.set(key, new Set())
    carNoToIds.get(key).add(vid)
  }
  return carNoToIds
}

function absMonto(m) {
  const n = Number(m)
  return Number.isFinite(n) ? Math.abs(n) : 0
}

async function main() {
  console.log('=== audit_gastos_por_vehiculo (solo lectura) ===')
  console.log('Excel:', xlsxPath)
  if (!existsSync(xlsxPath)) throw new Error(`No existe el archivo: ${xlsxPath}`)
  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const parsed = parseWorkbook(xlsxPath, { silentWarnings: true })
  console.log('\n--- Excel (parse) ---')
  console.log('Hoja:', parsed.sheetName, '| filas parseadas:', parsed.parsed.length)

  const vehiculos = await fetchAllVehiculos(supabase, empresaId)
  const unidades = await fetchAllUnidades(supabase, empresaId)
  const gastosRows = await fetchAllGastos(supabase, empresaId)

  const placaToId = buildPlacaToId(vehiculos)
  const carNoToIds = buildCarNoToIds(unidades)
  const aliasLineToVid = loadGastosAliasVehicleMap()

  console.log('\n--- Supabase ---')
  console.log('vehiculos:', vehiculos.length, '| unidades:', unidades.length, '| gastos:', gastosRows.length)

  /** @type {Map<string, { vehicle_line: string, placa: string|null, carNo: string|null, count: number, sum: number, vids: Set<number> }>} */
  const byHeader = new Map()
  for (const g of parsed.parsed) {
    const line = g.vehicle_line || '(vacío)'
    if (!byHeader.has(line)) {
      byHeader.set(line, {
        vehicle_line: line,
        placa: g.vehicle_placa ?? null,
        carNo: g.vehicle_car_no ?? null,
        count: 0,
        sum: 0,
        vids: new Set(),
      })
    }
    const agg = byHeader.get(line)
    const { vid } = resolveVehicleId(g, placaToId, carNoToIds, aliasLineToVid)
    agg.count += 1
    agg.sum += Number(g.monto) || 0
    if (vid != null) agg.vids.add(vid)
  }

  const sbByVid = new Map()
  let nullVidCount = 0
  let nullVidSum = 0
  for (const r of gastosRows) {
    const m = absMonto(r.monto)
    if (r.vehicle_id == null) {
      nullVidCount += 1
      nullVidSum += m
      continue
    }
    const vid = Number(r.vehicle_id)
    if (!Number.isFinite(vid)) continue
    if (!sbByVid.has(vid)) sbByVid.set(vid, { count: 0, sum: 0 })
    const s = sbByVid.get(vid)
    s.count += 1
    s.sum += m
  }

  const linesMultiVid = []
  const linesZeroSb = []
  const linesDiff = []
  const placaNoBd = []
  const numNoMatch = []
  const sinPista = []

  for (const agg of byHeader.values()) {
    if (agg.vids.size > 1) {
      linesMultiVid.push({
        line: agg.vehicle_line.slice(0, 80),
        placa: agg.placa,
        carNo: agg.carNo,
        vids: [...agg.vids].sort((a, b) => a - b),
        excelCount: agg.count,
      })
      continue
    }

    const rv = agg.vids.size === 1 ? [...agg.vids][0] : null
    const g0 = parsed.parsed.find((x) => x.vehicle_line === agg.vehicle_line)
    const clasif = g0 ? classifySinVehiculo(g0, placaToId, carNoToIds) : 'sin_placa_regex_ni_num_util'

    if (rv != null) {
      const sb = sbByVid.get(rv) || { count: 0, sum: 0 }
      if (sb.count === 0 && agg.count > 0) {
        linesZeroSb.push({
          line: agg.vehicle_line.slice(0, 100),
          placa: agg.placa,
          carNo: agg.carNo,
          resolvedVid: rv,
          excelCount: agg.count,
          excelSum: agg.sum,
        })
      }
      const dC = agg.count - sb.count
      const dS = Math.round((agg.sum - sb.sum) * 100) / 100
      if (dC !== 0 || Math.abs(dS) > 0.02) {
        linesDiff.push({
          line: agg.vehicle_line.slice(0, 80),
          resolvedVid: rv,
          excelCount: agg.count,
          excelSum: agg.sum,
          sbCount: sb.count,
          sbSum: sb.sum,
          diffCount: dC,
          diffSum: dS,
        })
      }
    } else if (agg.count > 0) {
      if (clasif === 'placa_no_en_supabase') placaNoBd.push({ line: agg.vehicle_line.slice(0, 100), placa: agg.placa, excelCount: agg.count })
      else if (clasif === 'num_interno_sin_coincidencia' || clasif === 'num_interno_ambiguo') {
        numNoMatch.push({ line: agg.vehicle_line.slice(0, 100), carNo: agg.carNo, clasif, excelCount: agg.count })
      } else {
        sinPista.push({ line: agg.vehicle_line.slice(0, 100), clasif, excelCount: agg.count })
      }
    }
  }

  const excelVidSet = new Set()
  for (const agg of byHeader.values()) {
    for (const v of agg.vids) excelVidSet.add(v)
  }
  const sbVehiculosSinGasto = vehiculos.filter((v) => {
    const id = Number(v.id)
    const s = sbByVid.get(id)
    return (!s || s.count === 0) && !excelVidSet.has(id)
  })

  console.log('\n' + '='.repeat(88))
  console.log('1) Cabeceras Excel → agregado (placa / N° interno / cantidad / suma PEN)')
  console.log('='.repeat(88))
  const sortedHeaders = [...byHeader.values()].sort((a, b) => b.count - a.count)
  for (const agg of sortedHeaders) {
    const rv = agg.vids.size === 1 ? [...agg.vids][0] : agg.vids.size > 1 ? `MIX:${[...agg.vids].join(',')}` : '—'
    console.log(
      `${String(agg.count).padStart(5)} | ${String(agg.sum.toFixed(2)).padStart(12)} | vid→${String(rv).padEnd(12)} | placa:${(agg.placa || '—').toString().padEnd(12)} | n°:${(agg.carNo || '—').toString().padEnd(6)} | ${agg.vehicle_line.slice(0, 70)}`,
    )
  }

  const sinVidResuelto = sortedHeaders.filter((a) => a.vids.size === 0 && a.count > 0)
  console.log('\n' + '='.repeat(88))
  console.log('1b) Cabeceras con gastos en Excel pero SIN vehicle_id resuelto (en app van a “sin vehículo” / null)')
  console.log('='.repeat(88))
  if (!sinVidResuelto.length) console.log('(ninguna)')
  else {
    let suma = 0
    let cnt = 0
    for (const a of sinVidResuelto) {
      suma += a.sum
      cnt += a.count
      console.log(`  ${a.count} gastos | ${a.sum.toFixed(2)} PEN | ${a.vehicle_line.slice(0, 90)}`)
    }
    console.log(`  Total filas sin vid: ${cnt} | suma: ${suma.toFixed(2)} PEN`)
  }

  console.log('\n' + '='.repeat(88))
  console.log('2) Comparación (cabecera con vid único): Excel vs Supabase por vehicle_id')
  console.log('='.repeat(88))
  console.log('diffCnt | diffMonto | excelCnt | excelSum | sbCnt | sbSum | vid | cabecera')
  for (const row of linesDiff.sort((a, b) => Math.abs(b.diffCount) - Math.abs(a.diffCount)).slice(0, 60)) {
    console.log(
      `${String(row.diffCount).padStart(7)} | ${String(row.diffSum).padStart(10)} | ${String(row.excelCount).padStart(8)} | ${String(row.excelSum.toFixed(2)).padStart(10)} | ${String(row.sbCount).padStart(5)} | ${String(row.sbSum.toFixed(2)).padStart(8)} | ${row.resolvedVid} | ${row.line}`,
    )
  }
  if (linesDiff.length > 60) console.log(`… (${linesDiff.length - 60} filas más con diferencia)`)

  console.log('\n' + '='.repeat(88))
  console.log('3) Resuelto a vehicle_id pero 0 gastos en Supabase (Excel sí tiene)')
  console.log('='.repeat(88))
  if (!linesZeroSb.length) console.log('(ninguno)')
  else for (const x of linesZeroSb) console.log(JSON.stringify(x))

  console.log('\n' + '='.repeat(88))
  console.log('4) Placa detectada en cabecera pero no en Supabase (empresa)')
  console.log('='.repeat(88))
  if (!placaNoBd.length) console.log('(ninguno)')
  else for (const x of placaNoBd) console.log(JSON.stringify(x))

  console.log('\n' + '='.repeat(88))
  console.log('5) Número interno sin match o ambiguo (cabeceras)')
  console.log('='.repeat(88))
  if (!numNoMatch.length) console.log('(ninguno)')
  else for (const x of numNoMatch) console.log(JSON.stringify(x))

  console.log('\n' + '='.repeat(88))
  console.log('6) Sin placa útil / sin resolución (clasificación)')
  console.log('='.repeat(88))
  if (!sinPista.length) console.log('(ninguno)')
  else for (const x of sinPista.slice(0, 40)) console.log(JSON.stringify(x))
  if (sinPista.length > 40) console.log(`… (${sinPista.length - 40} más)`)

  console.log('\n' + '='.repeat(88))
  console.log('7) Gastos en Supabase con vehicle_id NULL')
  console.log('='.repeat(88))
  console.log('cantidad:', nullVidCount, '| suma monto (abs):', Math.round(nullVidSum * 100) / 100)

  console.log('\n' + '='.repeat(88))
  console.log('8) Varios vehicle_id distintos bajo la misma cabecera Excel (revisar cabecera duplicada o datos)')
  console.log('='.repeat(88))
  if (!linesMultiVid.length) console.log('(ninguno)')
  else for (const x of linesMultiVid) console.log(JSON.stringify(x))

  console.log('\n' + '='.repeat(88))
  console.log('9) Vehículos en BD sin ningún gasto (y sin cabecera Excel que resolviera a ellos en este Excel)')
  console.log('='.repeat(88))
  console.log('total:', sbVehiculosSinGasto.length, '(informativo; no implica error)')
  for (const v of sbVehiculosSinGasto.slice(0, 25)) {
    console.log(`  id=${v.id} placa=${normPlaca(v.placa)}`)
  }
  if (sbVehiculosSinGasto.length > 25) console.log(`  … (${sbVehiculosSinGasto.length - 25} más)`)

  console.log('\nListo. No se escribió nada en Supabase.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
