/**
 * Tests Lote 3 — Cerrar / Retirar garantía.
 *
 * Cubre:
 * 1.  Migration: close_driver_guarantee declarada como SECURITY DEFINER.
 * 2.  Migration: set search_path = '' aplicado.
 * 3.  Migration: chequea rol admin/contador/socio.
 * 4.  Migration: chequea garantia_ya_cerrada.
 * 5.  Migration: NOT toca guarantee_movements.
 * 6.  Migration: NOT altera saldos financieros (current_balance, total_contributed, total_deducted).
 * 7.  Migration: solo actualiza closed_at, status, notes, updated_at.
 * 8.  Service: closeDriverGuarantee existe en garantiasService.
 * 9.  Service: mapea error garantia_ya_cerrada con mensaje legible.
 * 10. Modal: CerrarGarantiaModal existe e importa closeDriverGuarantee.
 * 11. Modal: muestra advertencia cuando hay saldo residual (hasSaldo).
 * 12. Detalle: botón "Cerrar garantía" existe en GarantiaDetalle.
 * 13. Detalle: importa CerrarGarantiaModal.
 * 14. Invariante: cerrar garantía libera al conductor para nueva garantía futura.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

function resolveSource(relPath: string): string {
  return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

// ── 1. Migration: SECURITY DEFINER ───────────────────────────────────────────
test('Migration: close_driver_guarantee es SECURITY DEFINER', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).toContain('create or replace function public.close_driver_guarantee');
  expect(sql.toLowerCase()).toContain('security definer');
});

// ── 2. Migration: set search_path = '' ───────────────────────────────────────
test("Migration: set search_path = '' aplicado", () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).toContain("set search_path = ''");
});

// ── 3. Migration: chequea roles ───────────────────────────────────────────────
test('Migration: chequea rol admin/contador/socio', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).toContain("v_role not in ('admin', 'contador', 'socio')");
  expect(sql).toContain('rol_sin_permiso');
});

// ── 4. Migration: chequea garantia_ya_cerrada ─────────────────────────────────
test('Migration: rechaza garantía ya cerrada con garantia_ya_cerrada', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).toContain('garantia_ya_cerrada');
  expect(sql).toContain("v_guarantee.status in ('cerrada', 'devuelta')");
});

// ── 5. Migration: no toca guarantee_movements ────────────────────────────────
test('Migration: no contiene UPDATE ni INSERT en guarantee_movements', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).not.toMatch(/update\s+public\.guarantee_movements/i);
  expect(sql).not.toMatch(/insert\s+into\s+public\.guarantee_movements/i);
});

// ── 6. Migration: no altera saldos derivados ────────────────────────────────
test('Migration: UPDATE no toca current_balance, total_contributed, total_deducted', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).not.toContain('current_balance');
  expect(sql).not.toContain('total_contributed');
  expect(sql).not.toContain('total_deducted');
});

// ── 7. Migration: solo actualiza campos de cierre ────────────────────────────
test('Migration: UPDATE solo toca closed_at, status, notes, updated_at', () => {
  const sql = resolveSource('../../supabase/migration_garantias_close.sql');
  expect(sql).toContain('closed_at  = now()');
  expect(sql).toContain("status     = 'cerrada'");
  expect(sql).toContain('updated_at = now()');
});

// ── 8. Service: closeDriverGuarantee existe ──────────────────────────────────
test('Service: closeDriverGuarantee exportada en garantiasService', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('export async function closeDriverGuarantee');
  expect(src).toContain("'close_driver_guarantee'");
});

// ── 9. Service: mapea error garantia_ya_cerrada ──────────────────────────────
test('Service: mapea garantia_ya_cerrada con mensaje legible', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('garantia_ya_cerrada');
  expect(src).toContain('La garantía ya está cerrada o devuelta');
});

// ── 10. Modal: CerrarGarantiaModal importa closeDriverGuarantee ──────────────
test('CerrarGarantiaModal: importa closeDriverGuarantee desde garantiasService', () => {
  const src = resolveSource('../../src/components/garantias/CerrarGarantiaModal.tsx');
  expect(src).toContain('closeDriverGuarantee');
  expect(src).toContain('garantiasService');
});

// ── 11. Modal: muestra advertencia de saldo residual ────────────────────────
test('CerrarGarantiaModal: tiene lógica hasSaldo con advertencia', () => {
  const src = resolveSource('../../src/components/garantias/CerrarGarantiaModal.tsx');
  expect(src).toContain('hasSaldo');
  expect(src).toContain('no se devuelve automáticamente');
});

// ── 12. Detalle: tiene botón "Cerrar garantía" ──────────────────────────────
test('GarantiaDetalle: tiene botón "Cerrar garantía"', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain('Cerrar garantía');
  expect(src).toContain('setShowCerrar(true)');
});

// ── 13. Detalle: importa CerrarGarantiaModal ─────────────────────────────────
test('GarantiaDetalle: importa CerrarGarantiaModal', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain('CerrarGarantiaModal');
});

// ── 14. Invariante: unique index se libera al cerrar ─────────────────────────
test('Migration: la garantía cerrada libera el unique index por conductor', () => {
  // La constrained del index es: WHERE closed_at IS NULL AND status NOT IN ('cerrada', 'devuelta').
  // Al setear status='cerrada' y closed_at=now(), la fila sale del predicado → el index se libera.
  const sql = resolveSource('../../supabase/migration_garantias_fase1.sql');
  expect(sql).toContain('closed_at is null');
  expect(sql).toContain("status not in ('cerrada', 'devuelta')");
});
