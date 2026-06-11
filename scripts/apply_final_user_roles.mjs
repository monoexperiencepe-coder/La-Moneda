/**
 * Alinea user_profiles con admins/contadores finales.
 * - Solo service_role (scripts locales).
 * - No hardcodea contraseñas.
 * - No toca auth desde el frontend.
 *
 * Contraseña opcional por email vía env (solo si vas a crear la cuenta):
 *   FINAL_USER_PASSWORD_diegosb0301_at_gmail_com=***
 * (email en minúsculas, @ → _at_, . → _)
 * Sin env de password: envía invitación Supabase (inviteUserByEmail).
 *
 * Uso:
 *   node scripts/apply_final_user_roles.mjs          # dry-run
 *   node scripts/apply_final_user_roles.mjs --apply  # aplica
 */
import { readFileSync } from 'fs';
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

const APPLY = process.argv.includes('--apply');

const FINAL_ADMINS = [
  'diegosb0301@gmail.com',
  'alvarosalasvelarde@gmail.com',
  'alvarosb24@gmail.com',
];
const FINAL_CONTADORES = ['psalas0812@gmail.com', 'edwardhelden30@gmail.com'];
const FINAL_EMAILS = new Set([...FINAL_ADMINS, ...FINAL_CONTADORES]);

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
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

function displayNameFromEmail(email) {
  const local = normEmail(email).split('@')[0] ?? 'Usuario';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function planForEmail(email, roleActual, isActiveActual) {
  const emailNorm = normEmail(email);
  if (FINAL_ADMINS.includes(emailNorm)) {
    return {
      rolePropuesto: 'admin',
      isActivePropuesto: true,
      accion:
        roleActual === 'admin' && isActiveActual
          ? 'Mantener admin activo'
          : 'Asignar admin + activar',
    };
  }
  if (FINAL_CONTADORES.includes(emailNorm)) {
    return {
      rolePropuesto: 'contador',
      isActivePropuesto: true,
      accion:
        roleActual === 'contador' && isActiveActual
          ? 'Mantener contador activo'
          : 'Asignar contador + activar',
    };
  }
  return {
    rolePropuesto: roleActual ?? 'operador',
    isActivePropuesto: false,
    accion: 'Desactivar (oculto en UI, sin borrar)',
  };
}

async function listAllAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users;
}

async function ensureAuthUser(email) {
  const emailNorm = normEmail(email);
  const authUsers = await listAllAuthUsers();
  const existing = authUsers.find((u) => normEmail(u.email) === emailNorm);
  if (existing) return { userId: existing.id, created: false, method: 'exists' };

  const pass = process.env[passwordEnvKey(emailNorm)];
  if (pass) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password: pass,
      email_confirm: true,
      user_metadata: { name: displayNameFromEmail(emailNorm) },
    });
    if (error) throw new Error(`createUser(${emailNorm}): ${error.message}`);
    return { userId: data.user.id, created: true, method: 'createUser' };
  }

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: emailNorm,
      options: { data: { name: displayNameFromEmail(emailNorm) } },
    });
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) throw new Error(`generateLink sin user.id (${emailNorm})`);
    return { userId, created: true, method: 'generateLink' };
  } catch (inviteErr) {
    throw new Error(
      `${inviteErr.message}. Define ${passwordEnvKey(emailNorm)} en .env para createUser sin invitación.`,
    );
  }
}

async function upsertProfile(userId, email, role, isActive, empresaId) {
  const emailNorm = normEmail(email);
  const payload = {
    id: userId,
    email: emailNorm,
    name: displayNameFromEmail(emailNorm),
    role,
    is_active: isActive,
    empresa_id: empresaId,
  };
  const { data: existing, error: readErr } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) throw new Error(`read profile(${emailNorm}): ${readErr.message}`);
  const { error } = existing
    ? await supabase
        .from('user_profiles')
        .update({
          email: payload.email,
          name: payload.name,
          role: payload.role,
          is_active: payload.is_active,
          empresa_id: payload.empresa_id,
        })
        .eq('id', userId)
    : await supabase.from('user_profiles').insert(payload);
  if (error) throw new Error(`${existing ? 'update' : 'insert'} profile(${emailNorm}): ${error.message}`);
}

async function resolveEmpresaId() {
  const fromEnv = (process.env.EMPRESA_ID ?? process.env.VITE_EMPRESA_ID ?? '').trim();
  if (fromEnv) return fromEnv;
  const { data: prof } = await supabase
    .from('user_profiles')
    .select('empresa_id')
    .not('empresa_id', 'is', null)
    .limit(1);
  if (prof?.[0]?.empresa_id) return prof[0].empresa_id;
  const { data: emp } = await supabase.from('empresas').select('id').limit(1);
  if (emp?.[0]?.id) return emp[0].id;
  throw new Error('No se pudo resolver empresa_id (define EMPRESA_ID o VITE_EMPRESA_ID en .env)');
}

