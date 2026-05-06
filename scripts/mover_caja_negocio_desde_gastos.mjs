/**
 * Detecta gastos operativos mal clasificados (texto «caja negocio» y variantes),
 * los inserta en public.caja_negocio_vehiculo y opcionalmente los borra de public.gastos.
 *
 * Requiere .env: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 *
 * DRY_RUN=1 por defecto (solo lista). Ejecución real:
 *   PowerShell: $env:DRY_RUN='0'; node scripts/mover_caja_negocio_desde_gastos.mjs
 *
 * No modifica ingresos, gastos_caja, inversiones_vehiculo ni vehículos.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
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

const env = { ...process.env, ...loadDotEnv() }
const url = (env.VITE_SUPABASE_URL ?? '').trim()
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const chunkSize = Math.max(20, Math.min(300, Number(env.CHUNK_SIZE) || 150))

const PAGE_SIZE = 1000

function normalizeForMatch(s) {
  if (s == null || s === '') return ''
  return String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coincide con: caja negocio, cajas negocio, caja del/de negocio, caj negocio… */
function matchesCajaNegocioRow(row) {
  const blob = normalizeForMatch(
    [
      row.tipo,
      row.motivo,
      row.categoria,
      row.comentarios,
      row.categoria_real,
      row.subcategoria,
      row.detalle_operativo,
    ]
      .filter(Boolean)
      .join(' '),
  )
  return /\b(cajas?|caj)\s+((del|de)\s+)?negocio\b/u.test(blob)
}

function toInsert(row) {
  const vid = row.vehicle_id != null ? Number(row.vehicle_id) : NaN
  const fecha = row.fecha != null ? String(row.fecha).slice(0, 10) : ''
  const concepto = String(row.motivo || row.tipo || 'CAJA NEGOCIO').trim().slice(0, 2000)
  const comentarios = String(row.comentarios ?? '').trim().slice(0, 2000)
  const monto = Number(row.monto)
  return {
    empresa_id: empresaId,
    vehicle_id: vid,
    fecha,
    monto: Number.isFinite(monto) ? monto : 0,
    concepto: concepto || 'CAJA NEGOCIO',
    origen_gasto_id: Number(row.id),
    comentarios,
    excel_extra: row.excel_extra ?? null,
  }
}

function printSample(rows, n = 50) {
  for (const r of rows.slice(0, n)) {
    const id = r.id
    const fecha = r.fecha
    const monto = r.monto
    const vid = r.vehicle_id
    const tipo = String(r.tipo ?? '').slice(0, 60)
    const motivo = String(r.motivo ?? '').slice(0, 80)
    console.log(`  id=${id} vehicle_id=${vid} fecha=${fecha} monto=${monto} tipo="${tipo}" motivo="${motivo}"`)
  }
  if (rows.length > n) console.log(`  … +${rows.length - n} más`)
}

async function fetchAllGastos(supabase) {
  const out = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('gastos')
      .select(
        'id, empresa_id, vehicle_id, fecha, monto, tipo, motivo, categoria, comentarios, categoria_real, subcategoria, detalle_operativo, excel_extra',
      )
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw new Error(`[gastos fetch] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return out
}

async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('caja_negocio_vehiculo').insert(batch)
    if (error) throw new Error(`[caja_negocio_vehiculo insert] lote ${i}: ${error.message}`)
    console.log(`  insertadas +${batch.length}`)
  }
}

async function deleteByIds(supabase, ids) {
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize)
    const { error } = await supabase.from('gastos').delete().eq('empresa_id', empresaId).in('id', slice)
    if (error) throw new Error(`[gastos delete] lote ${i}: ${error.message}`)
    console.log(`  eliminados gastos id… +${slice.length}`)
  }
}

async function main() {
  console.log('--- mover_caja_negocio_desde_gastos ---')
  console.log('empresa_id:', empresaId || '(vacío)')
  console.log('DRY_RUN:', dryRun ? '1 (no inserta ni borra)' : '0 (INSERT caja_negocio_vehiculo + DELETE gastos)')

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const all = await fetchAllGastos(supabase)
  const matched = all.filter((r) => matchesCajaNegocioRow(r))
  const sinVehiculo = matched.filter((r) => r.vehicle_id == null || !Number.isFinite(Number(r.vehicle_id)))
  const ok = matched.filter((r) => r.vehicle_id != null && Number.isFinite(Number(r.vehicle_id)))

  console.log('\nGastos en empresa:', all.length)
  console.log('Detectados (caja negocio / variantes):', matched.length)
  console.log('  ↳ sin vehicle_id (se omiten en migración):', sinVehiculo.length)
  console.log('  ↳ listos para mover:', ok.length)

  if (sinVehiculo.length > 0) {
    console.log('\nMuestra sin vehicle_id (revisar manualmente):')
    printSample(sinVehiculo, 20)
  }

  if (ok.length > 0) {
    console.log('\nMuestra (hasta 50 de los que sí tienen vehículo):')
    printSample(ok, 50)
  }

  if (dryRun || ok.length === 0) {
    if (dryRun && ok.length > 0) {
      console.log('\nPara ejecutar: $env:DRY_RUN=\'0\'; node scripts/mover_caja_negocio_desde_gastos.mjs')
    }
    return
  }

  const inserts = ok.map(toInsert)
  console.log('\nInsertando en caja_negocio_vehiculo…')
  await insertChunks(supabase, inserts)

  const ids = ok.map((r) => r.id)
  console.log('Eliminando de gastos…')
  await deleteByIds(supabase, ids)

  console.log('\nListo:', inserts.length, 'movidos.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
