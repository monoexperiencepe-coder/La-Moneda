/**
 * Audita y opcionalmente mueve public.gastos_caja → public.gastos cuando el texto
 * referencia unidad como «MODELO id» (ej. VERSA 32 BOMBA, YARIS 06 RADIADOR) e id = vehiculos.id.
 * Los dígitos del id pueden llevar ceros a la izquierda (06 → vehicle_id 6). Tras el id puede ir
 * texto libre (ej. 2/3, 2/5, descripción).
 *
 * - Candidatos claros: modelo + id exacto en texto (una sola unidad detectada).
 * - Posibles typos: número más largo que empieza por un id válido del mismo modelo (ej. VERSA 3213 → 32);
 *   solo auditoría; NO se mueven en modo real.
 * - Excluye si contiene (normalizado): MPBA/MBPA y variantes con espacios (M P B A, MB PA…);
 *   «abuela» y variantes con espacios (ABUEL A, ABUE LA…); compra (palabra completa); caja negocio.
 * - Dedup: no insertar si ya hay gasto misma empresa + fecha + monto + vehicle_id y traza/similitud.
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY.
 *
 * DRY_RUN=1 por defecto (solo informe).
 * Modo real además requiere ALLOW_GASTOS_CAJA_MOVE=1:
 *   $env:DRY_RUN='0'; $env:ALLOW_GASTOS_CAJA_MOVE='1'; node scripts/mover_gastos_caja_a_vehiculo.mjs
 *
 * No modifica ingresos, caja_negocio_vehiculo, inversiones_vehiculo ni vehículos.
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
const allowReal = env.ALLOW_GASTOS_CAJA_MOVE === '1' || env.ALLOW_GASTOS_CAJA_MOVE === 'true'
const PAGE = 1000
const CHUNK_INSERT = 80
const CHUNK_DELETE = 200

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

/** Texto ya en minúsculas sin tildes: quita espacios para detectar letras partidas (ABUEL A → abuela). */
function compactNoSpaces(blobFolded) {
  return blobFolded.replace(/\s+/g, '')
}

function hasAbuelaVariant(blobFolded) {
  return compactNoSpaces(blobFolded).includes('abuela')
}

function hasMpbaMbpaVariant(blobFolded) {
  const c = compactNoSpaces(blobFolded)
  return c.includes('mpba') || c.includes('mbpa')
}

function hasExcludedTerms(concepto, comentarios) {
  const blob = fold(`${concepto} ${comentarios}`)
  const compraInversion = /\bcompra\b/.test(blob)
  const cajaNegocio = /\b(cajas?|caj)\s+((del|de)\s+)?negocio\b/u.test(blob)
  const mpba = hasMpbaMbpaVariant(blob)
  const abuela = hasAbuelaVariant(blob)
  return {
    mpba,
    abuela,
    compraInversion,
    cajaNegocio,
    any: mpba || abuela || compraInversion || cajaNegocio,
  }
}

