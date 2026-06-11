/**
 * Asigna contraseñas manuales a usuarios finales en Supabase Auth (solo auth.users).
 * No modifica user_profiles, roles, is_active, empresa_id, RLS ni UI.
 *
 * Variables en .env / .env.local (NO commitear):
 *   SUPABASE_URL o VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FINAL_USER_PASSWORD_diegosb0301_at_gmail_com=
 *   FINAL_USER_PASSWORD_alvarosalasvelarde_at_gmail_com=
 *   FINAL_USER_PASSWORD_alvarosb24_at_gmail_com=
 *   FINAL_USER_PASSWORD_psalas0812_at_gmail_com=
 *   FINAL_USER_PASSWORD_edwardhelden30_at_gmail_com=
 *
 * Uso:
 *   node scripts/set_final_user_passwords.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
  }
}

const root = process.cwd();
loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, '.env.local'));

const FINAL_EMAILS = [
  'diegosb0301@gmail.com',
  'alvarosalasvelarde@gmail.com',
  'alvarosb24@gmail.com',
  'psalas0812@gmail.com',
  'edwardhelden30@gmail.com',
];

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR → Faltan SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function passwordEnvKey(email) {
  return `FINAL_USER_PASSWORD_${normEmail(email).replace(/@/g, '_at_').replace(/\./g, '_')}`;
}

function readPassword(email) {
  const key = passwordEnvKey(email);
  const val = process.env[key];
  if (val == null || String(val).trim() === '') {
    return { ok: false, error: `Falta ${key} en .env / .env.local` };
  }
  return { ok: true, password: String(val) };
}

async function findAuthUserByEmail(email, cache) {
  const nk = normEmail(email);
  const hit = cache.find((u) => normEmail(u.email) === nk);
  return hit ?? null;
}

const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error(`ERROR → listUsers: ${listErr.message}`);
  process.exit(1);
}

const authUsers = listData.users;
let fail = 0;

for (const email of FINAL_EMAILS) {
  const passResult = readPassword(email);
  if (!passResult.ok) {
    console.log(`${email} → ERROR (${passResult.error})`);
    fail++;
    continue;
  }

  const user = await findAuthUserByEmail(email, authUsers);
  if (!user) {
    console.log(`${email} → ERROR (usuario no encontrado en auth.users)`);
    fail++;
    continue;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password: passResult.password,
    email_confirm: true,
  });

  if (error) {
    console.log(`${email} → ERROR (${error.message})`);
    fail++;
    continue;
  }

  const confirmed = data.user?.email_confirmed_at != null;
  if (!confirmed) {
    console.log(`${email} → ERROR (password actualizado pero email sigue sin confirmar)`);
    fail++;
    continue;
  }

  console.log(`${email} → OK`);
}

process.exit(fail > 0 ? 1 : 0);
