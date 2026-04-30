/**
 * Rellena columnas de contexto operativo en ingresos y gastos ya importados.
 *
 * Variables (.env en la raíz o entorno):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (obligatorio para escribir; mismo patrón que import:full-seed)
 *   VITE_EMPRESA_ID
 *
 * DRY_RUN (por defecto seguro: no escribe si no fuerzas lo contrario):
 *   Sin definir, o DRY_RUN=1 / true  → solo cuenta y muestra resumen
 *   DRY_RUN=0 o false               → aplica UPDATEs
 *
 * Uso:
 *   node scripts/backfill_contexto_operativo.mjs
 *   DRY_RUN=0 node scripts/backfill_contexto_operativo.mjs
 *
 * npm:
 *   npm run backfill:contexto-operativo
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

/** Por defecto dry-run (solo DRY_RUN=0 o false aplica cambios). */
const dryRun = !(
  String(env.DRY_RUN ?? '1').trim() === '0' ||
  /^false$/i.test(String(env.DRY_RUN ?? '').trim())
)

const PAGE = Math.min(1000, Math.max(100, Number(env.BACKFILL_PAGE_SIZE) || 500))

function inferEstadoPago(comentarios) {
  const u = String(comentarios ?? '').trim().toUpperCase()
  if (!u) return null
  if (/(PENDIENTE|DEBE|POR COBRAR|POR PAGAR)/.test(u)) return 'PENDIENTE'
  if (/(PAGADO|COBRADO|LIQUIDADO)/.test(u)) return 'PAGADO'
  return null
}

function joinDetalleOperativo(detalleDelAuto, comentarios) {
  const a = String(detalleDelAuto ?? '').trim()
  const c = String(comentarios ?? '').trim()
  if (a && c) return `${a} — ${c}`
  if (a) return a
  if (c) return c
  return null
}

function tipoOperacionIngreso(tipo, subTipo) {
  const parts = [String(tipo ?? '').trim(), String(subTipo ?? '').trim()].filter(Boolean)
  return parts.length ? parts.join(' | ') : null
}

function normVal(v) {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function equalContext(a, b) {
  return normVal(a) === normVal(b)
}

function vehicleDetalle(v) {
  if (!v) return null
  const marca = String(v.marca ?? '').trim()
  const modelo = String(v.modelo ?? '').trim()
  const placa = String(v.placa ?? '').trim()
  const parts = [marca, modelo].filter(Boolean).join(' ')
  if (parts && placa) return `${parts} — ${placa}`
  if (parts) return parts
  if (placa) return placa
  return null
}

async function fetchAllRows(client, table, columns) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} select: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
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

  const client = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: vehRows, error: vErr } = await client
    .from('vehiculos')
    .select('id, marca, modelo, placa')
    .eq('empresa_id', empresaId)
  if (vErr) throw new Error(`vehiculos: ${vErr.message}`)
  const vehicleById = new Map((vehRows ?? []).map((r) => [Number(r.id), r]))

  const ingCols =
    'id, vehicle_id, tipo, sub_tipo, comentarios, detalle_operativo, tipo_operacion, estado_pago'
  const ingresos = await fetchAllRows(client, 'ingresos', ingCols)

  const ingPatches = []
  for (const row of ingresos) {
    const vid = row.vehicle_id != null ? Number(row.vehicle_id) : null
    const v = vid != null ? vehicleById.get(vid) : null
    const detalleVeh = vehicleDetalle(v)
    const com = String(row.comentarios ?? '')
    const detalle_operativo = joinDetalleOperativo(detalleVeh, com)
    const tipo_operacion = tipoOperacionIngreso(row.tipo, row.sub_tipo)
    const estado_pago = inferEstadoPago(com)

    const changed =
      !equalContext(row.detalle_operativo, detalle_operativo) ||
      !equalContext(row.tipo_operacion, tipo_operacion) ||
      !equalContext(row.estado_pago, estado_pago)

    if (changed) {
      ingPatches.push({
        id: row.id,
        detalle_operativo,
        tipo_operacion,
        estado_pago,
      })
    }
  }

  const gasCols =
    'id, vehicle_id, tipo, sub_tipo, categoria, motivo, comentarios, detalle_operativo, categoria_real, subcategoria'
  const gastos = await fetchAllRows(client, 'gastos', gasCols)

  const gasPatches = []
  for (const row of gastos) {
    const vid = row.vehicle_id != null ? Number(row.vehicle_id) : null
    const v = vid != null ? vehicleById.get(vid) : null
    const detalleVeh = vehicleDetalle(v)
    const com = String(row.comentarios ?? '')
    const motivo = String(row.motivo ?? '')
    const detalle_operativo = detalleVeh
      ? joinDetalleOperativo(detalleVeh, com)
      : joinDetalleOperativo(motivo, com)

    const cat = String(row.categoria ?? '').trim()
    const tipo = String(row.tipo ?? '').trim()
    const categoria_real = cat || tipo || null
    const sub = String(row.sub_tipo ?? '').trim()
    const subcategoria = sub || null

    const changed =
      !equalContext(row.detalle_operativo, detalle_operativo) ||
      !equalContext(row.categoria_real, categoria_real) ||
      !equalContext(row.subcategoria, subcategoria)

    if (changed) {
      gasPatches.push({
        id: row.id,
        detalle_operativo,
        categoria_real,
        subcategoria,
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        empresa_id: empresaId,
        dry_run: dryRun,
        ingresos_total: ingresos.length,
        ingresos_a_actualizar: ingPatches.length,
        gastos_total: gastos.length,
        gastos_a_actualizar: gasPatches.length,
      },
      null,
      2,
    ),
  )

  if (dryRun) {
    console.log('Modo DRY_RUN: no se escribió nada. Para aplicar: DRY_RUN=0 npm run backfill:contexto-operativo')
    return
  }

  let ingOk = 0
  let ingFail = 0
  for (const p of ingPatches) {
    const { id, ...patch } = p
    const { error } = await client.from('ingresos').update(patch).eq('id', id).eq('empresa_id', empresaId)
    if (error) {
      console.error(`ingreso id=${id}:`, error.message)
      ingFail++
    } else ingOk++
  }

  let gasOk = 0
  let gasFail = 0
  for (const p of gasPatches) {
    const { id, ...patch } = p
    const { error } = await client.from('gastos').update(patch).eq('id', id).eq('empresa_id', empresaId)
    if (error) {
      console.error(`gasto id=${id}:`, error.message)
      gasFail++
    } else gasOk++
  }

  console.log(
    JSON.stringify(
      {
        ingresos_actualizados: ingOk,
        ingresos_fallidos: ingFail,
        gastos_actualizados: gasOk,
        gastos_fallidos: gasFail,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
