/**
 * Importación idempotente desde Excel v3 (hojas: prestamos_financieros, prestamos_tramos, aportes_accionistas).
 *
 * empresa_id fijo (según negocio): 07593982-08e6-450c-8abe-4bf590609dd7
 *
 * Por defecto DRY_RUN (no escribe): si DRY_RUN no es '0' ni 'false', solo informe.
 * Escritura real solo si: DRY_RUN=0 y ALLOW_IMPORT_FINANCIAMIENTO=1
 *
 * Lectura Excel: sheet_to_json con raw:true (tipos nativos). Los normalizadores cubren strings
 * formateados (p. ej. "10,700.00") por si alguna celda viene como texto.
 *
 * Variables (.env raíz + process.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY | SERVICE_ROLE_KEY | VITE_SUPABASE_SERVICE_ROLE_KEY
 *
 * Opcional:
 *   FINANCIAMIENTO_XLSX=ruta\completa\archivo.xlsx
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const EMPRESA_ID = '07593982-08e6-450c-8abe-4bf590609dd7';

function loadDotEnv() {
  const p = resolve(root, '.env');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...process.env, ...loadDotEnv() };
const url = (env.VITE_SUPABASE_URL ?? '').trim();
const serviceKey = (
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

const dryRun = !(env.DRY_RUN === '0' || env.DRY_RUN === 'false');
const allowWrite = env.ALLOW_IMPORT_FINANCIAMIENTO === '1';

const xlsxArg = process.argv[2]?.trim();
const xlsxFromEnv = (env.FINANCIAMIENTO_XLSX ?? '').trim();

const defaultCandidates = [
  xlsxArg,
  xlsxFromEnv,
  resolve(root, 'aportes_prestamos_normalizado_migracion_v3_completo.xlsx'),
  resolve(process.env.USERPROFILE || '', 'Downloads/aportes_prestamos_normalizado_migracion_v3_completo.xlsx'),
  'C:\\Users\\alkan\\Downloads\\aportes_prestamos_normalizado_migracion_v3_completo.xlsx',
].filter(Boolean);

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(root, p);
}

const xlsxPath = defaultCandidates.map(resolvePath).find((p) => existsSync(p));

// --- Normalización de encabezados (por nombre, tolerante a BOM/espacios) ---

function normHeaderKey(k) {
  return String(k ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normHeaderRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normHeaderKey(k)] = v;
  }
  return out;
}

/** Obtiene valor por una lista de nombres de columna posibles (no ignora 0 ni false). */
function cell(row, ...names) {
  for (const n of names) {
    const key = normHeaderKey(n);
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const v = row[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

// --- Parsers robustos ---

/**
 * Acepta número, string con S/, US$, comas como miles, espacios, formato Excel localizado.
 */
function parseMoney(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return NaN;

  let s = String(value).trim();
  s = s.replace(/US\$|US\s*\$|S\/\.?|S\/\s*| PEN|\s*\$/gi, '').replace(/\s/g, '');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseMoneyOrNull(value) {
  const n = parseMoney(value);
  return Number.isFinite(n) ? n : null;
}

/** Acepta 0.12, "12%", "0,12", número Excel. */
function parsePercent(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let s = String(value).trim().replace(/\s/g, '');
  const isPct = s.endsWith('%');
  if (isPct) s = s.slice(0, -1);

  if (hasCommaDecimalAmbiguity(s)) {
    s = normalizeDecimalString(s);
  } else {
    s = s.replace(/,/g, '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return isPct ? n / 100 : n;
}

function hasCommaDecimalAmbiguity(s) {
  return s.includes(',') && s.includes('.');
}

function normalizeDecimalString(s) {
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    return s.replace(/\./g, '').replace(',', '.');
  }
  return s.replace(/,/g, '');
}

/**
 * Date, serial Excel, ISO parcial, dd/mm/yyyy, dd.mm.yy.
 */
function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 120000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(Math.floor(parsed.d)).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    return null;
  }

  const sFull = String(value ?? '').trim();
  if (!sFull) return null;

  const s = sFull.slice(0, 19).replace('T', ' ');

  const iso = sFull.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mdy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (mdy) {
    let mo = Number(mdy[1]);
    let d = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (mo > 12 && d <= 12) {
      const t = mo;
      mo = d;
      d = t;
    }
    if (!Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const tryDate = new Date(sFull);
  if (!Number.isNaN(tryDate.getTime())) return formatLocalDate(tryDate);

  return null;
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'y', 'verdadero'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'falso'].includes(s)) return false;
  return false;
}

function parseModalidad(raw) {
  const s = String(raw ?? 'tasa_anual')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  return s === 'cuota_fija' ? 'cuota_fija' : 'tasa_anual';
}

function parseEstado(raw) {
  return String(raw ?? 'activo').trim().toLowerCase() === 'cancelado' ? 'cancelado' : 'activo';
}

function mapMoneda(raw, fallback = 'USD') {
  const u = String(raw ?? '').trim().toUpperCase();
  if (u === 'PEN' || u === 'USD') return u;
  return fallback;
}

function normDedupePart(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function aporteDedupeKey(empresaId, accionista, vehRef, fechaIso, monto, moneda) {
  const payload = [
    empresaId,
    normDedupePart(accionista),
    normDedupePart(vehRef ?? ''),
    fechaIso,
    String(Number(monto)),
    mapMoneda(moneda, 'PEN'),
  ].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function getSheet(wb, name) {
  if (wb.Sheets[name]) return wb.Sheets[name];
  const keys = Object.keys(wb.Sheets);
  const hit = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
  return hit ? wb.Sheets[hit] : null;
}

/** Filas con raw:true y claves normalizadas (mapeo solo por nombre de encabezado). */
function sheetRows(wb, sheetName) {
  const sh = getSheet(wb, sheetName);
  if (!sh) return [];
  return XLSX.utils.sheet_to_json(sh, { defval: null, raw: true }).map(normHeaderRow);
}

/** Encabezados tal como salen del libro (solo diagnóstico). */
function sheetDiagnosticSample(wb, sheetName) {
  const sh = getSheet(wb, sheetName);
  if (!sh) return { sheet: sheetName, found: false, headersRaw: [], headersNorm: [], firstRowRaw: null };
  const rows = XLSX.utils.sheet_to_json(sh, { defval: null, raw: true });
  if (!rows.length) {
    return { sheet: sheetName, found: true, headersRaw: [], headersNorm: [], firstRowRaw: null };
  }
  const headersRaw = Object.keys(rows[0]);
  const headersNorm = headersRaw.map(normHeaderKey);
  const firstRowRaw = rows[0];
  return { sheet: sheetName, found: true, headersRaw, headersNorm, firstRowRaw };
}

function jsonForDiag(obj) {
  return JSON.stringify(
    obj,
    (_, v) => {
      if (v instanceof Date) return v.toISOString();
      return v;
    },
    2,
  );
}

function getCodigoPrestamo(row) {
  const v = cell(row, 'prestamo_codigo', 'codigo', 'prestamo codigo');
  return v == null ? '' : String(v).trim();
}

function getCodigoTramoRef(row) {
  const v = cell(row, 'prestamo_codigo_referencia', 'prestamo_codigo', 'codigo_referencia');
  return v == null ? '' : String(v).trim();
}

// --- main ---

async function run() {
  if (!xlsxPath) {
    console.error(
      'No se encontró el Excel v3. Coloca aportes_prestamos_normalizado_migracion_v3_completo.xlsx en la raíz del proyecto o en Downloads, o:',
      '\n  FINANCIAMIENTO_XLSX=C:\\ruta\\archivo.xlsx node scripts/import_financiamiento_from_xlsx.mjs',
      '\n  node scripts/import_financiamiento_from_xlsx.mjs C:\\ruta\\archivo.xlsx',
    );
    return 1;
  }

  if (!url || !serviceKey) {
    console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno / .env');
    return 1;
  }

  console.log('Excel:', xlsxPath.replace(/\\/g, '/'));
  console.log('empresa_id:', EMPRESA_ID);
  console.log('Modo:', dryRun ? 'DRY_RUN (solo lectura/informe)' : 'ESCRITURA');

  if (!dryRun && !allowWrite) {
    console.error(
      'Para escribir en Supabase define ALLOW_IMPORT_FINANCIAMIENTO=1 además de DRY_RUN=0.',
    );
    return 1;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });

  const rawPrestamos = sheetRows(wb, 'prestamos_financieros');
  const rawTramos = sheetRows(wb, 'prestamos_tramos');
  const rawAportes = sheetRows(wb, 'aportes_accionistas');

  console.log('\n--- Hojas leídas ---');
  console.log('prestamos_financieros filas:', rawPrestamos.length);
  console.log('prestamos_tramos filas:', rawTramos.length);
  console.log('aportes_accionistas filas:', rawAportes.length);

  if (dryRun) {
    console.log('\n--- Diagnóstico DRY_RUN (encabezados y primera fila) ---');
    const blocks = [
      ['prestamos_financieros', rawPrestamos],
      ['prestamos_tramos', rawTramos],
      ['aportes_accionistas', rawAportes],
    ];
    for (const [name, normRows] of blocks) {
      const d = sheetDiagnosticSample(wb, name);
      console.log(`\n[${name}] hoja encontrada:`, d.found);
      console.log('Encabezados detectados (raw):', d.headersRaw);
      console.log('Encabezados normalizados:', d.headersNorm);
      if (d.firstRowRaw) console.log('Primera fila raw:', jsonForDiag(d.firstRowRaw));
      if (normRows.length) console.log('Primera fila normalizada (lectura por nombre):', jsonForDiag(normRows[0]));
    }
  }

  const fmtErrores = [];
  const prestamosParsed = [];
  const codigoCount = new Map();

  for (let i = 0; i < rawPrestamos.length; i++) {
    const row = rawPrestamos[i];
    const line = i + 2;
    const codigo = getCodigoPrestamo(row);
    if (!codigo) {
      fmtErrores.push(`prestamos_financieros fila ~${line}: falta prestamo_codigo/codigo`);
      continue;
    }
    codigoCount.set(codigo, (codigoCount.get(codigo) ?? 0) + 1);

    const titulo = String(cell(row, 'titulo') ?? '').trim();
    const prestamista = String(cell(row, 'prestamista') ?? '').trim();
    const monedaCapital = mapMoneda(cell(row, 'moneda_capital', 'moneda'), 'USD');
    const monedaPago = mapMoneda(cell(row, 'moneda_pago', 'moneda'), monedaCapital);
    const modalidadPago = parseModalidad(cell(row, 'modalidad_pago'));

    const montoOriginal = parseMoney(cell(row, 'monto_original'));
    const capitalActual = parseMoney(cell(row, 'capital_actual_estimado', 'monto_original'));
    const tasaAnual = parsePercent(cell(row, 'tasa_anual'));
    const cuotaFija = parseMoneyOrNull(cell(row, 'cuota_fija_mensual'));
    const interesMensual = parseMoney(cell(row, 'interes_mensual_actual'));

    const fechaInicio = parseDate(cell(row, 'fecha_inicio'));
    const fechaCancelRaw = cell(row, 'fecha_cancelacion');
    const fechaCancel =
      fechaCancelRaw === null || fechaCancelRaw === '' ? null : parseDate(fechaCancelRaw);
    const estado = parseEstado(cell(row, 'estado'));
    const requiereTramos = parseBool(cell(row, 'requiere_tramos'));
    const observaciones = String(cell(row, 'observaciones') ?? '').trim();

    if (!fechaInicio) {
      fmtErrores.push(`prestamos_financieros ${codigo}: fecha_inicio inválida`);
      continue;
    }
    if (!Number.isFinite(montoOriginal) || !Number.isFinite(capitalActual)) {
      fmtErrores.push(`prestamos_financieros ${codigo}: monto_original/capital_actual_estimado inválido`);
      continue;
    }
    if (!Number.isFinite(interesMensual)) {
      fmtErrores.push(`prestamos_financieros ${codigo}: interes_mensual_actual inválido`);
      continue;
    }

    prestamosParsed.push({
      codigo,
      titulo,
      prestamista,
      moneda_capital: monedaCapital,
      moneda_pago: monedaPago,
      moneda_legacy: monedaCapital,
      modalidad_pago: modalidadPago,
      monto_original: montoOriginal,
      capital_actual_estimado: capitalActual,
      tasa_anual: tasaAnual,
      cuota_fija_mensual: cuotaFija,
      interes_mensual_actual: interesMensual,
      fecha_inicio: fechaInicio,
      fecha_cancelacion: fechaCancel,
      estado,
      requiere_tramos: requiereTramos,
      observaciones,
      notas: observaciones,
    });
  }

  if (dryRun && prestamosParsed.length) {
    console.log('\nPrimera fila parseada (préstamo):', jsonForDiag(prestamosParsed[0]));
  }

  for (const [c, n] of codigoCount) {
    if (n > 1) fmtErrores.push(`Duplicado en Excel: préstamo_codigo "${c}" aparece ${n} veces`);
  }

  const tramosParsed = [];
  const tramoKeyCount = new Map();

  for (let i = 0; i < rawTramos.length; i++) {
    const row = rawTramos[i];
    const line = i + 2;
    const codigoRef = getCodigoTramoRef(row);
    if (!codigoRef) {
      fmtErrores.push(`prestamos_tramos fila ~${line}: falta prestamo_codigo_referencia`);
      continue;
    }
    const ordenRaw = cell(row, 'tramo', 'orden');
    const orden = Number(parseMoney(ordenRaw ?? 0));
    if (!Number.isFinite(orden)) {
      fmtErrores.push(`prestamos_tramos ${codigoRef}: tramo/orden inválido`);
      continue;
    }
    const tk = `${codigoRef}|${orden}`;
    tramoKeyCount.set(tk, (tramoKeyCount.get(tk) ?? 0) + 1);

    const monedaCapital = mapMoneda(cell(row, 'moneda_capital', 'moneda'), 'USD');
    const monedaPago = mapMoneda(cell(row, 'moneda_pago', 'moneda'), monedaCapital);
    const modalidadPago = parseModalidad(cell(row, 'modalidad_pago'));
    const desde = parseDate(cell(row, 'desde'));
    const hastaRaw = cell(row, 'hasta');
    const hasta = hastaRaw === null || hastaRaw === '' ? null : parseDate(hastaRaw);
    const capitalRef = parseMoneyOrNull(cell(row, 'capital_referencial'));
    const tasaAnual = parsePercent(cell(row, 'tasa_anual'));
    const cuotaFija = parseMoneyOrNull(cell(row, 'cuota_fija_mensual'));
    const interesMensual = parseMoneyOrNull(cell(row, 'interes_mensual'));

    if (!desde) {
      fmtErrores.push(`prestamos_tramos ${codigoRef} tramo ${orden}: desde inválido`);
      continue;
    }

    tramosParsed.push({
      prestamo_codigo: codigoRef,
      orden,
      moneda_legacy: monedaCapital,
      moneda_capital: monedaCapital,
      moneda_pago: monedaPago,
      modalidad_pago: modalidadPago,
      desde,
      hasta,
      capital_referencial: capitalRef,
      tasa_anual: tasaAnual,
      cuota_fija_mensual: cuotaFija,
      interes_mensual: interesMensual,
      evento: String(cell(row, 'evento') ?? '').trim(),
      nota: String(cell(row, 'nota') ?? '').trim(),
    });
  }

  if (dryRun && tramosParsed.length) {
    console.log('\nPrimera fila parseada (tramo):', jsonForDiag(tramosParsed[0]));
  }

  for (const [k, n] of tramoKeyCount) {
    if (n > 1) fmtErrores.push(`Duplicado en Excel: tramo (${k.replace('|', ', orden ')}) × ${n}`);
  }

  const aportesParsed = [];
  const dedupeSeen = new Set();

  for (let i = 0; i < rawAportes.length; i++) {
    const row = rawAportes[i];
    const line = i + 2;
    const accionista = String(cell(row, 'accionista') ?? '').trim();
    const vehRefRaw = cell(row, 'vehiculo_referencia');
    const vehRef =
      vehRefRaw === null || vehRefRaw === '' ? null : String(vehRefRaw).trim() || null;
    const monto = parseMoney(cell(row, 'monto'));
    const moneda = mapMoneda(cell(row, 'moneda'), 'USD');
    const fechaAporte = parseDate(cell(row, 'fecha_aporte'));
    const generaInteres = parseBool(cell(row, 'genera_interes'));
    const tipoRaw = cell(row, 'tipo');
    const tipo = String(tipoRaw ?? 'aporte_accionista').trim() || 'aporte_accionista';
    const observaciones = String(cell(row, 'observaciones') ?? '').trim();

    if (!accionista) {
      fmtErrores.push(`aportes_accionistas fila ~${line}: falta accionista`);
      continue;
    }
    if (!Number.isFinite(monto)) {
      fmtErrores.push(`aportes_accionistas fila ~${line}: monto inválido`);
      continue;
    }
    if (!fechaAporte) {
      fmtErrores.push(`aportes_accionistas fila ~${line}: fecha_aporte inválida`);
      continue;
    }

    const dedupe_key = aporteDedupeKey(EMPRESA_ID, accionista, vehRef ?? '', fechaAporte, monto, moneda);
    if (dedupeSeen.has(dedupe_key)) {
      fmtErrores.push(`Duplicado en Excel (misma clave natural): accionista=${accionista} fecha=${fechaAporte} monto=${monto}`);
    } else {
      dedupeSeen.add(dedupe_key);
    }

    aportesParsed.push({
      empresa_id: EMPRESA_ID,
      accionista,
      vehiculo_referencia: vehRef,
      monto,
      moneda,
      fecha_aporte: fechaAporte,
      genera_interes: generaInteres,
      tipo,
      observaciones,
      dedupe_key,
    });
  }

  if (dryRun && aportesParsed.length) {
    console.log('\nPrimera fila parseada (aporte):', jsonForDiag(aportesParsed[0]));
  }

  console.log('\n--- Filas válidas tras parseo ---');
  console.log('Préstamos:', prestamosParsed.length);
  console.log('Tramos:', tramosParsed.length);
  console.log('Aportes:', aportesParsed.length);

  if (fmtErrores.length) {
    console.log('\n--- Posibles duplicados / errores de formato ---');
    for (const e of fmtErrores) console.log('-', e);
  }

  const { data: existPrestamos, error: ePre } = await supabase
    .from('prestamos_financieros')
    .select('id,codigo')
    .eq('empresa_id', EMPRESA_ID);

  if (ePre) {
    console.error('Error leyendo prestamos_financieros:', ePre.message);
    return 1;
  }

  const codigoToId = new Map();
  for (const r of existPrestamos ?? []) {
    codigoToId.set(String(r.codigo).trim(), Number(r.id));
  }

  let prestamosInsert = 0;
  let prestamosUpdate = 0;
  for (const p of prestamosParsed) {
    if (codigoToId.has(p.codigo)) prestamosUpdate += 1;
    else prestamosInsert += 1;
  }

  const prestamoIdsForExcel = [...new Set(prestamosParsed.map((p) => codigoToId.get(p.codigo)).filter(Boolean))];

  let existTramosFiltered = [];
  if (prestamoIdsForExcel.length) {
    const { data: trRows, error: eTr } = await supabase
      .from('prestamos_tramos')
      .select('id,prestamo_financiero_id,orden')
      .in('prestamo_financiero_id', prestamoIdsForExcel);
    if (eTr) console.warn('Aviso: no se pudieron leer tramos existentes:', eTr.message);
    existTramosFiltered = trRows ?? [];
  }

  let tramosInsert = 0;
  let tramosUpdate = 0;
  let tramosBlocked = 0;
  for (const t of tramosParsed) {
    const pid = codigoToId.get(t.prestamo_codigo);
    if (!pid) {
      tramosBlocked += 1;
      continue;
    }
    const hit = existTramosFiltered.find((x) => x.prestamo_financiero_id === pid && Number(x.orden) === t.orden);
    if (hit) tramosUpdate += 1;
    else tramosInsert += 1;
  }

  const dedupeKeysExcel = aportesParsed.map((a) => a.dedupe_key);
  let existDedupe = new Set();
  if (dedupeKeysExcel.length) {
    const { data: apExist } = await supabase
      .from('aportes_accionistas')
      .select('dedupe_key')
      .eq('empresa_id', EMPRESA_ID)
      .in('dedupe_key', dedupeKeysExcel);
    existDedupe = new Set((apExist ?? []).map((r) => r.dedupe_key));
  }

  let aportesInsert = 0;
  let aportesUpdate = 0;
  for (const a of aportesParsed) {
    if (existDedupe.has(a.dedupe_key)) aportesUpdate += 1;
    else aportesInsert += 1;
  }

  console.log('\n--- Resumen idempotencia (vs Supabase actual) ---');
  console.log('Préstamos a insertar:', prestamosInsert);
  console.log('Préstamos a actualizar:', prestamosUpdate);
  console.log('Tramos a insertar:', tramosInsert);
  console.log('Tramos a actualizar:', tramosUpdate);
  if (tramosBlocked)
    console.log(
      'Tramos sin préstamo resuelto en BD (se crearán tras insertar préstamo nuevo):',
      tramosBlocked,
    );
  console.log('Aportes a insertar:', aportesInsert);
  console.log('Aportes a actualizar:', aportesUpdate);

  if (dryRun) {
    console.log('\nDRY_RUN activo — no se escribió nada. Para importar: DRY_RUN=0 y ALLOW_IMPORT_FINANCIAMIENTO=1');
    return 0;
  }

  if (fmtErrores.length) {
    console.error('\nHay errores o duplicados en el Excel; corrígelos antes de importar con DRY_RUN=0.');
    return 1;
  }

  for (const p of prestamosParsed) {
    const payload = {
      empresa_id: EMPRESA_ID,
      codigo: p.codigo,
      prestamista: p.prestamista,
      titulo: p.titulo,
      moneda: p.moneda_legacy,
      moneda_capital: p.moneda_capital,
      moneda_pago: p.moneda_pago,
      modalidad_pago: p.modalidad_pago,
      monto_original: p.monto_original,
      capital_actual_estimado: p.capital_actual_estimado,
      tasa_anual: p.tasa_anual,
      cuota_fija_mensual: p.cuota_fija_mensual,
      interes_mensual_actual: p.interes_mensual_actual,
      fecha_inicio: p.fecha_inicio,
      fecha_cancelacion: p.fecha_cancelacion,
      estado: p.estado,
      requiere_tramos: p.requiere_tramos,
      observaciones: p.observaciones,
      notas: p.notas,
    };

    const existingId = codigoToId.get(p.codigo);
    if (existingId) {
      const { error } = await supabase.from('prestamos_financieros').update(payload).eq('id', existingId);
      if (error) {
        console.error('Update préstamo', p.codigo, error.message);
        return 1;
      }
    } else {
      const { data: ins, error } = await supabase.from('prestamos_financieros').insert(payload).select('id').single();
      if (error) {
        console.error('Insert préstamo', p.codigo, error.message);
        return 1;
      }
      codigoToId.set(p.codigo, Number(ins.id));
    }
  }

  const { data: allPrestamosDb } = await supabase
    .from('prestamos_financieros')
    .select('id,codigo')
    .eq('empresa_id', EMPRESA_ID);

  for (const r of allPrestamosDb ?? []) {
    codigoToId.set(String(r.codigo).trim(), Number(r.id));
  }

  for (const t of tramosParsed) {
    const pid = codigoToId.get(t.prestamo_codigo);
    if (!pid) {
      console.error('Tramo huérfano: préstamo no encontrado tras upsert:', t.prestamo_codigo);
      return 1;
    }
    const trPayload = {
      prestamo_financiero_id: pid,
      moneda: t.moneda_legacy,
      moneda_capital: t.moneda_capital,
      moneda_pago: t.moneda_pago,
      modalidad_pago: t.modalidad_pago,
      desde: t.desde,
      hasta: t.hasta,
      capital_referencial: t.capital_referencial,
      tasa_anual: t.tasa_anual,
      cuota_fija_mensual: t.cuota_fija_mensual,
      interes_mensual: t.interes_mensual,
      evento: t.evento,
      nota: t.nota,
      orden: t.orden,
    };

    const { data: trHit } = await supabase
      .from('prestamos_tramos')
      .select('id')
      .eq('prestamo_financiero_id', pid)
      .eq('orden', t.orden)
      .maybeSingle();

    if (trHit?.id) {
      const { error } = await supabase.from('prestamos_tramos').update(trPayload).eq('id', trHit.id);
      if (error) {
        console.error('Update tramo', t.prestamo_codigo, t.orden, error.message);
        return 1;
      }
    } else {
      const { error } = await supabase.from('prestamos_tramos').insert(trPayload);
      if (error) {
        console.error('Insert tramo', t.prestamo_codigo, t.orden, error.message);
        return 1;
      }
    }
  }

  for (const a of aportesParsed) {
    const { error } = await supabase.from('aportes_accionistas').upsert(
      {
        empresa_id: a.empresa_id,
        accionista: a.accionista,
        vehiculo_referencia: a.vehiculo_referencia,
        monto: a.monto,
        moneda: a.moneda,
        fecha_aporte: a.fecha_aporte,
        genera_interes: a.genera_interes,
        tipo: a.tipo,
        observaciones: a.observaciones,
        dedupe_key: a.dedupe_key,
      },
      { onConflict: 'dedupe_key' },
    );
    if (error) {
      console.error('Upsert aporte', a.accionista, a.fecha_aporte, error.message);
      return 1;
    }
  }

  console.log('\nImportación completada.');
  return 0;
}

run()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
