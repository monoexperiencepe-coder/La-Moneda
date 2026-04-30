/**
 * Importación histórica desde JSON seed → Supabase.
 *
 * Seed por defecto: src/data/systemExcelSeed.json
 * Para datos con excelColumnasExtra (export v2): SEED_JSON=src/data/systemExcelSeed_v2.json
 *
 * Tablas (orden): vehiculos → unidades → conductores → ingresos → gastos → control_fechas → kilometrajes
 *
 * Variables de entorno (.env en la raíz del repo):
 *   VITE_SUPABASE_URL              URL del proyecto
 *   VITE_EMPRESA_ID                uuid de la empresa (todas las filas llevan este empresa_id)
 *   SUPABASE_SERVICE_ROLE_KEY      recomendado (no usar prefijo VITE_ para no exponerla al bundle)
 *   SERVICE_ROLE_KEY               alias aceptado
 *   VITE_SUPABASE_SERVICE_ROLE_KEY alias aceptado (solo local)
 *
 * El frontend NO debe usar service_role; este script es solo para Node local.
 *
 * DRY_RUN=1 (o true): no escribe; conecta a Supabase y muestra conteos por tabla
 *   (total en seed, nuevos a insertar, omitidos por duplicado / sin vehículo resuelto).
 *
 * Mapeo Excel → Supabase: los vehicleId del JSON son el "N° carro" (= vehicles[].id del seed),
 * no el id interno de fila unidades (10000+). Se resuelve a vehiculos.id en Supabase por **placa**
 * (normalizada); si ya existe un vehículo con esa placa para la empresa, se reutiliza su id.
 *
 * Uso (PowerShell):
 *   $env:DRY_RUN='1'; node scripts/import_full_seed_to_supabase.mjs
 *   node scripts/import_full_seed_to_supabase.mjs
 *
 * npm:
 *   npm run import:full-seed
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
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
const dryRun = env.DRY_RUN === '1' || env.DRY_RUN === 'true'
const chunkSize = Math.max(50, Math.min(500, Number(env.CHUNK_SIZE) || 300))

const seedRel = (env.SEED_JSON || '').trim() || 'src/data/systemExcelSeed.json'
const seedPath = isAbsolute(seedRel) ? resolve(seedRel) : resolve(root, seedRel)

function normPlaca(p) {
  if (p == null || typeof p !== 'string') return ''
  const s = p.trim().toUpperCase().replace(/\s+/g, '')
  if (s === '—' || s === '-' || s === '–') return ''
  return s
}

function fixGastoCategoria(tipo) {
  const t = (tipo || '').toUpperCase()
  if (['GASTOS FIJOS', 'FIJO', 'SUELDO', 'SEGURO'].some((x) => t.includes(x))) return 'GASTOS_FIJOS'
  if (['DOCUMENT', 'TRIBUT', 'SOAT', 'RT-', 'AFOCAT', 'NOTARIAL'].some((x) => t.includes(x))) {
    return 'GASTOS_TRIBUTARIOS'
  }
  if (t.includes('OTROS GASTOS')) return 'GASTOS_PROVISIONALES'
  return 'GASTOS_MECANICOS'
}

function ingresoDedupeKey(empresaId, row, supabaseVehicleId) {
  const vid = supabaseVehicleId ?? 'null'
  const m = Number(row.monto)
  const com = (row.comentarios || '').slice(0, 120)
  return `${empresaId}|${row.fecha}|${vid}|${row.tipo}|${m}|${com}`
}

function gastoDedupeKey(empresaId, row, supabaseVehicleId) {
  const vid = supabaseVehicleId ?? 'null'
  const m = Number(row.monto)
  const com = (row.comentarios || '').slice(0, 120)
  return `${empresaId}|${row.fecha}|${vid}|${row.tipo}|${m}|${com}`
}

function controlDedupeKey(row, supabaseVehicleId) {
  const vid = supabaseVehicleId ?? 'null'
  return `${vid}|${row.tipo}|${row.fechaVencimiento}`
}

function kmDedupeKey(row, supabaseVehicleId) {
  const vid = supabaseVehicleId ?? 'null'
  const km = row.kilometraje != null && row.kilometraje !== '' ? String(row.kilometraje) : ''
  return `${vid}|${row.fecha}|${km}`
}

/** Mapea excelColumnasExtra del seed (import_system_excel.py) → columna excel_extra (jsonb). */
function excelExtraFromSeed(row) {
  const ex = row?.excelColumnasExtra
  if (ex == null || typeof ex !== 'object' || Array.isArray(ex)) return null
  const keys = Object.keys(ex)
  if (keys.length === 0) return null
  return ex
}

