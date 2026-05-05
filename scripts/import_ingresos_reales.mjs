/**
 * Importa ingresos desde "GASTOS E INGRESOS.xlsx" (hoja INGRESOS ) reemplazando
 * TODOS los ingresos de VITE_EMPRESA_ID en Supabase.
 *
 * NO modifica gastos, vehículos, conductores, control_fechas, etc.
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY (o alias).
 * Excel: argumento, o GASTOS_INGRESOS_XLSX / EXCEL_GASTOS_INGRESOS en .env.
 *
 * DRY_RUN=1 por defecto (no borra ni inserta). Import real:
 *   $env:DRY_RUN='0'; node scripts/import_ingresos_reales.mjs "C:\\ruta\\GASTOS E INGRESOS.xlsx"
 *
 * Probar primero:
 *   node scripts/report_gastos_ingresos_excel.mjs "ruta.xlsx" --with-supabase
 *   node scripts/import_ingresos_reales.mjs "ruta.xlsx"
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import {
  loadGastosIngresosWorkbook,
  ingresoFechaEsSospechosa,
  INGRESO_FECHA_TOPE_AUDITORIA,
} from './gastos_ingresos_excel_parse.mjs'
import { normPlaca } from './gastos_excel_parse.mjs'

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
const chunkSize = Math.max(50, Math.min(500, Number(env.CHUNK_SIZE) || 300))

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

async function fetchPlacaToId(supabase, empresa) {
  const page = 1000
  let from = 0
  const map = new Map()
  for (;;) {
    const { data, error } = await supabase.from('vehiculos').select('id, placa').eq('empresa_id', empresa).range(from, from + page - 1)
    if (error) throw new Error(`[vehiculos] ${error.message}`)
    if (!data?.length) break
    for (const v of data) {
      const p = normPlaca(v.placa)
      if (!p) continue
      const id = Number(v.id)
      map.set(p, id)
      const flat = p.replace(/-/g, '')
      if (flat !== p) map.set(flat, id)
    }
    if (data.length < page) break
    from += page
  }
  return map
}

function lookupVid(placa, placaToId) {
  const p = normPlaca(placa)
  if (!p) return null
  if (placaToId.has(p)) return placaToId.get(p)
  const flat = p.replace(/-/g, '')
  if (flat !== p && placaToId.has(flat)) return placaToId.get(flat)
  return null
}

function toIngresoRow(empresa_id, { fecha, vehicle_id, monto, comentarios, excel_extra }) {
  return {
    empresa_id,
    fecha,
    fecha_registro: fecha,
    vehicle_id,
    tipo: 'ALQUILER',
    sub_tipo: null,
    fecha_desde: null,
    fecha_hasta: null,
    metodo_pago: 'Efectivo',
    metodo_pago_detalle: 'Excel GASTOS E INGRESOS (hoja INGRESOS)',
    celular_metodo: null,
    signo: '+',
    monto,
    moneda: 'PEN',
    tipo_cambio: null,
    monto_pen_referencia: monto,
    comentarios: comentarios.slice(0, 2000),
    detalle_operativo: null,
    tipo_operacion: null,
    estado_pago: null,
    excel_extra,
  }
}

async function countIngresos(supabase, empresa) {
  const { count, error } = await supabase.from('ingresos').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function insertChunks(supabase, rows) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('ingresos').insert(batch)
    if (error) throw new Error(`[ingresos insert] lote ${i}: ${error.message}`)
    console.log(`  [ingresos] +${batch.length} (total ${Math.min(i + chunkSize, rows.length)}/${rows.length})`)
  }
}

function summarizeByYear(fechaRows) {
  const m = new Map()
  for (const r of fechaRows) {
    const y = Number(String(r.fecha ?? '').slice(0, 4))
    if (!Number.isFinite(y)) continue
    m.set(y, (m.get(y) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0])
}

function summarizeBySource(parsedIngresos) {
  const m = new Map()
  for (const r of parsedIngresos) {
    const k = r.yearSource || 'desconocido'
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

async function main() {
  const xlsxPath = resolveXlsxPath()
  console.log('--- import_ingresos_reales ---')
  console.log('Excel:', xlsxPath)
  console.log('DRY_RUN:', dryRun ? '1 (no borra ni inserta)' : '0 (BORRAR ingresos empresa + INSERT)')

  if (!existsSync(xlsxPath)) throw new Error(`No existe: ${xlsxPath}`)
  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const parsed = loadGastosIngresosWorkbook(xlsxPath)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const current = await countIngresos(supabase, empresaId)
  console.log('\nIngresos actuales en Supabase (esta empresa):', current)

  const placaToId = await fetchPlacaToId(supabase, empresaId)
  const rows = []
  let sinVid = 0
  for (const r of parsed.ingresos) {
    const vid = lookupVid(r.placa, placaToId)
    if (vid == null) {
      sinVid++
      continue
    }
    const comentarios = `[${r.mesLabel}] Placa ${r.placa} — Excel fila ${r.excelRow}`
    rows.push(
      toIngresoRow(empresaId, {
        fecha: r.fecha,
        vehicle_id: vid,
        monto: r.monto,
        comentarios,
        excel_extra: {
          source: 'gastos_ingresos_xlsx',
          sheet: 'INGRESOS ',
          row: r.excelRow,
          placa_excel: r.placa,
          mes_label: r.mesLabel,
        },
      }),
    )
  }

  const fechasAllParse = parsed.ingresos.map((r) => r.fecha).filter(Boolean).sort()
  const minFechaParse = fechasAllParse[0] ?? null
  const maxFechaParse = fechasAllParse[fechasAllParse.length - 1] ?? null

  const fechas = rows.map((r) => r.fecha).filter(Boolean).sort()
  const minFecha = fechas[0] ?? null
  const maxFecha = fechas[fechas.length - 1] ?? null
  const byYear = summarizeByYear(rows)
  const byYearParse = summarizeByYear(parsed.ingresos)
  const bySource = summarizeBySource(parsed.ingresos)

  const sospechosasParse = parsed.ingresos.filter((r) => ingresoFechaEsSospechosa(r.fecha))
  const sospechosasInsert = rows.filter((r) => ingresoFechaEsSospechosa(r.fecha))

  console.log('\n--- Resumen parse ---')
  console.log('Filas ingreso en Excel (expand):', parsed.ingresos.length)
  console.log('Filas listas para insertar (con vehicle_id):', rows.length)
  console.log('Omitidas (placa no resuelta en vehículos):', sinVid)
  const nColorMes = parsed.ingresos.filter((x) => x.yearSource === 'color_mes').length
  const nColorMonto = parsed.ingresos.filter((x) => x.yearSource === 'color_monto').length
  const nFallback = parsed.ingresos.filter((x) => x.yearSource === 'fallback_heredado').length
  const nFallbackInicio = parsed.ingresos.filter((x) => x.yearSource === 'fallback_inicio_operacion').length
  const nFallbackInicioAdj = parsed.ingresos.filter((x) => x.yearSource === 'fallback_inicio_ajustado').length
  const nFallbackGlobal2026 = parsed.ingresos.filter((x) => x.yearSource === 'fallback_inicio_regla_global_2026').length
  const nGuardrail = parsed.ingresos.filter((x) => x.errorGuardrailFecha).length
  console.log('Ingresos año por color (celda mes):', nColorMes)
  console.log('Ingresos año por color (celda monto/ingreso):', nColorMonto)
  console.log('Ingresos por fallback heredado:', nFallback)
  console.log('Ingresos por fallback inicio_operacion:', nFallbackInicio)
  console.log('Ingresos por fallback inicio ajustado (mes > máx. mes color año inicio):', nFallbackInicioAdj)
  console.log('Ingresos por fallback regla global (sin maxMes, inicio 2026 y mes > 5 → 2025):', nFallbackGlobal2026)
  console.log('Registros con error guardrail fecha (> ' + INGRESO_FECHA_TOPE_AUDITORIA + '):', nGuardrail)
  console.log('Detalle source_year:')
  for (const [src, c] of bySource) console.log(`  ${src}: ${c}`)
  console.log('Min fecha (todo el parse Excel):', minFechaParse ?? '—')
  console.log('Max fecha (todo el parse Excel):', maxFechaParse ?? '—')
  console.log('Min fecha (solo filas a insertar):', minFecha ?? '—')
  console.log('Max fecha (solo filas a insertar):', maxFecha ?? '—')
  console.log('Conteo por año (todo el parse Excel):')
  for (const [y, c] of byYearParse) console.log(`  ${y}: ${c}`)
  console.log('Conteo por año (solo filas a insertar):')
  for (const [y, c] of byYear) console.log(`  ${y}: ${c}`)
  console.log(
    `Fechas sospechosas (>${INGRESO_FECHA_TOPE_AUDITORIA}) en parse:`,
    sospechosasParse.length,
    '| en filas a insertar:',
    sospechosasInsert.length,
  )
  if (sospechosasParse.length > 0) {
    console.log('Muestra sospechosas parse (50):')
    for (const r of sospechosasParse.slice(0, 50)) {
      console.log(
        `  fila ${r.excelRow} ${r.placa ?? '—'} ${r.fecha} ${r.mesLabel} src=${r.yearSource} colorMes=${r.colorMesKey ?? '—'} añoMes=${r.añoPorColorMes ?? '—'} colorMonto=${r.colorMontoKey ?? '—'} añoMonto=${r.añoPorColorMonto ?? '—'}`,
      )
    }
  }

  if (maxFecha && maxFecha > '2026-12-31') {
    throw new Error(
      `ABORTADO: max fecha parseada (${maxFecha}) supera 2026-12-31. Revisa parser/auditor antes de importar.`,
    )
  }

  if (sospechosasParse.length > 0 || sospechosasInsert.length > 0) {
    throw new Error(
      `ABORTADO: hay ${sospechosasParse.length} ingreso(s) parseados con fecha sospechosa (>${INGRESO_FECHA_TOPE_AUDITORIA}). Ejecuta: node scripts/audit_ingresos_fecha_global.mjs`,
    )
  }

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se borró ni insertó nada.')
    console.log('Validar con: node scripts/report_gastos_ingresos_excel.mjs "' + xlsxPath + '" --with-supabase')
    console.log('Import real:  $env:DRY_RUN=\'0\'; node scripts/import_ingresos_reales.mjs "' + xlsxPath + '"')
    return
  }

  if (sinVid > 0) {
    console.warn('\nADVERTENCIA: hay filas Excel sin vehicle_id; el import continúa solo con las resueltas.')
  }

  console.log('\n--- Importación real ---')
  console.log('Borrando ingresos donde empresa_id =', empresaId, '…')
  const { error: delErr } = await supabase.from('ingresos').delete().eq('empresa_id', empresaId)
  if (delErr) throw new Error(`[ingresos delete] ${delErr.message}`)

  const afterDel = await countIngresos(supabase, empresaId)
  console.log('Ingresos tras borrado:', afterDel, '(esperado 0)')

  if (rows.length) await insertChunks(supabase, rows)
  const final = await countIngresos(supabase, empresaId)
  console.log('\nListo. Ingresos finales:', final, '(esperado', rows.length + ')')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
