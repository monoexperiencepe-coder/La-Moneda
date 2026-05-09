/**
 * Lee aportes_prestamos_normalizado_migracion_v2_moneda*.xlsx y escribe SQL seed idempotente
 * para prestamos_financieros (UPSERT) + prestamos_tramos (UPSERT con índice único).
 *
 * Uso:
 *   node scripts/generate_prestamos_financieros_migration_seed.mjs [ruta.xlsx] [empresa_uuid]
 *
 * Si no pasas Excel, prueba rutas por defecto (proyecto + Downloads).
 * Si no pasas UUID, usa la empresa del deploy actual (VITE_EMPRESA_ID).
 */
import XLSX from 'xlsx';
import { existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_EMPRESA_UUID = '07593982-08e6-450c-8abe-4bf590609dd7';

function sqlStr(s) {
  if (s == null || s === '') return "''";
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlNum(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return 'NULL';
  return String(Number(n));
}

function sqlBoolSiNo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'si' || s === 'true' || s === '1' ? 'true' : 'false';
}

function excelSerialToISO(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const parsed = XLSX.SSF.parse_date_code(n);
  if (!parsed) return null;
  const y = parsed.y;
  const m = parsed.m;
  const d = Math.floor(parsed.d);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function sqlDateFromExcel(v) {
  if (v === '' || v == null) return 'NULL';
  if (typeof v === 'number') {
    const iso = excelSerialToISO(v);
    return iso ? sqlStr(iso) : 'NULL';
  }
  const s = String(v).trim().slice(0, 10);
  if (!s) return 'NULL';
  return sqlStr(s);
}

function mapMoneda(raw, prestamoCodigo) {
  const u = String(raw ?? '').trim().toUpperCase();
  if (u === 'PEN' || u === 'USD') return u;
  return 'USD';
}

const empresaUuid = (process.argv[3] || DEFAULT_EMPRESA_UUID).trim();

const candidates = [
  process.argv[2],
  resolve(process.cwd(), 'aportes_prestamos_normalizado_migracion_v2_moneda.xlsx'),
  'C:\\Users\\alkan\\Downloads\\aportes_prestamos_normalizado_migracion_v2_moneda.xlsx',
  'C:\\Users\\alkan\\Downloads\\aportes_prestamos_normalizado_migracion_v2_moneda (1).xlsx',
].filter(Boolean);

const xlsxPath = candidates.find((p) => existsSync(p));
if (!xlsxPath) {
  console.error(
    'No se encontró el Excel. Coloca aportes_prestamos_normalizado_migracion_v2_moneda.xlsx en la raíz del proyecto o en Downloads, o pasa la ruta:',
    '\n  node scripts/generate_prestamos_financieros_migration_seed.mjs "C:\\\\ruta\\\\archivo.xlsx"',
  );
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const pf = XLSX.utils.sheet_to_json(wb.Sheets['prestamos_financieros'], { defval: '' });
const pt = XLSX.utils.sheet_to_json(wb.Sheets['prestamos_tramos'], { defval: '' });

let sql = `-- Auto-generado por scripts/generate_prestamos_financieros_migration_seed.mjs
-- Fuente: ${xlsxPath.replace(/\\/g, '/')}
-- empresa_id fijo (debe existir en public.empresas): ${empresaUuid}
-- Idempotente: préstamos por (empresa_id, codigo); tramos por (prestamo_financiero_id, orden).

create unique index if not exists prestamos_tramos_prestamo_orden_uidx
  on public.prestamos_tramos (prestamo_financiero_id, orden);

do $$
declare
  eid uuid;
  eid_override uuid := '${empresaUuid}'::uuid;
begin
  if eid_override is not null then
    eid := eid_override;
  else
    select emp.id into eid from public.empresas emp order by emp.id asc limit 1;
  end if;
  if eid is null then
    raise notice 'seed prestamos: sin empresas — revisa eid_override / tabla empresas';
    return;
  end if;
  if not exists (select 1 from public.empresas where id = eid) then
    raise exception 'seed prestamos: empresa_id % no existe en public.empresas', eid;
  end if;

`;

for (const row of pf) {
  const codigo = String(row.prestamo_codigo ?? '').trim();
  if (!codigo) continue;
  const monedaRaw = row.moneda;
  const moneda = mapMoneda(monedaRaw, codigo);
  let notas = String(row.observaciones ?? '').trim();
  const mr = String(row.moneda_revision ?? '').trim();
  if (String(monedaRaw).toUpperCase() === 'REVISAR' || String(monedaRaw).trim() === '') {
    notas =
      (notas ? notas + ' | ' : '') +
      `Excel moneda=${String(monedaRaw)}; revisión: ${mr || '—'}`;
  }

  sql += `  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      ${sqlStr(codigo)},
      ${sqlStr(row.prestamista)},
      ${sqlStr(moneda)},
      ${sqlNum(row.monto_original)},
      ${sqlNum(row.capital_actual_estimado)},
      ${sqlNum(row.tasa_anual)},
      ${sqlNum(row.interes_mensual_actual)},
      ${sqlDateFromExcel(row.fecha_inicio)}::date,
      ${sqlStr(String(row.estado || 'activo').toLowerCase())},
      ${row.fecha_cancelacion === '' || row.fecha_cancelacion == null ? 'NULL' : sqlDateFromExcel(row.fecha_cancelacion) + '::date'},
      ${sqlBoolSiNo(row.requiere_tramos)},
      ${sqlStr(notas)}
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

`;
}

sql += `end $$;

`;

sql += `do $$
declare
  eid uuid;
  eid_override uuid := '${empresaUuid}'::uuid;
  pid bigint;
begin
  if eid_override is not null then
    eid := eid_override;
  else
    select emp.id into eid from public.empresas emp order by emp.id asc limit 1;
  end if;
  if eid is null then return;
  end if;

`;

for (const row of pt) {
  const ref = String(row.prestamo_codigo_referencia ?? '').trim();
  if (!ref) continue;
  const moneda = mapMoneda(row.moneda, ref);
  const interes = row.interes_mensual;
  const interesSql = interes === '' || interes == null ? 'NULL' : sqlNum(interes);

  sql += `  select pf.id into pid from public.prestamos_financieros pf
    where pf.empresa_id = eid and pf.codigo = ${sqlStr(ref)} limit 1;
  if pid is not null then
    insert into public.prestamos_tramos (
      prestamo_financiero_id, moneda, capital_referencial, tasa_anual, interes_mensual,
      desde, hasta, evento, nota, orden
    ) values (
      pid,
      ${sqlStr(moneda)},
      ${sqlNum(row.capital_referencial)},
      ${sqlNum(row.tasa_anual)},
      ${interesSql},
      ${sqlDateFromExcel(row.desde)}::date,
      ${row.hasta === '' || row.hasta == null ? 'NULL' : sqlDateFromExcel(row.hasta) + '::date'},
      ${sqlStr(row.evento)},
      ${sqlStr(row.nota)},
      ${sqlNum(row.tramo)}
    )
    on conflict (prestamo_financiero_id, orden) do update set
      moneda = excluded.moneda,
      capital_referencial = excluded.capital_referencial,
      tasa_anual = excluded.tasa_anual,
      interes_mensual = excluded.interes_mensual,
      desde = excluded.desde,
      hasta = excluded.hasta,
      evento = excluded.evento,
      nota = excluded.nota;
  end if;

`;
}

sql += `end $$;
`;

const outPath = resolve(__dirname, '../supabase/migration_prestamos_financieros_seed_from_xlsx.sql');
writeFileSync(outPath, sql, 'utf8');
console.log('Written:', outPath, '| Excel:', xlsxPath, '| empresa:', empresaUuid);
