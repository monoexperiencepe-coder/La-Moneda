/**
 * READ-ONLY: audita SUBTIPOS GASTOS.xlsx vs factSubtiposGastos.json
 * No modifica BD ni frontend.
 *
 * Uso:
 *   node scripts/audit_subtipos_excel.mjs
 *   node scripts/audit_subtipos_excel.mjs "ruta/al/archivo.xlsx"
 *
 * Rutas buscadas por defecto:
 *   data/canonical/SUBTIPOS GASTOS.xlsx
 *   SUBTIPOS GASTOS.xlsx (raíz repo)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DEFAULT_PATHS = [
  join(ROOT, 'data', 'canonical', 'SUBTIPOS GASTOS.xlsx'),
  join(ROOT, 'SUBTIPOS GASTOS.xlsx'),
]

function normKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function loadFactJson() {
  const p = join(ROOT, 'src', 'data', 'factSubtiposGastos.json')
  return JSON.parse(readFileSync(p, 'utf8'))
}

function findWorkbookPath(argvPath) {
  if (argvPath) {
    const abs = resolve(argvPath)
    if (!existsSync(abs)) throw new Error(`No existe: ${abs}`)
    return abs
  }
  for (const p of DEFAULT_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

/** Heurística: primera fila con headers; columnas categoría + subtipo. */
function parseSheet(rows) {
  if (!rows?.length) return { headers: [], pairs: [], note: 'hoja vacía' }
  let headerIdx = 0
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const line = (rows[i] ?? []).map((c) => String(c ?? '').trim().toLowerCase())
    if (
      line.some((c) => /categor|tipo|clase|rubro/.test(c)) &&
      line.some((c) => /subtipo|sub tipo|detalle|concepto/.test(c))
    ) {
      headerIdx = i
      break
    }
  }
  const headers = (rows[headerIdx] ?? []).map((c) => String(c ?? '').trim())
  const catCol = headers.findIndex((h) => /categor|tipo|clase|rubro/i.test(h))
  const subCol = headers.findIndex((h) => /subtipo|sub tipo|detalle|concepto/i.test(h))
  if (catCol < 0 || subCol < 0) {
    return {
      headers,
      pairs: [],
      note: 'no se detectaron columnas categoría/subtipo; revisar hoja manualmente',
      rawPreview: rows.slice(0, 8),
    }
  }
  const pairs = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cat = String(rows[i]?.[catCol] ?? '').trim()
    const sub = String(rows[i]?.[subCol] ?? '').trim()
    if (!cat && !sub) continue
    if (!sub) continue
    pairs.push({ categoria: cat, subtipo: sub, normCat: normKey(cat), normSub: normKey(sub) })
  }
  return { headers, catCol, subCol, pairs }
}

function detectDuplicates(pairs) {
  const bySub = new Map()
  const dupSub = []
  for (const p of pairs) {
    const k = p.normSub
    if (!bySub.has(k)) bySub.set(k, [])
    bySub.get(k).push(p)
  }
  for (const [k, list] of bySub) {
    if (list.length > 1) {
      const labels = [...new Set(list.map((x) => x.subtipo))]
      if (labels.length > 1 || [...new Set(list.map((x) => x.categoria))].length > 1) {
        dupSub.push({ normKey: k, occurrences: list })
      }
    }
  }
  return dupSub
}

function diffAgainstFact(pairs, fact) {
  const factSubs = new Set()
  for (const subs of Object.values(fact)) {
    for (const s of subs) factSubs.add(normKey(s))
  }
  const excelOnly = []
  const inBoth = []
  for (const p of pairs) {
    if (factSubs.has(p.normSub)) inBoth.push(p)
    else excelOnly.push(p)
  }
  const excelNorm = new Set(pairs.map((p) => p.normSub))
  const factOnly = []
  for (const subs of Object.values(fact)) {
    for (const s of subs) {
      const nk = normKey(s)
      if (!excelNorm.has(nk)) factOnly.push(s)
    }
  }
  return { excelOnly, inBoth, factOnly }
}

function main() {
  const wbPath = findWorkbookPath(process.argv[2])
  if (!wbPath) {
    console.error(
      '[audit_subtipos_excel] No se encontró SUBTIPOS GASTOS.xlsx.\n' +
        'Coloca el archivo en data/canonical/SUBTIPOS GASTOS.xlsx o pásalo como argumento.',
    )
    process.exit(1)
  }

  const fact = loadFactJson()
  const wb = XLSX.readFile(wbPath, { cellDates: false })
  const sheets = {}
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    const parsed = parseSheet(rows)
    sheets[name] = {
      ...parsed,
      duplicates: detectDuplicates(parsed.pairs ?? []),
      diffFact: diffAgainstFact(parsed.pairs ?? [], fact),
    }
  }

  const outDir = join(ROOT, 'reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'subtipos_excel_audit.json')
  const report = {
    generatedAt: new Date().toISOString(),
    workbook: wbPath,
    sheetNames: wb.SheetNames,
    sheets,
    factTipoCount: Object.keys(fact).length,
  }
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`[audit_subtipos_excel] OK → ${outPath}`)
  for (const name of wb.SheetNames) {
    const s = sheets[name]
    const n = s.pairs?.length ?? 0
    const dup = s.duplicates?.length ?? 0
    const exOnly = s.diffFact?.excelOnly?.length ?? 0
    console.log(`  · ${name}: ${n} pares, ${dup} duplicados ambiguos, ${exOnly} solo en Excel`)
  }
}

main()
