/**
 * Clasifica gastos existentes (capa inteligente) sin borrar nada.
 *
 * Objetivo de modelo:
 * - gastos_caja: ledger bruto/original (NO se toca)
 * - gastos: capa clasificada para reportes
 *
 * DRY_RUN por defecto = 1 (solo analiza y muestra resumen)
 * - DRY_RUN=0 -> aplica UPDATE en public.gastos (incl. clasificacion_confianza)
 * - Texto de reglas: norm() + normalizeTypos() (errores típicos Excel)
 * - Política de confianza: umbrales 0.3 / 0.6, ver finalizeConfidence()
 *
 * Uso:
 *   node scripts/clasificar_gastos_financieros.mjs
 *   DRY_RUN=0 node scripts/clasificar_gastos_financieros.mjs
 *   node scripts/clasificar_gastos_financieros.mjs --export-pendientes-csv
 *   node scripts/clasificar_gastos_financieros.mjs --export-review-csv
 *   node scripts/clasificar_gastos_financieros.mjs --analyze-pendientes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const TIPOS = /** @type {const} */ ([
  'operativo_vehiculo',
  'operativo_flota_global',
  'administrativo_empresa',
  'financiero',
  'inversion',
  'personal_socios',
  'pendiente_revision',
])
const LAST_REPORT_PATH = resolve(__dirname, '.clasificar_gastos_last_report.json')
const AUDIT_PATTERNS = [
  { key: 'MANT.PECHY', terms: ['mant.pechy', 'mant pechy'] },
  { key: 'MANT.CARROS', terms: ['mant.carros', 'mant carros'] },
  { key: 'PAGO MANT', terms: ['pago mant', 'pago mant simple', 'pago mant simple y completos'] },
  { key: 'PECHY MANT', terms: ['pechy mant', 'pechy mantenimiento'] },
  { key: 'MANTENIMIENTO FLOTA', terms: ['mantenimiento flota', 'mantenimiento vehiculos', 'mantenimiento vehiculos'] },
  { key: 'ASV', terms: ['asv'] },
  { key: 'ASB', terms: ['asb'] },
  { key: 'DSB', terms: ['dsb'] },
  { key: 'MPBA', terms: ['mpba'] },
  { key: 'PRESTAMO', terms: ['prestamo', 'préstamo'] },
  { key: 'INTERES', terms: ['interes', 'interés'] },
  { key: 'RUS', terms: ['rus'] },
  { key: 'SUNAT', terms: ['sunat'] },
  { key: 'OFICINA', terms: ['oficina'] },
  { key: 'SOCIOS', terms: ['socios', 'socio'] },
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
const exportPendientesCsv = process.argv.includes('--export-pendientes-csv')
const exportReviewCsv = process.argv.includes('--export-review-csv')
const analyzePendientes = process.argv.includes('--analyze-pendientes')
/** Export/análisis: no aplican UPDATE en public.gastos */
const blockDbUpdates = exportPendientesCsv || exportReviewCsv || analyzePendientes

if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const KEYWORDS = {
  // Reglas explícitas del pedido
  operativoVehiculoForzado: [
    'soat', 'afocat',
    'impuesto ve', 'impuesti ve', 'impuesto vehicular',
    'gnv', 'gasolina',
    'embrague',
    'bobina', 'bobinas',
    'alternador',
    'manguera',
    'pastillas',
    'zapata',
    'retificacion', 'rectificacion',
    'sensor',
    'gps',
    'polarizado',
    'forro', 'asientos', 'techo', 'timon', 'piso',
    'planchado', 'pintura',
    'llanta', 'llantas',
    'aire acondicionado',
    'focos', 'faros',
    'accesorios',
    'filtro', 'filtros',
    'motor',
    'bujia', 'bujias',
  ],
  globalFlota: [
    'varios carros',
    'todos los carros',
    'flota',
    'mant simple y completos',
    'mant.carros pechy',
    'pago mant simple y completos',
    'mant.pechy febrero',
    'mant.pechy diciembre',
    'pechy mant varios carros',
  ],
  operativoVehiculoAmplio: [
    'mecanic', 'taller', 'repuesto', 'autoparte', 'bateria', 'bateria',
    'amortiguador', 'trapecio', 'radiador', 'bujia', 'bujias', 'caliper',
    'bomba', 'filtro', 'filtros', 'aceite', 'alineamiento', 'balanceo', 'lavado',
    'servicio', 'modulo', 'mampara', 'fraccionamiento', 'conductos',
    'instalacion', 'instalaciones', 'rectificacion',
    'cremallera', 'hidrolina', 'refrigerante',
  ],
  subtipo: {
    soat: ['soat', 'afocat'],
    impuesto_vehicular: ['impuesto ve', 'impuesti ve', 'impuesto vehicular'],
    gnv: ['gnv'],
    combustible: ['gasolina', 'petroleo', 'diesel', 'diesel', 'combustible'],
    motor: ['embrague', 'bobina', 'bobinas', 'alternador', 'manguera', 'retificacion', 'rectificacion', 'sensor', 'motor', 'inyector', 'inyectores', 'filtro', 'filtros', 'bujia', 'bujias'],
    frenos: ['pastillas', 'zapata', 'freno', 'frenos', 'caliper', 'disco'],
    suspension: ['suspension', 'suspension', 'amortiguador', 'amortiguadores', 'trapecio', 'trapecios', 'articulacion'],
    accesorios: ['gps', 'gps instalacion', 'gps delantero', 'gps trasero', 'polarizado', 'accesorios', 'focos', 'faros', 'mica faro'],
    interior: ['forro', 'asientos', 'techo', 'timon', 'piso'],
    electricidad: ['alternador', 'bobina', 'bobinas', 'sensor', 'focos', 'faros', 'bateria', 'batería'],
    aire_acondicionado: ['aire acondicionado', 'a/c', 'acondicionado'],
    llantas: ['llanta', 'llantas'],
    planchado_pintura: ['planchado', 'pintura'],
  },
  financiero: [
    'asv', 'asb', 'dsb', 'mpba', 'prestamo', 'préstamo', 'interes', 'interés', 'banco', 'bancos',
  ],
  inversion: [
    'compra auto', 'compra carro', 'compra vehiculo', 'compra vehículo',
    'adquisicion auto', 'adquisición auto', 'adquisicion vehiculo', 'adquisición vehículo',
  ],
  personal: [
    // OJO: techo/forro/piso/timon/asientos ya NO van aquí (pedido).
    'socio', 'socios', 'familia', 'casa', 'depa', 'departamento',
    'comida perros', 'comida perro', 'mascota', 'personal',
  ],
  /** Sin "chip/chips" sueltos: ver matchAdministrativoEmpresa() */
  administrativo: ['rus', 'sunat', 'oficina', 'boleta', 'boletas', 'gps plataforma', 'plataforma'],
}

/** Señales ALTA (0.9–1.0): refuerzan confianza por texto */
const CONF_ALTA_KEYWORDS = [
  'asv',
  'asb',
  'dsb',
  'mpba',
  'prestamo',
  'préstamo',
  'interes',
  'interés',
  'banco',
  'bancos',
  'compra carro',
  'compra vehiculo',
  'compra vehículo',
  'soat',
  'afocat',
  'gnv',
  'embrague',
  'llantas',
  'llanta',
  'pastillas',
  'pastilla',
  'impuesto vehicular',
  'impuesto ve',
  'impuesti ve',
  'sunat',
  'rus',
  'gps chips',
  'gps chip',
  'chip gps',
  'recarga chips',
  'recarga chip',
]

const CONF_MEDIA_KEYWORDS = [
  'arreglo',
  'arreglos',
  'freno',
  'frenos',
  'rodaje',
  'rodajes',
  'luna',
  'lunas',
  'regulacion',
  'regulación',
  'accesorio',
  'accesorios',
  'cableado',
  'condensador',
  'plumilla',
  'plumillas',
  'bocina',
  'bocinas',
  'pintura',
  'forro',
  'forros',
  'interior',
  'interiores',
]

const CONF_AMBIGUOUS_PHRASES = ['gas entrega', 'limpieza aros']

const RULES_FORCE_REVISION = new Set([
  'seguras_descripcion_minima_modelo',
  'override_financiero_codigo_pago_operativo',
  'gastos_caja_vehicle_sin_senales_fuertes',
])

/** Confianza fija (no max con señales): banda media-baja explícita */
const RULES_CONFIDENCE_EXACT = new Set([
  'override_financiero_codigo_pago_operativo',
  'gastos_caja_vehicle_sin_senales_fuertes',
])

/** @param {string} text */
function matchAdministrativoEmpresa(text) {
  if (hasAny(text, KEYWORDS.administrativo)) return true
  return /\bchip\s+gps\b|\bgps\s+chip\b|\bgps\s+chips\b|\brecarga\s+chips?\b|\bplataforma\s+gps\b|\bgps\s+plataforma\b|\bchips\s+claro\b/i.test(
    text,
  )
}

/** ASV/ASB/DSB como código de pago + naturaleza operativa vehículo → no financiero directo */
/** @param {string} text */
function isFinancieroCodigoPagoVsOperativoNature(text) {
  const hasCode = /\basv\b|\basb\b|\bdsb\b/i.test(text)
  const hasNature =
    /\bimpuesto\s+vehicular\b|\bimpuesto\s+ve\b|\bimpuesti\s+ve\b|\bpolarizado\b|\blunas?\b|\baccesorios?\b/i.test(
      text,
    )
  return hasCode && hasNature
}

/** @param {string} text */
function hasSenalesFinancierasDuras(text) {
  return hasAny(text, KEYWORDS.financiero)
}

/** Excluye chip suelto; coincide con administrativo “fuerte” */
/** @param {string} text */
function hasSenalesAdministrativasDuras(text) {
  return matchAdministrativoEmpresa(text)
}

/** @param {string} text */
function hasSenalesInversion(text) {
  return hasAny(text, KEYWORDS.inversion)
}

/** Import desde ledger gastos_caja en texto agregado */
/** @param {string} text */
function isFromGastosCajaImport(text) {
  return /\[\s*origen\s+gastos_caja/i.test(text) || /\bgastos_caja\b/i.test(text) || /\bexcel\s+gastos\b/i.test(text)
}

/** Modelo + año corto sin riqueza semántica (BAJA confianza heurística) */
/** @param {string} text */
function looksLikeSoloModeloNumero(text) {
  if (!/\b(yaris|versa|rio)\s+\d{1,3}\b/i.test(text)) return false
  const noise =
    /otros provisionales|gastos_caja|excel|fila|origen|caja unidad|script|traslado|id=/gi
  const cleaned = text.replace(noise, ' ')
  const tokens = cleaned
    .split(/[^a-z0-9]+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  const meaningful = tokens.filter((t) => !/^(yaris|versa|rio|\d{1,3})$/i.test(t))
  return meaningful.length <= 2
}

/**
 * Confianza por señales en texto (sin regla explícita).
 * `skipVehicleBoost`: no aplicar refuerzo por vehicle_id/modelo (evita inflar fallback/pendientes).
 * @param {string} text
 * @param {any} g
 * @param {{ skipVehicleBoost?: boolean }} [opts]
 */
function computeSignalConfidence(text, g, opts = {}) {
  const skipV = opts.skipVehicleBoost === true
  let max = 0
  if (hasAny(text, CONF_ALTA_KEYWORDS)) max = Math.max(max, 0.92)
  if (!skipV && g.vehicle_id != null) max = Math.max(max, 0.72)
  if (hasAny(text, CONF_MEDIA_KEYWORDS)) max = Math.max(max, 0.72)
  if (!skipV && /\b(yaris|versa|rio)\b/i.test(text)) max = Math.max(max, 0.72)
  if (looksLikeSoloModeloNumero(text)) max = Math.max(max, 0.42)
  for (const ph of CONF_AMBIGUOUS_PHRASES) {
    if (text.includes(norm(ph))) max = Math.max(max, 0.42)
  }
  if (/\barreglo\b/i.test(text) && text.length < 70) max = Math.max(max, 0.42)
  return max
}

/** @param {string | undefined} rule */
function ruleConfidenceFloor(rule) {
  if (!rule) return 0
  const floors = /** @type {Record<string, number>} */ ({
    global_flota_keywords: 0.95,
    financiero_keywords: 0.92,
    inversion_keywords: 0.92,
    administrativo_keywords: 0.92,
    operativo_vehiculo_forzado_keywords: 0.92,
    operativo_vehiculo_amplio_keywords: 0.72,
    personal_keywords: 0.85,
    fallback_pendiente: 0.08,
    override_financiero_codigo_pago_operativo: 0.55,
    gastos_caja_vehicle_sin_senales_fuertes: 0.55,
  })
  if (rule.startsWith('seguras_')) {
    if (rule === 'seguras_descripcion_minima_modelo') return 0.42
    return 0.88
  }
  return floors[rule] ?? 0.55
}

/**
 * @param {any} g
 * @param {string} text
 * @param {any} c
 */
function applyGastosCajaVehicleOperativoRule(g, text, c) {
  if (c.tipo_gasto !== 'pendiente_revision') return c
  if (!isFromGastosCajaImport(text)) return c
  if (g.vehicle_id == null) return c
  if (hasSenalesFinancierasDuras(text)) return c
  if (hasSenalesAdministrativasDuras(text)) return c
  if (hasSenalesInversion(text)) return c
  return {
    ...c,
    tipo_gasto: 'operativo_vehiculo',
    subtipo_gasto: getSubtipoOperativoVehiculo(text),
    rule: 'gastos_caja_vehicle_sin_senales_fuertes',
  }
}

/**
 * Política: umbrales 0.3 / 0.6 y downgrade si conf < 0.3.
 * @param {any} g
 * @param {string} text
 * @param {any} c
 */
function finalizeConfidence(g, text, c) {
  const floor = ruleConfidenceFloor(c.rule)
  const skipVehicleForSignals =
    c.rule === 'fallback_pendiente'
    || c.rule === 'seguras_descripcion_minima_modelo'
  let conf
  if (RULES_CONFIDENCE_EXACT.has(c.rule)) {
    conf = floor
  } else {
    conf = Math.max(
      computeSignalConfidence(text, g, { skipVehicleBoost: skipVehicleForSignals }),
      floor,
    )
  }
  if (c.rule === 'seguras_descripcion_minima_modelo') conf = 0.42
  conf = Math.min(1, Math.round(conf * 1000) / 1000)

  let tipo = c.tipo_gasto
  let subtipo = c.subtipo_gasto
  let reqRev = conf < 0.6
  if (conf < 0.3) {
    reqRev = true
    if (tipo !== 'pendiente_revision') {
      tipo = 'pendiente_revision'
      subtipo = null
    }
  } else if (conf >= 0.6) {
    reqRev = false
  }

  if (RULES_FORCE_REVISION.has(c.rule)) reqRev = true

  return {
    ...c,
    tipo_gasto: tipo,
    subtipo_gasto: subtipo,
    clasificacion_confianza: conf,
    requiere_revision: reqRev,
  }
}

/** @param {string} s */
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text @param {string[]} kws */
function hasAny(text, kws) {
  return kws.some((k) => text.includes(norm(k)))
}

function getSubtipoOperativoVehiculo(text) {
  const ordered = [
    'soat',
    'impuesto_vehicular',
    'aire_acondicionado',
    'llantas',
    'planchado_pintura',
    'interior',
    'accesorios',
    'combustible',
    'gnv',
    'frenos',
    'suspension',
    'electricidad',
    'motor',
  ]
  for (const st of ordered) {
    if (hasAny(text, KEYWORDS.subtipo[st])) return st
  }
  return 'motor'
}

function isVehicleSpecificMaintenance(text) {
  // Evita clasificar como global cuando el texto parece ser de una unidad concreta: "YARIS 05 MANT SIMPLE"
  return /\b(yaris|versa|rio)\s*[- ]?\d{1,3}\b/.test(text)
}

/** @param {string} s */
function escapeRegexTypo(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Orden: strings más largos primero para no trozar palabras compuestas */
const TYPO_REPLACEMENTS = /** @type {readonly [string, string][]} */ ([
  ['fraccionameinto', 'fraccionamiento'],
  ['pastillasa', 'pastillas'],
  ['pastillsa', 'pastillas'],
  ['intalacion', 'instalacion'],
  ['retificacion', 'rectificacion'],
  ['conductors', 'conductos'],
  ['siguenal', 'senal'],
  ['garamtia', 'garantia'],
  ['embregue', 'embrague'],
  ['llanatas', 'llantas'],
  ['devulve', 'devuelve'],
  ['impuesti', 'impuesto'],
  ['serviso', 'servicio'],
  ['mamapara', 'mampara'],
  ['embrage', 'embrague'],
  ['llanats', 'llantas'],
  ['pitnura', 'pintura'],
  ['doalres', 'dolares'],
  ['madulo', 'modulo'],
  ['fitlro', 'filtro'],
  ['golina', 'gasolina'],
  ['comrpa', 'compra'],
  ['bujais', 'bujias'],
  ['mtoor', 'motor'],
  ['enlante', 'enllante'],
  ['henrrry', 'henry'],
]).slice().sort((a, b) => b[0].length - a[0].length)

/**
 * Reduce errores típicos de pegado desde Excel antes de aplicar reglas.
 * @param {string} text ya normalizado (norm): minúsculas, sin acentos
 */
function normalizeTypos(text) {
  let out = text
  for (const [wrong, right] of TYPO_REPLACEMENTS) {
    const re = new RegExp(`\\b${escapeRegexTypo(wrong)}\\b`, 'g')
    out = out.replace(re, right)
  }
  return out
}

/** @param {any} g */
function joinGastoFields(g) {
  return [
    g.tipo,
    g.sub_tipo,
    g.categoria,
    g.motivo,
    g.pagado_a,
    g.comentarios,
    g.detalle_operativo,
    g.categoria_real,
    g.subcategoria,
    g.metodo_pago,
    g.metodo_pago_detalle,
  ].filter(Boolean).join(' | ')
}

/** Texto solo norm(), sin corrección de typos (baseline pendientes). */
function buildTextSinTypos(g) {
  return norm(joinGastoFields(g))
}

/** Texto que usan todas las reglas: norm + typos Excel */
function buildText(g) {
  return normalizeTypos(norm(joinGastoFields(g)))
}

/**
 * Heurística solo para export CSV de pendientes: no altera clasificar().
 * Si hay vehicle_id y ninguna regla estricta aplicó, suele ser operativo de unidad.
 */
function sugerirClasificacionPendiente(g) {
  const text = buildText(g)
  if (hasAny(text, KEYWORDS.globalFlota) && !isVehicleSpecificMaintenance(text)) {
    return { tipo: 'operativo_flota_global', subtipo: 'mantenimiento_global_flota' }
  }
  if (g.vehicle_id != null) {
    return { tipo: 'operativo_vehiculo', subtipo: getSubtipoOperativoVehiculo(text) }
  }
  return { tipo: '', subtipo: '' }
}

/** @param {unknown} val */
function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * @param {string} pathAbs
 * @param {any[]} pendientesRows filas clasificadas pendientes
 */
function exportPendientesCsvFile(pathAbs, pendientesRows) {
  const headers = [
    'id',
    'fecha',
    'vehicle_id',
    'monto',
    'tipo',
    'motivo',
    'categoria_real',
    'comentarios',
    'texto_normalizado',
    'sugerencia_tipo_gasto',
    'sugerencia_subtipo_gasto',
  ]
  const lines = [headers.join(',')]
  for (const r of pendientesRows) {
    const text = buildText(r)
    const sug = sugerirClasificacionPendiente(r)
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.fecha ?? ''),
        csvEscape(r.vehicle_id ?? ''),
        csvEscape(r.monto ?? ''),
        csvEscape(r.tipo ?? ''),
        csvEscape(r.motivo ?? ''),
        csvEscape(r.categoria_real ?? ''),
        csvEscape(r.comentarios ?? ''),
        csvEscape(text),
        csvEscape(sug.tipo),
        csvEscape(sug.subtipo),
      ].join(','),
    )
  }
  mkdirSync(dirname(pathAbs), { recursive: true })
  writeFileSync(pathAbs, lines.join('\n'), 'utf8')
}

const REVIEW_QUEUE_CSV_PATH = resolve(root, 'reports/review_queue.csv')

/**
 * Cola de revisión manual (clasificación con baja confianza o marcada).
 * @param {string} pathAbs
 * @param {any[]} rows filas ya clasificadas (spread ...c sobre gasto)
 */
function exportReviewQueueCsv(pathAbs, rows) {
  const headers = [
    'id',
    'fecha',
    'monto',
    'vehicle_id',
    'comentarios',
    'tipo_gasto',
    'subtipo_gasto',
    'clasificacion_confianza',
    'requiere_revision',
  ]
  const lines = [headers.join(',')]
  const queue = rows.filter((r) => r.requiere_revision || r.tipo_gasto === 'pendiente_revision')
  for (const r of queue) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.fecha ?? ''),
        csvEscape(r.monto ?? ''),
        csvEscape(r.vehicle_id ?? ''),
        csvEscape(r.comentarios ?? ''),
        csvEscape(r.tipo_gasto ?? ''),
        csvEscape(r.subtipo_gasto ?? ''),
        csvEscape(r.clasificacion_confianza ?? ''),
        csvEscape(r.requiere_revision ? 'true' : 'false'),
      ].join(','),
    )
  }
  mkdirSync(dirname(pathAbs), { recursive: true })
  writeFileSync(pathAbs, lines.join('\n'), 'utf8')
}

