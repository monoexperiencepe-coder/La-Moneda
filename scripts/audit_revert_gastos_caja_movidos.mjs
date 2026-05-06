/**
 * Audita gastos que provienen de public.gastos_caja (traza mover_gastos_caja_a_vehiculo.mjs)
 * y clasifica: (A) operativo coherente con móvil vs (B) sospechoso / no operativo.
 *
 * En modo real (opcional) reinserta (B) en gastos_caja y borra la fila en gastos.
 *
 * Detección de origen caja:
 * - comentarios contiene «origen gastos_caja id=…»
 * - o excel_extra.from_gastos_caja_id
 *
 * Variables: VITE_SUPABASE_URL, VITE_EMPRESA_ID, SUPABASE_SERVICE_ROLE_KEY.
 *
 * DRY_RUN=1 por defecto.
 * Real: DRY_RUN=0 y ALLOW_REVERT_GASTOS_CAJA=1
 *
 * No toca ingresos, caja_negocio_vehiculo, inversiones_vehiculo ni vehículos.
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
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
const empresaId = (env.VITE_EMPRESA_ID ?? '').trim()
const dryRun = env.DRY_RUN !== '0' && env.DRY_RUN !== 'false'
const allowRevert = env.ALLOW_REVERT_GASTOS_CAJA === '1' || env.ALLOW_REVERT_GASTOS_CAJA === 'true'
const PAGE = 1000
const CHUNK_INSERT = 80
const CHUNK_DELETE = 80

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactNoSpaces(blobFolded) {
  return blobFolded.replace(/\s+/g, '')
}

function blobFromGasto(g) {
  return fold(
    [g.tipo, g.sub_tipo, g.motivo, g.comentarios, g.detalle_operativo, g.categoria_real, g.metodo_pago_detalle]
      .filter(Boolean)
      .join(' '),
  )
}

function wasFromGastosCaja(g) {
  const com = String(g.comentarios ?? '')
  if (/origen\s+gastos_caja\s+id\s*=\s*\d+/i.test(com)) return true
  const ex = g.excel_extra
  if (ex && typeof ex === 'object' && ex.from_gastos_caja_id != null && String(ex.from_gastos_caja_id).trim() !== '') {
    return true
  }
  return false
}

function origenCajaId(g) {
  const ex = g.excel_extra
  if (ex && typeof ex === 'object' && ex.from_gastos_caja_id != null) {
    const n = Number(ex.from_gastos_caja_id)
    if (Number.isFinite(n)) return n
  }
  const com = String(g.comentarios ?? '')
  const m = com.match(/origen\s+gastos_caja\s+id\s*=\s*(\d+)/i)
  if (m) return Number(m[1])
  return null
}

/**
 * Señales administrativas / financieras → siempre B (no las anula la mecánica fuerte).
 * Nota: «cuota(s)» de cuotas de taller NO entra aquí; se trata aparte tras mecánica fuerte / heurística general.
 */