async function fetchAllRows(supabase, table, columns, empresaCol = 'empresa_id', empresaVal = empresaId) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq(empresaCol, empresaVal)
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

function toVehiculoInsert(v) {
  return {
    empresa_id: empresaId,
    marca: v.marca || '',
    modelo: v.modelo || '',
    placa: (v.placa || '').trim() || '—',
    anio: v.anio ?? null,
    color: v.color ?? null,
    activo: v.activo !== false,
  }
}

function toUnidadInsert(u, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    vehicle_id: vehicleIdSupabase,
    numero_interno: String(u.numeroInterno ?? ''),
    marca: u.marca || '',
    modelo: u.modelo || '',
    anio: Number(u.anio) || 0,
    placa: (u.placa || '').trim() || '—',
    detalle_auto: u.detalleAuto || '',
    combustible: u.combustible || '',
    color: u.color || '',
    tipo_carroceria: u.tipoCarroceria ?? null,
    numero_motor: u.numeroMotor ?? null,
    cantidad_llaves: u.cantidadLlaves ?? null,
    gps1: u.gps1 ?? null,
    gps2: u.gps2 ?? null,
    impuesto_estado: u.impuestoEstado ?? null,
    km_inicial: u.kmInicial ?? null,
    tarjeta_propiedad: u.tarjetaPropiedad ?? null,
    propietario: u.propietario ?? null,
    fecha_compra_usd: u.fechaCompraUSD ?? null,
    valor_compra_usd: u.valorCompraUSD ?? null,
    tipo_cambio_compra: u.tipoCambioCompra ?? null,
    gasto_gnv: u.gastoGnv ?? null,
    gastos_notariales: u.gastosNotariales ?? null,
    gastos_accesorios: u.gastosAccesorios ?? null,
    gps_instalado: !!u.gpsInstalado,
    gps_proveedor: u.gpsProveedor || '',
    impuesto_vehicular_vence: u.impuestoVehicularVence ?? null,
    comentarios: u.comentarios || '',
  }
}

function toConductorInsert(c, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    vehicle_id: vehicleIdSupabase,
    tipo_documento: c.tipoDocumento || 'DNI',
    numero_documento: (c.numeroDocumento || '').trim(),
    nombres: c.nombres || '',
    apellidos: c.apellidos || '',
    celular: c.celular || '',
    domicilio: c.domicilio || 'PROPIO',
    estado_contrato: c.estadoContrato || 'CERRADO',
    estado: c.estado || 'VIGENTE',
    status_original: c.statusOriginal ?? null,
    cochera: c.cochera ?? null,
    numero_emergencia: c.numeroEmergencia ?? null,
    direccion: c.direccion ?? null,
    documento_firmado: c.documentoFirmado ?? null,
    fecha_vencimiento_contrato: c.fechaVencimientoContrato ?? null,
    comentarios: c.comentarios || '',
  }
}

function toIngresoInsert(row, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    vehicle_id: vehicleIdSupabase,
    tipo: row.tipo,
    sub_tipo: row.subTipo ?? null,
    fecha_desde: row.fechaDesde ?? null,
    fecha_hasta: row.fechaHasta ?? null,
    metodo_pago: row.metodoPago || 'Otro',
    metodo_pago_detalle: row.metodoPagoDetalle || 'Excel',
    celular_metodo: row.celularMetodo ?? null,
    signo: '+',
    monto: row.monto,
    moneda: row.moneda || 'PEN',
    tipo_cambio: row.tipoCambio ?? null,
    monto_pen_referencia: row.montoPENReferencia ?? row.monto,
    comentarios: row.comentarios || '',
    excel_extra: excelExtraFromSeed(row),
  }
}

