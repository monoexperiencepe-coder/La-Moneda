/**
 * Lista gastos en un mes dado; opcionalmente filtra por monto exacto.
 *   node scripts/report_gastos_dic_monto.mjs 2026 12
 *   node scripts/report_gastos_dic_monto.mjs 2026 12 2008
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
const serviceKey = (
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()

const [yStr, mStr, montoEq] = process.argv.slice(2)
const y = Number(yStr)
const mo = Number(mStr)
if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
  console.error('Uso: node scripts/report_gastos_dic_monto.mjs <año> <mes> [monto]')
  process.exit(1)
}
const mm = String(mo).padStart(2, '0')
const from = `${y}-${mm}-01`
const last = new Date(y, mo, 0).getDate()
const to = `${y}-${mm}-${String(last).padStart(2, '0')}`

function colLetter(zeroBased) {
  const n = Number(zeroBased)
  if (!Number.isFinite(n) || n < 0) return '?'
  let dividend = n + 1
  let name = ''
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26
    name = String.fromCharCode(65 + modulo) + name
    dividend = Math.floor((dividend - modulo) / 26)
  }
  return name
}

function excelRef(ex) {
  if (!ex || ex.source !== 'gastos_la_moneda_xlsx') return ''
  const r = ex.row
  const cf = ex.col_fecha
  const cm = ex.col_monto
  if (r == null || cf == null || cm == null) return ''
  return `${colLetter(cf)}${r} / ${colLetter(cm)}${r}`
}

async function main() {
  if (!url || !serviceKey || !empresaId) {
    console.error('Faltan VITE_SUPABASE_URL, SERVICE_ROLE o VITE_EMPRESA_ID')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  let q = supabase
    .from('gastos')
    .select('id,fecha,monto,motivo,tipo_gasto,subtipo_gasto,excel_extra')
    .eq('empresa_id', empresaId)
    .gte('fecha', from)
    .lte('fecha', to)
    .order('monto', { ascending: false })

  if (montoEq != null && String(montoEq).trim() !== '') {
    const m = Number(montoEq)
    if (Number.isFinite(m)) {
      q = q.gte('monto', m - 0.005).lte('monto', m + 0.005)
    }
  }

  const { data, error } = await q
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  const rows = data ?? []
  const total = rows.reduce((s, g) => s + Number(g.monto), 0)
  console.log(`Período ${from} .. ${to} — filas: ${rows.length} — suma monto: ${total.toFixed(2)}`)
  for (const g of rows) {
    const ref = excelRef(g.excel_extra)
    console.log(
      `id=${g.id} | ${g.fecha} | S/${Number(g.monto).toFixed(2)} | ${g.tipo_gasto ?? ''} | ${(g.motivo ?? '').slice(0, 70)}${ref ? ` | Excel ${ref}` : ''}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
