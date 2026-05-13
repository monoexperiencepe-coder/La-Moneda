/**
 * Importación idempotente: hoja VALOR DE INVERSION → public.inversiones_generales_vehiculo
 *
 * DRY_RUN por defecto. Escritura: DRY_RUN=0 y ALLOW_IMPORT_INVERSIONES_GENERALES=1
 *
 * Fechas F.COMPRA: si hay valores inválidos (p. ej. 29/02/2022), el import real se bloquea salvo
 * ALLOW_NULL_FECHA_COMPRA=1 (importa fecha_compra=null solo en esas filas; avisos en consola).
 *
 * Detección de columnas por encabezados reales (no posición fija).
 * Diagnóstico extra cuando DRY_RUN está activo.
 *
 * Cierre: process.exitCode (evita process.exit() dentro de async / handles UV).
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const DEFAULT_EMPRESA_ID = '07593982-08e6-450c-8abe-4bf590609dd7';

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
const EMPRESA_ID = (env.EMPRESA_ID ?? DEFAULT_EMPRESA_ID).trim();

const dryRun = !(env.DRY_RUN === '0' || env.DRY_RUN === 'false');
const allowWrite = env.ALLOW_IMPORT_INVERSIONES_GENERALES === '1';
const allowNullFechaCompra = env.ALLOW_NULL_FECHA_COMPRA === '1';

const xlsxArg = process.argv[2]?.trim();
const xlsxFromEnv = (env.INVERSIONES_GENERALES_XLSX ?? '').trim();

const defaultCandidates = [
  xlsxArg,
  xlsxFromEnv,
  resolve(root, 'GASTOS E INGRESOS (3)(2).xlsx'),
  resolve(root, 'GASTOS E INGRESOS (3).xlsx'),
  resolve(process.env.USERPROFILE || '', 'Downloads/GASTOS E INGRESOS (3)(2).xlsx'),
  resolve(process.env.USERPROFILE || '', 'Downloads/GASTOS E INGRESOS (3).xlsx'),
  'C:\\Users\\alkan\\Downloads\\GASTOS E INGRESOS (3)(2).xlsx',
  'C:\\Users\\alkan\\Downloads\\GASTOS E INGRESOS (3).xlsx',
  resolve(process.env.USERPROFILE || '', 'Downloads/VALOR_DE_INVERSION_limpio_solo_hoja.xlsx'),
  'C:\\Users\\alkan\\Downloads\\VALOR_DE_INVERSION_limpio_solo_hoja.xlsx',
].filter(Boolean);

function resolvePath(p) {
  return isAbsolute(p) ? p : resolve(root, p);
}

const xlsxPath = defaultCandidates.map(resolvePath).find((p) => existsSync(p));

/** Clave estable para cell() interno (espacios → _). */
function normHeaderKey(k) {
  return String(k ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Normaliza encabezado para scoring (sin acentos, solo a-z0-9 y _). */
function normForScoring(s) {
  return String(s ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normHeaderRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[normHeaderKey(k)] = v;
  }
  return out;
}

function getByRawKey(rowRaw, rawKey) {
  if (rawKey == null || rawKey === '') return null;
  if (Object.prototype.hasOwnProperty.call(rowRaw, rawKey)) {
    const v = rowRaw[rawKey];
    if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) return v;
  }
  for (const k of Object.keys(rowRaw)) {
    if (normHeaderKey(k) === normHeaderKey(rawKey)) {
      const v = rowRaw[k];
      if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) return v;
    }
  }
  return null;
}

