/**
 * Auditoría de roles en user_profiles (solo lectura).
 * Uso: node scripts/audit_user_roles.mjs
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

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UI_ROLES = new Set(['admin', 'contador']);

function proposeRole(role) {
  if (UI_ROLES.has(role)) return { proposed: role, action: 'Mantener' };
  if (role === 'socio') return { proposed: 'admin', action: 'Revisar → admin (socio no habilitado en UI)' };
  if (role === 'operador') return { proposed: 'contador', action: 'Revisar → contador (operador no habilitado)' };
  return { proposed: '—', action: 'Revisar manualmente' };
}

const { data, error } = await supabase
  .from('user_profiles')
  .select('id, email, name, role, is_active')
  .order('email');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

const rows = data ?? [];
const admins = rows.filter((r) => r.role === 'admin' && r.is_active).length;
const contadores = rows.filter((r) => r.role === 'contador' && r.is_active).length;
const otrosRoles = rows.filter((r) => !UI_ROLES.has(r.role) || !r.is_active).length;

console.log('\n[usuarios:roles:audit]', {
  totalUsuarios: rows.length,
  admins,
  contadores,
  otrosRoles,
});

console.log('\nUSUARIO | ROL ACTUAL | ROL PROPUESTO | ACCIÓN');
console.log('---|---|---|---');
for (const r of rows) {
  const { proposed, action } = proposeRole(r.role);
  const user = `${r.name || r.email} <${r.email}>${r.is_active ? '' : ' [inactivo]'}`;
  console.log(`${user} | ${r.role} | ${proposed} | ${action}`);
}
console.log('');