function hasHardBadNonOperational(blobFolded) {
  const c = compactNoSpaces(blobFolded)
  if (c.includes('mpba') || c.includes('mbpa')) return true
  if (c.includes('abuela')) return true
  if (/\bcompra\s+auto\b/.test(blobFolded) || /\bcompra\s+carro\b/.test(blobFolded)) return true
  if (c.includes('compraauto') || c.includes('compracarro')) return true
  if (/\bprestamos?\b/.test(blobFolded)) return true
  if (/\bintereses?\b/.test(blobFolded) || /\binteres\b/.test(blobFolded)) return true
  if (/\bsocios?\b/.test(blobFolded)) return true
  if (/\babogado\b/.test(blobFolded) || /\bcoima\b/.test(blobFolded)) return true
  if (/\basv\b/.test(blobFolded) || /\basb\b/.test(blobFolded)) return true
  if (/\bsat\b/.test(blobFolded)) return true
  if (/\batu\b/.test(blobFolded)) return true
  if (/\bfise\b/.test(blobFolded)) return true
  if (/devolucion/.test(blobFolded) && /garantia/.test(blobFolded)) return true
  if (/\brt\s+taxi\b/.test(blobFolded) || c.includes('rttaxi')) return true
  if (/\bboletin\b/.test(blobFolded)) return true
  if (/\bdescargo\b/.test(blobFolded)) return true
  if (/pago\s+banco/.test(blobFolded) || c.includes('pagobanco')) return true
  if (/\bfinanciera\b/.test(blobFolded)) return true
  if (c.includes('santander')) return true
  if (c.includes('scotiabank')) return true
  if (/\bmulta(s)?\b/.test(blobFolded) || /\bpapeleta(s)?\b/.test(blobFolded)) return true
  if (/\bfraccionamiento\b/.test(blobFolded)) return true
  if (/\bgastos?\s+personales?\b/.test(blobFolded) || /\bpersonal(es)?\b/.test(blobFolded)) return true
  if (/\bcaja\s+negocio\b/.test(blobFolded) || /\bcajas\s+negocio\b/.test(blobFolded)) return true
  return false
}

/** Lista explícita negocio: si aparece, A aunque haya cuota(s) o fracciones tipo 3/5. */
const STRONG_MECHANICAL_PRIORITY = [
  'motor',
  'caja automatica',
  'turbina',
  'embrague',
  'amortiguador',
  'bieleta',
  'bieletas',
  'culata',
  'radiador',
  'bomba',
  'filtro',
  'llanta',
  'pastilla',
  'pastillas',
  'bujia',
  'bujias',
  'aceite',
  'refrigerante',
  'sensor',
  'sensores',
  'alternador',
  'bateria',
  'inyectores',
  'inyector',
  'soporte',
  'mantenimiento',
  'reparacion',
  'arreglo',
  'arreglos',
  'gnv',
  'soat',
  'faja',
  'empaques',
  'empaque',
  'plumillas',
  'suspension',
  'ventilador',
  'freno',
  'frenos',
  'scan',
  'scaneo',
]

function hasStrongMechanicalPriority(blobFolded) {
  if (/\bmano\s+de\s+obra\b/.test(blobFolded)) return true
  if (/cambio\s+faro\b/.test(blobFolded) || /cambio\s+de\s+faro\b/.test(blobFolded)) return true
  for (const kw of STRONG_MECHANICAL_PRIORITY) {
    if (blobFolded.includes(kw)) return true
  }
  return false
}

/** Palabras asociadas a móvil / taller / repuesto (heurística). Sin tokens muy cortos que choquen con «gastos_caja». */
const GOOD_MECHANICAL = [
  ...new Set([
    'mantenimiento',
    'manten',
    'repuesto',
    'repuestos',
    'llanta',
    'llantas',
    'llanats',
    'bujais',
    'zapatas',
    'filtro',
    'filtros',
    'filtro de aire',
    'filtro de aceite',
    'filtro de combustible',
    'bomba',
    'bomba de agua',
    'bomba de gasolina',
    'radiador',
    'bujia',
    'bujias',
    'pastilla',
    'pastillas',
    'pastillas de freno',
    'disco de freno',
    'liquido de freno',
    'soat',
    'gnv',
    'regulacion gas',
    'sensor',
    'sensores',
    'censor',
    'embrague',
    'kit embrague',
    'bateria',
    'aceite',
    'aceite motor',
    'refrigerante',
    'anticongelante',
    'arreglo',
    'arreglos',
    'motor',
    'amortiguador',
    'manguera',
    'alternador',
    'bobina',
    'oxigeno',
    'kit',
    'taller',
    'mecanico',
    'lubricante',
    'lubricacion',
    'servicio',
    'fuga',
    'disco',
    'tambo',
    'freno',
    'frenos',
    'valvula',
    'culata',
    'empaquetadura',
    'correa',
    'polea',
    'tensor',
    'amort',
    'planchado',
    'chapa',
    'pintura',
    'clutch',
    'direccion',
    'suspension',
    'inyector',
    'inyectores',
    'carburador',
    'escape',
    'cataliza',
    'catalizador',
    'enfriador',
    'termostato',
    'reten',
    'retenes',
    'junta',
    'juntas',
    'cigue',
    'piston',
    'block',
    'carter',
    'grasa',
    'transmision',
    'caja de cambio',
    'caja cambios',
    'sincron',
    'diferencial',
    'puente',
    'eje',
    'ruleman',
    'balero',
    'rodamiento',
    'chasis',
    'parabrisas',
    'cristal',
    'farol',
    'foco',
    'parachoques',
    'espejo',
    'cerradura',
    'alarma',
    'claxon',
    'bocina',
    'aire acondicionado',
    'acondicionado',
    'evaporador',
    'compresor',
    'gasolina',
    'diesel',
    'combustible',
    'tanque',
    'electro',
    'encendido',
    'distribucion',
    'cadena',
    'tiempo',
    'refrigeracion',
    'supercharger',
    'turbo',
    'intercooler',
    'silenciador',
    'mofle',
    'volante',
    'homocinetica',
    'fuelle',
    'fuelles',
    'rotula',
    'rotulas',
    'tripoide',
    'espiral',
    'resorte',
    'empaque',
    'balancin',
    'turbina',
    'automatica',
    'limpieza',
    'rodaje',
    'forro',
    'plumillas',
    'extintor',
    'trapecio',
    'calip',
    'inscripcion',
    'recambio',
  ]),
]

