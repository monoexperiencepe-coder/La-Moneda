/**
 * Auditoría de integridad: Supabase (solo lectura, consola).
 * No inserta, actualiza ni borra nada.
 *
 * Requiere .env: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 *
 * Uso:
 *   node scripts/audit_integridad_data.mjs
 *   node scripts/audit_integridad_data.mjs --vehicle=2
 *   $env:AUDIT_VEHICLE_ID='5'; node scripts/audit_integridad_data.mjs
 *
 * Seed opcional para comparar conteos: src/data/systemExcelSeed_v2.json
 *   (o systemExcelSeed.json si SEED_JSON apunta a otro archivo)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const TABLES = [
  'vehiculos',
  'unidades',
  'conductores',
  'ingresos',
  'gastos',
  'control_fechas',
  'kilometrajes',
  'pendientes',
  'registros_tiempo',
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

const seedRel = (env.SEED_JSON || '').trim() || 'src/data/systemExcelSeed_v2.json'
const seedPath = isAbsolute(seedRel) ? seedRel : resolve(root, seedRel)
const seedFallback = resolve(root, 'src/data/systemExcelSeed.json')

function parseVehicleIdArg() {
  const arg = process.argv.find((x) => x.startsWith('--vehicle='))
  if (arg) {
    const n = Number(arg.split('=')[1])
    if (Number.isFinite(n)) return n
  }
  const e = (env.AUDIT_VEHICLE_ID ?? '').trim()
  if (e && Number.isFinite(Number(e))) return Number(e)
  return 2
}

const AUDIT_VID = parseVehicleIdArg()

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
async function countByEmpresa(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId)
  if (error) throw new Error(`[count ${table}] ${error.message}`)
  return count ?? 0
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
async function fetchAllRows(supabase, table, columns) {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).eq('empresa_id', empresaId).range(from, from + page - 1)
    if (error) throw new Error(`[${table}] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

function line(level, msg) {
  const tag = level === 'CRITICO' ? '❌ CRITICO' : level === 'ALERTA' ? '⚠️  ALERTA' : '✓ OK'
  console.log(`  [${tag}] ${msg}`)
}

function section(title) {
  console.log(`\n--- ${title} ---`)
}

async function main() {
  console.log('=== audit_integridad_data (solo lectura) ===')
  console.log('Empresa:', empresaId || '(vacío)')
  console.log('Vehículo detalle:', AUDIT_VID)

  if (!url || !serviceKey || !empresaId) {
    console.error('\nFaltan VITE_SUPABASE_URL, VITE_EMPRESA_ID o SUPABASE_SERVICE_ROLE_KEY en .env')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const issues = { critico: [], alerta: [], ok: [] }

  function record(level, code, detail) {
    const entry = `${code}: ${detail}`
    issues[level].push(entry)
  }

  section('Conteos por tabla (empresa)')
  const counts = {}
  for (const t of TABLES) {
    try {
      counts[t] = await countByEmpresa(supabase, t)
      console.log(`  ${t}: ${counts[t]}`)
    } catch (e) {
      console.log(`  ${t}: ERROR — ${e.message}`)
      record('critico', 'COUNT', `${t}: ${e.message}`)
    }
  }

  section('Carga para chequeos de integridad')
  const vehiculos = await fetchAllRows(supabase, 'vehiculos', 'id, placa, marca, modelo, activo')
  const vehIds = new Set(vehiculos.map((v) => Number(v.id)))
  const conductores = await fetchAllRows(supabase, 'conductores', 'id, vehicle_id, nombres, apellidos, estado, empresa_id')
  const ingresos = await fetchAllRows(supabase, 'ingresos', 'id, vehicle_id')
  const gastos = await fetchAllRows(supabase, 'gastos', 'id, vehicle_id')
  const controlFechas = await fetchAllRows(supabase, 'control_fechas', 'id, vehicle_id')
  const kilometrajes = await fetchAllRows(supabase, 'kilometrajes', 'id, vehicle_id')
  const unidades = await fetchAllRows(supabase, 'unidades', 'id, vehicle_id, numero_interno, placa')
  const pendientes = await fetchAllRows(supabase, 'pendientes', 'id, vehicle_id')
  const registrosTiempo = await fetchAllRows(supabase, 'registros_tiempo', 'id, vehicle_id')

  console.log('  Filas cargadas en memoria para FK / reglas.')

  section('Reglas de integridad')

  // 1) Conductores sin vehicle_id
  const condSinVeh = conductores.filter((c) => c.vehicle_id == null)
  if (condSinVeh.length > 0) {
    line('ALERTA', `${condSinVeh.length} conductor(es) con vehicle_id null`)
    record('alerta', 'CONDUCTOR_SIN_VEH', `${condSinVeh.length} filas (ids muestra: ${condSinVeh.slice(0, 8).map((c) => c.id).join(', ')})`)
  } else {
    line('OK', 'Ningún conductor con vehicle_id null')
    issues.ok.push('conductores: todos con vehicle_id')
  }

  // 2) vehicle_id huérfano (no existe en vehiculos)
  function scanOrphans(rows) {
    const bad = []
    const nulls = []
    for (const r of rows) {
      const vid = r.vehicle_id
      if (vid == null) {
        nulls.push(r.id)
        continue
      }
      const n = Number(vid)
      if (!vehIds.has(n)) bad.push({ id: r.id, vehicle_id: n })
    }
    return { bad, nulls }
  }

  const ingOr = scanOrphans(ingresos)
  if (ingOr.bad.length) {
    line('CRITICO', `${ingOr.bad.length} ingreso(s) con vehicle_id inexistente`)
    record('critico', 'INGRESO_FK', ingOr.bad.slice(0, 5).map((x) => `id ${x.id}→${x.vehicle_id}`).join('; '))
  } else line('OK', 'Ingresos: ningún vehicle_id huérfano')
  if (ingOr.nulls.length) {
    line('CRITICO', `${ingOr.nulls.length} ingreso(s) con vehicle_id null`)
    record('critico', 'INGRESO_NULL_VEH', `${ingOr.nulls.length} ids`)
  }

  const gasOr = scanOrphans(gastos)
  if (gasOr.bad.length) {
    line('CRITICO', `${gasOr.bad.length} gasto(s) con vehicle_id inexistente`)
    record('critico', 'GASTO_FK', gasOr.bad.slice(0, 5).map((x) => `id ${x.id}→${x.vehicle_id}`).join('; '))
  } else line('OK', 'Gastos: ningún vehicle_id huérfano')
  if (gasOr.nulls.length > 0) {
    line('ALERTA', `${gasOr.nulls.length} gasto(s) con vehicle_id null`)
    record('alerta', 'GASTO_NULL_VEH', `${gasOr.nulls.length} filas`)
  }

  for (const [label, rows] of [
    ['control_fechas', controlFechas],
    ['kilometrajes', kilometrajes],
    ['pendientes', pendientes],
    ['registros_tiempo', registrosTiempo],
    ['unidades', unidades],
  ]) {
    const { bad, nulls } = scanOrphans(rows)
    if (bad.length) {
      line('CRITICO', `${label}: ${bad.length} fila(s) con vehicle_id inexistente`)
      record('critico', `${label}_FK`, bad.slice(0, 5).map((x) => `#${x.id}→${x.vehicle_id}`).join('; '))
    } else line('OK', `${label}: sin vehicle_id huérfano`)
    if (nulls.length && label === 'kilometrajes') {
      line('CRITICO', `kilometrajes: ${nulls.length} con vehicle_id null`)
      record('critico', 'KM_NULL_VEH', String(nulls.length))
    }
    if (nulls.length && ['control_fechas', 'pendientes', 'registros_tiempo', 'unidades'].includes(label)) {
      line('ALERTA', `${label}: ${nulls.length} fila(s) con vehicle_id null`)
      record('alerta', `${label}_NULL_VEH`, String(nulls.length))
    }
  }

  // Conductores cuyo vehicle_id no existe (nullable vehicle ya cubierto; aquí FK rota)
  const condBad = conductores.filter((c) => c.vehicle_id != null && !vehIds.has(Number(c.vehicle_id)))
  if (condBad.length) {
    line('CRITICO', `${condBad.length} conductor(es) con vehicle_id que no existe en vehiculos`)
    record('critico', 'CONDUCTOR_FK', condBad.slice(0, 5).map((c) => `#${c.id}→${c.vehicle_id}`).join('; '))
  } else line('OK', 'Conductores: ningún vehicle_id huérfano')

  // Vehículos activos sin conductor VIGENTE
  const vigentesPorVeh = new Map()
  for (const c of conductores) {
    if (c.estado !== 'VIGENTE' || c.vehicle_id == null) continue
    const vid = Number(c.vehicle_id)
    if (!vigentesPorVeh.has(vid)) vigentesPorVeh.set(vid, [])
    vigentesPorVeh.get(vid).push(c)
  }
  const activos = vehiculos.filter((v) => v.activo)
  const activosSinCond = activos.filter((v) => !vigentesPorVeh.has(Number(v.id)))
  if (activos.length === 0) {
    line('OK', 'No hay vehículos marcados activos en esta empresa')
  } else if (activosSinCond.length > 0) {
    line('ALERTA', `${activosSinCond.length} vehículo(s) activo(s) sin conductor VIGENTE`)
    record(
      'alerta',
      'VEH_ACTIVO_SIN_COND',
      `placas muestra: ${activosSinCond
        .slice(0, 15)
        .map((v) => v.placa)
        .join(', ')}${activosSinCond.length > 15 ? ' …' : ''}`,
    )
  } else {
    line('OK', 'Cada vehículo activo tiene al menos un conductor VIGENTE')
    issues.ok.push('flota activa con conductor')
  }

  section('Comparación con seed JSON (opcional)')
  let seedFile = null
  if (existsSync(seedPath)) seedFile = seedPath
  else if (existsSync(seedFallback)) seedFile = seedFallback
  if (!seedFile) {
    console.log('  (No se encontró systemExcelSeed_v2.json ni systemExcelSeed.json — se omite comparación.)')
    line('OK', 'Sin archivo seed local para comparar')
  } else {
    console.log('  Archivo:', seedFile)
    try {
      const raw = JSON.parse(readFileSync(seedFile, 'utf8'))
      const keys = ['vehicles', 'unidades', 'conductores', 'ingresos', 'gastos', 'controlFechas', 'kilometrajes']
      const mapTable = {
        vehicles: 'vehiculos',
        unidades: 'unidades',
        conductores: 'conductores',
        ingresos: 'ingresos',
        gastos: 'gastos',
        controlFechas: 'control_fechas',
        kilometrajes: 'kilometrajes',
      }
      for (const k of keys) {
        const arr = Array.isArray(raw[k]) ? raw[k] : []
        const t = mapTable[k]
        const dbn = counts[t] ?? 0
        const diff = dbn - arr.length
        const pct = arr.length ? ((diff / arr.length) * 100).toFixed(1) : '—'
        const msg = `seed ${k}: ${arr.length} | DB ${t}: ${dbn} (Δ ${diff}, ${pct}%)`
        console.log(`  ${msg}`)
        if (arr.length > 0 && Math.abs(dbn - arr.length) / arr.length > 0.25) {
          if (k === 'gastos' && dbn > arr.length) {
            line(
              'ALERTA',
              `Diferencia vs seed en gastos (${msg}) — suele ser normal si se importó Excel de gastos además del seed`,
            )
            record('alerta', `SEED_${k}`, msg)
          } else {
            line('ALERTA', `Diferencia fuerte vs seed en ${k} (${msg})`)
            record('alerta', `SEED_${k}`, msg)
          }
        }
      }
      if (!keys.some((k) => (Array.isArray(raw[k]) ? raw[k].length : 0) > 0)) {
        line('ALERTA', 'Seed sin arrays esperados o vacío — comparación solo informativa')
      }
    } catch (e) {
      line('ALERTA', `No se pudo leer seed: ${e.message}`)
      record('alerta', 'SEED_READ', e.message)
    }
  }

  section(`Detalle vehículo id ${AUDIT_VID}`)
  const v2 = vehiculos.find((v) => Number(v.id) === AUDIT_VID)
  if (!v2) {
    line('CRITICO', `No existe vehículo id ${AUDIT_VID} para esta empresa`)
    record('critico', 'AUDIT_VEH_MISSING', String(AUDIT_VID))
  } else {
    console.log('  Vehículo:', JSON.stringify(v2, null, 0))
    const unis = unidades.filter((u) => Number(u.vehicle_id) === AUDIT_VID)
    console.log(`  Unidades (vehicle_id=${AUDIT_VID}): ${unis.length}`)
    for (const u of unis.slice(0, 5)) console.log('   ', JSON.stringify(u))
    if (unis.length > 5) console.log('    …')

    const conds = conductores.filter((c) => c.vehicle_id != null && Number(c.vehicle_id) === AUDIT_VID)
    console.log(`  Conductores con vehicle_id=${AUDIT_VID}: ${conds.length}`)
    for (const c of conds) {
      const nom = [c.nombres, c.apellidos].filter(Boolean).join(' ').trim() || '(sin nombre en BD)'
      console.log(`    #${c.id} ${nom} | estado=${c.estado}`)
    }

    const ningunVigente = !conds.some((c) => c.estado === 'VIGENTE')
    if (conds.length === 0) {
      line('ALERTA', 'Este vehículo no tiene ningún conductor con vehicle_id apuntando aquí')
      record('alerta', 'AUDIT_VEH_SIN_COND', `vid ${AUDIT_VID}`)
    } else if (ningunVigente) {
      line('ALERTA', 'Hay conductores vinculados pero ninguno en estado VIGENTE')
      record('alerta', 'AUDIT_VEH_SIN_VIGENTE', `vid ${AUDIT_VID}`)
    } else {
      line('OK', 'Al menos un conductor VIGENTE')
    }

    const ning = ingresos.filter((i) => Number(i.vehicle_id) === AUDIT_VID).length
    const ngas = gastos.filter((g) => g.vehicle_id != null && Number(g.vehicle_id) === AUDIT_VID).length
    const ncf = controlFechas.filter((c) => c.vehicle_id != null && Number(c.vehicle_id) === AUDIT_VID).length
    const nkm = kilometrajes.filter((k) => Number(k.vehicle_id) === AUDIT_VID).length
    console.log(`  Ingresos (este vehículo): ${ning}`)
    console.log(`  Gastos (vehicle_id=${AUDIT_VID}): ${ngas}`)
    console.log(`  control_fechas: ${ncf} | kilometrajes: ${nkm}`)
  }
  console.log(`\n  Gastos con vehicle_id null (toda la empresa): ${gasOr.nulls.length}`)

  section('Resumen de severidad')
  console.log(`  CRITICO: ${issues.critico.length}`)
  for (const x of issues.critico) console.log('   ', x)
  console.log(`  ALERTA: ${issues.alerta.length}`)
  for (const x of issues.alerta) console.log('   ', x)
  console.log(`  OK (chequeos pasados registrados): ${issues.ok.length}`)

  let verdict = 'OK'
  if (issues.critico.length) verdict = 'CRITICO'
  else if (issues.alerta.length) verdict = 'ALERTA'

  console.log(`\n>>> VEREDICTO GLOBAL: ${verdict}`)
  if (verdict === 'OK') console.log('    No se detectaron incoherencias críticas ni alertas fuertes en esta corrida.')
  if (verdict === 'ALERTA') console.log('    Revisar alertas arriba (p. ej. conductor ausente, gastos sin vehículo, divergencia seed).')
  if (verdict === 'CRITICO') console.log('    Hay FK rotas u otros datos inconsistentes — revisar antes de nuevos imports.')

  process.exit(issues.critico.length ? 2 : issues.alerta.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(3)
})
