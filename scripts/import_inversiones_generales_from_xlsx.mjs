/**
 * Importación idempotente: hoja VALOR DE INVERSION → public.inversiones_generales_vehiculo
 *
 * DRY_RUN por defecto. Escritura: DRY_RUN=0 y ALLOW_IMPORT_INVERSIONES_GENERALES=1
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

function printDryRunDiagnostics(rawHeaders, firstRowRaw, refPick, montoPick, montoRawKeyResolved) {
  console.log('\n--- DIAGNÓSTICO DRY_RUN (hoja VALOR DE INVERSION) ---');
  console.log('Encabezados reales (orden):', JSON.stringify(rawHeaders, null, 2));
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
  console.log('[inversiones_generales] DRY_RUN=', dryRun ? '1 (solo informe)' : '0 (escritura)', 'allowWrite=', allowWrite);

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

  const refPick = pickRefColumn(rawHeaders, firstRowRaw);
  const montoPick = pickMontoColumn(rawHeaders);
  let montoRawKeyResolved = montoPick.rawKey;
  if (!montoRawKeyResolved) {
    montoRawKeyResolved = pickMontoColumnFallbackScan(raw, rawHeaders, refPick.rawKey);
  }

  if (dryRun) {
    printDryRunDiagnostics(rawHeaders, firstRowRaw, refPick, montoPick, montoRawKeyResolved);
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

    parsed.push({
      empresa_id: EMPRESA_ID,
      vehiculo_referencia: ref,
      vehiculo_numero: vehiculoNumero != null && Number.isFinite(vehiculoNumero) ? vehiculoNumero : null,
      placa: placa != null && String(placa).trim() ? String(placa).trim() : null,
      modelo: modelo != null && String(modelo).trim() ? String(modelo).trim() : null,
      monto_total: monto,
      moneda,
      fuente: 'VALOR DE INVERSION',
      observaciones: null,
    });
  }

  const byRef = new Map();
  for (const p of parsed) {
    byRef.set(p.vehiculo_referencia, p);
  }
  const unique = [...byRef.values()];

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

  const { data: existing, error: exErr } = await supabase
    .from('inversiones_generales_vehiculo')
    .select('vehiculo_referencia, monto_total, moneda')
    .eq('empresa_id', EMPRESA_ID);

  if (exErr) {
    console.error('Error leyendo tabla existente:', exErr.message);
    return 1;
  }

  const prev = new Map((existing ?? []).map((r) => [r.vehiculo_referencia, r]));
  const realUpdates = unique.filter((r) => {
    const p = prev.get(r.vehiculo_referencia);
    return p && (Number(p.monto_total) !== r.monto_total || String(p.moneda) !== r.moneda);
  }).length;
  const realInserts = unique.filter((r) => !prev.has(r.vehiculo_referencia)).length;
  const realUnchanged = unique.filter((r) => {
    const p = prev.get(r.vehiculo_referencia);
    return p && Number(p.monto_total) === r.monto_total && String(p.moneda) === r.moneda;
  }).length;

  console.log('Registros a insertar:', realInserts);
  console.log('Registros a actualizar (cambió monto o moneda):', realUpdates);
  console.log('Sin cambios (idempotente):', realUnchanged);

  if (dryRun || !allowWrite) {
    if (!allowWrite && !dryRun) console.warn('Falta ALLOW_IMPORT_INVERSIONES_GENERALES=1');
    console.log(dryRun ? 'Fin DRY_RUN (no se escribió).' : 'Abortado: define ALLOW_IMPORT_INVERSIONES_GENERALES=1');
    return 0;
  }

  const chunk = 40;
  for (let i = 0; i < unique.length; i += chunk) {
    const part = unique.slice(i, i + chunk);
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
