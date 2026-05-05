/**
 * Auditoría ENERO + año 2026: Excel vs parse vs Supabase (solo lectura en DB).
 *
 * Uso:
 *   node scripts/audit_ingresos_enero_2026.mjs "C:\\ruta\\GASTOS E INGRESOS.xlsx"
 *
 * Requiere .env para comparar Supabase: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_EMPRESA_ID.
 * Si faltan credenciales, solo se muestra el análisis del Excel.
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import {
  collectAuditFilasMes,
  parseIngresosLong,
  detectIngresoBlocks,
  detectIngresoYearColorMap,
} from './gastos_ingresos_excel_parse.mjs'
import { normPlaca } from './gastos_excel_parse.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const SHEET_INGRESOS = 'INGRESOS '
const FECHA_OBJETIVO = '2026-01-01'

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

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function normKeyPlaca(placa) {
  const p = normPlaca(placa)
  return p || String(placa ?? '').trim().toUpperCase()
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
      map.set(p, Number(v.id))
      const flat = p.replace(/-/g, '')
      if (flat !== p) map.set(flat, Number(v.id))
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

async function main() {
  const xlsxPath = resolveXlsxPath()
  console.log('=== audit_ingresos_enero_2026 ===\n')
  console.log('Excel:', xlsxPath)
  console.log('Fecha objetivo:', FECHA_OBJETIVO)
  console.log('')

  if (!existsSync(xlsxPath)) {
    console.error('No existe el archivo Excel.')
    process.exit(1)
  }

  const wb = XLSX.readFile(xlsxPath, { cellStyles: true })
  const sheetIngresos = wb.SheetNames.includes(SHEET_INGRESOS)
    ? SHEET_INGRESOS
    : wb.SheetNames.find((n) => n.trim().toUpperCase() === 'INGRESOS')
  if (!sheetIngresos) {
    console.error('No se encontró la hoja INGRESOS.')
    process.exit(1)
  }
  const ws = wb.Sheets[sheetIngresos]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })

  const blocks = detectIngresoBlocks(rows)
  const legend = detectIngresoYearColorMap(ws)
  const { entries: auditEnero } = collectAuditFilasMes(rows, ws, 1)
  const { ingresos: parsedAll } = parseIngresosLong(rows, ws)

  const parsedMap = new Map()
  for (const p of parsedAll) {
    parsedMap.set(`${normKeyPlaca(p.placa)}|${p.excelRow}`, p)
  }

  const parsedEnero2026 = parsedAll.filter((p) => p.fecha === FECHA_OBJETIVO)

  const enExcelColorDice2026 = auditEnero.filter(
    (e) =>
      e.incluido &&
      (e.añoPorColorMes === 2026 || (e.añoPorColorMes == null && e.añoPorColorMonto === 2026)),
  )

  const enExcelFechaFinal2026 = auditEnero.filter((e) => e.incluido && e.fechaFinal === FECHA_OBJETIVO)

  console.log('--- Resumen Excel / parse ---')
  console.log('Bloques (vehículos) detectados:', blocks.length)
  console.log('Filas de auditoría con etiqueta ENERO (+ monto):', auditEnero.length)
  console.log('  Incluidas por parser (año asignado):', auditEnero.filter((e) => e.incluido).length)
  console.log('  Omitidas:', auditEnero.filter((e) => !e.incluido).length)
  console.log('Filas ENERO donde color (mes o monto) indica año 2026:', enExcelColorDice2026.length)
  const colores2026 = [...legend.entries()].filter(([, y]) => y === 2026).map(([k]) => k)
  console.log(
    'Colores en leyenda mapeados a 2026:',
    colores2026.length ? colores2026.join(' | ') : '(ninguno detectado en celdas con año 2018–2026)',
  )
  console.log('Filas ENERO con fecha final construida =', FECHA_OBJETIVO + ':', enExcelFechaFinal2026.length)
  console.log('Registros parseIngresosLong con fecha =', FECHA_OBJETIVO + ':', parsedEnero2026.length)

  const url = (env.VITE_SUPABASE_URL ?? '').trim()
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()

  let placaToId = new Map()
  let dbRows = []
  let vidToPlaca = new Map()

  if (url && serviceKey && empresaId) {
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
    placaToId = await fetchPlacaToId(supabase, empresaId)

    const { data: ingData, error: ingErr } = await supabase
      .from('ingresos')
      .select('id, vehicle_id, fecha, monto')
      .eq('empresa_id', empresaId)
      .eq('fecha', FECHA_OBJETIVO)
    if (ingErr) console.error('[Supabase ingresos]', ingErr.message)
    else dbRows = ingData ?? []

    const ids = [...new Set(dbRows.map((r) => r.vehicle_id).filter(Boolean))]
    if (ids.length) {
      const { data: vehData, error: vehErr } = await supabase.from('vehiculos').select('id, placa').in('id', ids)
      if (vehErr) console.error('[Supabase vehiculos]', vehErr.message)
      else for (const v of vehData ?? []) vidToPlaca.set(Number(v.id), v.placa)
    }

    console.log('\n--- Supabase (solo lectura) ---')
    console.log('Total ingresos con fecha', FECHA_OBJETIVO + ':', dbRows.length)
    const byVid = new Map()
    for (const r of dbRows) {
      const vid = r.vehicle_id
      byVid.set(vid, (byVid.get(vid) || 0) + 1)
    }
    console.log('Por vehicle_id:')
    for (const [vid, c] of [...byVid.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  vehicle_id=${vid} placa=${vidToPlaca.get(Number(vid)) ?? '?'} count=${c}`)
    }

    const importaríanEnero2026 = auditEnero.filter(
      (e) => e.incluido && e.fechaFinal === FECHA_OBJETIVO && lookupVid(e.placa, placaToId) != null,
    )
    const perdidosPlaca = auditEnero.filter(
      (e) => e.incluido && e.fechaFinal === FECHA_OBJETIVO && lookupVid(e.placa, placaToId) == null,
    )

    console.log('\n--- Explicación (por qué pocos en la app / historial) ---')
    console.log(
      '1) El Excel lista muchas filas con texto "Enero", pero el año lo fija el color (u herencia/fallback).',
      'Si el color de la celda mes/monto no es el de 2026, la fecha final será p.ej. 2025-01-01, no',
      FECHA_OBJETIVO + '.',
    )
    console.log(
      '2) En este archivo, filas ENERO con fecha final =',
      FECHA_OBJETIVO + ':',
      enExcelFechaFinal2026.length + ';',
      'el parse global tiene',
      parsedEnero2026.length,
      'movimientos con esa fecha.',
    )
    console.log(
      '3) Del import: solo entran filas cuya placa existe en `vehiculos`. Filas ENERO',
      FECHA_OBJETIVO,
      'que sí importarían:',
      importaríanEnero2026.length + ';',
      'descartadas por placa sin match:',
      perdidosPlaca.length + '.',
    )
    console.log('4) En Supabase hay', dbRows.length, 'filas con fecha', FECHA_OBJETIVO + '.')
    if (dbRows.length !== importaríanEnero2026.length) {
      console.log(
        '   Si difiere de (3), puede haber ingresos manuales, otro import anterior, o registros duplicados/eliminados.',
      )
    }
  } else {
    console.log('\n(Omite comparación Supabase: configura VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_EMPRESA_ID.)')
    console.log('\n--- Explicación (solo Excel) ---')
    console.log(
      'Muchas celdas dicen "Enero" pero el año viene del color. Revisa `fecha_final` y `año_por_color_*` arriba.',
      'Solo las filas con fecha_final =',
      FECHA_OBJETIVO,
      'coinciden con "enero 2026" contable.',
    )
    console.log('Leyenda color→año detectada:', legend.size, 'entradas.')
  }

  console.log('\n--- Detalle: cada fila ENERO en Excel ---')
  for (const e of auditEnero) {
    const key = `${normKeyPlaca(e.placa)}|${e.excelRow}`
    const pMatch = parsedMap.get(key)
    let coincideParse = null
    if (e.incluido) {
      coincideParse = Boolean(
        pMatch && pMatch.fecha === e.fechaFinal && Math.abs((pMatch.monto ?? 0) - (e.monto ?? 0)) < 0.01,
      )
    }
    const vid = lookupVid(e.placa, placaToId)

    console.log(
      JSON.stringify({
        vehicle_id: vid ?? null,
        placa: e.placa,
        fila_excel: e.excelRow,
        mes: e.mesLabel,
        monto: e.monto,
        color_mes: e.colorMesKey,
        color_monto: e.colorMontoKey,
        año_por_color_mes: e.añoPorColorMes,
        año_por_color_monto: e.añoPorColorMonto,
        año_detectado: e.añoDetectado,
        year_source: e.yearSource,
        fecha_final: e.fechaFinal,
        inicio_operacion: e.inicioOperacion,
        maxMesColorAnioInicio: e.maxMesColorAnioInicio,
        incluido_u_omitido: e.incluido ? 'incluido' : 'omitido',
        motivo_omisión: e.motivoOmisión,
        coincide_con_parseIngresosLong: coincideParse,
        parse_en_mapa_fecha: pMatch?.fecha ?? null,
        import_fila_esta_fecha: e.incluido && e.fechaFinal === FECHA_OBJETIVO && vid != null,
      }),
    )
  }

  console.log('\nListo. No se modificó Supabase.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
