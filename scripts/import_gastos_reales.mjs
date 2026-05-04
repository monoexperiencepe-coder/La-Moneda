/**
 * Reemplaza los gastos de Supabase de UNA empresa por los de un Excel
 * (formato hoja ancha "GASTOS CARROS" con columnas por mes: fecha | monto).
 *
 * Archivo por defecto (si existe en la raíz del repo):
 *   GASTOS LA MONEDA (1).xlsx
 * O bien define ruta absoluta:
 *   GASTOS_XLSX=C:\\Users\\…\\GASTOS LA MONEDA (1).xlsx
 *
 * Variables (.env o entorno):
 *   VITE_SUPABASE_URL
 *   VITE_EMPRESA_ID              uuid de la empresa
 *   SUPABASE_SERVICE_ROLE_KEY    (solo Node; no VITE_)
 *   SERVICE_ROLE_KEY              alias
 *   VITE_SUPABASE_SERVICE_ROLE_KEY alias (solo local)
 *
 * DRY_RUN por defecto = sí (no borra ni inserta).
 *   DRY_RUN=0  → ejecuta borrado + inserción (solo gastos de esta empresa).
 *
 * Uso (PowerShell, solo simular):
 *   node scripts/import_gastos_reales.mjs
 *
 * Import real:
 *   $env:DRY_RUN='0'; node scripts/import_gastos_reales.mjs
 *
 * Solo informe (sin importar): gastos que quedarían sin vehicle_id
 *   node scripts/import_gastos_reales.mjs --report-sin-vehiculo [ruta.xlsx]
 *   REPORT_SIN_VEHICULO=1 node scripts/import_gastos_reales.mjs
 *
 * Fechas: tras interpretar la celda, se valida el calendario. Si el día no existe en ese mes
 * (ej. 2023-04-31), se usa el último día válido del mes antes de insertar. Mes/año fuera de rango
 * o día menor que 1 → la fila se omite (no se inserta).
 *
 * Parser Excel: `scripts/gastos_excel_parse.mjs` (compartido con audit_gastos_por_vehiculo.mjs).
 *
 * Alias manual (cabecera sin placa → vehicle_id): `scripts/gastos_alias_vehicle_map.json`
 * (claves normalizadas: mayúsculas, espacios colapsados). Solo aplica si no hay placa detectada en la cabecera.
 *
 * No modifica ingresos, vehículos, conductores, control_fechas ni kilometrajes.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import {
  parseWorkbook,
  resolveVehicleId,
  classifySinVehiculo,
  extractPlaca,
  normPlaca,
  normNumeroInterno,
  buildAliasVehicleMapFromJson,
  isLlantaGastoMotivoLine,
} from './gastos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const aliasJsonPath = resolve(__dirname, 'gastos_alias_vehicle_map.json')

function loadGastosAliasVehicleMap() {
  if (!existsSync(aliasJsonPath)) return new Map()
  try {
    const raw = JSON.parse(readFileSync(aliasJsonPath, 'utf8'))
    return buildAliasVehicleMapFromJson(raw)
  } catch (e) {
    console.warn('[gastos import] No se pudo leer gastos_alias_vehicle_map.json:', e.message)
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
/** Por defecto DRY_RUN: solo si DRY_RUN=0 o false se escribe. */
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const chunkSize = Math.max(50, Math.min(500, Number(env.CHUNK_SIZE) || 300))

const argvFlags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
const argvArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const reportSinVehiculo = argvFlags.has('--report-sin-vehiculo') || env.REPORT_SIN_VEHICULO === '1'

const xlsxArg = (argvArgs[0] || '').trim()
const xlsxPath = xlsxArg
  ? isAbsolute(xlsxArg)
    ? xlsxArg
    : resolve(root, xlsxArg)
  : (env.GASTOS_XLSX || '').trim()
    ? isAbsolute(env.GASTOS_XLSX)
      ? env.GASTOS_XLSX
      : resolve(root, env.GASTOS_XLSX)
    : resolve(root, 'GASTOS LA MONEDA (1).xlsx')

