/**
 * Reimporta solo control_fechas desde src/data/systemExcelSeed_v2.json.
 *
 * Variables (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (o SERVICE_ROLE_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY)
 *   VITE_EMPRESA_ID
 *
 * DRY_RUN: por defecto no escribe (equivalente a DRY_RUN=1). Para ejecutar borrado + insert:
 *   DRY_RUN=0 node scripts/reimport_control_fechas.mjs
 *
 * Mapeo vehicle_id: igual que import:full-seed — N° carro del JSON = vehicles[].id del seed;
 * se resuelve a vehiculos.id en Supabase por placa normalizada (vehículos ya existentes de la empresa).
 *
 * Dedupe antes de insertar: clave vehicle_id + tipo + fecha_vencimiento. Comentarios distintos se unen con " | ".
 *
 * npm: npm run reimport:control-fechas
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
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

const dryRun = !(
  String(env.DRY_RUN ?? '1').trim() === '0' ||
  /^false$/i.test(String(env.DRY_RUN ?? '').trim())
)

const chunkSize = Math.max(50, Math.min(500, Number(env.CHUNK_SIZE) || 300))
const seedPath = resolve(root, 'src', 'data', 'systemExcelSeed_v2.json')

function normPlaca(p) {
  if (p == null || typeof p !== 'string') return ''
  const s = p.trim().toUpperCase().replace(/\s+/g, '')
  if (s === '—' || s === '-' || s === '–') return ''
  return s
}

function controlDedupeKey(row, supabaseVehicleId) {
  const vid = supabaseVehicleId ?? 'null'
  const fv = String(row.fechaVencimiento ?? '').slice(0, 10)
  return `${vid}|${row.tipo}|${fv}`
}

function toControlInsert(row, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    vehicle_id: vehicleIdSupabase,
    tipo: row.tipo,
    fecha_vencimiento: String(row.fechaVencimiento).slice(0, 10),
    fecha_registro: String(row.fechaRegistro).slice(0, 10),
    comentarios: row.comentarios || '',
  }
}

async function fetchAllRows(supabase, table, columns) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('empresa_id', empresaId)
      .range(from, from + page - 1)
    if (error) throw new Error(`[${table}] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

async function insertChunks(supabase, table, rows, label) {
  let ok = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      console.error(`[${label}] lote ${i}-${i + batch.length}: ${error.message}`)
      throw error
    }
    ok += batch.length
    console.log(`  [${label}] +${batch.length} (total ${ok}/${rows.length})`)
  }
  return ok
}

async function main() {
  if (!url || !serviceKey) {
    console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  if (!empresaId) {
    console.error('Falta VITE_EMPRESA_ID.')
    process.exit(1)
  }
  if (!existsSync(seedPath)) {
    console.error('No existe', seedPath)
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
  const vehicles = Array.isArray(raw.vehicles) ? raw.vehicles : []
  const controlFechas = Array.isArray(raw.controlFechas) ? raw.controlFechas : []

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const placaToSupabaseId = new Map()
  const excelCarToSupabaseId = new Map()

  const existingVeh = await fetchAllRows(supabase, 'vehiculos', 'id, placa')
  for (const row of existingVeh) {
    const id = row.id != null ? String(row.id) : ''
    const p = normPlaca(row.placa)
    if (p && id) placaToSupabaseId.set(p, id)
  }

  for (const v of vehicles) {
    const nid = Number(v.id)
    if (!Number.isFinite(nid)) continue
    const p = normPlaca(v.placa)
    if (p && placaToSupabaseId.has(p)) excelCarToSupabaseId.set(nid, placaToSupabaseId.get(p))
  }

  function resolveExcelCarId(excelCarId) {
    if (excelCarId == null || !Number.isFinite(Number(excelCarId))) return null
    return excelCarToSupabaseId.get(Number(excelCarId)) ?? null
  }

  const currentRows = await fetchAllRows(
    supabase,
    'control_fechas',
    'id, vehicle_id, tipo, fecha_vencimiento, fecha_registro, comentarios',
  )

  const currentKeys = new Set(
    currentRows.map((r) =>
      controlDedupeKey(
        {
          tipo: r.tipo,
          fechaVencimiento: String(r.fecha_vencimiento).slice(0, 10),
        },
        r.vehicle_id != null ? String(r.vehicle_id) : null,
      ),
    ),
  )

  /** Clave: vehicle_id + tipo + fecha_vencimiento → una fila; comentarios unidos con " | " si difieren. */
  const mergedByKey = new Map()
  let sinVehiculo = 0
  /** Filas del seed con vehículo resuelto que repiten la misma clave (no cuentan la primera de cada grupo). */
  let duplicadosOmitidos = 0
  for (const row of controlFechas) {
    const sid = resolveExcelCarId(row.vehicleId)
    if (!sid) {
      sinVehiculo++
      continue
    }
    const ins = toControlInsert(row, sid)
    const key = controlDedupeKey(
      { tipo: ins.tipo, fechaVencimiento: ins.fecha_vencimiento },
      String(ins.vehicle_id),
    )
    const com = (ins.comentarios || '').trim()
    const prev = mergedByKey.get(key)
    if (!prev) {
      mergedByKey.set(key, { ...ins })
      continue
    }
    duplicadosOmitidos++
    const chunks = [prev.comentarios, com]
      .flatMap((c) => String(c || '').split(/\s*\|\s*/))
      .map((c) => c.trim())
      .filter(Boolean)
    const seen = new Set()
    const mergedCom = []
    for (const p of chunks) {
      if (seen.has(p)) continue
      seen.add(p)
      mergedCom.push(p)
    }
    prev.comentarios = mergedCom.join(' | ')
    const f0 = String(prev.fecha_registro).slice(0, 10)
    const f1 = String(ins.fecha_registro).slice(0, 10)
    prev.fecha_registro = f0 < f1 ? f0 : f1
  }

  const insert = Array.from(mergedByKey.values())

  const filasOriginalesSeed = controlFechas.length
  const filasConVehiculoResuelto = filasOriginalesSeed - sinVehiculo
  const filasUnicasAInsertar = insert.length
  if (duplicadosOmitidos !== filasConVehiculoResuelto - filasUnicasAInsertar) {
    throw new Error(
      `Inconsistencia dedupe: duplicadosOmitidos=${duplicadosOmitidos} vs esperado=${filasConVehiculoResuelto - filasUnicasAInsertar}`,
    )
  }

  const newKeys = new Set(mergedByKey.keys())

  const soloEnDb = [...currentKeys].filter((k) => !newKeys.has(k))
  const soloEnSeed = [...newKeys].filter((k) => !currentKeys.has(k))
  const enAmbos = [...currentKeys].filter((k) => newKeys.has(k)).length

  const report = {
    dry_run: dryRun,
    empresa_id: empresaId,
    seed: seedPath,
    vehiculos_supabase: existingVeh.length,
    mapeo_excel_carro_a_supabase: excelCarToSupabaseId.size,
    registros_actuales: currentRows.length,
    filas_originales_seed: filasOriginalesSeed,
    filas_unicas_a_insertar: filasUnicasAInsertar,
    duplicados_omitidos_en_seed: duplicadosOmitidos,
    omitidos_sin_vehiculo_resuelto: sinVehiculo,
    claves_dedupe_actuales: currentKeys.size,
    en_ambos_dedupe: enAmbos,
    solo_en_db_count: soloEnDb.length,
    solo_en_seed_count: soloEnSeed.length,
    diferencia_neta_filas: filasUnicasAInsertar - currentRows.length,
    muestra_solo_en_db: soloEnDb.slice(0, 30),
    muestra_solo_en_seed: soloEnSeed.slice(0, 30),
  }

  console.log('--- Resumen deduplicación (clave: vehicle_id + tipo + fecha_vencimiento) ---')
  console.log(`  Filas originales del seed:     ${filasOriginalesSeed}`)
  console.log(`  Filas únicas a insertar:       ${filasUnicasAInsertar}`)
  console.log(`  Duplicados omitidos:           ${duplicadosOmitidos}`)
  console.log(JSON.stringify(report, null, 2))

  if (dryRun) {
    console.log('\nDRY_RUN: no se borró ni insertó. Para aplicar: DRY_RUN=0 npm run reimport:control-fechas')
    return
  }

  const { error: delErr } = await supabase.from('control_fechas').delete().eq('empresa_id', empresaId)
  if (delErr) {
    console.error('delete control_fechas:', delErr.message)
    process.exit(1)
  }
  console.log('Eliminados (empresa):', currentRows.length, 'filas (previas al delete)')

  if (insert.length) await insertChunks(supabase, 'control_fechas', insert, 'control_fechas')
  else console.log('Nada que insertar.')

  console.log('Listo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
