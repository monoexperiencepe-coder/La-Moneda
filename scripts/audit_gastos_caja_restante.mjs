/**
 * Audita public.gastos_caja (ledger bruto) sin insertar, borrar ni actualizar nada.
 *
 * Clasifica cada fila en buckets para priorizar revisión humana / posibles traslados a gastos.
 * DRY_RUN=1 por defecto (solo lectura; este script nunca escribe en BD).
 *
 * Requiere: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o variantes en .env).
 *
 * Uso:
 *   node scripts/audit_gastos_caja_restante.mjs
 *   node scripts/audit_gastos_caja_restante.mjs --json
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const LAST_JSON = resolve(__dirname, '.audit_gastos_caja_restante_last.json')

const PAGE = 1000
const SAMPLE = 50

const BUCKETS = /** @type {const} */ ([
  'candidato_mover_operativo_vehiculo',
  'administrativo_empresa',
  'financiero_prestamo',
  'inversion_compra',
  'personal_socios',
  'caja_negocio_utilidad',
  'quedarse_gastos_caja',
  'duda_revision',
  'posibles_typos_unidad',
  'ya_movidos_o_duplicados',
])

/** Señales mecánicas / vehículo (texto ya fold). */
const MECHANICAL_TERMS = [
  'motor',
  'frenos',
  'llantas',
  'pastillas',
  'bujias',
  'bujías',
  'embrague',
  'caja',
  'rodaje',
  'gnv',
  'gas',
  'soat',
  'faro',
  'luna',
  'radio',
  'plumillas',
  'extintor',
  'certificado gas',
  'permiso lunas',
  'aceite',
  'filtro',
  'bomba',
  'sensor',
  'alternador',
  'inyectores',
  'soporte',
  'amortiguador',
  'reparacion',
  'reparación',
  'arreglo',
  'frenado',
  'disco',
  'suspension',
  'suspensión',
  'radiador',
  'manguera',
  'correa',
]

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
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const writeJson = process.argv.includes('--json')

if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseIdDigits(numStr) {
  const n = Number.parseInt(String(numStr), 10)
  return Number.isFinite(n) ? n : NaN
}

function maximalPrefixVehiclesSameModel(numStr, sameModel) {
  const prefix = sameModel.filter((v) => {
    const idStr = String(v.id)
    return numStr.startsWith(idStr) && numStr.length > idStr.length
  })
  if (!prefix.length) return []
  const maxLen = Math.max(...prefix.map((v) => String(v.id).length))
  return prefix.filter((v) => String(v.id).length === maxLen)
}