function hasGoodMechanical(blobFolded) {
  if (/\bgas\b/.test(blobFolded)) return true
  return GOOD_MECHANICAL.some((kw) => blobFolded.includes(kw))
}

/**
 * Vehículo / móvil: SOAT, seguros obligatorios, lunas, accesorios, cabina, sin ser reparto mecánico explícito.
 * Solo aplica si no pasó hasGoodMechanical (quienes ya son A_operativo_mecanico no pasan por aquí).
 */
function hasVehicleGeneralOperativo(blobFolded) {
  const c = compactNoSpaces(blobFolded)
  if (/permiso\s+lunas/.test(blobFolded) || c.includes('permisolunas')) return true
  if (/tapa\s+combustible/.test(blobFolded) || c.includes('tapacombustible')) return true
  if (blobFolded.includes('aire acondicionado')) return true
  if (/\ba\/c\b/.test(blobFolded)) return true

  if (c.includes('afocat')) return true
  if (/\bsoat\b/.test(blobFolded)) return true
  if (/\blunas\b/.test(blobFolded)) return true
  if (blobFolded.includes('mampa')) return true
  if (blobFolded.includes('mampara')) return true
  if (blobFolded.includes('cinturon')) return true
  if (/\bgps\b/.test(blobFolded)) return true
  if (blobFolded.includes('alarma')) return true
  if (blobFolded.includes('pantalla')) return true
  if (blobFolded.includes('parlante')) return true
  if (/\bradio\b/.test(blobFolded)) return true
  if (blobFolded.includes('extintor')) return true
  if (blobFolded.includes('plumilla')) return true
  if (/\bmicas?\b/.test(blobFolded)) return true
  if (/\bfocos?\b/.test(blobFolded)) return true
  if (/\bfaros?\b/.test(blobFolded) || /\bfaro\b/.test(blobFolded)) return true
  if (blobFolded.includes('accesorio')) return true
  if (blobFolded.includes('consola')) return true
  if (blobFolded.includes('tapiz')) return true
  if (blobFolded.includes('forro')) return true
  if (blobFolded.includes('espejo')) return true
  if (blobFolded.includes('chapa')) return true
  if (blobFolded.includes('lavado')) return true
  if (blobFolded.includes('timon')) return true
  if (blobFolded.includes('enlante')) return true
  if (/\benlantes\b/.test(blobFolded)) return true
  if (blobFolded.includes('enlal')) return true // typo tipo ENLALNTES
  if (/\baro\b/.test(blobFolded)) return true
  if (/\bllaves?\b/.test(blobFolded)) return true

  if (/ojo\s+chino/.test(blobFolded) || c.includes('ojochino')) return true
  if (blobFolded.includes('polarizado')) return true
  if (/impuesto\s+ve\b/.test(blobFolded) || c.includes('impuestove')) return true
  if (/impuesti\s+ve\b/.test(blobFolded) || c.includes('impuestive')) return true

  return false
}