/** Entero del token capturado (06 → 6). Solo dígitos (regex ya lo garantiza). */
function parseIdDigits(numStr) {
  const n = Number.parseInt(String(numStr), 10)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Typos tipo «3213» → vehículo 32: el token tiene más dígitos que el id y empieza por el id como texto.
 * No aplica a «06» vs id 6 (misma longitud tras normalizar número → va por match exacto numérico).
 */
function maximalPrefixVehiclesSameModel(numStr, sameModel) {
  const prefix = sameModel.filter((v) => {
    const idStr = String(v.id)
    return numStr.startsWith(idStr) && numStr.length > idStr.length
  })
  if (!prefix.length) return []
  const maxLen = Math.max(...prefix.map((v) => String(v.id).length))
  return prefix.filter((v) => String(v.id).length === maxLen)
}

/**
 * Extrae coincidencias «modelo (folded) + bloque de dígitos» en el haystack.
 * @returns {Array<{ modelFold: string, numStr: string, index: number }>}
 */
function extractModelNumberHits(haystackFolded, vehiculos) {
  const sorted = [...vehiculos].sort((a, b) => fold(b.modelo).length - fold(a.modelo).length)
  const hits = []
  const seen = new Set()
  for (const v of sorted) {
    const m = fold(v.modelo)
    if (m.length < 2) continue
    /** Tras el modelo: bloque de dígitos (permite ceros a la izquierda); \b tras dígitos permite «06 2/3». */
    const re = new RegExp(`\\b${escapeRe(m)}\\s+(\\d+)\\b`, 'gu')
    let mm
    while ((mm = re.exec(haystackFolded)) !== null) {
      const key = `${mm.index}|${m}|${mm[1]}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ modelFold: m, numStr: mm[1], index: mm.index })
    }
  }
  hits.sort((a, b) => a.index - b.index)
  return hits
}

/**
 * @returns {{
 *   kind: 'none' | 'clear' | 'typo' | 'ambiguous_exact' | 'ambiguous_multi_unit' | 'ambiguous_typo'
 *   vehicleId?: number
 *   matchedModelo?: string
 *   typoDetail?: { numStr: string, suggestedVehicleId: number, modelo: string }
 * }}
 */
function classifyFromHits(hits, vehiculos) {
  if (!hits.length) return { kind: 'none' }

  const clearVehicleIds = new Set()
  /** @type {Array<{ suggestedVehicleId: number, modelo: string, numStr: string }>} */
  const typoSingles = []

  for (const h of hits) {
    const sameModel = vehiculos.filter((v) => fold(v.modelo) === h.modelFold)
    const idParsed = parseIdDigits(h.numStr)
    const exact =
      Number.isFinite(idParsed) ? sameModel.filter((v) => Number(v.id) === idParsed) : []
    if (exact.length === 1) {
      clearVehicleIds.add(exact[0].id)
      continue
    }
    if (exact.length > 1) return { kind: 'ambiguous_exact' }

    const narrow = maximalPrefixVehiclesSameModel(h.numStr, sameModel)
    if (narrow.length === 1) {
      typoSingles.push({
        suggestedVehicleId: narrow[0].id,
        modelo: String(narrow[0].modelo ?? '').trim(),
        numStr: h.numStr,
      })
    } else if (narrow.length > 1) {
      return { kind: 'ambiguous_typo' }
    }
  }

  if (clearVehicleIds.size === 1 && typoSingles.length === 0) {
    const vid = [...clearVehicleIds][0]
    const vv = vehiculos.find((v) => Number(v.id) === vid)
    return { kind: 'clear', vehicleId: vid, matchedModelo: vv ? String(vv.modelo).trim() : '' }
  }

  if (clearVehicleIds.size === 0 && typoSingles.length === 1) {
    const t = typoSingles[0]
    return {
      kind: 'typo',
      typoDetail: {
        numStr: t.numStr,
        suggestedVehicleId: t.suggestedVehicleId,
        modelo: t.modelo,
      },
    }
  }

  if (clearVehicleIds.size > 1) return { kind: 'ambiguous_multi_unit' }
  if (clearVehicleIds.size === 1 && typoSingles.length > 0) return { kind: 'ambiguous_multi_unit' }
  if (typoSingles.length > 1) return { kind: 'ambiguous_typo' }

  return { kind: 'none' }
}

function classifyRow(concepto, comentarios, vehiculos) {
  const haystack = fold(`${concepto} ${comentarios}`)
  if (!haystack) return { kind: 'none' }
  const hits = extractModelNumberHits(haystack, vehiculos)
  return classifyFromHits(hits, vehiculos)
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

async function fetchAllGastos(supabase, empresa) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('gastos')
      .select('id, fecha, monto, vehicle_id, comentarios, excel_extra, motivo')
      .eq('empresa_id', empresa)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[gastos] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

function dupMapKey(fecha, monto, vehicleId) {
  return `${fecha}|${Number(monto)}|${Number(vehicleId)}`
}

/**
 * Índice fecha → lista gastos (para acotar comparaciones).
 */
function buildGastosDupIndex(gastosRows) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const byFecha = new Map()
  for (const g of gastosRows) {
    const f = String(g.fecha ?? '').slice(0, 10)
    if (!f) continue
    if (!byFecha.has(f)) byFecha.set(f, [])
    byFecha.get(f).push(g)
  }
  return byFecha
}

function extraHasCajaId(extra, cajaId) {
  if (extra == null || typeof extra !== 'object') return false
  const id = extra.from_gastos_caja_id
  return id != null && Number(id) === Number(cajaId)
}

function isLikelyDuplicate(gastoRow, cajaRow, vehicleId) {
  const cid = Number(cajaRow.id)
  const com = fold(gastoRow.comentarios ?? '')
  if (com.includes(`origen gastos_caja id=${cid}`) || com.includes(`origen gastos_caja id=${cid}]`)) return true
  if (extraHasCajaId(gastoRow.excel_extra, cid)) return true

  const conceptFold = fold(cajaRow.concepto ?? '').slice(0, 55)
  if (conceptFold.length >= 6 && com.includes(conceptFold)) return true

  const motivoFold = fold(gastoRow.motivo ?? '').slice(0, 55)
  if (conceptFold.length >= 6 && motivoFold.includes(conceptFold)) return true

  return false
}

function findDuplicateForCandidate(byFechaMap, cajaRow, vehicleId) {
  const f = String(cajaRow.fecha ?? '').slice(0, 10)
  const monto = Number(cajaRow.monto)
  const vid = Number(vehicleId)
  const list = byFechaMap.get(f)
  if (!list?.length) return null
  for (const g of list) {
    if (g.vehicle_id == null || Number(g.vehicle_id) !== vid) continue
    if (Number(g.monto) !== monto) continue
    if (isLikelyDuplicate(g, cajaRow, vid)) return g
  }
  return null
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

function printSample(title, rows, limit, formatter) {
  console.log(`\n--- ${title} (hasta ${limit}) ---`)
  const slice = rows.slice(0, limit)
  for (const r of slice) console.log(formatter(r))
  if (rows.length > limit) console.log(`… y ${rows.length - limit} más`)
}

async function main() {
  console.log('=== mover_gastos_caja_a_vehiculo — auditoría / traslado ===')
  console.log('DRY_RUN:', dryRun ? '1 (solo informe; no inserta ni borra)' : '0 (modo ejecución)')
  if (!dryRun && !allowReal) {
    console.error(
      '\n[BLOQUEADO] Modo real desactivado por seguridad. Para ejecutar inserciones/borrados añade también:\n  ALLOW_GASTOS_CAJA_MOVE=1\n',
    )
    process.exit(1)
  }

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const [cajaRows, vehiculos, gastosRows] = await Promise.all([
    fetchAllGastosCaja(supabase, empresaId),
    fetchVehiculos(supabase, empresaId),
    fetchAllGastos(supabase, empresaId),
  ])

  const byFecha = buildGastosDupIndex(gastosRows)

  let excludedMpba = 0
  let excludedAbuela = 0
  let excludedCompra = 0
  let excludedCajaNegocio = 0
  let sinPatron = 0
  let ambiguousExact = 0
  let ambiguousMultiUnit = 0
  let ambiguousTypo = 0
  /** candidatos claros antes de dedup */
  /** @type {Array<{ row: object, vehicleId: number, matchedModelo: string }>} */
  const clearRaw = []
  /** @type {Array<{ row: object, detail: object }>} */
  const typoRows = []
  /** @type {Array<{ row: object, vehicleId: number, dupGastoId: unknown }>} */
  const duplicateBlocked = []

  for (const row of cajaRows) {
    const concepto = row.concepto ?? ''
    const comentarios = row.comentarios ?? ''
    const ex = hasExcludedTerms(concepto, comentarios)
    if (ex.mpba) excludedMpba++
    if (ex.abuela) excludedAbuela++
    if (ex.compraInversion) excludedCompra++
    if (ex.cajaNegocio) excludedCajaNegocio++
    if (ex.any) continue

    const cl = classifyRow(concepto, comentarios, vehiculos)
    if (cl.kind === 'none') {
      sinPatron++
      continue
    }
    if (cl.kind === 'ambiguous_exact') {
      ambiguousExact++
      continue
    }
    if (cl.kind === 'ambiguous_multi_unit') {
      ambiguousMultiUnit++
      continue
    }
    if (cl.kind === 'ambiguous_typo') {
      ambiguousTypo++
      continue
    }
    if (cl.kind === 'typo') {
      typoRows.push({ row, detail: cl.typoDetail })
      continue
    }
    if (cl.kind === 'clear' && cl.vehicleId != null) {
      clearRaw.push({ row, vehicleId: cl.vehicleId, matchedModelo: cl.matchedModelo ?? '' })
    }
  }

  /** Tras dedup: solo insertables */
  /** @type {typeof clearRaw} */
  const toMove = []
  for (const m of clearRaw) {
    const dup = findDuplicateForCandidate(byFecha, m.row, m.vehicleId)
    if (dup) duplicateBlocked.push({ row: m.row, vehicleId: m.vehicleId, dupGastoId: dup.id })
    else toMove.push(m)
  }

  const stats = {
    total_gastos_caja: cajaRows.length,
    vehiculos_cargados: vehiculos.length,
    gastos_cargados_index: gastosRows.length,
    excluidos_mpba: excludedMpba,
    excluidos_abuela: excludedAbuela,
    excluidos_compra_palabra: excludedCompra,
    excluidos_caja_negocio: excludedCajaNegocio,
    sin_patron_modelo_id: sinPatron,
    ambiguos_match_exacto_multiple: ambiguousExact,
    ambiguos_varias_unidades_en_texto: ambiguousMultiUnit,
    ambiguos_typo_multiple: ambiguousTypo,
    candidatos_claros_patron_exacto: clearRaw.length,
    posibles_typos: typoRows.length,
    ya_movidos_o_duplicados_potenciales: duplicateBlocked.length,
    se_insertarian_tras_dedup: toMove.length,
  }

  console.log('\n--- Resumen (JSON) ---')
  console.log(JSON.stringify(stats, null, 2))

  printSample(
    'Muestra candidatos claros (patrón exacto; antes de dedup)',
    clearRaw,
    50,
    (m) =>
      JSON.stringify({
        gastos_caja_id: m.row.id,
        fecha: m.row.fecha,
        monto: m.row.monto,
        vehicle_id: m.vehicleId,
        modelo: m.matchedModelo,
        concepto: String(m.row.concepto).slice(0, 90),
      }),
  )

  printSample(
    'Muestra posibles typos / número extendido (NO se mueven en modo real)',
    typoRows,
    50,
    (x) =>
      JSON.stringify({
        gastos_caja_id: x.row.id,
        fecha: x.row.fecha,
        monto: x.row.monto,
        texto_numero: x.detail.numStr,
        modelo: x.detail.modelo,
        posible_vehicle_id: x.detail.suggestedVehicleId,
        concepto: String(x.row.concepto).slice(0, 90),
      }),
  )

  printSample(
    'Muestra bloqueados por duplicado / ya movidos',
    duplicateBlocked,
    50,
    (x) =>
      JSON.stringify({
        gastos_caja_id: x.row.id,
        fecha: x.row.fecha,
        monto: x.row.monto,
        vehicle_id: x.vehicleId,
        gasto_existente_id: x.dupGastoId,
        concepto: String(x.row.concepto).slice(0, 80),
      }),
  )

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se insertó en gastos ni se borró gastos_caja.')
    console.log('Modo real (solo candidatos claros sin duplicado; typos NO):')
    console.log('  PowerShell:')
    console.log("    $env:DRY_RUN='0'; $env:ALLOW_GASTOS_CAJA_MOVE='1'; node scripts/mover_gastos_caja_a_vehiculo.mjs")
    return
  }

  console.log('\n--- Ejecución real (candidatos claros únicamente) ---')
  const idsMoved = []
  for (let i = 0; i < toMove.length; i += CHUNK_INSERT) {
    const batch = toMove.slice(i, i + CHUNK_INSERT)
    const inserts = batch.map(({ row, vehicleId }) => toGastoRow(empresaId, row, vehicleId))
    const { error: insErr } = await supabase.from('gastos').insert(inserts)
    if (insErr) throw new Error(`[gastos insert] lote ${i}: ${insErr.message}`)
    for (const { row } of batch) idsMoved.push(row.id)
    console.log(`  [gastos] +${batch.length} (total: ${idsMoved.length}/${toMove.length})`)
  }

  for (let i = 0; i < idsMoved.length; i += CHUNK_DELETE) {
    const chunk = idsMoved.slice(i, i + CHUNK_DELETE)
    const { error: delErr } = await supabase.from('gastos_caja').delete().in('id', chunk)
    if (delErr) throw new Error(`[gastos_caja delete] lote ${i}: ${delErr.message}`)
    console.log(`  [gastos_caja] eliminados ${chunk.length}`)
  }

  console.log('\nListo. Insertados + eliminados de caja:', idsMoved.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