function extractModelNumberHits(haystackFolded, vehiculos) {
  const sorted = [...vehiculos].sort((a, b) => fold(b.modelo).length - fold(a.modelo).length)
  const hits = []
  const seen = new Set()
  for (const v of sorted) {
    const m = fold(v.modelo)
    if (m.length < 2) continue
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

function classifyFromHits(hits, vehiculos) {
  if (!hits.length) return { kind: 'none' }

  const clearVehicleIds = new Set()
  /** @type {Array<{ suggestedVehicleId: number, modelo: string, numStr: string }>} */
  const typoSingles = []

  for (const h of hits) {
    const sameModel = vehiculos.filter((v) => fold(v.modelo) === h.modelFold)
    const idParsed = parseIdDigits(h.numStr)
    const exact = Number.isFinite(idParsed) ? sameModel.filter((v) => Number(v.id) === idParsed) : []
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

function classifyModelPlaca(concepto, comentarios, vehiculos) {
  const haystack = fold(`${concepto} ${comentarios}`)
  if (!haystack) return { kind: 'none' }
  const hits = extractModelNumberHits(haystack, vehiculos)
  return classifyFromHits(hits, vehiculos)
}

function montoClose(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.02
}

function extraHasCajaId(extra, cajaId) {
  if (extra == null || typeof extra !== 'object') return false
  const id = extra.from_gastos_caja_id
  return id != null && Number(id) === Number(cajaId)
}

function comentariosMencionanCajaId(comentarios, cajaId) {
  const cid = Number(cajaId)
  const c = fold(comentarios ?? '')
  if (/\[\s*origen\s+gastos_caja\s+id\s*=\s*\d+\s*\]/i.test(String(comentarios ?? ''))) {
    const m = String(comentarios ?? '').match(/origen\s+gastos_caja\s+id\s*=\s*(\d+)/i)
    if (m && Number(m[1]) === cid) return true
  }
  if (c.includes(`origen gastos_caja id=${cid}`) || c.includes(`origen gastos_caja id=${cid}]`)) return true
  if (c.includes(`gastos_caja id=${cid}`)) return true
  return false
}

function buildGastosByFecha(gastosRows) {
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

function isLikelyDuplicate(gastoRow, cajaRow) {
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

/** @returns {{ kind: 'none' | 'linked' | 'fecha_monto', gastoIds: number[], detail?: string }} */
function detectYaMovidoDuplicado(cajaRow, gastosRows, byFecha) {
  const cid = Number(cajaRow.id)
  const matches = []
  for (const g of gastosRows) {
    if (extraHasCajaId(g.excel_extra, cid)) matches.push(Number(g.id))
    else if (comentariosMencionanCajaId(g.comentarios, cid)) matches.push(Number(g.id))
  }
  if (matches.length) {
    return { kind: 'linked', gastoIds: [...new Set(matches)], detail: 'excel_extra o comentarios traza gastos_caja' }
  }

  const f = String(cajaRow.fecha ?? '').slice(0, 10)
  const list = byFecha.get(f)
  if (!list?.length) return { kind: 'none', gastoIds: [] }

  const fechaMontoIds = []
  for (const g of list) {
    if (!montoClose(g.monto, cajaRow.monto)) continue
    if (isLikelyDuplicate(g, cajaRow)) fechaMontoIds.push(Number(g.id))
  }
  if (fechaMontoIds.length) {
    return {
      kind: 'fecha_monto',
      gastoIds: [...new Set(fechaMontoIds)],
      detail: 'misma fecha + monto + similitud texto / traza débil',
    }
  }

  return { kind: 'none', gastoIds: [] }
}

function hasCajaNegocio(blob) {
  return /\b(cajas?|caj)\s+((del|de)\s+)?negocio\b/u.test(blob)
}

/** Excluir de candidato operativo (MPBA, abuela, ASV, préstamo, etc.). */
function exclusionOperativoMover(blob) {
  const c = compactNoSpaces(blob)
  if (hasMpbaMbpaVariant(blob)) return { hit: true, tag: 'mpba_mbpa' }
  if (hasAbuelaVariant(blob)) return { hit: true, tag: 'abuela' }
  if (/\basv\b/.test(blob) || /\basb\b/.test(blob) || /\bdsb\b/.test(blob)) return { hit: true, tag: 'asv_asb_dsb' }
  if (/\bprestamo\b/.test(blob) || /\bpréstamo\b/.test(blob)) return { hit: true, tag: 'prestamo' }
  if (/\binteres\b/.test(blob) || /\binterés\b/.test(blob)) return { hit: true, tag: 'interes' }
  if (/\bcompra\s+carro\b/.test(blob) || /\bcompra\s+vehiculo\b/.test(blob) || /\bcompra\s+vehículo\b/.test(blob))
    return { hit: true, tag: 'compra_carro' }
  if (/\bcompra\b/.test(blob)) return { hit: true, tag: 'compra_otra' }
  if (/\bsocios?\b/.test(blob)) return { hit: true, tag: 'socios' }
  if (/\bcasa\b/.test(blob)) return { hit: true, tag: 'casa' }
  if (/\bfamilia\b/.test(blob)) return { hit: true, tag: 'familia' }
  if (/\bsunat\b/.test(blob) || /\brus\b/.test(blob) || /\boficina\b/.test(blob) || /\bboletas?\b/.test(blob))
    return { hit: true, tag: 'admin_sunat_rus' }
  if (/chips?\s*gps/.test(blob) || /plataforma\s*gps/.test(blob)) return { hit: true, tag: 'gps_plataforma' }
  if (hasCajaNegocio(blob)) return { hit: true, tag: 'caja_negocio' }
  return { hit: false, tag: '' }
}

function hasMechanicalSignals(blobFolded) {
  if (hasCajaNegocio(blobFolded)) {
    const withoutCajaNeg = blobFolded.replace(/\b(cajas?|caj)\s+((del|de)\s+)?negocio\b/giu, ' ')
    for (const term of MECHANICAL_TERMS) {
      const t = fold(term)
      if (t.length < 2) continue
      if (t === 'caja') {
        if (new RegExp(`\\bcaja\\b`, 'i').test(withoutCajaNeg)) return true
        continue
      }
      if (new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(blobFolded)) return true
    }
    return false
  }
  for (const term of MECHANICAL_TERMS) {
    const t = fold(term)
    if (t.length < 2) continue
    if (new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(blobFolded)) return true
  }
  return false
}

function placaMatchInText(blobFolded, vehiculos) {
  for (const v of vehiculos) {
    const p = fold(v.placa ?? '').replace(/\s+/g, '')
    if (p.length < 3) continue
    const re = new RegExp(`\\b${escapeRe(p)}\\b`, 'i')
    if (re.test(blobFolded)) return { hit: true, placa: v.placa, vehicleId: v.id }
  }
  return { hit: false }
}

function routeExcludedToBucket(blob) {
  const ex = exclusionOperativoMover(blob)
  if (!ex.hit) return null
  if (ex.tag === 'caja_negocio') return 'caja_negocio_utilidad'
  if (ex.tag === 'prestamo' || ex.tag === 'interes') return 'financiero_prestamo'
  if (ex.tag === 'compra_carro') return 'inversion_compra'
  if (ex.tag === 'compra_otra') return 'quedarse_gastos_caja'
  if (ex.tag === 'socios' || ex.tag === 'casa' || ex.tag === 'familia') return 'personal_socios'
  if (ex.tag === 'admin_sunat_rus' || ex.tag === 'gps_plataforma') return 'administrativo_empresa'
  if (ex.tag === 'mpba_mbpa' || ex.tag === 'abuela' || ex.tag === 'asv_asb_dsb') return 'quedarse_gastos_caja'
  return 'quedarse_gastos_caja'
}

/**
 * @param {object} cajaRow
 * @param {Array<{id:number, marca:string, modelo:string, placa:string}>} vehiculos
 * @param {ReturnType<typeof detectYaMovidoDuplicado>} dupInfo
 */
function assignBucket(cajaRow, vehiculos, dupInfo) {
  const blob = fold(`${cajaRow.concepto} ${cajaRow.comentarios}`)

  if (dupInfo.kind !== 'none') {
    return {
      bucket: 'ya_movidos_o_duplicados',
      meta: { dup: dupInfo.kind, gastoIds: dupInfo.gastoIds, detail: dupInfo.detail },
    }
  }

  const modelCls = classifyModelPlaca(cajaRow.concepto, cajaRow.comentarios, vehiculos)
  if (['ambiguous_exact', 'ambiguous_multi_unit', 'ambiguous_typo'].includes(modelCls.kind)) {
    return { bucket: 'duda_revision', meta: { ambiguedad_modelo_numero: modelCls.kind } }
  }
  if (modelCls.kind === 'typo' && modelCls.typoDetail) {
    return {
      bucket: 'posibles_typos_unidad',
      meta: { typo: modelCls.typoDetail },
    }
  }

  const routed = routeExcludedToBucket(blob)
  if (routed) {
    return { bucket: routed, meta: { exclusion: true } }
  }

  const mech = hasMechanicalSignals(blob)
  const placaHit = placaMatchInText(blob, vehiculos)
  const unitClear = modelCls.kind === 'clear' && modelCls.vehicleId != null

  if (mech && (unitClear || placaHit.hit)) {
    return {
      bucket: 'candidato_mover_operativo_vehiculo',
      meta: {
        vehicleId: unitClear ? modelCls.vehicleId : placaHit.vehicleId ?? null,
        via: unitClear ? 'modelo_numero' : placaHit.hit ? 'placa' : null,
        matchedModelo: modelCls.matchedModelo ?? null,
        placa: placaHit.placa ?? null,
      },
    }
  }

  if (/\bsunat\b/.test(blob) || /\brus\b/.test(blob) || /\boficina\b/.test(blob) || /\bboletas?\b/.test(blob))
    return { bucket: 'administrativo_empresa', meta: {} }
  if (/chips?\s*gps/.test(blob) || /plataforma\s*gps/.test(blob))
    return { bucket: 'administrativo_empresa', meta: {} }

  if (mech) {
    return { bucket: 'duda_revision', meta: { reason: 'senal_mecanica_sin_unidad_clara' } }
  }

  return { bucket: 'quedarse_gastos_caja', meta: {} }
}

async function fetchAll(table, selectCols, empresa) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .eq('empresa_id', empresa)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[${table}] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

function summarize(bucketMap) {
  const lines = []
  for (const name of BUCKETS) {
    const arr = bucketMap.get(name) ?? []
    const count = arr.length
    const total = arr.reduce((s, x) => s + Number(x.row.monto ?? 0), 0)
    lines.push({ bucket: name, cantidad: count, monto_total: Math.round(total * 100) / 100 })
  }
  return lines
}

function formatSampleLine(x) {
  const r = x.row
  const id = r.id
  const f = String(r.fecha ?? '').slice(0, 10)
  const m = Number(r.monto).toFixed(2)
  const c = String(r.concepto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72)
  const extra = x.meta && Object.keys(x.meta).length ? ` | ${JSON.stringify(x.meta).slice(0, 120)}` : ''
  return `  id=${id} ${f} S/${m} — ${c}${extra}`
}

async function main() {
  console.log('=== audit_gastos_caja_restante ===')
  console.log('DRY_RUN:', dryRun ? '1 (solo lectura; este script no escribe en BD)' : '0 (igual sin escrituras)')
  console.log('empresa_id:', empresaId)

  const [cajaRows, vehiculos, gastosRows] = await Promise.all([
    fetchAll('gastos_caja', 'id, fecha, concepto, monto, categoria, comentarios, excel_extra', empresaId),
    fetchAll('vehiculos', 'id, marca, modelo, placa', empresaId),
    fetchAll('gastos', 'id, fecha, monto, vehicle_id, comentarios, excel_extra, motivo', empresaId),
  ])

  const byFecha = buildGastosByFecha(gastosRows)

  /** @type {Map<string, Array<{ row: object, meta: object }>>} */
  const bucketMap = new Map()
  for (const b of BUCKETS) bucketMap.set(b, [])

  for (const row of cajaRows) {
    const dupInfo = detectYaMovidoDuplicado(row, gastosRows, byFecha)
    const { bucket, meta } = assignBucket(row, vehiculos, dupInfo)
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, [])
    bucketMap.get(bucket).push({ row, meta })
  }

  const summary = summarize(bucketMap)

  console.log('\n--- Resumen por bucket ---')
  for (const s of summary) {
    const arr = bucketMap.get(s.bucket) ?? []
    console.log(`\n## ${s.bucket}`)
    console.log(`  cantidad: ${s.cantidad}`)
    console.log(`  monto_total: S/ ${s.monto_total.toFixed(2)}`)
    console.log(`  muestra (hasta ${SAMPLE}):`)
    const slice = arr.slice(0, SAMPLE)
    for (const x of slice) console.log(formatSampleLine(x))
    if (arr.length > SAMPLE) console.log(`  … y ${arr.length - SAMPLE} más`)
  }

  console.log('\n--- Totales ---')
  console.log('gastos_caja filas:', cajaRows.length)
  console.log('vehiculos:', vehiculos.length)
  console.log('gastos (índice dedup):', gastosRows.length)

  if (writeJson) {
    const payload = {
      generatedAt: new Date().toISOString(),
      empresa_id: empresaId,
      dry_run: dryRun,
      summary,
      samples: Object.fromEntries(
        BUCKETS.map((b) => [
          b,
          (bucketMap.get(b) ?? []).slice(0, SAMPLE).map((x) => ({
            id: x.row.id,
            fecha: x.row.fecha,
            monto: Number(x.row.monto),
            concepto: x.row.concepto,
            comentarios: x.row.comentarios,
            meta: x.meta,
          })),
        ]),
      ),
    }
    writeFileSync(LAST_JSON, JSON.stringify(payload, null, 2), 'utf8')
    console.log('\nJSON escrito:', LAST_JSON)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