function toGastoInsert(row, vehicleIdSupabase) {
  const cat = row.categoria || fixGastoCategoria(row.tipo)
  return {
    empresa_id: empresaId,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    vehicle_id: vehicleIdSupabase,
    tipo: row.tipo,
    sub_tipo: row.subTipo ?? null,
    fecha_desde: row.fechaDesde ?? null,
    fecha_hasta: row.fechaHasta ?? null,
    metodo_pago: row.metodoPago || 'Otro',
    metodo_pago_detalle: row.metodoPagoDetalle || 'Excel',
    celular_metodo: row.celularMetodo ?? null,
    categoria: cat,
    motivo: row.motivo || row.subTipo || row.tipo,
    signo: '-',
    monto: row.monto,
    pagado_a: row.pagadoA || '',
    comentarios: row.comentarios || '',
    excel_extra: excelExtraFromSeed(row),
  }
}

function toControlInsert(row, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    vehicle_id: vehicleIdSupabase,
    tipo: row.tipo,
    fecha_vencimiento: row.fechaVencimiento,
    fecha_registro: row.fechaRegistro,
    comentarios: row.comentarios || '',
  }
}

function toKmInsert(row, vehicleIdSupabase) {
  return {
    empresa_id: empresaId,
    vehicle_id: vehicleIdSupabase,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    km_mantenimiento: row.kmMantenimiento ?? null,
    kilometraje: row.kilometraje ?? null,
    descripcion: row.descripcion || '',
    costo: row.costo ?? null,
  }
}

