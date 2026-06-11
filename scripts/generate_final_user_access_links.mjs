/**
 * Genera enlaces de acceso (recovery) para usuarios finales con confirmed=false.
 * No modifica roles, user_profiles, is_active ni contraseñas.
 *
 * Uso:
 *   node scripts/generate_final_user_access_links.mjs
 *
 * Salida: consola + archivo gitignored `final-user-access-links.local`
 * Requiere: SUPABASE_URL/VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

try {
  const envPath = resolve(process.cwd(), '.env');
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
  /* .env opcional */
}

const FINAL_USERS = [
  { email: 'diegosb0301@gmail.com', rol: 'admin' },
  { email: 'alvarosalasvelarde@gmail.com', rol: 'admin' },
  { email: 'alvarosb24@gmail.com', rol: 'admin' },
  { email: 'psalas0812@gmail.com', rol: 'contador' },
  { email: 'edwardhelden30@gmail.com', rol: 'contador' },
];

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const REDIRECT_TO =
  (process.env.VITE_APP_URL ?? process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '') +
  '/login';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normEmail(email) {
  return String(email).trim().toLowerCase();
}

async function generateAccessLink(email) {
  const emailNorm = normEmail(email);

  const recovery = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: emailNorm,
    options: { redirectTo: REDIRECT_TO },
  });
  if (!recovery.error && recovery.data?.properties?.action_link) {
    return { method: 'recovery', link: recovery.data.properties.action_link };
  }

  const invite = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: emailNorm,
    options: { redirectTo: REDIRECT_TO },
  });
  if (!invite.error && invite.data?.properties?.action_link) {
    return { method: 'invite', link: invite.data.properties.action_link };
  }

  const errMsg = recovery.error?.message ?? invite.error?.message ?? 'sin enlace';
  throw new Error(errMsg);
}

const { data: authList, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('listUsers:', listErr.message);
  process.exit(1);
}

console.log('\n[usuarios:acceso] Generando enlaces para definir contraseña');
console.log(`redirectTo: ${REDIRECT_TO}\n`);

const lines = [
  `# La Moneda — enlaces de acceso (${new Date().toISOString()})`,
  `# Compartir cada enlace solo con el titular. No commitear este archivo.`,
  `# Tras abrir el enlace, el usuario define su contraseña y queda confirmado.`,
  '',
];

let ok = 0;
let fail = 0;

for (const { email, rol } of FINAL_USERS) {
  const authUser = authList.users.find((u) => normEmail(u.email) === normEmail(email));
  if (!authUser) {
    console.error(`✗ ${email}: no existe en auth.users`);
    lines.push(`## ${email} (${rol})`, 'ERROR: usuario no encontrado en auth', '');
    fail++;
    continue;
  }

  const confirmed = authUser.email_confirmed_at != null;
  try {
    const { method, link } = await generateAccessLink(email);
    console.log(`✓ ${email} [${rol}] — ${method} — confirmed=${confirmed}`);
    console.log(`  ${link}\n`);
    lines.push(
      `## ${email} (${rol})`,
      `confirmed_antes: ${confirmed}`,
      `metodo: ${method}`,
      link,
      '',
    );
    ok++;
  } catch (err) {
    console.error(`✗ ${email}: ${err.message}`);
    lines.push(`## ${email} (${rol})`, `ERROR: ${err.message}`, '');
    fail++;
  }
}

const outPath = resolve(process.cwd(), 'final-user-access-links.local');
writeFileSync(outPath, lines.join('\n'), 'utf-8');

console.log(`[usuarios:acceso] ${ok} enlaces OK, ${fail} errores`);
console.log(`Archivo local (gitignored): ${outPath}\n`);

if (fail > 0) process.exit(1);