function loadPreviousReport() {
  if (!existsSync(LAST_REPORT_PATH)) return null
  try {
    return JSON.parse(readFileSync(LAST_REPORT_PATH, 'utf8'))
  } catch {
    return null
  }
}

function saveCurrentReport(report) {
  try {
    writeFileSync(LAST_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  } catch (e) {
    console.warn('[warn] no se pudo guardar reporte anterior:', e.message)
  }
}

/**
 * Clasificación sin política de confianza (uso interno).
 * @param {any} g fila de public.gastos
 * @param {string} text resultado de buildText / buildTextSinTypos
 * @param {{ useSeguras?: boolean }} [opts]
 */
function clasificarDesdeTextoCore(g, text, opts = {}) {
  const useSeguras = opts.useSeguras !== false
  // 1) reglas explícitas de global flota
  if (hasAny(text, KEYWORDS.globalFlota) && !isVehicleSpecificMaintenance(text)) {
    return {
      tipo_gasto: 'operativo_flota_global',
      subtipo_gasto: 'mantenimiento_global_flota',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: true,
      requiere_revision: false,
      rule: 'global_flota_keywords',
    }
  }

  // 2) ASV/ASB/DSB + naturaleza operativa vehículo → operativo (no financiero directo)
  if (isFinancieroCodigoPagoVsOperativoNature(text)) {
    const subtipo = getSubtipoOperativoVehiculo(text)
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: subtipo,
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'override_financiero_codigo_pago_operativo',
    }
  }

  // 3) financiero (prioridad alta)
  if (hasAny(text, KEYWORDS.financiero)) {
    return {
      tipo_gasto: 'financiero',
      subtipo_gasto: 'prestamo_interes_banca',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'financiero_keywords',
    }
  }

  // 4) inversión (prioridad alta)
  if (hasAny(text, KEYWORDS.inversion)) {
    return {
      tipo_gasto: 'inversion',
      subtipo_gasto: 'compra_unidad',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'inversion_keywords',
    }
  }

  // 5) administrativo_empresa (prioridad alta; chip solo no basta)
  if (matchAdministrativoEmpresa(text)) {
    return {
      tipo_gasto: 'administrativo_empresa',
      subtipo_gasto: 'tributario_operativo_empresa',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'administrativo_keywords',
    }
  }

  // 6) FORZADO: toda palabra de lista objetivo => operativo_vehiculo
  if (hasAny(text, KEYWORDS.operativoVehiculoForzado)) {
    const subtipo = getSubtipoOperativoVehiculo(text)
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: subtipo,
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'operativo_vehiculo_forzado_keywords',
    }
  }

  // 7) cobertura amplia para reducir pendiente_revision (vehículo + términos mecánicos comunes)
  if (g.vehicle_id != null && hasAny(text, KEYWORDS.operativoVehiculoAmplio)) {
    const subtipo = getSubtipoOperativoVehiculo(text)
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: subtipo,
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'operativo_vehiculo_amplio_keywords',
    }
  }

  // 8) Reglas seguras (post análisis pendientes): refinan antes de personal/fallback
  if (useSeguras) {
    const seguras = clasificarOperativoSeguras(g, text)
    if (seguras) return seguras
  }

  // 9) personal_socios
  if (hasAny(text, KEYWORDS.personal)) {
    return {
      tipo_gasto: 'personal_socios',
      subtipo_gasto: 'gasto_personal',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'personal_keywords',
    }
  }

  // fallback
  return {
    tipo_gasto: 'pendiente_revision',
    subtipo_gasto: null,
    origen_clasificacion: 'reglas_v1',
    es_global_flota: false,
    requiere_revision: true,
    rule: 'fallback_pendiente',
  }
}

