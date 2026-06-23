/**
 * Auditoría READ-ONLY: vehiculos.id vs número visual de unidad.
 * Uso: node scripts/audit_vehicle_ids_readonly.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const envFile of ['.env', '.env.local']) {
  try {
    const envPath = resolve(process.cwd(), envFile);
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* opcional */
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const EMPRESA_ID = (process.env.EMPRESA_ID ?? process.env.VITE_EMPRESA_ID ?? '').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countTable(table, vehicleCol = 'vehicle_id') {
  const { count, error } = await supabase
    .from(table)
    .select(vehicleCol, { count: 'exact', head: true })
    .not(vehicleCol, 'is', null);
  if (error) return { table, error: error.message, count: null };
  return { table, count: count ?? 0 };
}

async function distinctVehicles(table, vehicleCol = 'vehicle_id') {
  const all = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(vehicleCol)
      .not(vehicleCol, 'is', null)
      .range(from, from + page - 1);
    if (error) return { table, error: error.message, ids: [] };
    const rows = data ?? [];
    for (const r of rows) {
      const id = Number(r[vehicleCol]);
      if (Number.isFinite(id)) all.push(id);
    }
    if (rows.length < page) break;
    from += page;
  }
  return { table, ids: [...new Set(all)] };
}

// Fetch all vehiculos
const vehiculos = [];
{
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = supabase.from('vehiculos').select('id, placa, marca, modelo, activo, created_at, empresa_id');
    if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
    const { data, error } = await q.order('id').range(from, from + page - 1);
    if (error) {
      console.error('Error vehiculos:', error.message);
      process.exit(1);
    }
    vehiculos.push(...(data ?? []));
    if ((data ?? []).length < page) break;
    from += page;
  }
}

const ids = vehiculos.map((v) => Number(v.id)).filter(Number.isFinite);
const maxId = ids.length ? Math.max(...ids) : 0;
const minId = ids.length ? Math.min(...ids) : 0;
const activos = vehiculos.filter((v) => v.activo === true);
const inactivos = vehiculos.filter((v) => v.activo === false);

const missing = [];
for (let i = minId; i <= maxId; i += 1) {
  if (!ids.includes(i)) missing.push(i);
}

// unidades table
let unidadesCount = null;
let unidadesWithVehicle = null;
{
  let q = supabase.from('unidades').select('id, vehicle_id, numero_interno', { count: 'exact' });
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
  const { count, data, error } = await q.limit(5);
  if (!error) {
    unidadesCount = count ?? 0;
    unidadesWithVehicle = (data ?? []).filter((u) => u.vehicle_id != null).length;
  }
}

// inversiones_generales vehiculo_numero
let invGenSample = [];
{
  let q = supabase
    .from('inversiones_generales_vehiculo')
    .select('vehiculo_numero, vehiculo_referencia, placa')
    .limit(10);
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
  const { data } = await q;
  invGenSample = data ?? [];
}

const refTables = [
  'ingresos',
  'gastos',
  'conductores',
  'control_fechas',
  'kilometrajes',
  'vehicle_downtime',
  'inversiones_vehiculo',
  'inversiones_generales_vehiculo',
  'caja_negocio_vehiculo',
  'pendientes',
  'registros_tiempo',
  'unidades',
];

const refCounts = [];
for (const t of refTables) {
  const col = t === 'inversiones_generales_vehiculo' ? 'vehiculo_numero' : 'vehicle_id';
  if (t === 'inversiones_generales_vehiculo') {
    let q = supabase.from(t).select(col, { count: 'exact', head: true }).not(col, 'is', null);
    if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
    const { count, error } = await q;
    refCounts.push({ table: t, column: col, count: error ? null : count ?? 0, error: error?.message });
  } else {
    let q = supabase.from(t).select(col, { count: 'exact', head: true }).not(col, 'is', null);
    if (EMPRESA_ID && t !== 'vehicle_downtime') {
      try {
        q = q.eq('empresa_id', EMPRESA_ID);
      } catch {
        /* some tables may not have empresa_id filter in client */
      }
    }
    const { count, error } = await q;
    refCounts.push({ table: t, column: col, count: error ? null : count ?? 0, error: error?.message });
  }
}

// orphan vehicle_ids in ingresos (sample)
const vehicleIdSet = new Set(ids);
const orphanSamples = {};
for (const t of ['ingresos', 'gastos', 'kilometrajes']) {
  const { ids: used } = await distinctVehicles(t);
  const orphans = used.filter((id) => !vehicleIdSet.has(id));
  orphanSamples[t] = { usedDistinct: used.length, orphans: orphans.slice(0, 20), orphanCount: orphans.length };
}

// Check columns on vehiculos via information_schema not available via supabase client easily
// Infer from first row keys
const vehiculoColumns = vehiculos[0] ? Object.keys(vehiculos[0]) : [];

const report = {
  auditedAt: new Date().toISOString(),
  empresaIdFilter: EMPRESA_ID || '(todas)',
  vehiculos: {
    total: vehiculos.length,
    activos: activos.length,
    inactivos: inactivos.length,
    minId,
    maxId,
    idsFaltantesEntreMinYMax: missing.length,
    idsFaltantesMuestra: missing.slice(0, 30),
    idsFaltantesUltimos: missing.slice(-10),
    columnasDetectadas: vehiculoColumns,
    tieneNumeroUnidad: vehiculoColumns.some((c) =>
      /numero_unidad|unidad_numero|orden_flota|codigo_unidad|numero_interno/.test(c),
    ),
    ultimosCreados: [...vehiculos]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5)
      .map((v) => ({ id: v.id, placa: v.placa, activo: v.activo, created_at: v.created_at })),
    ultimoId: maxId,
    siguienteIdEstimado: maxId + 1,
    brechaIdVsConteo: maxId - vehiculos.length,
  },
  unidadesTabla: {
    totalFilas: unidadesCount,
    muestra: unidadesCount != null ? 'ver unidades.numero_interno + vehicle_id' : 'tabla no accesible o vacía',
  },
  inversionesGeneralesMuestra: invGenSample,
  referenciasPorTabla: refCounts,
  huerfanosVehicleId: orphanSamples,
  notaSecuencia:
    'La secuencia Postgres (vehiculos_id_seq) no es consultable vía Supabase REST; usar SQL en SQL Editor.',
};

const outPath = resolve(process.cwd(), 'scripts', 'audit_vehicle_ids_output.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
console.log(JSON.stringify(report, null, 2));
console.log(`\nGuardado: ${outPath}`);