function cell(rowNorm, ...names) {
  for (const n of names) {
    const key = normHeaderKey(n);
    if (!Object.prototype.hasOwnProperty.call(rowNorm, key)) continue;
    const v = rowNorm[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, month1to12) {
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month1to12 === 2 && isLeapYear(y)) return 29;
  return dim[month1to12 - 1] ?? 0;
}

/** Año razonable para compra de unidades. */
function isValidCalendarDate(y, month1to12, day) {
  if (!Number.isFinite(y) || !Number.isFinite(month1to12) || !Number.isFinite(day)) return false;
  if (y < 1900 || y > 2100) return false;
  if (month1to12 < 1 || month1to12 > 12) return false;
  if (day < 1 || day > daysInMonth(y, month1to12)) return false;
  return true;
}

function toIsoDateOnly(y, month1to12, day) {
  if (!isValidCalendarDate(y, month1to12, day)) return null;
  return `${y}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Comprueba que (y,m,d) no haya “rodado” al construir Date local (fechas imposibles). */
function localYmdRoundTripOk(y, month1to12, day) {
  const t = new Date(y, month1to12 - 1, day);
  return t.getFullYear() === y && t.getMonth() === month1to12 - 1 && t.getDate() === day;
}

/**
 * Serial Excel → partes UTC (1899-12-30); valida calendario antes de devolver ISO.
 */
function excelSerialToValidatedIso(serial) {
  const u = Math.floor(Number(serial));
  if (!Number.isFinite(u) || u < 20000 || u > 80000) return { ok: false, code: 'serial_fuera_rango', iso: null, naiveIso: null };
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + u * 86400000);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (y < 1900 || y > 2100) return { ok: false, code: 'serial_anio_fuera_rango', iso: null, naiveIso: `${y}-${mo}-${day}` };
  const iso = toIsoDateOnly(y, mo, day);
  if (!iso) {
    return {
      ok: false,
      code: 'serial_calendario_invalido',
      iso: null,
      naiveIso: `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }
  return { ok: true, iso, code: null, naiveIso: null };
}

/**
 * F.COMPRA: Date (Excel), serial numérico, DD.MM.YY / DD.MM.YYYY / DD/MM/YYYY (día-mes-año), o YYYY-MM-DD.
 * No inventa fechas: 29/02 en año no bisiesto → error; no envía ISO inválido a Postgres.
 * @returns {{ ok: boolean, iso: string | null, code: string | null, naiveIso: string | null }}
 */