/**
 * Clasificación completa: reglas + rescate gastos_caja + scoring de confianza.
 * @param {any} g
 * @param {string} text
 * @param {{ useSeguras?: boolean }} [opts]
 */
function clasificarDesdeTexto(g, text, opts = {}) {
  let c = clasificarDesdeTextoCore(g, text, opts)
  c = applyGastosCajaVehicleOperativoRule(g, text, c)
  c = finalizeConfidence(g, text, c)
  return c
}

/** @param {any} g */
function clasificar(g) {
  return clasificarDesdeTexto(g, buildText(g))
}

/** @param {any} g */
function cuentaComoPendiente(c) {
  return c.tipo_gasto === 'pendiente_revision' || c.requiere_revision
}

/** Subtipo para regla cuota + mecánica (prioridad explícita) */
function pickSubtipoCuotaMechanical(text) {
  if (/\btrapecio\b|\btrapecios\b/.test(text)) return 'suspension'
  if (/\brodaje\b/.test(text)) return 'suspension'
  if (/\bpastilla\b|\bpastillas\b|\bzapata\b|\bfreno\b|\bfrenos\b/.test(text)) return 'frenos'
  if (
    /\bcaja\s+automatica\b|\bcaja\s+de\s+cambios\b|\bturbina\b|\bculata\b|\bmotor\b|\bembrague\b|\balternador\b|\bbobina\b|\bbobinas\b|\bradiador\b|\bbomba\b|\binyector\b|\binyectores\b|\bsoporte\b/.test(text)
  ) {
    return 'motor'
  }
  return 'motor'
}

