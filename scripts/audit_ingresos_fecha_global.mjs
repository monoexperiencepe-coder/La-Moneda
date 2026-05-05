/**
 * Auditoría global de fechas parseadas en la hoja INGRESOS (sin Supabase).
 *
 * - Lista registros con fecha > 2026-05-31 (sospechosos): colores, años por color, año final.
 * - Resumen: min/max fecha, conteo por año, cantidad sospechosas, muestra de 50.
 *
 * Uso:
 *   node scripts/audit_ingresos_fecha_global.mjs [ruta.xlsx]
 *
 * Opcional en .env: GASTOS_INGRESOS_XLSX / EXCEL_GASTOS_INGRESOS
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, dirname, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import {
  loadGastosIngresosWorkbook,
  INGRESO_FECHA_TOPE_AUDITORIA,
  ingresoFechaEsSospechosa,
} from './gastos_ingresos_excel_parse.mjs'

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

function resolveXlsxPath() {
  const argv = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const a0 = (argv || '').trim()
  if (a0) return isAbsolute(a0) ? a0 : resolve(root, a0)
  const g = (env.GASTOS_INGRESOS_XLSX || env.EXCEL_GASTOS_INGRESOS || '').trim()
  if (g) return isAbsolute(g) ? g : resolve(root, g)
  return resolve(root, 'GASTOS E INGRESOS.xlsx')
}

function summarizeByYear(ingresos) {
  const m = new Map()
  for (const r of ingresos) {
    const y = Number(String(r.fecha ?? '').slice(0, 4))
    if (!Number.isFinite(y)) continue
    m.set(y, (m.get(y) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0])
}

function summarizeSource(ingresos) {
  const m = new Map()
  for (const r of ingresos) {
    const k = r.yearSource || 'desconocido'
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

function rowAuditPayload(r) {
  return {
    vehicle_id: null,
    placa: r.placa ?? null,
    excel_row: r.excelRow,
    mes: r.mesLabel,
    monto: r.monto,
    inicio_operacion: r.inicioOperacion ?? null,
    max_mes_color_año_inicio: r.maxMesColorAnioInicio ?? null,
    año_final_asignado: r.añoFinal ?? Number(String(r.fecha).slice(0, 4)),
    fecha: r.fecha,
    year_source: r.yearSource ?? null,
    color_mes: r.colorMesKey ?? null,
    año_por_color_mes: r.añoPorColorMes ?? null,
    color_monto: r.colorMontoKey ?? null,
    año_por_color_monto: r.añoPorColorMonto ?? null,
    sospechosa: Boolean(r.sospechosa ?? ingresoFechaEsSospechosa(r.fecha)),
    error_guardrail_fecha: Boolean(r.errorGuardrailFecha),
  }
}

function printSospechosaCompleta(o) {
  console.log(
    [
      '---',
      `  placa: ${o.placa ?? '—'}`,
      `  fila_excel: ${o.excel_row}`,
      `  mes: ${o.mes}`,
      `  monto: ${o.monto}`,
      `  inicio_operacion: ${o.inicio_operacion ?? '—'}`,
      `  maxMesColorAnioInicio: ${o.max_mes_color_año_inicio ?? '—'}`,
      `  año_final: ${o.año_final_asignado}`,
      `  fecha: ${o.fecha}`,
      `  year_source: ${o.year_source ?? '—'}`,
    ].join('\n'),
  )
}

function main() {
  const path = resolveXlsxPath()
  console.log('=== audit_ingresos_fecha_global ===\n')
  console.log('Excel:', path)
  console.log('Tope auditoría (fecha sospechosa si >):', INGRESO_FECHA_TOPE_AUDITORIA)
  console.log('Nota: vehicle_id no se consulta (sin Supabase).\n')

  if (!existsSync(path)) {
    console.error('No existe el archivo. Indica la ruta como argumento o define GASTOS_INGRESOS_XLSX en .env.')
    process.exit(1)
  }

  const parsed = loadGastosIngresosWorkbook(path)
  const ingresos = parsed.ingresos || []

  const fechas = ingresos.map((r) => r.fecha).filter(Boolean).sort()
  const minFecha = fechas[0] ?? null
  const maxFecha = fechas[fechas.length - 1] ?? null
  const byYear = summarizeByYear(ingresos)
  const bySource = summarizeSource(ingresos)

  const sospechosas = ingresos.filter((r) => ingresoFechaEsSospechosa(r.fecha))
  const reglaGlobal2026 = ingresos.filter((r) => r.yearSource === 'fallback_inicio_regla_global_2026')

  console.log('--- Resumen parse ---')
  console.log('Total ingresos parseados:', ingresos.length)
  console.log('Min fecha:', minFecha ?? '—')
  console.log('Max fecha:', maxFecha ?? '—')
  console.log('\nConteo por año:')
  for (const [y, c] of byYear) console.log(`  ${y}: ${c}`)
  console.log('\nConteo por year_source:')
  for (const [s, c] of bySource) console.log(`  ${s}: ${c}`)
  console.log('\nSospechosas (fecha >', INGRESO_FECHA_TOPE_AUDITORIA + '):', sospechosas.length)

  if (reglaGlobal2026.length > 0) {
    console.log(
      '\n--- Registros con fallback_inicio_regla_global_2026 (sin maxMes color; inicio 2026 y mes > 5 → año 2025) ---',
    )
    console.log('Cantidad:', reglaGlobal2026.length)
    for (const r of reglaGlobal2026) printSospechosaCompleta(rowAuditPayload(r))
  }

  if (sospechosas.length > 0) {
    console.log('\n--- Sospechosas completas (campos principales) ---')
    for (const r of sospechosas) printSospechosaCompleta(rowAuditPayload(r))
  }

  console.log('\n--- Lista completa: registros sospechosos (JSON por línea) ---')
  if (sospechosas.length === 0) {
    console.log('(ninguno)')
  } else {
    for (const r of sospechosas) {
      console.log(JSON.stringify(rowAuditPayload(r)))
    }
  }

  console.log('\n--- Muestra: primeros 50 sospechosos (vista legible) ---')
  if (sospechosas.length === 0) {
    console.log('(ninguno)')
  } else {
    for (const r of sospechosas.slice(0, 50)) {
      const o = rowAuditPayload(r)
      console.log(
        [
          `  fila_excel=${o.excel_row} placa=${o.placa ?? '—'} mes=${o.mes}`,
          `    fecha=${o.fecha} monto=${o.monto} inicio_op=${o.inicio_operacion ?? '—'} maxMes=${o.max_mes_color_año_inicio ?? '—'}`,
          `    año_final=${o.año_final_asignado} source=${o.year_source}`,
          `    color_mes=${o.color_mes ?? '—'} año_color_mes=${o.año_por_color_mes ?? '—'}`,
          `    color_monto=${o.color_monto ?? '—'} año_color_monto=${o.año_por_color_monto ?? '—'}`,
        ].join('\n'),
      )
    }
    if (sospechosas.length > 50) console.log(`  … (${sospechosas.length - 50} más listados arriba en JSON)`)
  }

  if (sospechosas.length > 0) {
    console.error('\n[EXIT 1] Hay fechas sospechosas; revisar parser/Excel antes de importar.')
    process.exit(1)
  }
  console.log('\n✓ Sin fechas sospechosas según el tope configurado.')
}

main()
