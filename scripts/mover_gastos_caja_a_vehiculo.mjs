/**
 * Mueve filas de public.gastos_caja → public.gastos cuando el concepto/comentario
 * referencia unidad como «Modelo N» (ej. Versa 60, Yaris 12) y N coincide con vehiculos.id.
 *
 * NO mueve si concepto o comentarios contienen "MPBA" o "abuela" (sin importar mayúsculas),
 * ni inversión por «compra» (palabra completa «compra», p. ej. compra de / compra carro / compra vehículo).
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY.
 *
 * DRY_RUN=1 por defecto. Import real:
 *   $env:DRY_RUN='0'; node scripts/mover_gastos_caja_a_vehiculo.mjs
 *
 * No modifica ingresos, vehiculos, inversiones_vehiculo ni documentación.
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

const env = { ...process.env, ...loadDotEnv() }
const url = (env.VITE_SUPABASE_URL ?? '').trim()
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const PAGE = 1000

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasExcludedTerms(concepto, comentarios) {
  const blob = fold(`${concepto} ${comentarios}`)
  /** Palabra «compra» sola (no «recompra»); cubre compra, compra de, compra carro, compra vehículo/vehículo tras fold. */
  const compraInversion = /\bcompra\b/.test(blob)
  return {
    mpba: blob.includes('mpba'),
    abuela: blob.includes('abuela'),
    compraInversion,
  }
}

async function fetchAllGastosCaja(supabase, empresa) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('gastos_caja')
      .select('id, fecha, concepto, monto, categoria, comentarios, excel_extra')
      .eq('empresa_id', empresa)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[gastos_caja] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function fetchVehiculos(supabase, empresa) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, marca, modelo')
      .eq('empresa_id', empresa)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

/**
 * Busca «modelo normalizado» + espacio + id como palabra.
 * @returns {{ vehicleId: number | null, matchedModelo: string | null, ambiguous: boolean }}
 */
function resolveVehicleFromText(concepto, comentarios, vehiculos) {
  const haystack = fold(`${concepto} ${comentarios}`)
  if (!haystack) return { vehicleId: null, matchedModelo: null, ambiguous: false }

  const sorted = [...vehiculos].sort((a, b) => fold(b.modelo).length - fold(a.modelo).length)

  const hits = []
  for (const v of sorted) {
    const m = fold(v.modelo)
    if (!m || m.length < 2) continue
    const re = new RegExp(`\\b${escapeRe(m)}\\s+${Number(v.id)}\\b`, 'iu')
    if (re.test(haystack)) {
      hits.push({ id: Number(v.id), modelo: String(v.modelo ?? '').trim() })
    }
  }

  const byId = new Map()
  for (const h of hits) {
    if (!byId.has(h.id)) byId.set(h.id, h)
  }
  if (byId.size === 0) return { vehicleId: null, matchedModelo: null, ambiguous: false }
  if (byId.size > 1) return { vehicleId: null, matchedModelo: null, ambiguous: true }

  const only = [...byId.values()][0]
  return { vehicleId: only.id, matchedModelo: only.modelo, ambiguous: false }
}

function toGastoRow(empresa_id, cajaRow, vehicleId) {
  const concepto = String(cajaRow.concepto ?? '').trim()
  const comCaja = String(cajaRow.comentarios ?? '').trim()
  const tipo = 'OTROS GASTOS'
  const motivo = 'OTROS PROVISIONALES'
  const comentarios = `${concepto}${comCaja ? ` · ${comCaja}` : ''} [origen gastos_caja id=${cajaRow.id}]`.slice(0, 8000)
  return {
    empresa_id,
    fecha: cajaRow.fecha,
    fecha_registro: cajaRow.fecha,
    vehicle_id: vehicleId,
    tipo,
    sub_tipo: motivo,
    fecha_desde: null,
    fecha_hasta: null,
    metodo_pago: 'Efectivo',
    metodo_pago_detalle: 'Traslado desde gastos_caja (script mover_gastos_caja_a_vehiculo)',
    celular_metodo: null,
    categoria: 'GASTOS_PROVISIONALES',
    motivo,
    signo: '-',
    monto: Number(cajaRow.monto),
    pagado_a: '',
    comentarios: comentarios.slice(0, 8000),
    detalle_operativo: null,
    categoria_real: 'GASTOS_CAJA_UNIDAD',
    subcategoria: null,
    excel_extra: {
      from_gastos_caja_id: cajaRow.id,
      from_gastos_caja_excel_extra: cajaRow.excel_extra ?? null,
    },
  }
}