/** Reglas seguras post-análisis pendientes (tras forzado/amplio que no aplicaron) */
function clasificarOperativoSeguras(g, text) {
  const vid = g.vehicle_id != null

  // --- 7) Aire acondicionado (antes de chapa para no perder A/C) ---
  if (
    /\ba\/c\b|\baire\s+acondicionado\b|\bacondicionado\b|\brecarga\s+gas\s+a\/c\b|\btuberias\s+a\/c\b|\brecarga\b.*\ba\/c\b|\blimpieza\b.*\ba\/c\b|\bbajada\s+de\s+tablero\b.*\ba\/c\b|\bsoplador\b.*\ba\/c\b/.test(
      text,
    )
  ) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'aire_acondicionado',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_aire_acondicionado',
    }
  }

  // --- 6) Radio / audio / electricidad (antes de motor "modulo" genérico) ---
  if (
    /\bradio\b|\bparlante\b|\balarma\b|\bcableado\b|\bdireccional\b|\brelay\b|\brele\b|\belectronico\b|\belectr[oó]nico\b|\bobturador\b|\bpantalla\b|\bconsola\b|\bsonido\b/.test(text)
    || (/\bcorriente\b/.test(text) && /\bpasar\b|\bjumper\b|\bbater/i.test(text))
    || (/\bmodulo\b/.test(text) && /\bradio\b|\balarma\b|\ba\/c\b|\bac\b|\belectron/i.test(text))
  ) {
    const sub = /\bradio\b|\bparlante\b|\balarma\b|\bpantalla\b|\bconsola\b|\bsonido\b/.test(text) ? 'accesorios' : 'electricidad'
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: sub,
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_radio_electricidad',
    }
  }

  // --- 5) Carrocería / vidrios ---
  if (/\bchapa\b|\bvidrio\b|\bluna\b|\bpuerta\b|\bpestillo\b|\bmampara\b|\bparabrisas\b|\bmica\b|\bmaletera\b|\bpulido\b|\bparacho\b|\bparachoque\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'accesorios',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_carroceria_accesorios',
    }
  }

  // --- 4) Inyección / combustible ---
  if (/\binyector\b|\binyectores\b|\bregulador\b|\bhidrolina\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'motor',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_inyeccion_motor',
    }
  }
  if (/\bgnv\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'gnv',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_combustible_gnv',
    }
  }
  if (/\bgasolina\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'combustible',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_combustible_gasolina',
    }
  }
  if (/\bmedidor\b.*\bcombustible\b|\bcombustible\b.*\bfoco\b|\btanque\b.*\bgas\b|\bvalvula\b.*\bgas\b|\bgas\b.*\btanque\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'combustible',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_combustible_gas',
    }
  }

  // --- 3) Motor / culata / soporte… ---
  if (
    /\bculata\b|\bsoporte\b|\bempaque\b|\bbalancines\b|\bmodulo\b|\btermostato\b|\bventilador\b|\barrancador\b|\bestrella\b/.test(text)
  ) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'motor',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_motor_partes',
    }
  }

  // --- 2) Rodaje / trapecio / caja cambios / turbina ---
  if (/\brodaje\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'suspension',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_rodaje_suspension',
    }
  }
  if (/\btrapecio\b|\btrapecios\b|\boquilla\b|\boquillas\b|\bestabilizador\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'suspension',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_trapecio_suspension',
    }
  }
  if (/\bcaja\s+automatica\b|\bcaja\s+de\s+cambios\b|\bturbina\b|\bcaja\b.*\bautomatica\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'motor',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_caja_turbina_motor',
    }
  }

  // --- 1) Cuotas / fraccionamiento + mecánica ---
  const tieneCuotaFraccion =
    /\bcuota\b|\bcuotas\b|\bfraccionamiento\b|\bfraccionameinto\b/.test(text)
  const tieneMecanicaCuota =
    /\b(motor|culata|caja\s+automatica|turbina|embrague|inyector|inyectores|alternador|bobina|bobinas|radiador|bomba|rodaje|trapecio|soporte|freno|frenos|pastilla|pastillas|zapata)\b/.test(text)
  if (tieneCuotaFraccion && tieneMecanicaCuota) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: pickSubtipoCuotaMechanical(text),
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_cuota_fraccion_mecanica',
    }
  }

  // --- 8) Taller PECHY / HENRY + vehicle_id ---
  if (vid && /\bpechy\b|\bhenry\b/.test(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: getSubtipoOperativoVehiculo(text),
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: false,
      rule: 'seguras_taller_pechy_henry',
    }
  }

  // --- 9) Descripción mínima solo modelo+número (import gastos_caja) ---
  if (vid && isDescripcionMinimaSoloModelo(text)) {
    return {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'motor',
      origen_clasificacion: 'reglas_v1',
      es_global_flota: false,
      requiere_revision: true,
      rule: 'seguras_descripcion_minima_modelo',
    }
  }

  return null
}