/** Primer término no es un concepto contable genérico (evita «pago 50», «otros 1»). */
const MINIMAL_CONCEPT_LEXCLUDE = new Set([
  'pago',
  'pagos',
  'cuota',
  'cuotas',
  'otros',
  'otro',
  'total',
  'caja',
  'efectivo',
  'yape',
  'plin',
  'banco',
  'prestamo',
  'prestamos',
  'varios',
  'gasto',
  'gastos',
])

/**
 * Concepto reducido solo a modelo + número de unidad (ej. «YARIS 05»), ya con fold().
 * Solo si el gasto tiene vehicle_id (movimiento ya asociado al móvil).
 */
function isMinimalModelPlusUnitConcept(conceptFolded, vehicleId) {
  if (vehicleId == null || vehicleId === '') return false
  const s = conceptFolded.trim().replace(/\s+/g, ' ')
  /** Tramo visible antes de « · Excel … » u otro sufijo (ej. solo «YARIS 05»). */
  const core = s.split(/\s*·\s*/)[0].trim()
  const m = core.match(/^([a-záéíóúñ]{2,})\s+(\d{1,3})$/i)
  if (!m) return false
  const head = m[1].toLowerCase()
  if (MINIMAL_CONCEPT_LEXCLUDE.has(head)) return false
  return true
}

/**
 * A_operativo_mecanico = STRONG_MECHANICAL / GOOD_MECHANICAL (incl. typos bujais, llanats, zapatas).
 * A_operativo_vehiculo_general = gasto válido del móvil (accesorios, SOAT, lunas, etc.) sin señal mecánica explícita.
 * B_hard_admin = lista dura (ASV, SAT, ATU, …) siempre sospechoso.
 * B_cuota_sin_mecanica = cuota(s) sin ninguna señal mecánica (ni fuerte ni amplia).
 * B_no_mechanical_signal = resto sin contexto de taller/móvil.
 */
function classifyGastoCajaOrigen(g) {
  const blob = blobFromGasto(g)
  const conceptHead = fold(conceptoFromGastoComentarios(g.comentarios))
  if (hasHardBadNonOperational(blob)) return 'B_hard_admin'
  if (hasStrongMechanicalPriority(blob)) return 'A_operativo_mecanico'
  if (hasGoodMechanical(blob)) return 'A_operativo_mecanico'
  if (hasVehicleGeneralOperativo(blob)) return 'A_operativo_vehiculo_general'
  if (isMinimalModelPlusUnitConcept(conceptHead, g.vehicle_id)) return 'A_operativo_vehiculo_general'
  if (/\bcuotas?\b/.test(blob)) return 'B_cuota_sin_mecanica'
  return 'B_no_mechanical_signal'
}

async function fetchAllGastos(supabase, empresa) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('gastos')
      .select(
        'id, empresa_id, fecha, fecha_registro, vehicle_id, tipo, sub_tipo, motivo, comentarios, monto, categoria, metodo_pago, metodo_pago_detalle, excel_extra, detalle_operativo, categoria_real',
      )
      .eq('empresa_id', empresa)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[gastos] ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

/** Reconstruye texto principal para concepto en gastos_caja (antes del marcador de origen). */
function conceptoFromGastoComentarios(comentarios) {
  const s = String(comentarios ?? '')
  const idx = s.search(/\s*\[origen\s+gastos_caja\s+id\s*=\s*\d+\]/i)
  const head = idx >= 0 ? s.slice(0, idx) : s
  const t = head.replace(/\s*·\s*$/, '').trim()
  return (t || '(sin concepto)').slice(0, 2000)
}

