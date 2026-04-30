/**
 * Importa controlFechas y kilometrajes desde src/data/systemExcelSeed.json hacia Supabase.
 *
 * Requisitos:
 * - Ejecutar desde la raíz del repo: npm run import:seed-control-km
 * - .env con VITE_SUPABASE_URL, VITE_EMPRESA_ID (uuid) y una clave con permiso de escritura:
 *   preferible VITE_SUPABASE_SERVICE_ROLE_KEY para import masivo; si solo tienes anon,
 *   las políticas RLS deben permitir INSERT en control_fechas y kilometrajes para esa empresa.
 * - Tablas creadas (ver supabase/migration_control_fechas_kilometrajes.sql).
 * - vehicle_id del JSON deben existir en public.vehiculos para no violar FK (si las FK están activas).
 *
 * Opciones (variables de entorno):
 *   DRY_RUN=1           solo muestra conteos, no inserta
 *   SKIP_CONTROL=1    no importa control_fechas
 *   SKIP_KM=1         no importa kilometrajes
 *   CHUNK_SIZE=400    tamaño de cada lote (default 400)
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
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
const dryRun = env.DRY_RUN === '1' || env.DRY_RUN === 'true'
const skipControl = env.SKIP_CONTROL === '1'
const skipKm = env.SKIP_KM === '1'
const chunkSize = Math.max(50, Math.min(1000, Number(env.CHUNK_SIZE) || 400))

if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL y clave (SERVICE_ROLE o ANON) en .env')
  process.exit(1)
}
if (!empresaId) {
  console.error('Falta VITE_EMPRESA_ID en .env')
  process.exit(1)
}

const seedPath = resolve(root, 'src', 'data', 'systemExcelSeed.json')
if (!existsSync(seedPath)) {
  console.error('No existe', seedPath)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
const controlRows = Array.isArray(raw.controlFechas) ? raw.controlFechas : []
const kmRows = Array.isArray(raw.kilometrajes) ? raw.kilometrajes : []

function toControlInsert(cf) {
  return {
    empresa_id: empresaId,
    vehicle_id: cf.vehicleId ?? null,
    tipo: cf.tipo,
    fecha_vencimiento: cf.fechaVencimiento,
    fecha_registro: cf.fechaRegistro,
    comentarios: cf.comentarios ?? '',
  }
}

function toKmInsert(k) {
  return {
    empresa_id: empresaId,
    vehicle_id: k.vehicleId,
    fecha: k.fecha,
    fecha_registro: k.fechaRegistro,
    km_mantenimiento: k.kmMantenimiento ?? null,
    kilometraje: k.kilometraje ?? null,
    descripcion: k.descripcion ?? '',
    costo: k.costo ?? null,
  }
}

async function insertChunks(supabase, table, rows, label) {
  let ok = 0
  let fail = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      console.error(`[${label}] chunk ${i}-${i + batch.length}:`, error.message)
      fail += batch.length
    } else {
      ok += batch.length
      console.log(`[${label}] insertados ${ok}/${rows.length}`)
    }
  }
  return { ok, fail }
}

async function main() {
  console.log('Empresa:', empresaId)
  console.log('Seed:', seedPath)
  console.log('controlFechas:', controlRows.length, 'kilometrajes:', kmRows.length)
  console.log('dryRun:', dryRun, 'skipControl:', skipControl, 'skipKm:', skipKm, 'chunk:', chunkSize)

  if (dryRun) {
    console.log('DRY_RUN: no se insertó nada.')
    return
  }

  const supabase = createClient(url, key)

  if (!skipControl && controlRows.length) {
    const payload = controlRows.map(toControlInsert)
    const r = await insertChunks(supabase, 'control_fechas', payload, 'control_fechas')
    console.log('control_fechas resumen ok:', r.ok, 'fallidos:', r.fail)
  }

  if (!skipKm && kmRows.length) {
    const payload = kmRows.map(toKmInsert)
    const r = await insertChunks(supabase, 'kilometrajes', payload, 'kilometrajes')
    console.log('kilometrajes resumen ok:', r.ok, 'fallidos:', r.fail)
  }

  console.log('Listo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