function runReportSinVehiculo({ parsed, placaToId, carNoToIds, aliasLineToVid }) {
  const sin = []
  for (const g of parsed.parsed) {
    const { vid } = resolveVehicleId(g, placaToId, carNoToIds, aliasLineToVid)
    if (vid != null) continue
    const clasif = classifySinVehiculo(g, placaToId, carNoToIds)
    sin.push({ g, clasif })
  }

  const byHeader = new Map()
  for (const { g } of sin) {
    const h = g.vehicle_line || '(vacío)'
    byHeader.set(h, (byHeader.get(h) || 0) + 1)
  }

  const byClasif = new Map()
  for (const { clasif } of sin) {
    byClasif.set(clasif, (byClasif.get(clasif) || 0) + 1)
  }

  const placasBd = new Set([...placaToId.keys()])

  console.log('\n' + '='.repeat(80))
  console.log('REPORTE: gastos sin vehicle_id (misma lógica que el import; no escribe BD)')
  console.log('='.repeat(80))
  console.log('Total filas parseadas con monto+fecha:', parsed.parsed.length)
  console.log('Sin vehicle_id:', sin.length)
  console.log(
    'Fechas corregidas / omitidas (parse):',
    parsed.dateClampedCount ?? 0,
    '/',
    parsed.dateOmittedInvalidCount ?? 0,
  )

  console.log('\n--- 1) Muestra (primeros 50) ---')
  console.log(
    'idx | mes_col | fecha | monto | cabecera_vehiculo | placa_extraida | n°_antes_placa | clasif | motivo_gasto',
  )
  const sampleN = Math.min(50, sin.length)
  for (let i = 0; i < sampleN; i++) {
    const { g, clasif } = sin[i]
    const ex = g.excel_extra || {}
    const pl = g.vehicle_placa ?? ''
    const cn = g.vehicle_car_no ?? ''
    const cab = (g.vehicle_line || '').replace(/\s+/g, ' ').slice(0, 56)
    const mot = (g.motivo || '').replace(/\s+/g, ' ').slice(0, 40)
    console.log(
      `${String(i + 1).padStart(3)} | ${String(ex.month_header ?? '').slice(0, 8)} | ${g.fecha} | ${g.monto} | ${cab} | ${pl} | ${cn} | ${clasif} | ${mot}`,
    )
  }
  if (sin.length > sampleN) console.log(`… (${sin.length - sampleN} más)`)

  console.log('\n--- 2) Cabeceras de vehículo en Excel (texto fila “solo A”) ---')
  console.log('Cada gasto hereda la última cabecera vista arriba en la hoja (vehicle_line).')

  console.log('\n--- 3) Conteo por cabecera (ordenado descendente) ---')
  const sortedHeaders = [...byHeader.entries()].sort((a, b) => b[1] - a[1])
  console.log('gastos_sin_vid | cabecera')
  for (const [h, c] of sortedHeaders) {
    console.log(`${c} | ${h}`)
  }

  console.log('\n--- 4) Conteo por clasificación (diagnóstico) ---')
  for (const [k, v] of [...byClasif.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${v}\t${k}`)
  }

  console.log('\n--- 5) Propuestas de mejora ---')
  console.log('Por placa:')
  console.log('  · Ampliar regex si hay formatos distintos a AA-123 / AAA-1234 (ej. sin guion, espacio).')
  console.log('  · Normalizar en Excel o en BD (espacios, minúsculas) — ya se usa mayúsculas y sin espacio.')
  console.log('  · Para “placa_no_en_supabase”: corregir placa en `vehiculos` o texto de cabecera para que coincida.')
  console.log('Por número interno:')
  console.log('  · Solo se usa si el patrón “NNN … AAA-999” extrae un número y hay exactamente un `unidades` con ese número.')
  console.log('  · “num_interno_ambiguo”: varios vehículos comparten el mismo número; resolver por placa en cabecera o mapa manual.')
  console.log('  · “num_interno_sin_coincidencia”: cargar `unidades.numero_interno` o ajustar el texto antes de la placa.')
  console.log('Por texto de cabecera (vehicle_line):')
  console.log('  · Tabla opcional `HEADER_TEXT → vehicle_id` (env JSON o archivo) para líneas sin placa reconocible.')
  console.log('  · Buscar subcadena: si la cabecera contiene parte de `vehiculos.placa` o modelo, enlazar con cuidado (falsos positivos).')
  const placasEnCabeceraSinMatch = new Set()
  for (const { g, clasif } of sin) {
    if (clasif === 'placa_no_en_supabase' && g.vehicle_placa) placasEnCabeceraSinMatch.add(normPlaca(g.vehicle_placa))
  }
  if (placasEnCabeceraSinMatch.size) {
    console.log('\nPlacas extraídas del Excel que no están en Supabase (esta empresa), únicas:', placasEnCabeceraSinMatch.size)
    console.log([...placasEnCabeceraSinMatch].sort().join(', '))
  }

  const headersSinPlaca = sortedHeaders.filter(([h]) => !extractPlaca(h))
  if (headersSinPlaca.length) {
    console.log('\nCabeceras con al menos un gasto sin vid y sin patrón de placa en la propia cabecera:', headersSinPlaca.length)
    for (const [h, c] of headersSinPlaca.slice(0, 25)) {
      console.log(`  (${c}) ${h.slice(0, 100)}${h.length > 100 ? '…' : ''}`)
    }
    if (headersSinPlaca.length > 25) console.log(`  … (${headersSinPlaca.length - 25} más)`)
  }

  console.log('\nReferencia: placas en Supabase (esta empresa):', placasBd.size, 'únicas')
  console.log('='.repeat(80))
  console.log('Fin del reporte. No se importó ni borró nada.')
}

function toInsertRow(empresaId, row, vehicleId) {
  return {
    empresa_id: empresaId,
    fecha: row.fecha,
    fecha_registro: row.fecha_registro,
    vehicle_id: vehicleId,
    tipo: row.tipo,
    sub_tipo: row.sub_tipo,
    fecha_desde: row.fecha_desde,
    fecha_hasta: row.fecha_hasta,
    metodo_pago: row.metodo_pago,
    metodo_pago_detalle: row.metodo_pago_detalle,
    celular_metodo: row.celular_metodo,
    categoria: row.categoria,
    motivo: row.motivo,
    signo: '-',
    monto: row.monto,
    pagado_a: row.pagado_a,
    comentarios: row.comentarios,
    detalle_operativo: row.detalle_operativo,
    categoria_real: row.categoria_real,
    subcategoria: row.subcategoria,
    excel_extra: row.excel_extra,
  }
}

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

async function countGastos(supabase, empresa) {
  const { count, error } = await supabase
    .from('gastos')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa)
  if (error) throw new Error(`[gastos count] ${error.message}`)
  return count ?? 0
}

async function insertChunks(supabase, rows) {
  let ok = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('gastos').insert(batch)
    if (error) throw new Error(`[gastos insert] lote ${i}: ${error.message}`)
    ok += batch.length
    console.log(`  [gastos] +${batch.length} (total ${ok}/${rows.length})`)
  }
}

async function main() {
  console.log('--- import_gastos_reales ---')
  console.log('Excel:', xlsxPath)
  if (reportSinVehiculo) console.log('Modo: --report-sin-vehiculo (solo consola; sin importar)')
  console.log('DRY_RUN:', dryRun ? '1 (no borra ni inserta)' : '0 (BORRAR gastos empresa + INSERT)')

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const currentCount = await countGastos(supabase, empresaId)
  console.log('\nGastos actuales en Supabase (esta empresa):', currentCount)

  const parsed = parseWorkbook(xlsxPath)
  console.log('\n--- Análisis Excel ---')
  console.log('Hoja usada:', parsed.sheetName)
  console.log('Filas totales (aprox.):', parsed.totalRows)
  console.log('Bloques mes (pares fecha|monto):', parsed.monthBlocks)
  console.log('Filas cabecera de vehículo detectadas:', parsed.vehicleHeaderRows)
  if (parsed.llantaMotivoHeaderSkipped > 0) {
    console.log('Filas solo texto “llanta” (no cabecera, contexto vehículo conservado):', parsed.llantaMotivoHeaderSkipped)
  }
  if (parsed.gastosVehicleLineLlanta > 0) {
    console.warn('[gastos import] Inconsistencia: gastos con vehicle_line tipo llanta:', parsed.gastosVehicleLineLlanta)
  }
  console.log('Gastos parseados (filas a insertar):', parsed.parsed.length)
  console.log('Omitidos (monto sin fecha en celda):', parsed.skippedNoDate)
  console.log('Omitidos (sin cabecera de vehículo previa):', parsed.skippedNoVehicleContext)
  console.log('Fechas corregidas (día → último día válido del mes):', parsed.dateClampedCount ?? 0)
  console.log('Fechas omitidas (mes/año fuera de rango o día < 1):', parsed.dateOmittedInvalidCount ?? 0)
  if (dryRun && (parsed.dateClampSamples?.length || parsed.dateOmittedSamples?.length)) {
    console.log('\n--- DRY_RUN: ejemplos de fechas ---')
    if (parsed.dateClampSamples?.length) {
      console.log('Corregidas (muestra, hasta ' + parsed.dateClampSamples.length + '):')
      for (const s of parsed.dateClampSamples) console.log('  ·', s)
    }
    if (parsed.dateOmittedSamples?.length) {
      console.log('Omitidas (muestra, hasta ' + parsed.dateOmittedSamples.length + '):')
      for (const s of parsed.dateOmittedSamples) console.log('  ·', s)
    }
  }

  const vehiculos = await fetchAllVehiculos(supabase, empresaId)
  const placaToId = new Map()
  for (const v of vehiculos) {
    const p = normPlaca(v.placa)
    if (!p) continue
    const id = Number(v.id)
    placaToId.set(p, id)
    const flat = p.replace(/-/g, '')
    if (flat !== p) placaToId.set(flat, id)
  }

  const unidades = await fetchAllUnidades(supabase, empresaId)
  const carNoToIds = new Map()
  for (const u of unidades) {
    const key = normNumeroInterno(u.numero_interno)
    if (!key || u.vehicle_id == null) continue
    const vid = Number(u.vehicle_id)
    if (!Number.isFinite(vid)) continue
    if (!carNoToIds.has(key)) carNoToIds.set(key, new Set())
    carNoToIds.get(key).add(vid)
  }

  const aliasLineToVid = loadGastosAliasVehicleMap()
  console.log('\n--- Alias cabecera → vehicle_id ---')
  console.log('Archivo:', aliasJsonPath)
  console.log('Entradas cargadas:', aliasLineToVid.size)
  if (aliasLineToVid.size) {
    for (const [k, id] of [...aliasLineToVid.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(' ', k, '→', id)
    }
  }

  let withVehicleId = 0
  let withoutVehicleId = 0
  let viaPlaca = 0
  let viaCarNo = 0
  let viaAlias = 0
  let motivoLlantaConVid = 0
  let motivoLlantaSinVid = 0
  const insertRows = []

  for (const g of parsed.parsed) {
    const { vid, fromPlaca, fromCarNo, fromAlias } = resolveVehicleId(g, placaToId, carNoToIds, aliasLineToVid)
    if (vid != null) {
      withVehicleId++
      if (fromPlaca) viaPlaca++
      if (fromCarNo) viaCarNo++
      if (fromAlias) viaAlias++
    } else {
      withoutVehicleId++
    }

    if (isLlantaGastoMotivoLine(g.motivo)) {
      if (vid != null) motivoLlantaConVid++
      else motivoLlantaSinVid++
    }

    insertRows.push(toInsertRow(empresaId, g, vid))
  }

  console.log('\n--- Resolución vehicle_id ---')
  console.log('Filas con vehicle_id:', withVehicleId)
  console.log('  · vía placa (vehículos):', viaPlaca)
  console.log('  · vía N° interno único (unidades):', viaCarNo)
  console.log('  · vía alias manual (JSON, sin placa en cabecera):', viaAlias)
  console.log('Filas sin vehicle_id (se insertan null):', withoutVehicleId)
  if (dryRun) {
    console.log('\n(DRY_RUN) Alias: gastos asignados por JSON =', viaAlias, '| sin vehicle_id =', withoutVehicleId)
    console.log(
      '(DRY_RUN) Llantas: filas “solo motivo” no usadas como cabecera =',
      parsed.llantaMotivoHeaderSkipped ?? 0,
    )
    console.log(
      '(DRY_RUN) Llantas: gastos reasignados (heredan vehículo previo, no cabecera llanta) =',
      parsed.gastosHeredanVehiculoTrasFilaLlanta ?? 0,
    )
    console.log(
      '(DRY_RUN) Llantas: gastos cuyo motivo (col. A) es texto llanta, con vehicle_id =',
      motivoLlantaConVid,
      '| sin vehicle_id =',
      motivoLlantaSinVid,
    )
    console.log('(DRY_RUN) Total sin vehicle_id:', withoutVehicleId)
  }

  if (reportSinVehiculo) {
    runReportSinVehiculo({ parsed, placaToId, carNoToIds, aliasLineToVid })
    return
  }

  const sample = insertRows.slice(0, 3)
  console.log('\nEjemplo de filas a insertar (3):')
  for (const s of sample) {
    console.log(JSON.stringify(s, null, 0).slice(0, 400) + '…')
  }

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se borró ni insertó nada.')
    console.log('Para importar de verdad (solo gastos de esta empresa):')
    console.log('  PowerShell:  $env:DRY_RUN=\'0\'; node scripts/import_gastos_reales.mjs')
    return
  }

  console.log('\n--- Importación real ---')
  console.log('Borrando gastos donde empresa_id =', empresaId, '…')
  const { error: delErr } = await supabase.from('gastos').delete().eq('empresa_id', empresaId)
  if (delErr) throw new Error(`[gastos delete] ${delErr.message}`)

  const afterDel = await countGastos(supabase, empresaId)
  console.log('Gastos tras borrado:', afterDel, '(esperado 0)')

  if (insertRows.length) await insertChunks(supabase, insertRows)

  const finalCount = await countGastos(supabase, empresaId)
  console.log('\nListo. Gastos finales en Supabase:', finalCount, '(esperado', insertRows.length + ')')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