async function main() {
  console.log('--- mover_gastos_caja_a_vehiculo ---')
  console.log('DRY_RUN:', dryRun ? '1 (no inserta ni borra)' : '0 (INSERT gastos + DELETE gastos_caja)')

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const [cajaRows, vehiculos] = await Promise.all([fetchAllGastosCaja(supabase, empresaId), fetchVehiculos(supabase, empresaId)])

  let excludedMpba = 0
  let excludedAbuela = 0
  let excludedCompra = 0
  let noVehicleMatch = 0
  let ambiguous = 0
  /** @type {Array<{ row: object, vehicleId: number, matchedModelo: string }>} */
  const toMove = []

  for (const row of cajaRows) {
    const concepto = row.concepto ?? ''
    const comentarios = row.comentarios ?? ''
    const ex = hasExcludedTerms(concepto, comentarios)
    if (ex.mpba) excludedMpba++
    if (ex.abuela) excludedAbuela++
    if (ex.compraInversion) excludedCompra++
    if (ex.mpba || ex.abuela || ex.compraInversion) continue

    const res = resolveVehicleFromText(concepto, comentarios, vehiculos)
    if (res.ambiguous) {
      ambiguous++
      continue
    }
    if (res.vehicleId == null) {
      noVehicleMatch++
      continue
    }
    toMove.push({ row, vehicleId: res.vehicleId, matchedModelo: res.matchedModelo ?? '' })
  }

  const candidatos = toMove.length + ambiguous
  const stats = {
    total_gastos_caja: cajaRows.length,
    vehiculos_cargados: vehiculos.length,
    excluidos_mpba: excludedMpba,
    excluidos_abuela: excludedAbuela,
    excluidos_compra_inversion: excludedCompra,
    sin_patron_unidad: noVehicleMatch,
    ambiguos_modelo_id: ambiguous,
    candidatos_patron_modelo_id: candidatos,
    se_moverian: toMove.length,
  }

  console.log('\n--- Resumen ---')
  console.log(JSON.stringify(stats, null, 2))

  const muestra = toMove.slice(0, 20)
  console.log('\nMuestra (hasta 20 movimientos):')
  for (const m of muestra) {
    console.log(
      JSON.stringify({
        gastos_caja_id: m.row.id,
        fecha: m.row.fecha,
        monto: m.row.monto,
        concepto: String(m.row.concepto).slice(0, 80),
        vehicle_id: m.vehicleId,
        modelo_coincidencia: m.matchedModelo,
      }),
    )
  }
  if (toMove.length > 20) console.log(`… y ${toMove.length - 20} más`)

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se insertó en gastos ni se borró gastos_caja.')
    console.log('Real:  $env:DRY_RUN=\'0\'; node scripts/mover_gastos_caja_a_vehiculo.mjs')
    return
  }

  const insertChunk = 80
  const idsMoved = []

  console.log('\n--- Ejecución real ---')
  for (let i = 0; i < toMove.length; i += insertChunk) {
    const batch = toMove.slice(i, i + insertChunk)
    const inserts = batch.map(({ row, vehicleId }) => toGastoRow(empresaId, row, vehicleId))
    const { error: insErr } = await supabase.from('gastos').insert(inserts)
    if (insErr) throw new Error(`[gastos insert] lote ${i}: ${insErr.message}`)
    for (const { row } of batch) idsMoved.push(row.id)
    console.log(`  [gastos] +${batch.length} (total insertados hasta ahora: ${idsMoved.length})`)
  }

  const delChunk = 200
  for (let i = 0; i < idsMoved.length; i += delChunk) {
    const chunk = idsMoved.slice(i, i + delChunk)
    const { error: delErr } = await supabase.from('gastos_caja').delete().in('id', chunk)
    if (delErr) throw new Error(`[gastos_caja delete] lote ${i}: ${delErr.message}`)
    console.log(`  [gastos_caja] -${chunk.length} ids`)
  }

  console.log('\nListo. Movidos:', idsMoved.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