function toGastosCajaRow(empresa_id, g, reason) {
  const concepto = conceptoFromGastoComentarios(g.comentarios)
  const origId = origenCajaId(g)
  const comentarios = [
    `Revertido desde gastos operativos (gasto id=${g.id}).`,
    reason ? `Motivo clasificación: ${reason}` : '',
    origId != null ? `Origen histórico gastos_caja id=${origId}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)

  const excel_extra = {
    reverted_from_gasto_id: g.id,
    reverted_at: new Date().toISOString(),
    reverted_reason: reason,
    prior_gasto_excel_extra: g.excel_extra ?? null,
    ...(origId != null ? { from_gastos_caja_id_original: origId } : {}),
  }

  return {
    empresa_id,
    fecha: g.fecha,
    concepto,
    monto: Number(g.monto),
    categoria: 'CAJA_GENERAL',
    comentarios,
    excel_extra,
  }
}

async function main() {
  console.log('=== audit_revert_gastos_caja_movidos ===')
  console.log('DRY_RUN:', dryRun ? '1 (solo informe)' : '0 (revertir sospechosos)')
  if (!dryRun && !allowRevert) {
    console.error('\n[BLOQUEADO] Añade ALLOW_REVERT_GASTOS_CAJA=1 junto con DRY_RUN=0 para ejecutar.')
    process.exit(1)
  }

  if (!url || !serviceKey) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!empresaId) throw new Error('Falta VITE_EMPRESA_ID')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const all = await fetchAllGastos(supabase, empresaId)
  const movidos = all.filter(wasFromGastosCaja)

  /** @type {typeof movidos} */
  const operativos = []
  let operativosMecanico = 0
  let operativosVehiculoGeneral = 0
  /** @type {Array<{ g: (typeof movidos)[0]; reason: string }>} */
  const sospechosos = []

  for (const g of movidos) {
    const reason = classifyGastoCajaOrigen(g)
    if (reason === 'A_operativo_mecanico') {
      operativos.push(g)
      operativosMecanico += 1
    } else if (reason === 'A_operativo_vehiculo_general') {
      operativos.push(g)
      operativosVehiculoGeneral += 1
    } else sospechosos.push({ g, reason })
  }

  const montoSospechoso = sospechosos.reduce((s, x) => s + Number(x.g.monto || 0), 0)
  const bHard = sospechosos.filter((x) => x.reason === 'B_hard_admin').length
  const bCuota = sospechosos.filter((x) => x.reason === 'B_cuota_sin_mecanica').length
  const bNoMech = sospechosos.filter((x) => x.reason === 'B_no_mechanical_signal').length

  const stats = {
    total_gastos_empresa: all.length,
    total_movidos_desde_gastos_caja_auditados: movidos.length,
    operativos_correctos_A: operativos.length,
    A_operativo_mecanico: operativosMecanico,
    A_operativo_vehiculo_general: operativosVehiculoGeneral,
    sospechosos_no_operativos_B: sospechosos.length,
    sospechosos_por_mala_senal_admin_fin: bHard,
    sospechosos_por_cuota_sin_mecanica: bCuota,
    sospechosos_sin_palabras_mecanicas: bNoMech,
    monto_total_sospechoso_pen: Number(montoSospechoso.toFixed(2)),
  }

  /** Referencia último DRY_RUN antes de typos bujais/llanats/zapatas + etiqueta A_operativo_mecanico (misma base de datos). */
  const REF_DRY_RUN_ANTERIOR = {
    sospechosos_no_operativos_B: 854,
    sospechosos_sin_palabras_mecanicas: 206,
  }

  console.log('\n--- Resumen (JSON) ---')
  console.log(JSON.stringify(stats, null, 2))

  console.log('\n--- Comparación vs DRY_RUN anterior (referencia en script) ---')
  console.log(
    JSON.stringify(
      {
        referencia_anterior: REF_DRY_RUN_ANTERIOR,
        delta_sospechosos_B_total: sospechosos.length - REF_DRY_RUN_ANTERIOR.sospechosos_no_operativos_B,
        delta_B_no_mechanical_signal: bNoMech - REF_DRY_RUN_ANTERIOR.sospechosos_sin_palabras_mecanicas,
      },
      null,
      2,
    ),
  )

  console.log('\n--- Muestra sospechosos (hasta 50) ---')
  for (const { g, reason } of sospechosos.slice(0, 50)) {
    const human =
      reason === 'B_hard_admin'
        ? 'señal administrativa/financiera (lista dura: ASV, FISE, SAT, …)'
        : reason === 'B_cuota_sin_mecanica'
          ? 'cuota(s) sin trabajo mecánico identificable'
          : 'sin palabras mecánicas/repuesto en texto'
    console.log(
      JSON.stringify({
        gasto_id: g.id,
        fecha: g.fecha,
        monto: g.monto,
        vehicle_id: g.vehicle_id,
        origen_gastos_caja_id: origenCajaId(g),
        motivo: String(g.motivo ?? '').slice(0, 80),
        comentarios: String(g.comentarios ?? '').slice(0, 120),
        clasificacion: reason,
        razon: human,
      }),
    )
  }
  if (sospechosos.length > 50) console.log(`… y ${sospechosos.length - 50} más`)

  const soloNoMech = sospechosos.filter((x) => x.reason === 'B_no_mechanical_signal')
  console.log('\n--- Muestra B_no_mechanical_signal (hasta 50) ---')
  for (const { g, reason } of soloNoMech.slice(0, 50)) {
    console.log(
      JSON.stringify({
        gasto_id: g.id,
        fecha: g.fecha,
        monto: g.monto,
        vehicle_id: g.vehicle_id,
        origen_gastos_caja_id: origenCajaId(g),
        motivo: String(g.motivo ?? '').slice(0, 80),
        comentarios: String(g.comentarios ?? '').slice(0, 120),
        clasificacion: reason,
        razon: 'sin palabras mecánicas/repuesto en texto',
      }),
    )
  }
  if (soloNoMech.length > 50) console.log(`… y ${soloNoMech.length - 50} más en B_no_mechanical_signal`)

  if (dryRun) {
    console.log('\n✓ DRY_RUN: no se insertó en gastos_caja ni se borró en gastos.')
    console.log('Real (solo filas clase B):')
    console.log("  $env:DRY_RUN='0'; $env:ALLOW_REVERT_GASTOS_CAJA='1'; node scripts/audit_revert_gastos_caja_movidos.mjs")
    return
  }

  console.log('\n--- Revirtiendo sospechosos (B) ---')
  const idsDeleted = []
  for (let i = 0; i < sospechosos.length; i += CHUNK_INSERT) {
    const batch = sospechosos.slice(i, i + CHUNK_INSERT)
    const inserts = batch.map(({ g, reason }) =>
      toGastosCajaRow(
        empresaId,
        g,
        reason === 'B_hard_admin'
          ? 'hard_admin'
          : reason === 'B_cuota_sin_mecanica'
            ? 'cuota_sin_mecanica'
            : 'no_mechanical_signal',
      ),
    )
    const { data: insData, error: insErr } = await supabase.from('gastos_caja').insert(inserts).select('id')
    if (insErr) throw new Error(`[gastos_caja insert] lote ${i}: ${insErr.message}`)
    console.log(`  [gastos_caja] +${insData?.length ?? batch.length} filas`)

    const ids = batch.map(({ g }) => g.id)
    const { error: delErr } = await supabase.from('gastos').delete().in('id', ids)
    if (delErr) throw new Error(`[gastos delete] lote ${i}: ${delErr.message}`)
    idsDeleted.push(...ids)
    console.log(`  [gastos] eliminados ids: ${ids.length}`)
  }

  console.log('\nListo. Revertidos (B):', idsDeleted.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
