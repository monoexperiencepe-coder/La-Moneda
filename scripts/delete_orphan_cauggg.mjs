/**
 * CONTROLLED DELETE — orphan investment row CAUGGG / vehiculo_numero=180
 * Temporary operational script. Delete after use.
 *
 * Steps:
 *   precheck  — verify conditions (read-only)
 *   impact    — totals before delete (read-only)
 *   backup    — write JSON to scripts/
 *   delete    — single row by primary key
 *   postcheck — verify row gone, count/totals shifted correctly
 *
 * Usage:
 *   node scripts/delete_orphan_cauggg.mjs precheck
 *   node scripts/delete_orphan_cauggg.mjs delete
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv[2] ?? 'precheck'; // 'precheck' | 'delete'

const TARGET_ID   = 'b545614d-235d-4529-ac43-a3281e9dadc3';
const TARGET_VEH  = 180;
const TARGET_PLACA = 'CAUGGG';
const TARGET_MONTO = 12000;
const TARGET_FUENTE = 'REGISTRO_UI';

function loadDotEnv(file) {
  const p = resolve(root, file);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadDotEnv('.env'), ...loadDotEnv('.env.local') };
const url = env.VITE_SUPABASE_URL?.trim() ?? '';
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? '').trim();
const EMPRESA_ID = env.VITE_EMPRESA_ID?.trim() ?? '';

if (!url || !serviceKey) { console.error('BLOCKED: Missing credentials'); process.exit(1); }

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// ── helpers ──────────────────────────────────────────────────────────────────

function pass(msg)  { console.log(`  ✓ ${msg}`); }
function fail(msg)  { console.error(`  ✗ BLOCKED: ${msg}`); process.exit(1); }
function info(msg)  { console.log(`  → ${msg}`); }
function header(t)  { console.log(`\n${'═'.repeat(54)}\n${t}\n${'═'.repeat(54)}`); }

// ── PRECHECK ─────────────────────────────────────────────────────────────────

header('PRECHECK — target row verification');

const { data: targetRows, error: te } = await sb
  .from('inversiones_generales_vehiculo')
  .select('*')
  .eq('id', TARGET_ID)
  .eq('empresa_id', EMPRESA_ID);

if (te) fail(`query error: ${te.message}`);
if (!targetRows?.length) fail(`Target row id=${TARGET_ID} NOT FOUND — already deleted?`);

const row = targetRows[0];
console.log('\n  Full row:');
console.log(JSON.stringify(row, null, 4));

// Verify each condition
if (row.vehiculo_numero !== TARGET_VEH)
  fail(`vehiculo_numero mismatch: expected 180, got ${row.vehiculo_numero}`);
pass(`vehiculo_numero = ${row.vehiculo_numero}`);

const placa = (row.placa ?? '').replace(/[^A-Z0-9]/g, '').toUpperCase();
const expectedPlaca = TARGET_PLACA.replace(/[^A-Z0-9]/g, '').toUpperCase();
if (placa !== expectedPlaca)
  fail(`placa mismatch: expected CAUGGG, got ${row.placa}`);
pass(`placa = ${row.placa}`);

if (Number(row.monto_total) !== TARGET_MONTO)
  fail(`monto_total mismatch: expected 12000, got ${row.monto_total}`);
pass(`monto_total = ${row.monto_total}`);

if (row.moneda !== 'USD')
  fail(`moneda mismatch: expected USD, got ${row.moneda}`);
pass(`moneda = ${row.moneda}`);

if (row.fuente !== TARGET_FUENTE)
  fail(`fuente mismatch: expected REGISTRO_UI, got ${row.fuente}`);
pass(`fuente = ${row.fuente}`);

// Vehicle id=180 must not exist
const { data: vById } = await sb
  .from('vehiculos').select('id').eq('empresa_id', EMPRESA_ID).eq('id', 180);
if (vById?.length) fail('Vehicle id=180 EXISTS in vehiculos — abort: unexpected live vehicle');
pass('vehiculos.id=180 does not exist (vehicle is deleted)');

// No live vehicle with placa CAUGGG
const { data: vByPlaca } = await sb
  .from('vehiculos').select('id, placa').eq('empresa_id', EMPRESA_ID).ilike('placa', '%CAUGGG%');
if (vByPlaca?.length) fail(`Live vehicle found with placa CAUGGG: ${JSON.stringify(vByPlaca)}`);
pass('No live vehicle has placa CAUGGG');

// No other investment row with vehiculo_numero=180
const { data: otherByNum } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id').eq('empresa_id', EMPRESA_ID).eq('vehiculo_numero', 180).neq('id', TARGET_ID);
if (otherByNum?.length) fail(`Other investment rows reference vehiculo_numero=180: ${JSON.stringify(otherByNum)}`);
pass('No other investment row references vehiculo_numero=180');

// No other investment row with placa CAUGGG
const { data: otherByPlaca } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id').eq('empresa_id', EMPRESA_ID).ilike('placa', '%CAUGGG%').neq('id', TARGET_ID);
if (otherByPlaca?.length) fail(`Other investment rows have placa CAUGGG: ${JSON.stringify(otherByPlaca)}`);
pass('No other investment row has placa CAUGGG');

console.log('\n  ✓✓ ALL PRECHECK CONDITIONS SATISFIED\n');

// ── IMPACT AUDIT ─────────────────────────────────────────────────────────────

header('IMPACT AUDIT — current totals');

const { data: allRows, error: ae } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id, vehiculo_numero, vehiculo_referencia, monto_total, moneda, fuente')
  .eq('empresa_id', EMPRESA_ID)
  .order('vehiculo_numero');

if (ae) fail(`impact query error: ${ae.message}`);

const totalCount = allRows?.length ?? 0;
let totalUSD = 0, totalPEN = 0;
for (const r of allRows ?? []) {
  const m = Number(r.monto_total ?? 0);
  if (r.moneda === 'USD') totalUSD += m;
  else totalPEN += m;
}

info(`Total row count (all companies): ${totalCount}`);
info(`Total USD: ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
info(`Total PEN: ${totalPEN.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
info(`Target row contribution: USD 12,000.00`);
info(`Expected post-delete USD: ${(totalUSD - 12000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
info(`Expected post-delete row count: ${totalCount - 1}`);

// ── BACKUP ───────────────────────────────────────────────────────────────────

header('BACKUP — writing JSON');

const backupPath = resolve(root, 'scripts', 'backup_cauggg_investment_row.json');
const backupPayload = { deletedAt: new Date().toISOString(), row };
writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
pass(`Backup written: ${backupPath}`);
info('Backup contents:');
console.log(JSON.stringify(backupPayload, null, 4));

// ── DELETE ────────────────────────────────────────────────────────────────────

if (MODE !== 'delete') {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  DRY RUN — precheck + impact + backup complete.');
  console.log('  Re-run with: node scripts/delete_orphan_cauggg.mjs delete');
  console.log('  to execute the delete.');
  console.log('══════════════════════════════════════════════════\n');
  process.exit(0);
}

header('DELETE — single row by primary key');

const { error: de, count: dcount } = await sb
  .from('inversiones_generales_vehiculo')
  .delete({ count: 'exact' })
  .eq('id', TARGET_ID)
  .eq('empresa_id', EMPRESA_ID)
  .eq('vehiculo_numero', TARGET_VEH)
  .eq('placa', TARGET_PLACA);

if (de) fail(`Delete error: ${de.message}`);
if (dcount !== 1) fail(`Delete affected ${dcount} rows — expected exactly 1. Manual verification required.`);
pass(`Deleted exactly ${dcount} row`);

// ── POSTCHECK ─────────────────────────────────────────────────────────────────

header('POSTCHECK — verify deletion and totals');

// Row must not exist
const { data: gone } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id').eq('id', TARGET_ID).eq('empresa_id', EMPRESA_ID);
if (gone?.length) fail('Target row STILL EXISTS after delete — unexpected. Manual verification required.');
pass('Target row no longer exists');

// Row count and totals
const { data: afterRows, error: afe } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id, monto_total, moneda').eq('empresa_id', EMPRESA_ID);
if (afe) fail(`postcheck query error: ${afe.message}`);

const afterCount = afterRows?.length ?? 0;
let afterUSD = 0, afterPEN = 0;
for (const r of afterRows ?? []) {
  const m = Number(r.monto_total ?? 0);
  if (r.moneda === 'USD') afterUSD += m;
  else afterPEN += m;
}

if (afterCount !== totalCount - 1)
  fail(`Row count mismatch: expected ${totalCount - 1}, got ${afterCount}`);
pass(`Row count: ${totalCount} → ${afterCount} (decreased by 1)`);

const expectedAfterUSD = totalUSD - 12000;
if (Math.abs(afterUSD - expectedAfterUSD) > 0.01)
  fail(`USD total mismatch: expected ${expectedAfterUSD}, got ${afterUSD}`);
pass(`USD total: ${totalUSD} → ${afterUSD} (decreased by 12,000.00)`);

if (afterPEN !== totalPEN) pass(`PEN total unchanged: ${afterPEN}`);
else pass(`PEN total: ${afterPEN} (unchanged)`);

// Verify no other row with vehiculo_numero=180 or placa=CAUGGG remains
const { data: orphanCheck } = await sb
  .from('inversiones_generales_vehiculo')
  .select('id').eq('empresa_id', EMPRESA_ID)
  .or(`vehiculo_numero.eq.180,placa.ilike.%CAUGGG%`);
if (orphanCheck?.length) fail(`Unexpected rows still match vehiculo_numero=180 or placa=CAUGGG: ${JSON.stringify(orphanCheck)}`);
pass('No remaining rows reference vehiculo_numero=180 or placa=CAUGGG');

header('SUMMARY');
console.log(`  Backup:         ${backupPath}`);
console.log(`  Rows before:    ${totalCount}`);
console.log(`  Rows after:     ${afterCount}`);
console.log(`  USD before:     ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  USD after:      ${afterUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  USD difference: -12,000.00`);
console.log(`  PEN total:      ${afterPEN.toLocaleString('en-US', { minimumFractionDigits: 2 })} (unchanged)`);
console.log('');
console.log('  LA_MONEDA_ORPHAN_INVESTMENT_CAUGGG_DELETE: COMPLETE');
