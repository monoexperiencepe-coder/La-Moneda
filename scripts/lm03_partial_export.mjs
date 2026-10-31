/**
 * LM-03 partial backup (read-only) — user_profiles + repo snapshot of replaced policy.
 * Output: %LOCALAPPDATA%\LaMoneda\backups\lm03-partial-<ts>\
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';
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

function sha256File(path) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex');
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const url = env.VITE_SUPABASE_URL || '';
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(
  process.env.LOCALAPPDATA || 'C:\\Users\\Public',
  'LaMoneda',
  'backups',
  `lm03-partial-${ts}`,
);
mkdirSync(outDir, { recursive: true });

const manifest = {
  type: 'lm03_partial_backup',
  projectRef: 'cqzwyckbhqfpgtbtizkr',
  createdUtc: new Date().toISOString(),
  files: [],
  roleDistributionBefore: null,
  financialSmoke: null,
};

if (!url || !key) {
  manifest.error = 'missing_supabase_url_or_service_role';
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error('BLOQUEADO: falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: profiles, error: pErr } = await supabase
  .from('user_profiles')
  .select('id,email,role,is_active,empresa_id,name,created_at')
  .order('email');
if (pErr) {
  manifest.error = pErr.message;
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error('BLOQUEADO:', pErr.message);
  process.exit(2);
}

const profilesPath = join(outDir, 'user_profiles_export.json');
writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
manifest.files.push({
  name: 'user_profiles_export.json',
  rows: profiles.length,
  sha256: sha256File(profilesPath),
});

const counts = {};
for (const r of profiles) counts[r.role] = (counts[r.role] ?? 0) + 1;
manifest.roleDistributionBefore = counts;

const finTables = ['gastos', 'ingresos', 'vehiculos'];
for (const table of finTables) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  manifest.financialSmoke = manifest.financialSmoke || {};
  manifest.financialSmoke[table] = error ? { ok: false, error: error.message } : { ok: true, count };
}

const repoPolicy = resolve(process.cwd(), 'supabase/migration_empresas_user_profiles_rls_fase1.sql');
const policySnap = join(outDir, 'repo_user_profiles_rls_fase1_reference.sql');
copyFileSync(repoPolicy, policySnap);
manifest.files.push({
  name: 'repo_user_profiles_rls_fase1_reference.sql',
  note: 'Definición de referencia en repo (policy user_profiles_update_admin_tenant pre-LM-03)',
  sha256: sha256File(policySnap),
});

for (const f of ['migration_lm03_user_role_admin.sql', 'rollback_lm03_user_role_admin.sql']) {
  const src = resolve(process.cwd(), 'supabase', f);
  const dst = join(outDir, f);
  copyFileSync(src, dst);
  manifest.files.push({ name: f, sha256: sha256File(dst) });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ok: true, outDir, manifest }, null, 2));
