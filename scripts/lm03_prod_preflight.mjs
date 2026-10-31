/**
 * LM-03 preflight READ-ONLY contra Supabase (service role).
 * No escribe datos ni roles.
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

async function rpcExists(name) {
  const { error: rpcErr } = await supabase.rpc(name, {
    p_target_user_id: '00000000-0000-0000-0000-000000000000',
    p_new_role: 'admin',
  });
  if (!rpcErr) return true;
  const msg = rpcErr.message || '';
  const code = rpcErr.code || '';
  if (msg.includes('Could not find the function') || code === 'PGRST202') return false;
  return 'present_not_invokable_without_jwt';
}

async function main() {
  const report = { projectRef: ref, readOnly: true, timestamp: new Date().toISOString() };

  const { data: profiles, error: pErr } = await supabase
    .from('user_profiles')
    .select('id,email,role,is_active,empresa_id')
    .in('id', [DIEGO, ALVARO_SB24, ALVARO_SALAS]);
  report.identities = { error: pErr?.message ?? null, rows: profiles ?? [] };

  const { data: roleCounts } = await supabase.from('user_profiles').select('role');
  const counts = {};
  for (const r of roleCounts ?? []) {
    counts[r.role] = (counts[r.role] ?? 0) + 1;
  }
  report.roleDistribution = counts;

  const { count: logCount, error: logErr } = await supabase
    .from('user_role_change_log')
    .select('*', { count: 'exact', head: true });
  report.lm03Objects = {
    user_role_change_log: logErr ? { exists: false, error: logErr.message } : { exists: true, rowCount: logCount },
  };

  report.rpc_admin_update_user_role = await rpcExists('admin_update_user_role');
  const lm = await rpcExists('is_lm_role_manager');
  report.rpc_is_lm_role_manager = lm;

  const { data: logRows, error: logSelectErr } = await supabase
    .from('user_role_change_log')
    .select('id')
    .limit(1);
  report.auditLogReadable = logSelectErr
    ? { ok: false, error: logSelectErr.message }
    : { ok: true, sampleRows: logRows?.length ?? 0 };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
