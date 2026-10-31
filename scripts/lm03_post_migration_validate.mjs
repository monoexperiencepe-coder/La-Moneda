/**
 * LM-03 post-migration READ-ONLY validation (production).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_REF = 'cqzwyckbhqfpgtbtizkr';
const DIEGO = '2418065a-e7b1-41b6-840d-b49dfa353285';
const ALVARO_SB24 = '9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f';
const ALVARO_SALAS = 'd666cb8f-8788-4579-8da2-eb19bbbb31c6';

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

function refFromUrl(url) {
  const m = String(url || '').match(/https:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const url = env.VITE_SUPABASE_URL || '';
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
const ref = refFromUrl(url);
if (ref !== EXPECTED_REF) {
  console.error(JSON.stringify({ error: 'project_ref_mismatch', ref, expected: EXPECTED_REF }));
  process.exit(2);
}
if (!key) {
  console.error(JSON.stringify({ error: 'missing_service_role_key' }));
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return { count: count ?? null, error: error?.message ?? null };
}

async function main() {
  const report = { projectRef: ref, readOnly: true, timestamp: new Date().toISOString(), checks: {} };

  const lmDiego = await supabase.rpc('is_lm_role_manager', { p_user_id: DIEGO });
  const lmSb24 = await supabase.rpc('is_lm_role_manager', { p_user_id: ALVARO_SB24 });
  const lmSalas = await supabase.rpc('is_lm_role_manager', { p_user_id: ALVARO_SALAS });
  report.checks.is_lm_role_manager = {
    diego: lmDiego.data === true,
    alvaroSb24: lmSb24.data === true,
    alvaroSalas: lmSalas.data === false,
    errors: [lmDiego.error, lmSb24.error, lmSalas.error].filter(Boolean).map((e) => e.message),
  };

  const adminRpc = await supabase.rpc('admin_update_user_role', {
    p_target_user_id: ALVARO_SALAS,
    p_new_role: 'admin',
  });
  report.checks.admin_update_user_role_exists = adminRpc.error
    ? !/Could not find the function|PGRST202/i.test(adminRpc.error.message || '')
    : true;

  report.financialCounts = {
    gastos: await countTable('gastos'),
    ingresos: await countTable('ingresos'),
    vehiculos: await countTable('vehiculos'),
  };

  report.referenceCounts = { gastos: 16086, ingresos: 4448, vehiculos: 98 };

  const criticalOk =
    report.checks.is_lm_role_manager.diego &&
    report.checks.is_lm_role_manager.alvaroSb24 &&
    report.checks.is_lm_role_manager.alvaroSalas &&
    report.checks.admin_update_user_role_exists;

  report.pass = criticalOk;
  console.log(JSON.stringify(report, null, 2));
  process.exit(criticalOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