/**
 * Solo modelo + número en línea tipo Excel import, sin concepto mecánico.
 * @param {string} text buildText normalizado
 */
function isDescripcionMinimaSoloModelo(text) {
  if (!/\bgastos_caja\b|\bexcel\s+gastos\b/i.test(text)) return false
  const segmentos = text.split('|').map((s) => s.trim())
  const ultimo = segmentos[segmentos.length - 1] || ''
  const sinBoiler = ultimo
    .replace(/\s*\[origen\s+gastos_caja[^\]]*\]\s*$/i, '')
    .trim()
  // "rio 11 · excel gastos fila 158" o equivalente
  return (
    /^(rio|versa|yaris)\s+\d{1,3}\s*·\s*excel\s+gastos\s+fila\s+\d+/i.test(sinBoiler)
    && !/\b(cambio|arreglo|motor|culata|cuota|mant|peaje|gas|pago)\b/i.test(sinBoiler)
  )
}

function printPatternAudit(rawRows, classifiedRows) {
  console.log('\n=== Auditoría por patrones solicitados ===')
  const byId = new Map(classifiedRows.map((r) => [r.id, r]))
  for (const p of AUDIT_PATTERNS) {
    const matched = rawRows.filter((r) => {
      const t = buildText(r)
      return hasAny(t, p.terms)
    })
    if (!matched.length) {
      console.log(`\n[${p.key}] total=0`)
      continue
    }
    const cls = new Map()
    for (const r of matched) {
      const c = byId.get(r.id)
      const key = c ? `${c.tipo_gasto}${c.subtipo_gasto ? `/${c.subtipo_gasto}` : ''}` : '(sin_clasificacion)'
      cls.set(key, (cls.get(key) ?? 0) + 1)
    }
    console.log(`\n[${p.key}] total=${matched.length}`)
    for (const [k, v] of [...cls.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(5)} -> ${k}`)
    }
  }
}

function printMantPechyAudit(rawRows, classifiedRows) {
  const mantTerms = [
    'mant',
    'mantenimiento',
    'pechy',
    'pago mant',
    'mant carros',
    'mant.pechy',
  ]
  const byId = new Map(classifiedRows.map((r) => [r.id, r]))
  const matched = rawRows.filter((r) => {
    const t = buildText(r)
    return hasAny(t, mantTerms)
  })
  const cls = new Map()
  for (const r of matched) {
    const c = byId.get(r.id)
    const key = c ? `${c.tipo_gasto}${c.subtipo_gasto ? `/${c.subtipo_gasto}` : ''}` : '(sin_clasificacion)'
    cls.set(key, (cls.get(key) ?? 0) + 1)
  }

  console.log('\n=== Auditoría MANT / PECHY ===')
  console.log(`Total coincidencias MANT/PECHY: ${matched.length}`)
  for (const [k, v] of [...cls.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)} -> ${k}`)
  }
}

