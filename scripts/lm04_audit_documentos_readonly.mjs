/**
 * LM-04 — Auditoría read-only documentos (control_fechas) prod.
 * No imprime claves ni contraseñas.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const url = env.VITE_SUPABASE_URL || '';
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
const empresa = env.VITE_EMPRESA_ID || '';

if (!url || !key) {
  console.error(JSON.stringify({ error: 'missing_supabase_env' }));
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: byPlaca, error: e1 } = await supabase
  .from('vehiculos')
  .select('id,numero_unidad,placa,marca,modelo,activo,empresa_id')
  .eq('placa', 'CMF620')
  .maybeSingle();

const { data: byNumero, error: e2 } = await supabase
  .from('vehiculos')
  .select('id,numero_unidad,placa,marca,modelo,activo,empresa_id')
  .in('numero_unidad', [99, 100])
  .order('numero_unidad');

const vehicleIds = new Set();
if (byPlaca?.id != null) vehicleIds.add(byPlaca.id);
for (const v of byNumero ?? []) {
  if (v.id != null) vehicleIds.add(v.id);
}

const ids = [...vehicleIds];
let controlFechas = [];
if (ids.length) {
  const { data, error } = await supabase
    .from('control_fechas')
    .select('id,vehicle_id,tipo,fecha_vencimiento,fecha_registro,comentarios,empresa_id,created_at')
    .in('vehicle_id', ids)
    .order('created_at', { ascending: false });
  if (error) controlFechas = { error: error.message };
  else controlFechas = data ?? [];
}

let rpcLatest = null;
if (empresa) {
  const { data, error } = await supabase.rpc('fetch_latest_control_fechas_by_vehicle', {
    p_empresa_id: empresa,
  });
  const rows = data ?? [];
  const filtered = rows.filter((r) => ids.includes(r.vehicle_id));
  rpcLatest = error
    ? { error: error.message }
    : { total: rows.length, subset: filtered, sampleTipos196: filtered.filter((r) => r.vehicle_id === 196).map((r) => r.tipo) };
}

const mismatch = [];
for (const v of byNumero ?? []) {
  if (v.numero_unidad === v.id) continue;
  mismatch.push({
    id: v.id,
    numero_unidad: v.numero_unidad,
    placa: v.placa,
    note: v.numero_unidad !== v.id ? 'id !== numero_unidad' : null,
  });
}

console.log(
  JSON.stringify(
    {
      readOnly: true,
      timestamp: new Date().toISOString(),
      placa_CMF620: byPlaca ?? (e1 ? { error: e1.message } : null),
      unidades_99_100: byNumero ?? (e2 ? { error: e2.message } : null),
      id_vs_numero_unidad: mismatch,
      control_fechas_for_these_ids: controlFechas,
      rpc_latest_subset: rpcLatest,
    },
    null,
    2,
  ),
);
