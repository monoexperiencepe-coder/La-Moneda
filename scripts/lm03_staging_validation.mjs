/**
 * LM-03 — Validación en Supabase STAGING (no producción).
 *
 * Requisitos:
 *   - VITE_SUPABASE_URL apunta a un project ref distinto de prod (cqzwyckbhqfpgtbtizkr)
 *   - LM03_STAGING_CONFIRM=1
 *   - SUPABASE_SERVICE_ROLE_KEY (solo staging)
 *   - Opcional: contraseñas LM03_* para login JWT (usuarios de prueba en staging)
 *
 * Uso:
 *   node scripts/lm03_staging_validation.mjs --dry-run
 *   node scripts/lm03_staging_validation.mjs --apply-migration   # solo staging
 *   node scripts/lm03_staging_validation.mjs --run-tests           # tras migración
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const PROD_PROJECT_REF = 'cqzwyckbhqfpgtbtizkr';

const DIEGO_ID = '2418065a-e7b1-41b6-840d-b49dfa353285';
const ALVARO_SB24_ID = '9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f';
const ALVARO_SALAS_ID = 'd666cb8f-8788-4579-8da2-eb19bbbb31c6';

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

function assertStagingIsolation(url) {
  const ref = refFromUrl(url);
  if (!ref) throw new Error('URL Supabase inválida');
  if (ref === PROD_PROJECT_REF) {
    throw new Error(
      `ABORT: project ref ${ref} es PRODUCCIÓN La Moneda. Configure .env.staging con otro proyecto.`,
    );
  }
  return ref;
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.size === 0;
const applyMigration = args.has('--apply-migration');
const runTests = args.has('--run-tests');

const env = {
  ...loadEnv('.env'),
  ...loadEnv('.env.local'),
  ...loadEnv('.env.staging'),
};
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

let stagingRef;
try {
  stagingRef = assertStagingIsolation(url);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(2);
}

console.log(JSON.stringify({ mode: 'staging-check', projectRef: stagingRef, dryRun }, null, 2));

if (process.env.LM03_STAGING_CONFIRM !== '1' && !dryRun) {
  console.error('ABORT: export LM03_STAGING_CONFIRM=1 para ejecutar en staging.');
  process.exit(2);
}

if (dryRun && !applyMigration && !runTests) {
  console.log('OK dry-run: entorno no es prod. Configure .env.staging y ejecute --apply-migration / --run-tests.');
  process.exit(0);
}

if (applyMigration) {
  if (!serviceKey) {
    console.error('ABORT: falta SUPABASE_SERVICE_ROLE_KEY para aplicar SQL en staging.');
    process.exit(2);
  }
  const sqlPath = resolve(process.cwd(), 'supabase/migration_lm03_user_role_admin.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  console.log(`[migration] ${sqlPath} (${sql.length} chars) → staging ${stagingRef}`);
  if (dryRun) {
    console.log('Dry-run: no se ejecutó SQL.');
  } else {
    console.error(
      'ABORT: aplicación SQL vía API requiere Supabase Management CLI o SQL Editor manual en staging.',
    );
    console.error('Pegue supabase/migration_lm03_user_role_admin.sql en el SQL Editor del proyecto staging.');
    process.exit(2);
  }
}

async function signIn(email, password) {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

async function rpcAs(client, targetId, newRole) {
  const { error } = await client.rpc('admin_update_user_role', {
    p_target_user_id: targetId,
    p_new_role: newRole,
  });
  return error;
}

if (runTests) {
  const testTarget = env.LM03_TEST_TARGET_USER_ID?.trim();
  if (!testTarget) {
    console.error('ABORT: defina LM03_TEST_TARGET_USER_ID (UUID usuario de prueba en staging).');
    process.exit(2);
  }
  const diegoPass = env.LM03_DIEGO_PASSWORD;
  const alvaroPass = env.LM03_ALVARO_SB24_PASSWORD;
  const salasPass = env.LM03_ALVARO_SALAS_PASSWORD;
  if (!diegoPass || !alvaroPass || !salasPass) {
    console.error('ABORT: faltan LM03_*_PASSWORD para JWT tests (solo staging).');
    process.exit(2);
  }

  const results = [];

  const diego = await signIn('diegosb0301@gmail.com', diegoPass);
  results.push({
    case: 'Diego cambia rol test user',
    ok: !(await rpcAs(diego, testTarget, 'admin')),
    note: 'expect ok when target is contador',
  });

  const alvaro = await signIn('alvarosb24@gmail.com', alvaroPass);
  results.push({
    case: 'Álvaro SB24 cambia rol',
    ok: !(await rpcAs(alvaro, testTarget, 'contador')),
  });

  const salas = await signIn('alvarosalasvelarde@gmail.com', salasPass);
  const salasErr = await rpcAs(salas, testTarget, 'admin');
  results.push({
    case: 'Álvaro Salas rechazado',
    ok: Boolean(salasErr),
    error: salasErr?.message,
  });

  const direct = await salas.from('user_profiles').update({ role: 'admin' }).eq('id', testTarget);
  results.push({
    case: 'UPDATE directo role rechazado',
    ok: Boolean(direct.error),
    error: direct.error?.message,
  });

  console.log(JSON.stringify({ stagingRef, results }, null, 2));
}