async function fetchAllGastos() {
  const page = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('gastos')
      .select('id, fecha, vehicle_id, tipo, sub_tipo, categoria, motivo, pagado_a, comentarios, detalle_operativo, categoria_real, subcategoria, metodo_pago, metodo_pago_detalle, monto')
      .eq('empresa_id', empresaId)
      .range(from, from + page - 1)
    if (error) throw new Error(`[gastos fetch] ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

/** @param {any[]} rows */
function summarize(rows) {
  const byTipo = new Map()
  const bySubtipo = new Map()
  for (const r of rows) {
    const t = r.tipo_gasto
    if (!byTipo.has(t)) byTipo.set(t, { count: 0, monto: 0, samples: [] })
    const it = byTipo.get(t)
    it.count += 1
    it.monto += Number(r.monto ?? 0)
    if (it.samples.length < 30) it.samples.push(r)

    const st = r.subtipo_gasto || '(sin_subtipo)'
    if (!bySubtipo.has(st)) bySubtipo.set(st, { count: 0, monto: 0 })
    const sub = bySubtipo.get(st)
    sub.count += 1
    sub.monto += Number(r.monto ?? 0)
  }
  return { byTipo, bySubtipo }
}

async function applyUpdates(rows) {
  const chunkSize = 300
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    for (const r of chunk) {
      const { error } = await supabase
        .from('gastos')
        .update({
          tipo_gasto: r.tipo_gasto,
          subtipo_gasto: r.subtipo_gasto,
          origen_clasificacion: r.origen_clasificacion,
          es_global_flota: r.es_global_flota,
          requiere_revision: r.requiere_revision,
          clasificacion_confianza: r.clasificacion_confianza,
        })
        .eq('empresa_id', empresaId)
        .eq('id', r.id)
      if (error) throw new Error(`[gastos update id=${r.id}] ${error.message}`)
    }
    console.log(`[update] ${Math.min(i + chunk.length, rows.length)}/${rows.length}`)
  }
}

const PENDIENTES_CSV_PATH = resolve(root, 'reports/pendientes_clasificacion_gastos.csv')

/** Stopwords solicitadas + partículas muy frecuentes en comentarios importados */
const ANALYSIS_STOPWORDS = new Set([
  'gastos', 'provisionales', 'excel', 'fila', 'origen', 'caja', 'unidad', 'traslado', 'script', 'efectivo',
  'otros', 'gasto', 'id',
  /** Metadato típico del script de importación (no describe el gasto) */
  'mover', 'vehiculo',
  'de', 'la', 'el', 'en', 'y', 'a', 'o', 'por', 'con', 'sin', 'del', 'al', 'los', 'las', 'un', 'una',
  'que', 'se', 'su', 'le', 'te', 'lo', 'ha', 'es', 'mas', 'más', 'ante', 'entre', 'desde', 'hasta',
])

/** Patrones heurísticos (orden: más específicos primero). text = buildText() ya normalizado */
const PENDIENTES_PATTERN_BUCKETS = [
  {
    label: 'cuotas_fraccion_motor_culata_caja',
    test: (t) => /\d\s*\/\s*\d/.test(t) && /\bcuota\b|\bcuotas\b|\bfraccionamiento\b|\barreglo\s+caja\b|\bempaque\b/.test(t),
  },
  { label: 'inyeccion_inyectores_combustible', test: (t) => /\binyector\b|\binyectores\b|\binyeccion\b/.test(t) },
  {
    label: 'gas_gnv_instalacion_conversion',
    test: (t) =>
      /\binstalacion\s+gas\b|\bconversion\b|\bgnv\b|\btanque\b.*\bgas\b|\bvalvula\b.*\bgas\b|\bgas\s+a\/c\b|\brecarga\b.*\bgas\b/.test(t),
  },
  { label: 'aire_acondicionado_ac', test: (t) => /\ba\/c\b|\bac\b|\baire\b|\bvalvula\b|\brefrigeracion\b|\bags\b/.test(t) && /\blimpieza\b|\bac\b|\ba\/c\b|\bsello\b|\bestrella\b/.test(t) },
  { label: 'radio_audio_electronica', test: (t) => /\bradio\b|\balarma\b|\bmodulo\b|\bbocina\b|\bparlante\b/.test(t) },
  { label: 'carroceria_vidrios_chapa', test: (t) => /\bluna\b|\bmica\b|\bplumilla\b|\bchapa\b|\bpuerta\b|\bpestillo\b|\bmaletera\b|\bparachoque\b|\bmampara\b/.test(t) },
  { label: 'rodaje_trapezio_caja_cambios', test: (t) => /\brodaje\b|\boquilla\b|\bcaja\s+de\s+cambios\b|\barreglo\s+caja\b/.test(t) },
  { label: 'peaje_estacionamiento', test: (t) => /\bpeaje\b|\bestacionamiento\b|\bcochera\b/.test(t) },
  { label: 'pechy_henry_taller_nombre', test: (t) => /\bpechy\b|\bhenry\b|\bhenrry\b|\bgumercindo\b|\bjesus\b|\bjesis\b/.test(t) },
  { label: 'motor_culata_soporte_sin_cuota', test: (t) => /\bmotor\b|\bculata\b|\bturbina\b|\bsoporte\b/.test(t) },
  { label: 'descripcion_minima_solo_modelo', test: (t) => /^\s*(yaris|versa|rio)\s+\d{1,3}\s*·/.test(t.trim()) || /\|\s*(rio|versa|yaris)\s+\d{1,3}\s*·\s*excel\b/.test(t) },
]

/** @param {string} text */
function tokensForAnalysis(text) {
  const raw = text.split(/[^a-z0-9]+/).filter(Boolean)
  return raw.filter((w) => !ANALYSIS_STOPWORDS.has(w) && !/^\d+$/.test(w) && w.length >= 2)
}

/** @param {Map<string, number>} m */
function topEntries(m, n) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

/**
 * @param {any[]} pendientes filas clasificadas pendiente_revision
 */
function printPendientesAnalysis(pendientes) {
  console.log('\n\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  Análisis pendiente_revision (--analyze-pendientes)              ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log(`\nTotal registros pendientes: ${pendientes.length}`)

  // --- Agrupación por patrones ---
  const bucketCounts = new Map()
  const bucketMonto = new Map()
  let sinBucket = 0
  let sinBucketMonto = 0
  for (const r of pendientes) {
    const t = buildText(r)
    let matched = false
    for (const b of PENDIENTES_PATTERN_BUCKETS) {
      if (b.test(t)) {
        bucketCounts.set(b.label, (bucketCounts.get(b.label) ?? 0) + 1)
        bucketMonto.set(b.label, (bucketMonto.get(b.label) ?? 0) + Number(r.monto ?? 0))
        matched = true
        break
      }
    }
    if (!matched) {
      sinBucket += 1
      sinBucketMonto += Number(r.monto ?? 0)
    }
  }
  console.log('\n=== 1) Agrupación por patrones (heurística, primera coincidencia) ===')
  const rows = [...bucketCounts.entries()].sort((a, b) => b[1] - a[1])
  for (const [label, cnt] of rows) {
    const m = bucketMonto.get(label) ?? 0
    console.log(`  ${String(cnt).padStart(5)} | S/${m.toFixed(2).padStart(12)} | ${label}`)
  }
  console.log(`  ${String(sinBucket).padStart(5)} | S/${sinBucketMonto.toFixed(2).padStart(12)} | (sin bucket / resto)`)

  // --- Unigramas ---
  const uni = new Map()
  const bi = new Map()
  const tri = new Map()
  for (const r of pendientes) {
    const tok = tokensForAnalysis(buildText(r))
    for (const w of tok) uni.set(w, (uni.get(w) ?? 0) + 1)
    for (let i = 0; i < tok.length - 1; i++) {
      const bg = `${tok[i]} ${tok[i + 1]}`
      bi.set(bg, (bi.get(bg) ?? 0) + 1)
    }
    for (let i = 0; i < tok.length - 2; i++) {
      const tg = `${tok[i]} ${tok[i + 1]} ${tok[i + 2]}`
      tri.set(tg, (tri.get(tg) ?? 0) + 1)
    }
  }

  console.log('\n=== 2) Top términos (sin stopwords solicitadas) ===')
  for (const [w, c] of topEntries(uni, 40)) {
    console.log(`  ${String(c).padStart(5)}  ${w}`)
  }

  console.log('\n=== 3) Top bigramas ===')
  for (const [w, c] of topEntries(bi, 25)) {
    console.log(`  ${String(c).padStart(5)}  ${w}`)
  }

  console.log('\n=== 4) Top trigramas ===')
  for (const [w, c] of topEntries(tri, 20)) {
    console.log(`  ${String(c).padStart(5)}  ${w}`)
  }

  // --- Top 100 por monto ---
  const porMonto = [...pendientes].sort((a, b) => Number(b.monto ?? 0) - Number(a.monto ?? 0))
  console.log('\n=== 5) Muestra 100 pendientes por monto (desc) ===')
  for (let i = 0; i < Math.min(100, porMonto.length); i++) {
    const p = porMonto[i]
    const desc = [p.motivo, p.categoria_real, p.comentarios].filter(Boolean).join(' | ').slice(0, 140)
    console.log(
      `  ${String(i + 1).padStart(3)} monto=${Number(p.monto ?? 0).toFixed(2).padStart(10)} veh=${String(p.vehicle_id ?? 'null').padStart(4)} id=${p.id} :: ${desc}`,
    )
  }

  console.log('\n=== 6) Reglas candidatas (solo propuesta; no aplicadas) ===')
  console.log(`
--- Reglas SEGURAS (bajo riesgo de falsos positivos si vehicle_id presente) ---
  • Keywords operativo_vehiculo: "inyector(es)", "censor"/sensor oxígeno, "instalacion gas", "recarga gas" + A/C, "parabrisas", "resorte(s)", "amortiguador" (typo amortiguuardor), "rodaje" (subtipo suspension/motor según contexto).
  • Fracciones "cuota N/M" + culata/caja/turbina/empaque → operativo_vehiculo / motor (regla ya cubrible ampliando listas forzadas o amplio).
  • "regulacion frenos", "disco(s)", "pastilla(s)", "pin(es)", "palier", "bomba de combustible" → frenos/motor/combustible según diccionario.

--- Reglas DUDOSAS (revisar muestras antes de automatizar) ---
  • Textos con "impuesto" + "sat" / "nils" / "tributarios": pueden ser administrativo SUNAT/RUS-like pero sin keywords actuales; riesgo de robar impuesto vehicular operativo.
  • "seguro", "rimac": pueden ser administrativo/póliza por vehículo u operativo; definir si van a administrativo_empresa fijo.
  • Nombres de taller/persona ("pechy", "henry", "jesus") + operativo mecánico: útil como refuerzo, no como única señal.
  • "mod" abreviado (mano de obra): puede ser ruido; no usar solo "mod" como keyword.

--- Reglas que requieren DECISIÓN DEL DUEÑO ---
  • "gastos notariales compra versa …", documentación ATU/INDECOPI: ¿inversion o administrativo o operativo legal? Depende de tu política contable.
  • Pagos recurrentes de seguro por vehículo vs globales de flota.
  • Filosofía para líneas casi vacías ("RIO 12 ·"): ¿siempre operativo por vehicle_id o mantener pendiente para completar descripción?
`)
}

async function main() {
  console.log('--- clasificar_gastos_financieros ---')
  console.log('Empresa:', empresaId)
  console.log('DRY_RUN:', dryRun ? '1 (no escribe)' : '0 (actualiza gastos)')
  if (exportPendientesCsv) console.log('Export pendientes CSV:', PENDIENTES_CSV_PATH)
  if (exportReviewCsv) console.log('Export review CSV:', REVIEW_QUEUE_CSV_PATH)
  if (analyzePendientes) console.log('Modo análisis: --analyze-pendientes (sin UPDATE)')

  const gastos = await fetchAllGastos()
  console.log('Gastos leídos:', gastos.length)

  const classified = gastos.map((g) => {
    const c = clasificar(g)
    return {
      ...g,
      ...c,
    }
  })

  const { byTipo, bySubtipo } = summarize(classified)
  const previous = loadPreviousReport()

  const pendientes = classified.filter((r) => r.tipo_gasto === 'pendiente_revision' || r.requiere_revision)

  const pendSinTyposSinSeguras = gastos.reduce((acc, g) => {
    const c = clasificarDesdeTexto(g, buildTextSinTypos(g), { useSeguras: false })
    return acc + (cuentaComoPendiente(c) ? 1 : 0)
  }, 0)
  const pendConTyposSinSeguras = gastos.reduce((acc, g) => {
    const c = clasificarDesdeTexto(g, buildText(g), { useSeguras: false })
    return acc + (cuentaComoPendiente(c) ? 1 : 0)
  }, 0)

  console.log('\n=== normalizeTypos (reglas seguras OFF en ambos) ===')
  console.log(`Sin normalizeTypos: ${pendSinTyposSinSeguras}`)
  console.log(`Con normalizeTypos: ${pendConTyposSinSeguras}`)
  {
    const d = pendConTyposSinSeguras - pendSinTyposSinSeguras
    console.log(`Delta typos: ${d >= 0 ? '+' : ''}${d}`)
  }

  console.log('\n=== Reglas seguras (texto con normalizeTypos) ===')
  console.log(`Pendientes sin reglas seguras: ${pendConTyposSinSeguras}`)
  console.log(`Pendientes finales (con reglas seguras): ${pendientes.length}`)
  {
    const d = pendientes.length - pendConTyposSinSeguras
    console.log(`Delta reglas seguras: ${d >= 0 ? '+' : ''}${d}`)
  }

  const noPendTipo = (r) => r.tipo_gasto !== 'pendiente_revision'
  const conf = (r) => Number(r.clasificacion_confianza ?? 0)
  const altaConf = classified.filter((r) => noPendTipo(r) && conf(r) >= 0.9).length
  const mediaConf = classified.filter((r) => noPendTipo(r) && conf(r) >= 0.6 && conf(r) < 0.9).length
  const bajaConf = classified.filter((r) => noPendTipo(r) && conf(r) >= 0.3 && conf(r) < 0.6).length
  const pendientesReales = classified.filter((r) => r.tipo_gasto === 'pendiente_revision').length
  const subUmbral03 = classified.filter((r) => Number(r.clasificacion_confianza ?? 0) < 0.3).length
  const pctAuto =
    classified.length === 0 ? 0 : ((classified.length - pendientesReales) / classified.length) * 100

  console.log('\n=== Confianza (clasificación automática vs pendientes) ===')
  console.log(`Clasificados alta confianza (≥0.9, no pendiente): ${altaConf}`)
  console.log(`Clasificados media confianza [0.6, 0.9): ${mediaConf}`)
  console.log(`Clasificados baja confianza [0.3, 0.6) con tipo asignado: ${bajaConf}`)
  console.log(`Pendientes reales (tipo pendiente_revision): ${pendientesReales}`)
  console.log(`Filas con clasificacion_confianza < 0.3: ${subUmbral03}`)
  console.log(`Porcentaje con tipo distinto de pendiente_revision: ${pctAuto.toFixed(2)}%`)

  const topRev = [...classified]
    .filter((r) => r.requiere_revision)
    .sort((a, b) => conf(a) - conf(b))
    .slice(0, 100)
  console.log('\n=== Top 100 requiere_revision (menor confianza primero) ===')
  for (let i = 0; i < topRev.length; i++) {
    const r = topRev[i]
    const desc = [r.motivo, r.categoria_real, r.comentarios].filter(Boolean).join(' | ').slice(0, 120)
    console.log(
      `  ${String(i + 1).padStart(3)} conf=${conf(r).toFixed(3)} tipo=${r.tipo_gasto ?? ''} id=${r.id} :: ${desc}`,
    )
  }
  if (!topRev.length) console.log('  (ninguno)')

  console.log('\n=== Conteo por tipo_gasto ===')
  for (const t of TIPOS) {
    const x = byTipo.get(t) || { count: 0, monto: 0 }
    console.log(`${t.padEnd(24)} | ${String(x.count).padStart(5)} | monto ${x.monto.toFixed(2)}`)
  }

  console.log('\n=== Conteo por subtipo_gasto ===')
  for (const [st, x] of [...bySubtipo.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${String(st).padEnd(22)} | ${String(x.count).padStart(5)}`)
  }

  console.log('\n=== Monto por subtipo_gasto ===')
  for (const [st, x] of [...bySubtipo.entries()].sort((a, b) => b[1].monto - a[1].monto)) {
    console.log(`${String(st).padEnd(22)} | monto ${x.monto.toFixed(2)}`)
  }

  console.log('\n=== Muestras (30 por tipo) ===')
  for (const t of TIPOS) {
    const x = byTipo.get(t)
    if (!x?.samples?.length) continue
    console.log(`\n[${t}] muestras=${x.samples.length}`)
    for (const s of x.samples) {
      const desc = [s.motivo, s.categoria_real, s.comentarios].filter(Boolean).join(' | ').slice(0, 130)
      console.log(
        `  id=${s.id} fecha=${s.fecha ?? '—'} veh=${s.vehicle_id ?? 'null'} monto=${Number(s.monto ?? 0).toFixed(2)} conf=${Number(s.clasificacion_confianza ?? 0).toFixed(3)} rule=${s.rule} :: ${desc}`,
      )
    }
  }

  console.log('\n=== Pendientes de revisión ===')
  console.log('Total pendientes_revision:', pendientes.length)
  console.log('\n=== Muestras pendientes restantes (100) ===')
  for (const p of pendientes.slice(0, 100)) {
    const desc = [p.motivo, p.categoria_real, p.comentarios].filter(Boolean).join(' | ').slice(0, 160)
    console.log(
      `  id=${p.id} fecha=${p.fecha ?? '—'} veh=${p.vehicle_id ?? 'null'} monto=${Number(p.monto ?? 0).toFixed(2)} conf=${Number(p.clasificacion_confianza ?? 0).toFixed(3)} :: ${desc}`,
    )
  }
  if (pendientes.length > 100) console.log(`  ... (${pendientes.length - 100} más)`)

  if (exportPendientesCsv) {
    exportPendientesCsvFile(PENDIENTES_CSV_PATH, pendientes)
    console.log(`\n✓ CSV exportado: ${PENDIENTES_CSV_PATH} (${pendientes.length} filas)`)
  }

  if (exportReviewCsv) {
    exportReviewQueueCsv(REVIEW_QUEUE_CSV_PATH, classified)
    const qn = classified.filter((r) => r.requiere_revision || r.tipo_gasto === 'pendiente_revision').length
    console.log(`\n✓ CSV review_queue: ${REVIEW_QUEUE_CSV_PATH} (${qn} filas)`)
  }

  printPatternAudit(gastos, classified)
  printMantPechyAudit(gastos, classified)

  if (analyzePendientes) printPendientesAnalysis(pendientes)

  console.log('\n=== Diferencia vs run anterior ===')
  if (!previous) {
    console.log('No hay run anterior guardado (se guardará este resultado como baseline).')
  } else {
    const prevPend = Number(previous.pendingCount ?? 0)
    const diffPend = pendientes.length - prevPend
    console.log(`pendiente_revision: ${prevPend} -> ${pendientes.length} (delta ${diffPend >= 0 ? '+' : ''}${diffPend})`)

    const allTipoKeys = new Set([
      ...Object.keys(previous.tipoCounts || {}),
      ...TIPOS,
    ])
    for (const k of [...allTipoKeys].sort()) {
      const a = Number(previous.tipoCounts?.[k] ?? 0)
      const b = Number((byTipo.get(k)?.count) ?? 0)
      const d = b - a
      if (d !== 0) console.log(`tipo ${k}: ${a} -> ${b} (delta ${d >= 0 ? '+' : ''}${d})`)
    }
  }

  saveCurrentReport({
    at: new Date().toISOString(),
    pendingCount: pendientes.length,
    pendientesTipoPendienteRevision: pendientesReales,
    confidenceLt03: subUmbral03,
    confidenceBuckets: { altaGte09: altaConf, media06to09: mediaConf, baja03to06: bajaConf },
    pctClasificadoAutomatico: pctAuto,
    tipoCounts: Object.fromEntries(
      TIPOS.map((t) => [t, Number(byTipo.get(t)?.count ?? 0)]),
    ),
    subtipoCounts: Object.fromEntries(
      [...bySubtipo.entries()].map(([k, v]) => [k, v.count]),
    ),
  })

  if (dryRun || blockDbUpdates) {
    if (dryRun) {
      console.log('\n✓ DRY_RUN=1: no se modificó nada.')
      console.log('Para aplicar UPDATE: DRY_RUN=0 node scripts/clasificar_gastos_financieros.mjs')
    }
    if (exportPendientesCsv) {
      console.log('\n✓ --export-pendientes-csv: no se aplicaron UPDATE en public.gastos.')
    }
    if (exportReviewCsv) {
      console.log('\n✓ --export-review-csv: no se aplicaron UPDATE en public.gastos.')
    }
    if (analyzePendientes) {
      console.log('\n✓ --analyze-pendientes: no se aplicaron UPDATE en public.gastos.')
    }
    return
  }

  console.log('\nAplicando actualización en public.gastos ...')
  await applyUpdates(classified)
  console.log('✓ Actualización completada.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

