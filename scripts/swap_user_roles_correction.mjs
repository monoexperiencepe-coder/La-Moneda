/**
 * Intercambio puntual de roles entre dos usuarios (solo user_profiles.role).
 * No toca auth.users, passwords, is_active, empresa_id ni otros perfiles.
 *
 * Uso:
 *   node scripts/swap_user_roles_correction.mjs          # dry-run + tabla previa
 *   node scripts/swap_user_roles_correction.mjs --apply  # aplica solo si difiere
 */
import { readFileSync } from 'fs';
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

const APPLY = process.argv.includes('--apply');

/** email → rol objetivo (solo estos dos perfiles). */
const ROLE_CORRECTIONS = new Map([
  ['psalas0812@gmail.com', 'contador'],
  ['alvarosb24@gmail.com', 'admin'],
]);

const FINAL_ADMINS = new Set([
  'diegosb0301@gmail.com',
  'alvarosalasvelarde@gmail.com',
  'alvarosb24@gmail.com',
]);
const FINAL_CONTADORES = new Set(['psalas0812@gmail.com', 'edwardhelden30@gmail.com']);

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL/VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

const targetEmails = [...ROLE_CORRECTIONS.keys()];

const { data: profiles, error } = await supabase
  .from('user_profiles')
  .select('id, email, name, role, is_active, empresa_id')
  .in('email', targetEmails);

if (error) {
  console.error('Error leyendo user_profiles:', error.message);
  process.exit(1);
}

const byEmail = new Map((profiles ?? []).map((p) => [normEmail(p.email), p]));

const plan = targetEmails.map((email) => {
  const row = byEmail.get(email);
  const rolNuevo = ROLE_CORRECTIONS.get(email);
  const rolActual = row?.role ?? '(sin perfil)';
  const needsChange = Boolean(row && row.role !== rolNuevo);
  return {
    email,
    id: row?.id ?? null,
    rolActual,
    rolNuevo,
    accion: !row ? 'ERROR: perfil no encontrado' : needsChange ? 'Actualizar role' : 'Sin cambios (ya correcto)',
    needsChange,
    is_active: row?.is_active,
  };
});

console.log(`\n${APPLY ? '▶ APLICANDO' : '◻ DRY-RUN'} — Intercambio de roles (solo user_profiles.role)\n`);
console.log('EMAIL | ROL ACTUAL | ROL NUEVO | ACCIÓN');
console.log('---|---|---|---');
for (const p of plan) {
  console.log(`${p.email} | ${p.rolActual} | ${p.rolNuevo} | ${p.accion}`);
}

const missing = plan.filter((p) => !p.id);
if (missing.length > 0) {
  console.error('\nPerfiles faltantes:', missing.map((p) => p.email).join(', '));
  process.exit(1);
}

if (!APPLY) {
  console.log('\nSin cambios. Ejecuta: node scripts/swap_user_roles_correction.mjs --apply\n');
  process.exit(0);
}

const swapAudit = [];
let changed = 0;

for (const p of plan) {
  if (!p.needsChange) {
    console.log(`✓ ${p.email} → ya es ${p.rolNuevo}`);
    continue;
  }
  const { error: updErr } = await supabase
    .from('user_profiles')
    .update({ role: p.rolNuevo })
    .eq('id', p.id);
  if (updErr) {
    console.error(`✗ ${p.email}: ${updErr.message}`);
    process.exit(1);
  }
  const entry = {
    usuario: p.email,
    rol_anterior: p.rolActual,
    rol_nuevo: p.rolNuevo,
    fecha: new Date().toISOString(),
  };
  swapAudit.push(entry);
  console.log('[usuarios:roles:swap]', entry);
  changed++;
}

const { data: allActive, error: verifyErr } = await supabase
  .from('user_profiles')
  .select('email, role, is_active')
  .eq('is_active', true)
  .in('role', ['admin', 'contador']);

if (verifyErr) {
  console.error('Error verificando roles:', verifyErr.message);
  process.exit(1);
}

const active = (allActive ?? []).filter((r) => r.is_active);
const admins = active.filter((r) => r.role === 'admin').map((r) => normEmail(r.email));
const contadores = active.filter((r) => r.role === 'contador').map((r) => normEmail(r.email));

const adminsOk =
  admins.length === 3 && [...FINAL_ADMINS].every((e) => admins.includes(e));
const contadoresOk =
  contadores.length === 2 && [...FINAL_CONTADORES].every((e) => contadores.includes(e));

console.log('\n[usuarios:roles:audit]', {
  cambiosAplicados: changed,
  adminsActivos: admins.length,
  contadoresActivos: contadores.length,
  admins,
  contadores,
  validacion: adminsOk && contadoresOk ? 'OK' : 'REVISAR',
});

if (!adminsOk || !contadoresOk) {
  console.error('\nValidación final fallida. Revisa la tabla user_profiles.');
  process.exit(1);
}

console.log(`\n✅ Roles finales correctos (${changed} actualización${changed !== 1 ? 'es' : ''}).\n`);
