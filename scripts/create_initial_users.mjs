/**
 * Crea (o actualiza) los usuarios iniciales de La Moneda en Supabase Auth
 * y sus perfiles en la tabla user_profiles.
 *
 * Uso:
 *   node scripts/create_initial_users.mjs
 *
 * Variables de entorno requeridas (en .env o en la sesión):
 *   SUPABASE_URL              — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (nunca anon)
 *   ADMIN_EMAIL / ADMIN_PASSWORD
 *   SOCIO_EMAIL / SOCIO_PASSWORD
 *   CONTADOR_EMAIL / CONTADOR_PASSWORD
 *   OPERADOR_EMAIL / OPERADOR_PASSWORD
 *
 * El script es idempotente: si el usuario ya existe lo actualiza.
 * NO imprime contraseñas en ningún momento.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Cargar .env manualmente (sin depender de dotenv) ─────────────────────────
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env no encontrado — se usan las variables de entorno del shell
}

// ── Validar variables ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Definición de usuarios iniciales ─────────────────────────────────────────
const USERS = [
  {
    role:  'admin',
    email: process.env.ADMIN_EMAIL    ?? '',
    pass:  process.env.ADMIN_PASSWORD ?? '',
    name:  'Administrador',
  },
  {
    role:  'socio',
    email: process.env.SOCIO_EMAIL    ?? '',
    pass:  process.env.SOCIO_PASSWORD ?? '',
    name:  'Socio',
  },
  {
    role:  'contador',
    email: process.env.CONTADOR_EMAIL    ?? '',
    pass:  process.env.CONTADOR_PASSWORD ?? '',
    name:  'Contador',
  },
  {
    role:  'operador',
    email: process.env.OPERADOR_EMAIL    ?? '',
    pass:  process.env.OPERADOR_PASSWORD ?? '',
    name:  'Operador',
  },
];

const missing = USERS.filter((u) => !u.email || !u.pass).map((u) => u.role);
if (missing.length) {
  console.error(`❌  Faltan credenciales para: ${missing.join(', ')}`);
  console.error('    Revisa las variables de entorno (ver encabezado del script).');
  process.exit(1);
}

// ── Helper: upsert auth + profile ────────────────────────────────────────────
async function upsertUser({ email, pass, name, role }) {
  // 1. ¿Ya existe el usuario?
  const { data: listData, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  const existing = listData.users.find((u) => u.email === email);
  let userId;

  if (existing) {
    // Actualizar contraseña para mantener idempotencia
    const { error: upErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: pass,
      email_confirm: true,
    });
    if (upErr) throw new Error(`updateUser(${email}): ${upErr.message}`);
    userId = existing.id;
    console.log(`  ↻  ${email}  [${role}]  — actualizado`);
  } else {
    // Crear nuevo usuario (email ya confirmado)
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        password: pass,
        email_confirm: true,
      });
    if (createErr) throw new Error(`createUser(${email}): ${createErr.message}`);
    userId = created.user.id;
    console.log(`  ✓  ${email}  [${role}]  — creado`);
  }

  // 2. Upsert en user_profiles
  const { error: profileErr } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, email, name, role, is_active: true },
      { onConflict: 'id' },
    );
  if (profileErr) throw new Error(`upsert profile(${email}): ${profileErr.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n🪙  La Moneda — Seed usuarios iniciales\n');

let ok = 0;
for (const user of USERS) {
  try {
    await upsertUser(user);
    ok++;
  } catch (err) {
    console.error(`  ✗  Error con ${user.email}: ${err.message}`);
  }
}

console.log(`\n${ok === USERS.length ? '✅' : '⚠️'}  ${ok}/${USERS.length} usuarios procesados.\n`);

if (ok < USERS.length) process.exit(1);