function parseFechaCompraResult(val) {
  if (val == null || val === '') return { ok: true, iso: null, code: null, naiveIso: null };
  if (typeof val === 'boolean') return { ok: false, iso: null, code: 'boolean', naiveIso: null };

  if (val instanceof Date) {
    if (Number.isNaN(+val)) return { ok: false, iso: null, code: 'date_nan', naiveIso: null };
    const y = val.getFullYear();
    const mo = val.getMonth() + 1;
    const day = val.getDate();
    if (!localYmdRoundTripOk(y, mo, day)) {
      return { ok: false, iso: null, code: 'date_obj_inconsistente', naiveIso: `${y}-${mo}-${day}` };
    }
    const iso = toIsoDateOnly(y, mo, day);
    if (!iso) {
      return {
        ok: false,
        iso: null,
        code: 'date_calendario_invalido',
        naiveIso: `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
    return { ok: true, iso, code: null, naiveIso: null };
  }

  if (typeof val === 'number' && Number.isFinite(val)) {
    if (val > 20000 && val < 80000) return excelSerialToValidatedIso(val);
    return { ok: false, iso: null, code: 'numero_no_serial', naiveIso: null };
  }

  const s = String(val).trim();
  if (!s) return { ok: true, iso: null, code: null, naiveIso: null };

  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoLike) {
    const y = parseInt(isoLike[1], 10);
    const mo = parseInt(isoLike[2], 10);
    const day = parseInt(isoLike[3], 10);
    const iso = toIsoDateOnly(y, mo, day);
    if (!iso) {
      return {
        ok: false,
        iso: null,
        code: 'iso_texto_invalido',
        naiveIso: `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
    return { ok: true, iso, code: null, naiveIso: null };
  }

  const mEu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (mEu) {
    const day = parseInt(mEu[1], 10);
    const mo = parseInt(mEu[2], 10);
    let y = parseInt(mEu[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const iso = toIsoDateOnly(y, mo, day);
    if (!iso) {
      const naive = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const feb29 = mo === 2 && day === 29 && !isLeapYear(y);
      return {
        ok: false,
        iso: null,
        code: feb29 ? 'feb_29_ano_no_bisiesto' : 'dmY_calendario_invalido',
        naiveIso: naive,
      };
    }
    return { ok: true, iso, code: null, naiveIso: null };
  }

  return { ok: false, iso: null, code: 'formato_no_reconocido', naiveIso: null };
}

function recomendacionFechaCompra(issue) {
  const { code, anio } = issue;
  if (code === 'feb_29_ano_no_bisiesto') {
    const a = anio != null ? String(anio) : 'ese año';
    return `${a} no es bisiesto: no existe 29/02. Corregí la celda en Excel (p. ej. 28/02 o 01/03) o definí ALLOW_NULL_FECHA_COMPRA=1 para importar con fecha_compra vacía en esa fila.`;
  }
  if (code === 'formato_no_reconocido') {
    return 'Usá DD.MM.YY, DD/MM/YYYY, fecha serial de Excel o celda con formato fecha. O definí ALLOW_NULL_FECHA_COMPRA=1 para omitir fecha en filas no interpretables.';
  }
  return 'Revisá día/mes/año en Excel. O definí ALLOW_NULL_FECHA_COMPRA=1 para importar con fecha_compra vacía en esa fila.';
}

/**
 * Número Excel, string con comas/puntos, S/, US$, formato moneda.
 */
function parseMoney(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return NaN;
  let s = String(value).trim();
  s = s.replace(/US\$|US\s*\$|S\/\.?|S\/\s*|PEN|EUR|€|\s*\$/gi, '').replace(/\s/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = parts[0].replace(/\./g, '') + '.' + parts[1];
    else s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function detectMonedaFromHeaderLabel(labelRaw) {
  const u = String(labelRaw ?? '').toUpperCase();
  if (/\bUSD\b|US\$|DOLAR|DOLLAR/i.test(u)) return 'USD';
  if (/\bPEN\b|S\/|SOL(ES)?\b/i.test(u)) return 'PEN';
  return null;
}

function detectMonedaFromValue(val) {
  const s = String(val ?? '').toUpperCase();
  if (s.includes('US$') || s.includes('USD')) return 'USD';
  if (s.includes('S/') || s.includes('PEN')) return 'PEN';
  return null;
}

function extractVehiculoNumero(ref) {
  const s = String(ref ?? '').trim();
  if (!s) return null;
  let m = s.match(/\bn[°o]?\s*(\d{1,3})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 200) return n;
  }
  m = s.match(/veh[íi]culo\s*(\d{1,3})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 200) return n;
  }
  m = s.match(/yaris\s*(\d{1,3})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 200) return n;
  }
  // Fallback principal: cualquier referencia que termine en número (Rio 10, GLORY 82, Versa 03, etc.)
  m = s.match(/(\d{1,3})\s*$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 200) return n;
  }
  return null;
}

function normSheetName(n) {
  return String(n ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function findValorInversionSheet(workbook) {
  const want = 'valor de inversion';
  const exact = workbook.SheetNames.find((sn) => normSheetName(sn) === want);
  if (exact) return exact;
  return workbook.SheetNames.find((sn) => normSheetName(sn).includes('valor') && normSheetName(sn).includes('inversion'));
}

/** Penaliza columnas que parecen desglose parcial (no total). */
function scorePartialBreakdown(h) {
  if (!h) return 0;
  if (/\b(gnv|notari|firma|seguro|gps|funda|accesori|document|papeles|soat|placa)\b/i.test(h) && !/total/i.test(h)) {
    return -40;
  }
  return 0;
}

/**
 * Elige la columna de monto total por nombre de encabezado (mayor score).
 * Si varias columnas “total”, se prefiere la que explícitamente une total+inversión/valor.
 */
function pickMontoColumn(rawHeaders) {
  const entries = rawHeaders.map((raw, idx) => {
    const h = normForScoring(raw);
    if (!h) return { raw, idx, score: -999, h: '' };
    let score = scorePartialBreakdown(h);

    const rules = [
      { test: /total_inv|total.*inv.*us|inv.*us.*\$|total.*inv.*us\$?$/i, w: 125 },
      { test: /total.*inver|inver.*total|inversion.*total|total.*inversion/, w: 120 },
      { test: /valor.*total.*inver|valor.*inver.*total/, w: 118 },
      { test: /valor_de_inversion|valordeinversion|valor.*de.*inver/, w: 116 },
      { test: /valor_total|total_valor/, w: 112 },
      { test: /total_invertido|totalinvertido|invertido.*total/, w: 110 },
      { test: /inversion_total|inversi.*total/, w: 108 },
      { test: /valor_invertido|valorinvertido/, w: 106 },
      { test: /costo_total|total_costo|costo.*inver|inver.*costo/, w: 104 },
      { test: /monto_total|total_monto/, w: 102 },
      { test: /total_vehic|vehic.*total/, w: 100 },
      { test: /inver.*inicial|costo.*inicial|capital.*inver/, w: 96 },
      { test: /valor.*usd|usd.*valor|total.*usd|monto.*usd/i, w: 95 },
      { test: /valor.*pen|pen.*valor|total.*pen|monto.*pen|s\/?\s*total/i, w: 95 },
      { test: /^total$|^total_usd$|^total_pen$|^total_us$|^total_pen$/, w: 88 },
      { test: /inver.*valor|valor.*inver/, w: 86 },
      { test: /importe.*total|total.*importe/, w: 84 },
      { test: /suma.*total|total.*general/, w: 82 },
    ];
    for (const { test, w } of rules) {
      if (test.test(h)) score += w;
    }

    if (/\btotal\b/.test(h) && /inv/.test(h)) score += 40;
    else if (/\btotal\b/.test(h)) score += 15;
    if (/\bvalor\b/.test(h) && !/total/.test(h)) score += 4;
    if (/\binver|(^|_)inv(_|$)/i.test(h)) score += 12;
    if (/\bcosto\b|\bmonto\b|\bimporte\b/.test(h)) score += 6;
    if (/^valor_s_us|valor.*(compra|veh)/i.test(h) && !/total/.test(h)) score -= 35;

    return { raw, idx, score, h };
  });

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.idx - a.idx;
  });

  const best = entries[0];
  if (!best || best.score < 1) return { rawKey: null, score: best?.score ?? 0, candidates: entries.slice(0, 8) };
  return { rawKey: best.raw, score: best.score, norm: best.h, candidates: entries.slice(0, 8) };
}

/**
 * Si no hubo encabezado claro de total, elige la columna donde más filas tienen número > 0
 * y el encabezado no parece desglose parcial.
 */
function pickMontoColumnFallbackScan(raw, rawHeaders, refRawKey) {
  let bestKey = null;
  let bestScore = -999;
  for (const h of rawHeaders) {
    if (refRawKey && normHeaderKey(h) === normHeaderKey(refRawKey)) continue;
    const nh = normForScoring(h);
    if (!nh) continue;
    let ok = 0;
    for (let i = 0; i < Math.min(25, raw.length); i++) {
      if (refRawKey) {
        const ref = String(getByRawKey(raw[i], refRawKey) ?? '').trim();
        if (!ref || /^total/i.test(ref)) continue;
        if (/^(veh[ií]culo|referencia|tipo|n[°o]?|descripci)/i.test(ref) && !/\d/.test(ref)) continue;
      }
      const v = getByRawKey(raw[i], h);
      const n = parseMoney(v);
      if (Number.isFinite(n) && n > 0) ok++;
    }
    const breakdown = scorePartialBreakdown(nh);
    let headerBonus = 0;
    if (/\btotal\b/.test(nh) && /inv/.test(nh)) headerBonus += 120;
    else if (/\btotal\b/.test(nh)) headerBonus += 35;
    if (/^valor_s_us|valor.*compra/i.test(nh) && !/total/.test(nh)) headerBonus -= 80;
    if (/\binver|inv_us|total_inv/i.test(nh)) headerBonus += 25;
    if (/\bvalor\b|\bcosto\b|\bmonto\b|\bimporte\b/.test(nh)) headerBonus += 8;
    const s = ok * 8 + headerBonus + breakdown;
    if (s > bestScore) {
      bestScore = s;
      bestKey = h;
    }
  }
  return bestScore >= 32 ? bestKey : null;
}

/**
 * Columnas de desglose (VALOR DE INVERSION): encabezados reales vía normForScoring.
 */
function pickBreakdownRawKeys(rawHeaders) {
  const rows = rawHeaders
    .filter((k) => k && String(k).trim() && !/^__empty/i.test(String(k)))
    .map((raw) => ({ raw, n: normForScoring(raw) }));
  const pick = (pred) => rows.find(({ n }) => pred(n))?.raw ?? null;

  const fecha =
    pick((n) => n === 'f_compra' || /^f_?compra/.test(n)) ||
    pick((n) => n.includes('fecha') && n.includes('compra'));

  const valorVehiculo = pick(
    (n) =>
      n.includes('valor') &&
      (n.includes('us') || n.endsWith('usd')) &&
      !n.includes('total') &&
      !n.includes('seguro') &&
      !n.includes('inv') &&
      !n.includes('gps') &&
      !n.includes('gnv'),
  );

  const solesHeader =
    rawHeaders.find((h) => /^\s*s\/?\.?\s*$/i.test(String(h).trim())) ??
    pick((n) => n === 's' || n === 'sol' || n === 'soles');

  return {
    fecha,
    valorVehiculo,
    gnv: pick((n) => n.includes('gnv')),
    notarial: pick((n) => n.includes('notarial')),
    firmas: pick((n) => n.includes('firma') || n.includes('leg')),
    seguro: pick((n) => n.includes('seguro')),
    gps: pick((n) => n.includes('gps')),
    fundas: pick((n) => n.includes('funda') || (n.includes('acces') && n.includes('fund')) || n.includes('g_fundas')),
    soles: solesHeader,
  };
}

function pickRefColumn(rawHeaders, sampleRowRaw) {
  const entries = rawHeaders.map((raw, idx) => {
    const h = normForScoring(raw);
    let score = 0;
    const rules = [
      { test: /tipo.*carro|tipocarro|tipo_carro/, w: 100 },
      { test: /^vehiculo$|^vehículo$|descripcion|descripción|referencia|unidad|item|nombre/, w: 90 },
      { test: /modelo.*unidad|unidad.*vehic/, w: 70 },
    ];
    for (const { test, w } of rules) {
      if (test.test(h)) score += w;
    }
    const v = getByRawKey(sampleRowRaw ?? {}, raw);
    const vs = String(v ?? '').trim();
    if (/yaris|corolla|rio|sportage|veh|auto|camion/i.test(vs)) score += 25;
    if (/\d/.test(vs) && vs.length >= 3 && vs.length < 80) score += 10;
    return { raw, idx, score, h };
  });
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  const best = entries[0];
  if (best && best.score >= 20) return { rawKey: best.raw, score: best.score, norm: best.h, candidates: entries.slice(0, 6) };
  const first = rawHeaders[0];
  return { rawKey: first ?? null, score: 0, norm: normForScoring(first), candidates: entries.slice(0, 6), fallback: true };
}

function printDryRunDiagnostics(rawHeaders, firstRowRaw, refPick, montoPick, montoRawKeyResolved, breakdownKeys) {
  console.log('\n--- DIAGNÓSTICO DRY_RUN (hoja VALOR DE INVERSION) ---');
  console.log('Encabezados reales (orden):', JSON.stringify(rawHeaders, null, 2));
  console.log('Columnas desglose detectadas:', JSON.stringify(breakdownKeys, null, 2));
  console.log('Primera fila de datos (raw, tal cual sheet_to_json):', JSON.stringify(firstRowRaw ?? {}, null, 2));
  console.log(
    'Claves normalizadas (normHeaderKey):',
    JSON.stringify(
      rawHeaders.map((k) => ({ raw: k, normKey: normHeaderKey(k), scoring: normForScoring(k) })),
      null,
      2,
    ),
  );
  console.log('Columna REF elegida (raw key):', refPick.rawKey, '| score:', refPick.score, refPick.fallback ? '| (fallback primera columna)' : '');
  console.log(
    'Columna MONTO usada (raw key):',
    montoRawKeyResolved,
    '| score encabezado:',
    montoPick.score,
    montoPick.rawKey !== montoRawKeyResolved ? '| (resuelta por fallback barrido de valores)' : '',
  );
  if (montoPick.norm) console.log('  norm encabezado ganador (si aplica):', montoPick.norm);
  if (montoPick.candidates?.length) {
    console.log('Top candidatos monto por nombre (norm, score):');
    for (const c of montoPick.candidates) {
      if (c.score > -100) console.log(`  ${c.h || '(vacío)'}  raw=${JSON.stringify(c.raw)}  score=${c.score}  idx=${c.idx}`);
    }
  }
  console.log('--- fin diagnóstico ---\n');
}

async function mainAsync() {
  console.log(
    '[inversiones_generales] DRY_RUN=',
    dryRun ? '1 (solo informe)' : '0 (escritura)',
    'allowWrite=',
    allowWrite,
    '| ALLOW_NULL_FECHA_COMPRA=',
    allowNullFechaCompra ? '1' : '0 (fechas inválidas bloquean import real)',
  );

  if (!xlsxPath) {
    console.error('No se encontró Excel. Pasa ruta como argv[1] o define INVERSIONES_GENERALES_XLSX');
    return 1;
  }
  console.log('Excel:', xlsxPath);

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = findValorInversionSheet(wb);
  if (!sheetName) {
    console.error('No hay hoja tipo "VALOR DE INVERSION". Hojas:', wb.SheetNames.join(', '));
    return 1;
  }
  console.log('Hoja:', sheetName);

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: true });
  console.log('Filas leídas (json):', raw.length);

  if (!raw.length) {
    console.warn('Hoja vacía.');
    return 0;
  }

  const rawHeaders = Object.keys(raw[0]).filter((k) => String(k).trim() !== '');
  const firstRowRaw = raw[0];
  const breakdownKeys = pickBreakdownRawKeys(rawHeaders);

  const refPick = pickRefColumn(rawHeaders, firstRowRaw);
  const montoPick = pickMontoColumn(rawHeaders);
  let montoRawKeyResolved = montoPick.rawKey;
  if (!montoRawKeyResolved) {
    montoRawKeyResolved = pickMontoColumnFallbackScan(raw, rawHeaders, refPick.rawKey);
  }

  if (dryRun) {
    printDryRunDiagnostics(rawHeaders, firstRowRaw, refPick, montoPick, montoRawKeyResolved, breakdownKeys);
  }

  function optMoneyRow(rowRaw, rawKey) {
    if (rawKey == null) return null;
    const x = parseMoney(getByRawKey(rowRaw, rawKey));
    return Number.isFinite(x) ? x : null;
  }

  const headerMonedaFromMontoCol =
    montoRawKeyResolved != null ? detectMonedaFromHeaderLabel(montoRawKeyResolved) : null;

  function detectMonedaFromHeaderKeysAll(headers) {
    const blob = headers.join(' ').toUpperCase();
    if (blob.includes('USD') || blob.includes('DOLAR')) return 'USD';
    if (blob.includes('PEN') || blob.includes('S/')) return 'PEN';
    return null;
  }

  const formatErrors = [];
  const parsed = [];

  for (let i = 0; i < raw.length; i++) {
    const rowRaw = raw[i];
    const rowNorm = normHeaderRow(rowRaw);

    let refRaw = refPick.rawKey != null ? getByRawKey(rowRaw, refPick.rawKey) : null;
    if (refRaw == null) {
      refRaw = cell(
        rowNorm,
        'vehiculo',
        'vehículo',
        'referencia',
        'tipo_carro',
        'tipo carro',
        'unidad',
        'descripcion',
        'descripción',
        'n_unidad',
        'item',
      );
    }
    const ref = String(refRaw ?? '').trim();
    if (!ref || /^total/i.test(ref)) continue;
    if (/^(veh[ií]culo|referencia|tipo|n[°o]?|descripci)/i.test(ref) && !/\d/.test(ref)) continue;

    let montoRaw = montoRawKeyResolved != null ? getByRawKey(rowRaw, montoRawKeyResolved) : null;
    if (montoRaw == null) {
      montoRaw =
        cell(
          rowNorm,
          'valor_total_invertido',
          'total_invertido',
          'monto_total',
          'total',
          'valor_total',
          'inversion_total',
          'total_inversion',
          'valor de inversion',
          'valor_de_inversion',
          'costo_total',
          'monto',
        ) ?? null;
    }

    const monto = parseMoney(montoRaw);
    if (!Number.isFinite(monto) || monto < 0) {
      formatErrors.push({ fila: i + 2, ref, montoRaw, msg: 'monto inválido' });
      continue;
    }

    let moneda = detectMonedaFromValue(montoRaw) ?? headerMonedaFromMontoCol ?? detectMonedaFromHeaderKeysAll(rawHeaders) ?? 'USD';
    if (moneda !== 'PEN' && moneda !== 'USD') moneda = 'USD';

    const placa = cell(rowNorm, 'placa', 'placas');
    const modelo = cell(rowNorm, 'modelo', 'tipo', 'marca_modelo');
    const numCol = cell(rowNorm, 'n', 'n°', 'numero', 'número', 'vehiculo_numero', 'n_vehiculo');
    let vehiculoNumero = numCol != null && numCol !== '' ? parseInt(String(numCol).replace(/\D/g, ''), 10) : NaN;
    if (!Number.isFinite(vehiculoNumero)) vehiculoNumero = extractVehiculoNumero(ref);

    const valorCompraUsd = optMoneyRow(rowRaw, breakdownKeys.valorVehiculo);
    const gastoGnvUsd = optMoneyRow(rowRaw, breakdownKeys.gnv);
    const gastoNotarialUsd = optMoneyRow(rowRaw, breakdownKeys.notarial);
    const legFirmasUsd = optMoneyRow(rowRaw, breakdownKeys.firmas);
    const seguroUsd = optMoneyRow(rowRaw, breakdownKeys.seguro);
    const gpsUsd = optMoneyRow(rowRaw, breakdownKeys.gps);
    const fundasAccesoriosUsd = optMoneyRow(rowRaw, breakdownKeys.fundas);
    const totalEquivalentePen = optMoneyRow(rowRaw, breakdownKeys.soles);

    parsed.push({
      empresa_id: EMPRESA_ID,
      vehiculo_referencia: ref,
      vehiculo_numero: vehiculoNumero != null && Number.isFinite(vehiculoNumero) ? vehiculoNumero : null,
      placa: placa != null && String(placa).trim() ? String(placa).trim() : null,
      modelo: modelo != null && String(modelo).trim() ? String(modelo).trim() : null,
      fecha_compra: null,
      valor_compra_usd: valorCompraUsd,
      gasto_gnv_usd: gastoGnvUsd,
      gasto_notarial_usd: gastoNotarialUsd,
      leg_firmas_usd: legFirmasUsd,
      seguro_usd: seguroUsd,
      gps_usd: gpsUsd,
      fundas_accesorios_usd: fundasAccesoriosUsd,
      total_equivalente_pen: totalEquivalentePen,
      monto_total: monto,
      moneda,
      fuente: 'VALOR DE INVERSION',
      observaciones: null,
      _import_meta: {
        filaExcel: i + 2,
        fechaCompraRaw: breakdownKeys.fecha != null ? getByRawKey(rowRaw, breakdownKeys.fecha) : null,
      },
    });
  }

  const byRef = new Map();
  for (const p of parsed) {
    byRef.set(p.vehiculo_referencia, p);
  }
  const unique = [...byRef.values()];

  const fechaIssues = [];
  for (const r of unique) {
    const raw = r._import_meta?.fechaCompraRaw;
    const empty = raw == null || (typeof raw === 'string' && !String(raw).trim());
    const fr = parseFechaCompraResult(raw);
    r.fecha_compra = fr.ok ? fr.iso : null;
    if (!empty && !fr.ok) {
      let anio;
      if (fr.code === 'feb_29_ano_no_bisiesto' && fr.naiveIso && /^\d{4}/.test(fr.naiveIso)) {
        anio = parseInt(fr.naiveIso.slice(0, 4), 10);
      }
      fechaIssues.push({
        severity: allowNullFechaCompra ? 'warning' : 'error',
        filaExcel: r._import_meta?.filaExcel ?? null,
        vehiculo_referencia: r.vehiculo_referencia,
        fCompraOriginal: raw,
        fechaParseadaInvalida: fr.naiveIso,
        code: fr.code,
        recomendacion: recomendacionFechaCompra({ code: fr.code, anio }),
      });
    }
  }

  if (fechaIssues.length) {
    const errs = fechaIssues.filter((x) => x.severity === 'error').length;
    const warns = fechaIssues.filter((x) => x.severity === 'warning').length;
    console.log('\n--- Validación fecha_compra (F.COMPRA), antes de upsert ---');
    console.log(`Incidencias: ${fechaIssues.length} (errores: ${errs}, avisos: ${warns})`);
    for (const e of fechaIssues) {
      console.log('---');
      console.log('Gravedad:', e.severity);
      console.log('Fila Excel (número de fila en la hoja):', e.filaExcel);
      console.log('vehiculo_referencia:', e.vehiculo_referencia);
      console.log('Valor original F.COMPRA:', e.fCompraOriginal);
      console.log('Fecha parseada inválida / candidata:', e.fechaParseadaInvalida);
      console.log('Código:', e.code);
      console.log('Recomendación:', e.recomendacion);
    }
    const feb29List = fechaIssues.filter((e) => e.fechaParseadaInvalida === '2022-02-29');
    if (feb29List.length) {
      console.log('\n--- Detalle explícito: 2022-02-29 (no existe; 2022 no es bisiesto) ---');
      for (const e of feb29List) {
        console.log(
          JSON.stringify(
            {
              filaExcel: e.filaExcel,
              vehiculo_referencia: e.vehiculo_referencia,
              fCompraOriginal: e.fCompraOriginal,
              fechaParseadaInvalida: e.fechaParseadaInvalida,
            },
            null,
            2,
          ),
        );
      }
    }
  }

  const bloqueadoFecha = fechaIssues.some((x) => x.severity === 'error');
  if (bloqueadoFecha) {
    console.error(
      '\n[inversiones_generales] Import bloqueado: hay F.COMPRA inválida(s). Corregí el Excel o definí ALLOW_NULL_FECHA_COMPRA=1 para importar con fecha_compra=null en esas filas.',
    );
    return 1;
  }

  if (allowNullFechaCompra && fechaIssues.length) {
    console.warn(
      `[inversiones_generales] ALLOW_NULL_FECHA_COMPRA=1: ${fechaIssues.length} fila(s) con F.COMPRA inválida se importan con fecha_compra=null.`,
    );
  }

  const sumUsd = unique.filter((r) => r.moneda === 'USD').reduce((s, r) => s + r.monto_total, 0);
  const sumPen = unique.filter((r) => r.moneda === 'PEN').reduce((s, r) => s + r.monto_total, 0);

  console.log('Vehículos / referencias únicas:', unique.length);
  console.log('Suma USD:', sumUsd.toFixed(2), '| Suma PEN:', sumPen.toFixed(2));
  console.log('Errores formato:', formatErrors.length);
  if (formatErrors.length && formatErrors.length <= 25) console.log(JSON.stringify(formatErrors, null, 2));
  else if (formatErrors.length) console.log('(primeros 15)', JSON.stringify(formatErrors.slice(0, 15), null, 2));

  if (!url || !serviceKey) {
    console.warn('Sin Supabase URL/service key: no se calcula insert/update vs BD.');
    return dryRun ? 0 : 1;
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const invCompareFieldsFull = [
    'monto_total',
    'moneda',
    'fecha_compra',
    'valor_compra_usd',
    'gasto_gnv_usd',
    'gasto_notarial_usd',
    'leg_firmas_usd',
    'seguro_usd',
    'gps_usd',
    'fundas_accesorios_usd',
    'total_equivalente_pen',
  ];

  function numEqLoose(a, b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(Number(a) - Number(b)) < 0.01;
  }

  function inversionRowUnchanged(p, r, fields) {
    for (const f of fields) {
      if (f === 'moneda') {
        if (String(p[f] ?? '') !== String(r[f] ?? '')) return false;
      } else if (f === 'fecha_compra') {
        const da = p[f] == null ? null : String(p[f]).slice(0, 10);
        const db = r[f] == null ? null : String(r[f]).slice(0, 10);
        if (da !== db) return false;
      } else if (!numEqLoose(p[f], r[f])) return false;
    }
    return true;
  }

  let invCompareFields = invCompareFieldsFull;
  let { data: existing, error: exErr } = await supabase
    .from('inversiones_generales_vehiculo')
    .select(`vehiculo_referencia, ${invCompareFields.join(', ')}`)
    .eq('empresa_id', EMPRESA_ID);

  if (
    exErr &&
    (/does not exist|42703|schema cache/i.test(exErr.message) || /column/i.test(exErr.message))
  ) {
    console.warn(
      '[inversiones_generales] BD sin columnas de desglose; aplica supabase/migration_inversiones_generales_vehiculo_desglose.sql. Comparación solo monto/moneda.',
    );
    invCompareFields = ['monto_total', 'moneda'];
    const retry = await supabase
      .from('inversiones_generales_vehiculo')
      .select('vehiculo_referencia, monto_total, moneda')
      .eq('empresa_id', EMPRESA_ID);
    existing = retry.data;
    exErr = retry.error;
  }

  if (exErr) {
    console.error('Error leyendo tabla existente:', exErr.message);
    return 1;
  }

  const prev = new Map((existing ?? []).map((r) => [r.vehiculo_referencia, r]));
  const realUpdates = unique.filter((r) => {
    const p = prev.get(r.vehiculo_referencia);
    return p && !inversionRowUnchanged(p, r, invCompareFields);
  }).length;
  const realInserts = unique.filter((r) => !prev.has(r.vehiculo_referencia)).length;
  const realUnchanged = unique.filter((r) => {
    const p = prev.get(r.vehiculo_referencia);
    return p && inversionRowUnchanged(p, r, invCompareFields);
  }).length;

  console.log('Registros a insertar:', realInserts);
  console.log('Registros a actualizar (cambió algún campo respecto a la BD):', realUpdates);
  console.log('Sin cambios (idempotente):', realUnchanged);

  if (dryRun || !allowWrite) {
    if (!allowWrite && !dryRun) console.warn('Falta ALLOW_IMPORT_INVERSIONES_GENERALES=1');
    console.log(dryRun ? 'Fin DRY_RUN (no se escribió).' : 'Abortado: define ALLOW_IMPORT_INVERSIONES_GENERALES=1');
    return 0;
  }

  const chunk = 40;
  for (let i = 0; i < unique.length; i += chunk) {
    const part = unique.slice(i, i + chunk).map(({ _import_meta, ...row }) => row);
    const { error } = await supabase.from('inversiones_generales_vehiculo').upsert(part, {
      onConflict: 'empresa_id,vehiculo_referencia',
    });
    if (error) {
      console.error('Upsert error:', error.message);
      return 1;
    }
  }
  console.log('Upsert OK:', unique.length, 'filas.');
  return 0;
}

const exitCode = await mainAsync().catch((e) => {
  console.error(e);
  return 1;
});
process.exitCode = exitCode ?? 0;