async function main() {
  console.log('--- import_full_seed_to_supabase ---')
  console.log('Seed:', seedPath)
  console.log('DRY_RUN:', dryRun)
  console.log('CHUNK_SIZE:', chunkSize)

  if (!url) {
    console.error('Falta VITE_SUPABASE_URL')
    process.exit(1)
  }
  if (!empresaId) {
    console.error('Falta VITE_EMPRESA_ID')
    process.exit(1)
  }
  if (!serviceKey) {
    console.error(
      'Falta clave service role: define SUPABASE_SERVICE_ROLE_KEY o SERVICE_ROLE_KEY en .env (no uses VITE_ en producción).',
    )
    process.exit(1)
  }

  if (!existsSync(seedPath)) {
    console.error('No existe', seedPath)
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
  const vehicles = Array.isArray(raw.vehicles) ? raw.vehicles : []
  const unidades = Array.isArray(raw.unidades) ? raw.unidades : []
  const conductores = Array.isArray(raw.conductores) ? raw.conductores : []
  const ingresos = Array.isArray(raw.ingresos) ? raw.ingresos : []
  const gastos = Array.isArray(raw.gastos) ? raw.gastos : []
  const controlFechas = Array.isArray(raw.controlFechas) ? raw.controlFechas : []
  const kilometrajes = Array.isArray(raw.kilometrajes) ? raw.kilometrajes : []

  for (const g of gastos) {
    if (!g.categoria) g.categoria = fixGastoCategoria(g.tipo)
  }

  console.log('\nEstructura seed (meta si existe):', raw.meta ?? {})
  console.log('Conteos en JSON:')
  console.log('  vehiculos:', vehicles.length)
  console.log('  unidades:', unidades.length)
  console.log('  conductores:', conductores.length)
  console.log('  ingresos:', ingresos.length)
  console.log('  gastos:', gastos.length)
  console.log('  control_fechas:', controlFechas.length)
  console.log('  kilometrajes:', kilometrajes.length)

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  /** @type {Map<string, string>} placa normalizada -> vehiculos.id en Supabase */
  const placaToSupabaseId = new Map()
  /** @type {Map<number, string>} N° carro Excel (vehicles[].id) -> vehiculos.id Supabase */
  const excelCarToSupabaseId = new Map()

  const existingVeh = await fetchAllRows(supabase, 'vehiculos', 'id, placa')
  for (const row of existingVeh) {
    const id = row.id != null ? String(row.id) : ''
    const p = normPlaca(row.placa)
    if (p && id) placaToSupabaseId.set(p, id)
  }
  console.log('\nVehículos ya en Supabase (empresa):', existingVeh.length, 'placas indexadas:', placaToSupabaseId.size)

  for (const v of vehicles) {
    const nid = Number(v.id)
    if (!Number.isFinite(nid)) continue
    const p = normPlaca(v.placa)
    if (p && placaToSupabaseId.has(p)) excelCarToSupabaseId.set(nid, placaToSupabaseId.get(p))
  }
  console.log('Mapeo inicial Excel N°→vehiculo Supabase (por placa ya existente):', excelCarToSupabaseId.size)

  function resolveExcelCarId(excelCarId) {
    if (excelCarId == null || !Number.isFinite(Number(excelCarId))) return null
    const n = Number(excelCarId)
    return excelCarToSupabaseId.get(n) ?? null
  }

  const vehToInsert = []
  for (const v of [...vehicles].sort((a, b) => Number(a.id) - Number(b.id))) {
    const nid = Number(v.id)
    if (!Number.isFinite(nid)) continue
    const p = normPlaca(v.placa)
    if (!p) continue
    if (placaToSupabaseId.has(p)) continue
    vehToInsert.push({ v, nid, p })
  }

  /** Mapeo para conteos DRY_RUN: asume que cada vehículo nuevo del seed quedará resuelto (id ficticio por N°). */
  const previewExcelToId = new Map(excelCarToSupabaseId)
  for (const { nid, p } of vehToInsert) {
    if (p) previewExcelToId.set(nid, `__plan_new_${nid}`)
  }
  const resolvePreview = (excelCarId) => {
    if (excelCarId == null || !Number.isFinite(Number(excelCarId))) return null
    return previewExcelToId.get(Number(excelCarId)) ?? null
  }

  const existingUnidadPlacas = new Set(
    (await fetchAllRows(supabase, 'unidades', 'placa'))
      .map((r) => normPlaca(r.placa))
      .filter(Boolean),
  )
  const existingDocs = new Set(
    (await fetchAllRows(supabase, 'conductores', 'numero_documento')).map((r) =>
      (r.numero_documento || '').trim(),
    ),
  )

  const ingRows = await fetchAllRows(supabase, 'ingresos', 'fecha, vehicle_id, tipo, monto, comentarios')
  const ingresoKeys = new Set(ingRows.map((r) => ingresoDedupeKey(empresaId, {
    fecha: String(r.fecha).slice(0, 10),
    tipo: r.tipo,
    monto: Number(r.monto),
    comentarios: r.comentarios,
  }, r.vehicle_id != null ? String(r.vehicle_id) : null)))

  const gastoRows = await fetchAllRows(supabase, 'gastos', 'fecha, vehicle_id, tipo, monto, comentarios')
  const gastoKeys = new Set(
    gastoRows.map((r) =>
      gastoDedupeKey(empresaId, {
        fecha: String(r.fecha).slice(0, 10),
        tipo: r.tipo,
        monto: Number(r.monto),
        comentarios: r.comentarios,
      }, r.vehicle_id != null ? String(r.vehicle_id) : null),
    ),
  )

  const ctrlRows = await fetchAllRows(supabase, 'control_fechas', 'vehicle_id, tipo, fecha_vencimiento')
  const controlKeys = new Set(
    ctrlRows.map((r) =>
      controlDedupeKey(
        {
          tipo: r.tipo,
          fechaVencimiento: String(r.fecha_vencimiento).slice(0, 10),
        },
        r.vehicle_id != null ? String(r.vehicle_id) : null,
      ),
    ),
  )

  const kmRowsDb = await fetchAllRows(supabase, 'kilometrajes', 'vehicle_id, fecha, kilometraje')
  const kmKeys = new Set(
    kmRowsDb.map((r) =>
      kmDedupeKey(
        {
          fecha: String(r.fecha).slice(0, 10),
          kilometraje: r.kilometraje != null ? String(r.kilometraje) : '',
        },
        r.vehicle_id != null ? String(r.vehicle_id) : null,
      ),
    ),
  )

  const unidToInsert = []
  let unidSkipDup = 0
  for (const u of unidades) {
    const p = normPlaca(u.placa)
    if (p && existingUnidadPlacas.has(p)) {
      unidSkipDup++
      continue
    }
    unidToInsert.push(u)
  }

  const condToInsert = []
  let condSkipDup = 0
  for (const c of conductores) {
    const doc = (c.numeroDocumento || '').trim()
    if (doc && existingDocs.has(doc)) {
      condSkipDup++
      continue
    }
    condToInsert.push(c)
  }

  const buildIngresoPlan = (resolver, dedupeKeys, addKeys) => {
    const insert = []
    let skipDup = 0
    let skipNoVeh = 0
    for (const row of ingresos) {
      const sid = resolver(row.vehicleId)
      if (!sid) {
        skipNoVeh++
        continue
      }
      const k = ingresoDedupeKey(empresaId, row, sid)
      if (dedupeKeys.has(k)) {
        skipDup++
        continue
      }
      insert.push(toIngresoInsert(row, sid))
      if (addKeys) dedupeKeys.add(k)
    }
    return { insert, skipDup, skipNoVeh }
  }

  const buildGastoPlan = (resolver, dedupeKeys, addKeys) => {
    const insert = []
    let skipDup = 0
    for (const row of gastos) {
      const sid = row.vehicleId != null ? resolver(row.vehicleId) : null
      const k = gastoDedupeKey(empresaId, row, sid)
      if (dedupeKeys.has(k)) {
        skipDup++
        continue
      }
      insert.push(toGastoInsert(row, sid))
      if (addKeys) dedupeKeys.add(k)
    }
    return { insert, skipDup }
  }

  const buildControlPlan = (resolver, dedupeKeys, addKeys) => {
    const insert = []
    let skipDup = 0
    let skipNoVeh = 0
    for (const row of controlFechas) {
      const sid = resolver(row.vehicleId)
      if (!sid) {
        skipNoVeh++
        continue
      }
      const k = controlDedupeKey(row, sid)
      if (dedupeKeys.has(k)) {
        skipDup++
        continue
      }
      insert.push(toControlInsert(row, sid))
      if (addKeys) dedupeKeys.add(k)
    }
    return { insert, skipDup, skipNoVeh }
  }

  const buildKmPlan = (resolver, dedupeKeys, addKeys) => {
    const insert = []
    let skipDup = 0
    let skipNoVeh = 0
    for (const row of kilometrajes) {
      const sid = resolver(row.vehicleId)
      if (!sid) {
        skipNoVeh++
        continue
      }
      const k = kmDedupeKey(row, sid)
      if (dedupeKeys.has(k)) {
        skipDup++
        continue
      }
      insert.push(toKmInsert(row, sid))
      if (addKeys) dedupeKeys.add(k)
    }
    return { insert, skipDup, skipNoVeh }
  }

  /** Re-evalúa mapeo tras vehículos nuevos (unidades que dependían de un insert). */
  function refreshExcelCarMapFromPlacas() {
    for (const v of vehicles) {
      const nid = Number(v.id)
      if (!Number.isFinite(nid)) continue
      const p = normPlaca(v.placa)
      if (p && placaToSupabaseId.has(p)) excelCarToSupabaseId.set(nid, placaToSupabaseId.get(p))
    }
  }

  console.log('\n--- Resumen importación (tras resolver placas existentes) ---')
  console.log('vehiculos: JSON', vehicles.length, '| nuevos a insertar', vehToInsert.length, '| ya en BD por placa', vehicles.length - vehToInsert.length)

  const unidadesResolvedPreview = unidades.filter((u) => {
    const ev = u.vehicleId != null ? Number(u.vehicleId) : null
    return ev == null || resolvePreview(ev)
  }).length
  console.log(
    'unidades: JSON',
    unidades.length,
    '| candidatas (sin duplicar placa en BD)',
    unidToInsert.length,
    '| omitidas placa duplicada',
    unidSkipDup,
    '| con vehicle resuelto (preview)',
    unidadesResolvedPreview,
  )

  console.log(
    'conductores: JSON',
    conductores.length,
    '| a insertar (doc nuevo)',
    condToInsert.length,
    '| omitidos doc existente',
    condSkipDup,
  )

  const previewIng = new Set(ingresoKeys)
  const previewGas = new Set(gastoKeys)
  const previewCtrl = new Set(controlKeys)
  const previewKm = new Set(kmKeys)

  let ingPlan = buildIngresoPlan(resolvePreview, previewIng, true)
  let gasPlan = buildGastoPlan(resolvePreview, previewGas, true)
  let ctrlPlan = buildControlPlan(resolvePreview, previewCtrl, true)
  let kmPlan = buildKmPlan(resolvePreview, previewKm, true)
  console.log(
    'ingresos: a insertar',
    ingPlan.insert.length,
    '| omitidos duplicado',
    ingPlan.skipDup,
    '| sin vehículo resuelto',
    ingPlan.skipNoVeh,
  )
  console.log('gastos: a insertar', gasPlan.insert.length, '| omitidos duplicado', gasPlan.skipDup)
  console.log(
    'control_fechas: a insertar',
    ctrlPlan.insert.length,
    '| dup',
    ctrlPlan.skipDup,
    '| sin vehículo',
    ctrlPlan.skipNoVeh,
  )
  console.log('kilometrajes: a insertar', kmPlan.insert.length, '| dup', kmPlan.skipDup, '| sin vehículo', kmPlan.skipNoVeh)

  if (dryRun) {
    console.log('\nDRY_RUN: no se escribió nada. Quita DRY_RUN para importar.')
    return
  }

  console.log('\n--- Importación real ---')

  if (vehToInsert.length) {
    const rows = []
    for (const { v, nid, p } of vehToInsert) {
      rows.push(toVehiculoInsert(v))
    }
    for (let i = 0; i < rows.length; i += chunkSize) {
      const batch = rows.slice(i, i + chunkSize)
      const { data, error } = await supabase.from('vehiculos').insert(batch).select('id, placa')
      if (error) throw new Error(`[vehiculos insert] ${error.message}`)
      for (const row of data || []) {
        const pid = normPlaca(row.placa)
        const sid = String(row.id)
        if (pid) placaToSupabaseId.set(pid, sid)
      }
      console.log(`  [vehiculos] lote insertado ${(data || []).length}`)
    }
    refreshExcelCarMapFromPlacas()
    for (const { nid, p } of vehToInsert) {
      if (p && placaToSupabaseId.has(p)) excelCarToSupabaseId.set(nid, placaToSupabaseId.get(p))
    }
  }

  const unidadRows = []
  for (const u of unidToInsert) {
    const p = normPlaca(u.placa)
    if (p && existingUnidadPlacas.has(p)) continue
    const excelVid = u.vehicleId != null ? Number(u.vehicleId) : null
    const sid = excelVid != null && Number.isFinite(excelVid) ? resolveExcelCarId(excelVid) : null
    if (excelVid != null && !sid) {
      console.warn('  [unidades] skip sin vehicle_id resuelto para Excel car', excelVid, 'placa', u.placa)
      continue
    }
    unidadRows.push(toUnidadInsert(u, sid))
    if (p) existingUnidadPlacas.add(p)
  }
  if (unidadRows.length) await insertChunks(supabase, 'unidades', unidadRows, 'unidades')

  const condRows = []
  for (const c of condToInsert) {
    const doc = (c.numeroDocumento || '').trim()
    if (doc && existingDocs.has(doc)) continue
    const sid = c.vehicleId != null ? resolveExcelCarId(Number(c.vehicleId)) : null
    if (c.vehicleId != null && !sid) {
      console.warn('  [conductores] skip sin vehicle', c.numeroDocumento)
      continue
    }
    condRows.push(toConductorInsert(c, sid))
    if (doc) existingDocs.add(doc)
  }
  if (condRows.length) await insertChunks(supabase, 'conductores', condRows, 'conductores')

  ingPlan = buildIngresoPlan(resolveExcelCarId, ingresoKeys, true)
  if (ingPlan.insert.length) await insertChunks(supabase, 'ingresos', ingPlan.insert, 'ingresos')

  gasPlan = buildGastoPlan(resolveExcelCarId, gastoKeys, true)
  if (gasPlan.insert.length) await insertChunks(supabase, 'gastos', gasPlan.insert, 'gastos')

  ctrlPlan = buildControlPlan(resolveExcelCarId, controlKeys, true)
  if (ctrlPlan.insert.length) await insertChunks(supabase, 'control_fechas', ctrlPlan.insert, 'control_fechas')

  kmPlan = buildKmPlan(resolveExcelCarId, kmKeys, true)
  if (kmPlan.insert.length) await insertChunks(supabase, 'kilometrajes', kmPlan.insert, 'kilometrajes')

  console.log('\nImportación completada.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
