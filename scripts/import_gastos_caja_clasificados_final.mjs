/**
 * Migra movimientos desde Excel clasificado (fuente de verdad) → public.gastos.
 * NO lee ni actualiza public.gastos_caja. NO borra nada.
 *
 * Columnas requeridas en la primera hoja: fecha, concepto, monto, categoria_final, subtipo, vehiculo_detectado
 * (acepta variantes de encabezado sin acentos / espacios → snake_case).
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY
 *
 * DRY_RUN=1 por defecto (solo resumen; no inserta).
 * Insert real: DRY_RUN=0 (opcionalmente ALLOW_MIGRACION_GASTOS_CAJA_FINAL=1 como segunda llave).
 *
 * Excel: argv ruta, o GASTOS_CAJA_CLASIFICADOS_XLSX en .env,
 * o por defecto ./reports/gastos_caja_ordenado_final_sin_vehiculo_en_no_operativos.xlsx
 * o %USERPROFILE%/Downloads/gastos_caja_ordenado_final_sin_vehiculo_en_no_operativos.xlsx
 *
 * Uso:
 *   DRY_RUN=1 node scripts/import_gastos_caja_clasificados_final.mjs
 *   DRY_RUN=1 node scripts/import_gastos_caja_clasificados_final.mjs "C:\\ruta\\archivo.xlsx"
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute, join } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { normalizeSqlDate } from './sql_date_normalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PATH_AUDIT_SIN_VEHICLE = resolve(__dirname, '.audit_operativos_sin_vehicle_id.xlsx')
const PATH_AUDIT_DUP_EXCEL = resolve(__dirname, '.audit_duplicados_excel.xlsx')
const MIGR_VERSION = '2026-05-final'
const PAGE = 1000
const CHUNK = 80

const ALLOWED_CATEGORIAS = new Set([
  'operativo_vehiculo',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'inversion_compra',
  'personal_socios_familiares',
  'gastos_globales',
])

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
const allowReal =
  env.ALLOW_MIGRACION_GASTOS_CAJA_FINAL === '1' ||
  env.ALLOW_MIGRACION_GASTOS_CAJA_FINAL === 'true'

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeaderKey(raw) {
  const f = fold(String(raw ?? ''))
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  const aliases = {
    fecha_movimiento: 'fecha',
    fecha_mov: 'fecha',
    categoria: 'categoria_final',
    categoria_final_excel: 'categoria_final',
    tipo_final: 'categoria_final',
    vehiculo: 'vehiculo_detectado',
    vehículo_detectado: 'vehiculo_detectado',
    unidad_detectada: 'vehiculo_detectado',
    subtipo_gasto: 'subtipo',
    detalle_subtipo: 'subtipo',
  }
  return aliases[f] ?? f
}

function resolveXlsxPath(argvPath) {
  const a = (argvPath || '').trim()
  if (a) return isAbsolute(a) ? a : resolve(root, a)
  const g = (env.GASTOS_CAJA_CLASIFICADOS_XLSX ?? '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  const inReports = resolve(root, 'reports', 'gastos_caja_ordenado_final_sin_vehiculo_en_no_operativos.xlsx')
  if (existsSync(inReports)) return inReports
  const inDownloads = join(homedir(), 'Downloads', 'gastos_caja_ordenado_final_sin_vehiculo_en_no_operativos.xlsx')
  if (existsSync(inDownloads)) return inDownloads
  return inReports
}

function excelSerialToYmd(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const p = XLSX.SSF.parse_date_code(serial)
  if (!p) return null
  const y = p.y
  const mo = p.m
  const d = p.d
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function cellToFecha(raw) {
  if (raw == null || raw === '') return { fecha: null, note: 'vacío' }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear()
    const mo = raw.getMonth() + 1
    const d = raw.getDate()
    return { fecha: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, note: null }
  }
  if (typeof raw === 'number') {
    const ymd = excelSerialToYmd(raw)
    if (ymd) {
      const n = normalizeSqlDate(ymd)
      return n.fecha ? { fecha: n.fecha, note: null } : { fecha: null, note: 'serial_invalido' }
    }
  }
  const s = String(raw).trim()
  const sql = normalizeSqlDate(s.slice(0, 10))
  if (sql.fecha) return { fecha: sql.fecha, note: sql.adjusted ? sql.note : null }
  const trySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (trySlash) {
    const mo = Number(trySlash[1])
    const d = Number(trySlash[2])
    const y = Number(trySlash[3])
    const ymd = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const n = normalizeSqlDate(ymd)
    return n.fecha ? { fecha: n.fecha, note: 'desde_dd_mm_yyyy' } : { fecha: null, note: 'fecha_invalida' }
  }
  return { fecha: null, note: 'formato_no_reconocido' }
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
      typoSingles.push({ suggestedVehicleId: narrow[0].id, modelo: String(narrow[0].modelo ?? '').trim(), numStr: h.numStr })
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
    return { kind: 'typo', typoDetail: { numStr: t.numStr, suggestedVehicleId: t.suggestedVehicleId, modelo: t.modelo } }
  }
  if (clearVehicleIds.size > 1) return { kind: 'ambiguous_multi_unit' }
  if (clearVehicleIds.size === 1 && typoSingles.length > 0) return { kind: 'ambiguous_multi_unit' }
  if (typoSingles.length > 1) return { kind: 'ambiguous_typo' }
  return { kind: 'none' }
}

function resolveVehicleFromText(texto, vehiculos) {
  const haystack = fold(String(texto ?? ''))
  if (!haystack) return { kind: 'none' }
  const hits = extractModelNumberHits(haystack, vehiculos)
  return classifyFromHits(hits, vehiculos)
}

function fingerprint(concepto, fecha, monto) {
  const c = fold(concepto).replace(/\s+/g, ' ').trim()
  return `${fecha}|${c}|${Number(monto).toFixed(2)}`
}

function writeAuditXlsx(filepath, sheetName, objects) {
  if (!objects.length) return
  const ws = XLSX.utils.json_to_sheet(objects)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1')
  XLSX.writeFile(wb, filepath)
}

function motivoSinVehicle(det, vehiculoDetectado) {
  const v = String(vehiculoDetectado ?? '').trim()
  if (!v) return 'vehiculo_detectado vacío; no hay texto para modelo+número de unidad'
  if (det.kind === 'typo')
    return 'posible typo de unidad (número no coincide exacto); revisar modelo+número en vehiculos'
  if (det.kind === 'ambiguous_exact')
    return 'ambigüedad: más de una unidad con mismo id/modelo para el número indicado'
  if (det.kind === 'ambiguous_multi_unit') return 'ambigüedad: varias unidades detectadas en el texto'
  if (det.kind === 'ambiguous_typo') return 'ambigüedad: varios typos/unidades candidatas'
  if (det.kind === 'none') return 'vehiculo_detectado sin coincidencia con modelo+número de flota'
  return `sin_resolver: clasificacion_modelo=${det.kind}`
}

function extractMigracionExtra(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
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

function dedupeKey(version, excelRow) {
  return `${String(version ?? '').trim()}|${Number(excelRow)}`
}

async function fetchMigratedRowIndex(supabase, empresa) {
  /** @type {Set<string>} */
  const set = new Set()
  let from = 0
  /** @type {{ data: unknown[] | null; error: Error | null }} */
  let last = { data: [], error: null }
  for (;;) {
    const q = supabase
      .from('gastos')
      .select('excel_extra')
      .eq('empresa_id', empresa)
      .contains('excel_extra', { migracion_gastos_caja_final: true })
      .range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) {
      last = { data: null, error }
      break
    }
    last = { data, error: null }
    if (!data?.length) break
    for (const g of data) {
      const ex = extractMigracionExtra(g.excel_extra)
      if (!ex || ex.migracion_gastos_caja_final !== true) continue
      const row = Number(ex.excel_row)
      if (!Number.isFinite(row) || row <= 0) continue
      set.add(dedupeKey(ex.migracion_version ?? '', row))
      set.add(dedupeKey('*', row))
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  if (!last.error) return set

  console.warn('[dedupe] contains() falló; escaneo paginado de excel_extra:', last.error.message)
  from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('gastos')
      .select('excel_extra')
      .eq('empresa_id', empresa)
      .not('excel_extra', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[gastos dedupe index fallback] ${error.message}`)
    if (!data?.length) break
    for (const g of data) {
      const ex = extractMigracionExtra(g.excel_extra)
      if (!ex || ex.migracion_gastos_caja_final !== true) continue
      const row = Number(ex.excel_row)
      if (!Number.isFinite(row) || row <= 0) continue
      set.add(dedupeKey(ex.migracion_version ?? '', row))
      set.add(dedupeKey('*', row))
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return set
}

function normalizeCategoria(raw) {
  const f = fold(String(raw ?? '')).replace(/\s+/g, '_')
  return f.replace(/[^a-z0-9_]/g, '')
}

function readExcelRows(path) {
  if (!existsSync(path)) throw new Error(`No existe el archivo: ${path}`)
  const wb = XLSX.readFile(path)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
  if (!matrix.length) return { sheetName, rows: [] }

  const rawKeys = Object.keys(matrix[0])
  const keyMap = {}
  for (const k of rawKeys) {
    const nk = normalizeHeaderKey(k)
    if (nk) keyMap[nk] = k
  }

  const required = ['fecha', 'concepto', 'monto', 'categoria_final', 'subtipo', 'vehiculo_detectado']
  const missing = required.filter((r) => !keyMap[r])
  if (missing.length) {
    throw new Error(
      `Faltan columnas en Excel (hoja "${sheetName}"). Normalizadas esperadas: ${required.join(', ')}\n` +
        `Detectadas: ${Object.keys(keyMap).join(', ')}\n` +
        `Faltan: ${missing.join(', ')}`,
    )
  }

  const rows = []
  let excelRow = 1
  for (const obj of matrix) {
    excelRow++
    const pick = (logical) => obj[keyMap[logical]]

    const fechaMeta = cellToFecha(pick('fecha'))
    const concepto = String(pick('concepto') ?? '').trim()
    const montoRaw = pick('monto')
    const monto =
      typeof montoRaw === 'number'
        ? montoRaw
        : Number.parseFloat(String(montoRaw).replace(/,/g, '').trim())
    const categoria_final = normalizeCategoria(pick('categoria_final'))
    const subtipoRaw = pick('subtipo')
    const subtipo = String(subtipoRaw ?? '').trim()
    const vehRaw = pick('vehiculo_detectado')
    const vehiculo_detectado = String(vehRaw ?? '').trim()

    rows.push({
      excelRow,
      fecha: fechaMeta.fecha,
      fechaNote: fechaMeta.note,
      concepto,
      monto,
      categoria_final,
      subtipo,
      vehiculo_detectado,
    })
  }
  return { sheetName, rows }
}

function buildInsertPayload(row, vehicleId, empresa_id) {
  const cat = row.categoria_final
  const isOp = cat === 'operativo_vehiculo'
  const subNorm = row.subtipo ? row.subtipo.slice(0, 500) : null
  const fecha = row.fecha
  const concepto = row.concepto
  const monto = Number(row.monto)
  const fp = fingerprint(concepto, fecha, monto)

  const excel_extra = {
    migracion_gastos_caja_final: true,
    origen: 'gastos_caja_excel_final',
    concepto_original: concepto,
    categoria_final_excel: cat,
    subtipo_excel: row.subtipo || '',
    vehiculo_detectado_excel: row.vehiculo_detectado || '',
    migracion_version: MIGR_VERSION,
    excel_row: row.excelRow,
    dedupe_fingerprint: fp,
  }

  const motivo = subNorm || 'MIGRACION_GASTOS_CAJA_FINAL'

  return {
    empresa_id,
    fecha,
    fecha_registro: fecha,
    vehicle_id: isOp ? vehicleId : null,
    tipo: 'OTROS GASTOS',
    sub_tipo: motivo,
    fecha_desde: null,
    fecha_hasta: null,
    metodo_pago: 'Efectivo',
    metodo_pago_detalle: `Migración Excel (${MIGR_VERSION})`,
    celular_metodo: null,
    categoria: 'GASTOS_PROVISIONALES',
    motivo,
    signo: '-',
    monto,
    pagado_a: '',
    comentarios: `[migración gastos_caja final] ${concepto}`.slice(0, 8000),
    detalle_operativo: null,
    categoria_real: 'MIGRACION_EXCEL_CAJA_FINAL',
    subcategoria: subNorm,
    excel_extra,
    tipo_gasto: cat,
    subtipo_gasto: subNorm,
    es_global_flota: !isOp,
    origen_clasificacion: 'migracion_gastos_caja_final',
    requiere_revision: false,
    clasificacion_manual: true,
    clasificacion_confianza: 1,
  }
}

async function main() {
  const argvPos = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const xlsxPath = resolveXlsxPath(argvPos[0])

  console.log('=== import_gastos_caja_clasificados_final ===')
  console.log('Excel:', xlsxPath)
  console.log('DRY_RUN:', dryRun ? '1 (sin INSERT)' : '0 (INSERT habilitado si llave de seguridad)')
  console.log('empresa_id:', empresaId)

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const { sheetName, rows: excelRows } = readExcelRows(xlsxPath)
  console.log('Hoja:', sheetName)
  console.log('Filas leídas (datos):', excelRows.length)

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const vehiculos = await fetchVehiculos(supabase, empresaId)
  const migratedRowsDb = await fetchMigratedRowIndex(supabase, empresaId)

  const stats = {
    por_categoria: Object.fromEntries([...ALLOWED_CATEGORIAS].map((k) => [k, 0])),
    monto_por_categoria: Object.fromEntries([...ALLOWED_CATEGORIAS].map((k) => [k, 0])),
    invalid_categoria: 0,
    invalid_fecha: 0,
    invalid_monto: 0,
    invalid_concepto: 0,
    duplicados_excel: 0,
    duplicados_db: 0,
    operativo_sin_vehicle_resuelto: 0,
    operativo_typo_o_ambiguo: 0,
    listos_insertar: 0,
  }

  /** @type {typeof excelRows} */
  const toInsert = []
  /** @type {Map<string, { fp: string, row: object }[]>} */
  const fpToOccurrences = new Map()
  /** @type {Array<Record<string, unknown>>} */
  const auditSinVehicle = []

  for (const r of excelRows) {
    if (!r.concepto) {
      stats.invalid_concepto++
      continue
    }
    if (!r.fecha) {
      stats.invalid_fecha++
      continue
    }
    if (!Number.isFinite(r.monto) || r.monto <= 0) {
      stats.invalid_monto++
      continue
    }
    if (!ALLOWED_CATEGORIAS.has(r.categoria_final)) {
      stats.invalid_categoria++
      continue
    }

    stats.por_categoria[r.categoria_final]++
    stats.monto_por_categoria[r.categoria_final] += r.monto

    const fp = fingerprint(r.concepto, r.fecha, r.monto)
    if (!fpToOccurrences.has(fp)) fpToOccurrences.set(fp, [])
    fpToOccurrences.get(fp).push({ fp, row: r })

    const dbKeyExact = dedupeKey(MIGR_VERSION, r.excelRow)
    const dbKeyAnyVer = dedupeKey('*', r.excelRow)
    if (migratedRowsDb.has(dbKeyExact) || migratedRowsDb.has(dbKeyAnyVer)) {
      stats.duplicados_db++
      continue
    }

    let vehicleId = null
    if (r.categoria_final === 'operativo_vehiculo') {
      const det = resolveVehicleFromText(r.vehiculo_detectado, vehiculos)
      if (det.kind === 'clear') {
        vehicleId = det.vehicleId
      } else if (det.kind === 'typo' || ['ambiguous_exact', 'ambiguous_multi_unit', 'ambiguous_typo'].includes(det.kind)) {
        stats.operativo_typo_o_ambiguo++
        auditSinVehicle.push({
          excel_row: r.excelRow,
          fecha: r.fecha,
          concepto: r.concepto,
          monto: r.monto,
          categoria_final: r.categoria_final,
          subtipo: r.subtipo,
          vehiculo_detectado: r.vehiculo_detectado,
          motivo_error: motivoSinVehicle(det, r.vehiculo_detectado),
        })
        continue
      } else {
        stats.operativo_sin_vehicle_resuelto++
        auditSinVehicle.push({
          excel_row: r.excelRow,
          fecha: r.fecha,
          concepto: r.concepto,
          monto: r.monto,
          categoria_final: r.categoria_final,
          subtipo: r.subtipo,
          vehiculo_detectado: r.vehiculo_detectado,
          motivo_error: motivoSinVehicle(det, r.vehiculo_detectado),
        })
        continue
      }
    }

    toInsert.push({ row: r, vehicleId })
    stats.listos_insertar++
  }

  console.log('\n--- Resumen ---')
  console.log('Total filas leídas:', excelRows.length)
  console.log('Por categoría (filas válidas cat+monto+fecha+concepto):', stats.por_categoria)
  console.log(
    'Monto por categoría (S/):',
    Object.fromEntries(Object.entries(stats.monto_por_categoria).map(([k, v]) => [k, Math.round(v * 100) / 100])),
  )
  console.log('Listos para insertar:', stats.listos_insertar)
  console.log('Duplicados (misma fila repetida en Excel, mismo fingerprint):', stats.duplicados_excel)
  console.log('Duplicados (ya en BD migracion_gastos_caja_final + fingerprint):', stats.duplicados_db)
  console.log('Operativo sin vehicle_id resuelto:', stats.operativo_sin_vehicle_resuelto)
  console.log('Operativo typo/ambiguo (no insertar automático):', stats.operativo_typo_o_ambiguo)
  console.log('Categoría inválida:', stats.invalid_categoria)
  console.log('Fecha inválida:', stats.invalid_fecha)
  console.log('Monto inválido:', stats.invalid_monto)
  console.log('Concepto vacío:', stats.invalid_concepto)

  /** Duplicados internos: todas las filas que comparten fingerprint con ≥2 ocurrencias */
  const auditDupRows = []
  for (const [, list] of fpToOccurrences) {
    if (list.length < 2) continue
    for (const { fp, row } of list) {
      auditDupRows.push({
        fingerprint: fp,
        excel_row: row.excelRow,
        fecha: row.fecha,
        concepto: row.concepto,
        monto: row.monto,
        categoria_final: row.categoria_final,
        subtipo: row.subtipo,
      })
    }
  }
  stats.duplicados_excel = auditDupRows.length

  if (auditSinVehicle.length > 0) {
    writeAuditXlsx(PATH_AUDIT_SIN_VEHICLE, 'operativos_sin_vehicle', auditSinVehicle)
    console.log('\n[auditoría] Operativos sin vehicle_id →', PATH_AUDIT_SIN_VEHICLE)
    console.log('  Filas exportadas:', auditSinVehicle.length)
  }

  if (auditDupRows.length > 0) {
    auditDupRows.sort((a, b) => String(a.fingerprint).localeCompare(String(b.fingerprint)) || Number(a.excel_row) - Number(b.excel_row))
    writeAuditXlsx(PATH_AUDIT_DUP_EXCEL, 'duplicados_excel', auditDupRows)
    console.log('\n[auditoría] Duplicados internos Excel →', PATH_AUDIT_DUP_EXCEL)
    console.log('  Filas exportadas (todas las ocurrencias):', auditDupRows.length)
  }

  if (!dryRun) {
    if (!allowReal) {
      console.error(
        '\n[BLOQUEADO] Para INSERT real añade ALLOW_MIGRACION_GASTOS_CAJA_FINAL=1 además de DRY_RUN=0\n',
      )
      process.exit(1)
    }
    console.log('\nInsertando en public.gastos …')
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK).map(({ row, vehicleId }) => buildInsertPayload(row, vehicleId, empresaId))
      const { error } = await supabase.from('gastos').insert(chunk)
      if (error) throw new Error(`[gastos insert] lote ${i}: ${error.message}`)
      console.log(`  +${chunk.length}`)
    }
    console.log('Listo.')
  } else {
    console.log('\n(DRY_RUN=1: no se ejecutó INSERT. Revisa el resumen y luego DRY_RUN=0 + ALLOW_MIGRACION_GASTOS_CAJA_FINAL=1)')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
