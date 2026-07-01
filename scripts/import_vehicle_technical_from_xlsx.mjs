/**
 * Backfill ficha técnica en public.vehiculos desde Excel "caracteristica auto".
 *
 * DRY_RUN por defecto. Escritura: DRY_RUN=0 y ALLOW_IMPORT_VEHICLE_TECHNICAL=1
 *
 * Match por placa normalizada (ignora guiones/espacios). NO crea vehículos nuevos.
 * NO modifica id ni numero_unidad.
 *
 * Uso:
 *   node scripts/import_vehicle_technical_from_xlsx.mjs [ruta.xlsx]
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync, existsSync, writeFileSync } from 'fs';
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
const allowWrite = env.ALLOW_IMPORT_VEHICLE_TECHNICAL === '1';

function normalizePlaca(placa) {
  return String(placa ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function placaMatchKey(placa) {
  return normalizePlaca(placa).replace(/[^A-Z0-9]/g, '');
}

function normHeaderKey(k) {
  return String(k ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[#.]/g, '')
    .replace(/\s/g, '_');
}

function cellStr(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  return String(v).trim();
}

function cellInt(v) {
  const s = cellStr(v);
  if (s === '') return null;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const HEADER_ALIASES = {
  placa: ['PLACA'],
  combustible: ['COMBUSTIBLE'],
  color: ['COLOR'],
  tipo_carroceria: ['TIPO_CARROCERIA', 'TIPO CARROCERIA', 'TIPO_CARROCERÍA'],
  numero_motor: ['N_MOTOR', 'N MOTOR', 'NUMERO_MOTOR'],
  cantidad_llaves: ['LLAVES', '_LLAVES', 'CANTIDAD_LLAVES'],
  gps_1: ['GPS_1', 'GPS 1', '_GPS_1'],
  gps_2: ['GPS_2', 'GPS 2', '_GPS_2'],
  impuesto: ['IMPUESTO'],
  km_inicial: ['KM_INICIAL', 'KM INICIAL'],
  tarjeta_propiedad: ['TARJ_PROPIEDAD', 'TARJ PROPIEDAD', 'TARJETA_PROPIEDAD'],
  propietario_nombre: ['PROPIETARIO', 'PROPIETARIO_NOMBRE'],
  numero_excel: ['N', 'N°', 'NO', 'NUMERO', 'NUMERO_UNIDAD'],
  marca: ['MARCA'],
  modelo: ['MODELO'],
  anio: ['ANO', 'AÑO', 'ANIO'],
};

function resolveColumn(headers, field) {
  const aliases = HEADER_ALIASES[field] ?? [];
  for (const h of headers) {
    const nk = normHeaderKey(h);
    for (const a of aliases) {
      if (nk === normHeaderKey(a)) return h;
    }
  }
  return null;
}

const xlsxArg = process.argv[2]?.trim();
const candidates = [
  xlsxArg,
  env.VEHICLE_TECHNICAL_XLSX,
  resolve(root, 'caracteristica auto (2).xlsx'),
  resolve(process.env.USERPROFILE || '', 'Downloads/caracteristica auto (2).xlsx'),
  'C:\\Users\\alkan\\Downloads\\caracteristica auto (2).xlsx',
].filter(Boolean);

const xlsxPath = candidates.map((p) => (isAbsolute(p) ? p : resolve(root, p))).find((p) => existsSync(p));

if (!xlsxPath) {
  console.error('No se encontró el Excel. Pase la ruta como argumento o defina VEHICLE_TECHNICAL_XLSX.');
  process.exitCode = 1;
  process.exit(1);
}

if (!url || !serviceKey) {
  console.error('Faltan VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exitCode = 1;
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const wb = XLSX.readFile(xlsxPath);
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

if (rows.length === 0) {
  console.error('Excel vacío');
  process.exitCode = 1;
  process.exit(1);
}

const headers = Object.keys(rows[0]);
const cols = {};
for (const field of Object.keys(HEADER_ALIASES)) {
  cols[field] = resolveColumn(headers, field);
}

if (!cols.placa) {
  console.error('No se encontró columna PLACA. Headers:', headers);
  process.exitCode = 1;
  process.exit(1);
}

const { data: vehicles, error: vehErr } = await supabase
  .from('vehiculos')
  .select('id, placa, numero_unidad, marca, modelo, anio, combustible, color, tipo_carroceria, numero_motor, cantidad_llaves, gps_1, gps_2, impuesto, km_inicial, tarjeta_propiedad, propietario_nombre')
  .eq('empresa_id', EMPRESA_ID);

if (vehErr) {
  console.error('[vehiculos fetch]', vehErr.message);
  process.exitCode = 1;
  process.exit(1);
}

const byPlaca = new Map();
for (const v of vehicles ?? []) {
  const key = placaMatchKey(v.placa);
  if (!key) continue;
  if (byPlaca.has(key)) {
    byPlaca.get(key).duplicates = true;
  } else {
    byPlaca.set(key, { vehicle: v, duplicates: false });
  }
}

const report = {
  excelPath: xlsxPath,
  sheetName,
  totalFilasExcel: rows.length,
  placasEncontradas: [],
  placasNoEncontradas: [],
  conflictos: [],
  actualizados: [],
  sinCambios: [],
  camposActualizados: {},
  dryRun,
};

function bumpField(f) {
  report.camposActualizados[f] = (report.camposActualizados[f] ?? 0) + 1;
}

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const placaRaw = cellStr(row[cols.placa]);
  if (!placaRaw) continue;

  const key = placaMatchKey(placaRaw);
  const match = byPlaca.get(key);

  if (!match) {
    report.placasNoEncontradas.push({ fila: i + 2, placa: placaRaw });
    continue;
  }

  if (match.duplicates) {
    report.conflictos.push({
      placa: placaRaw,
      motivo: 'Múltiples vehículos con la misma placa normalizada en BD',
    });
    continue;
  }

  const v = match.vehicle;
  const patch = {};

  const setText = (field, colKey, dbKey) => {
    if (!cols[colKey]) return;
    const val = cellStr(row[cols[colKey]]);
    if (val === '') return;
    const cur = v[dbKey];
    const curNorm = cur == null ? '' : String(cur).trim();
    if (curNorm !== '' && curNorm.toUpperCase() !== val.toUpperCase()) {
      report.conflictos.push({
        placa: placaRaw,
        campo: dbKey,
        bd: curNorm,
        excel: val,
        motivo: 'Valor distinto en BD (no se sobrescribe en dry-run conflict check)',
      });
      return;
    }
    if (curNorm !== val) {
      patch[dbKey] = val;
      bumpField(dbKey);
    }
  };

  const setInt = (colKey, dbKey) => {
    if (!cols[colKey]) return;
    const val = cellInt(row[cols[colKey]]);
    if (val == null) return;
    const cur = v[dbKey];
    if (cur != null && cur !== val) {
      report.conflictos.push({
        placa: placaRaw,
        campo: dbKey,
        bd: cur,
        excel: val,
        motivo: 'Valor numérico distinto en BD',
      });
      return;
    }
    if (cur !== val) {
      patch[dbKey] = val;
      bumpField(dbKey);
    }
  };

  setText('combustible', 'combustible', 'combustible');
  setText('color', 'color', 'color');
  setText('tipo_carroceria', 'tipo_carroceria', 'tipo_carroceria');
  setText('numero_motor', 'numero_motor', 'numero_motor');
  setInt('cantidad_llaves', 'cantidad_llaves');
  setText('gps_1', 'gps_1', 'gps_1');
  setText('gps_2', 'gps_2', 'gps_2');
  setText('impuesto', 'impuesto', 'impuesto');
  setInt('km_inicial', 'km_inicial');
  setText('tarjeta_propiedad', 'tarjeta_propiedad', 'tarjeta_propiedad');
  setText('propietario_nombre', 'propietario_nombre', 'propietario_nombre');

  const numeroExcel = cols.numero_excel ? cellInt(row[cols.numero_excel]) : null;
  if (numeroExcel != null && v.numero_unidad != null && v.numero_unidad !== numeroExcel) {
    report.conflictos.push({
      placa: placaRaw,
      campo: 'numero_unidad',
      bd: v.numero_unidad,
      excel: numeroExcel,
      motivo: 'N° Excel ≠ numero_unidad (no se modifica numero_unidad)',
    });
  }

  if (Object.keys(patch).length === 0) {
    report.sinCambios.push({ placa: placaRaw, id: v.id });
    report.placasEncontradas.push({ placa: placaRaw, id: v.id, actualizado: false });
    continue;
  }

  report.placasEncontradas.push({ placa: placaRaw, id: v.id, actualizado: true, patch });

  if (dryRun || !allowWrite) {
    report.actualizados.push({ placa: placaRaw, id: v.id, patch, modo: 'dry-run' });
    continue;
  }

  const { error: upErr } = await supabase.from('vehiculos').update(patch).eq('id', v.id).eq('empresa_id', EMPRESA_ID);

  if (upErr) {
    report.conflictos.push({ placa: placaRaw, motivo: `Error UPDATE: ${upErr.message}` });
  } else {
    report.actualizados.push({ placa: placaRaw, id: v.id, patch, modo: 'applied' });
  }
}

const reportMd = `# VEHICLE_TECHNICAL_INFO_IMPORT_REPORT

Generado: ${new Date().toISOString()}

## Fuente

- Excel: \`${xlsxPath}\`
- Hoja: \`${sheetName}\`
- Empresa: \`${EMPRESA_ID}\`
- Modo: ${dryRun ? 'DRY RUN (sin escritura)' : allowWrite ? 'ESCRITURA' : 'DRY RUN (ALLOW_IMPORT_VEHICLE_TECHNICAL≠1)'}

## Resumen

| Métrica | Valor |
|---------|------:|
| Total filas Excel | ${report.totalFilasExcel} |
| Placas encontradas | ${report.placasEncontradas.length} |
| Placas no encontradas | ${report.placasNoEncontradas.length} |
| Actualizaciones ${dryRun ? 'propuestas' : 'aplicadas'} | ${report.actualizados.length} |
| Sin cambios | ${report.sinCambios.length} |
| Conflictos reportados | ${report.conflictos.length} |

## Campos actualizados (conteo)

${Object.entries(report.camposActualizados)
  .map(([k, n]) => `- \`${k}\`: ${n}`)
  .join('\n') || '- (ninguno)'}

## Placas no encontradas

${report.placasNoEncontradas.length === 0 ? '_Ninguna_' : report.placasNoEncontradas.map((x) => `- Fila ${x.fila}: \`${x.placa}\``).join('\n')}

## Conflictos

${report.conflictos.length === 0 ? '_Ninguno_' : report.conflictos.slice(0, 50).map((c) => `- \`${c.placa ?? '?'}\` ${c.campo ? `\`${c.campo}\`: BD=${c.bd} Excel=${c.excel}` : c.motivo}`).join('\n')}

## Ejemplo CAU677 / Unidad #83

Buscar en actualizados: placa que normaliza a CAU677.

${(() => {
  const cau = report.placasEncontradas.find((p) => placaMatchKey(p.placa) === 'CAU677');
  if (!cau) return '_Placa CAU677 no encontrada en Excel o BD._';
  const upd = report.actualizados.find((u) => placaMatchKey(u.placa) === 'CAU677');
  return upd
    ? `Encontrada id=${cau.id}. Patch: \`${JSON.stringify(upd.patch)}\``
    : `Encontrada id=${cau.id}. Sin cambios pendientes (datos ya alineados o conflicto).`;
})()}

## Cómo aplicar en producción

1. Ejecutar \`supabase/migration_vehiculos_ficha_tecnica.sql\` en Supabase.
2. \`node scripts/import_vehicle_technical_from_xlsx.mjs "ruta/al/excel.xlsx"\` (dry run).
3. Revisar conflictos en este reporte.
4. \`DRY_RUN=0 ALLOW_IMPORT_VEHICLE_TECHNICAL=1 node scripts/import_vehicle_technical_from_xlsx.mjs "..."\`
`;

const reportPath = resolve(root, 'VEHICLE_TECHNICAL_INFO_IMPORT_REPORT.md');
writeFileSync(reportPath, reportMd, 'utf8');

console.log(JSON.stringify({
  excel: xlsxPath,
  totalFilasExcel: report.totalFilasExcel,
  encontradas: report.placasEncontradas.length,
  noEncontradas: report.placasNoEncontradas.length,
  actualizados: report.actualizados.length,
  conflictos: report.conflictos.length,
  dryRun,
  reportPath,
}, null, 2));

if (!dryRun && !allowWrite) {
  console.error('Escritura bloqueada: defina ALLOW_IMPORT_VEHICLE_TECHNICAL=1');
  process.exitCode = 1;
}