const { data: profileRows, error: profErr } = await supabase
  .from('user_profiles')
  .select('id, email, name, role, is_active')
  .order('email');

if (profErr) {
  console.error('Error leyendo user_profiles:', profErr.message);
  process.exit(1);
}

const profiles = profileRows ?? [];
const authUsers = await listAllAuthUsers();

const planRows = [];

for (const p of profiles) {
  const plan = planForEmail(p.email, p.role, p.is_active);
  planRows.push({
    id: p.id,
    email: p.email,
    roleActual: p.role,
    isActiveActual: p.is_active,
    existsInProfiles: true,
    ...plan,
  });
}

for (const target of [...FINAL_ADMINS, ...FINAL_CONTADORES]) {
  const inProfiles = profiles.some((p) => normEmail(p.email) === target);
  const inAuth = authUsers.some((u) => normEmail(u.email) === target);
  if (!inProfiles) {
    const plan = planForEmail(target, null, false);
    planRows.push({
      id: null,
      email: target,
      roleActual: '(sin perfil)',
      isActiveActual: false,
      existsInProfiles: false,
      inAuth,
      ...plan,
      accion: inAuth
        ? `Crear/actualizar perfil → ${plan.rolePropuesto}`
        : `Crear cuenta auth + perfil → ${plan.rolePropuesto}`,
    });
  }
}

planRows.sort((a, b) => normEmail(a.email).localeCompare(normEmail(b.email)));

console.log(`\n${APPLY ? '▶ APLICANDO' : '◻ DRY-RUN'} — Usuarios finales\n`);
console.log('EMAIL | ROL ACTUAL | ROL PROPUESTO | ACCIÓN');
console.log('---|---|---|---');
for (const p of planRows) {
  const prop =
    p.isActivePropuesto
      ? p.rolePropuesto
      : `${p.rolePropuesto} [inactivo]`;
  console.log(`${p.email} | ${p.roleActual} | ${prop} | ${p.accion}`);
}

const activeAdmins = planRows.filter(
  (p) => FINAL_ADMINS.includes(normEmail(p.email)) && p.isActivePropuesto,
).length;
const activeContadores = planRows.filter(
  (p) => FINAL_CONTADORES.includes(normEmail(p.email)) && p.isActivePropuesto,
).length;

console.log('\n[usuarios:roles:audit]', {
  totalUsuarios: profiles.length,
  admins: activeAdmins,
  contadores: activeContadores,
  otrosRoles: planRows.filter((p) => !p.isActivePropuesto).length,
  cuentasFinalesFaltantes: [...FINAL_EMAILS].filter(
    (e) => !profiles.some((p) => normEmail(p.email) === e),
  ).length,
});

if (!APPLY) {
  console.log('\nSin cambios. Ejecuta: node scripts/apply_final_user_roles.mjs --apply\n');
  process.exit(0);
}

let ok = 0;
let fail = 0;

const empresaId = await resolveEmpresaId();
console.log(`\nempresa_id: ${empresaId}\n`);

for (const target of [...FINAL_ADMINS, ...FINAL_CONTADORES]) {
  const plan = planForEmail(target, null, false);
  try {
    const { userId, method } = await ensureAuthUser(target);
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('role,is_active,empresa_id')
      .eq('id', userId)
      .maybeSingle();
    if (
      currentProfile
      && currentProfile.role === plan.rolePropuesto
      && currentProfile.is_active === true
      && currentProfile.empresa_id === empresaId
    ) {
      console.log(`✓ ${target} → sin cambios (${plan.rolePropuesto})`);
      ok++;
      continue;
    }
    await upsertProfile(userId, target, plan.rolePropuesto, true, empresaId);
    console.log(`✓ ${target} → ${plan.rolePropuesto} (${method})`);
    ok++;
  } catch (err) {
    console.error(`✗ ${target}: ${err.message}`);
    fail++;
  }
}

for (const p of profiles) {
  if (FINAL_EMAILS.has(normEmail(p.email))) continue;
  const plan = planForEmail(p.email, p.role, p.is_active);
  if (p.role === plan.rolePropuesto && p.is_active === plan.isActivePropuesto) continue;
  const { error } = await supabase
    .from('user_profiles')
    .update({ role: plan.rolePropuesto, is_active: plan.isActivePropuesto })
    .eq('id', p.id);
  if (error) {
    console.error(`✗ ${p.email}: ${error.message}`);
    fail++;
  } else {
    console.log(`✓ ${p.email} → role=${plan.rolePropuesto}, is_active=${plan.isActivePropuesto}`);
    ok++;
  }
}

console.log(`\n${fail === 0 ? '✅' : '⚠️'}  ${ok} operaciones OK, ${fail} errores.\n`);
process.exit(fail > 0 ? 1 : 0);
