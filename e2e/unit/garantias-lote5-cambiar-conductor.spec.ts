/**
 * Tests Lote 5 — Cambiar conductor (cierra garantía actual + crea nueva).
 *
 * Cubre:
 * 1.  CambiarConductorModal importa closeDriverGuarantee Y createDriverGuarantee.
 * 2.  CambiarConductorModal excluye al conductor actual de la lista destino.
 * 3.  CambiarConductorModal muestra advertencia cuando hay saldo (no se transfiere).
 * 4.  CambiarConductorModal llama primero a closeDriverGuarantee, luego a createDriverGuarantee.
 * 5.  CambiarConductorModal NOT modifica guarantee_movements directamente.
 * 6.  CambiarConductorModal acepta userId para audit trail.
 * 7.  GarantiaDetalle tiene botón "Cambiar conductor".
 * 8.  GarantiaDetalle importa CambiarConductorModal.
 * 9.  GarantiaDetalle pasa empresaId y userId a CambiarConductorModal.
 * 10. Invariante: nueva garantía empieza con balance 0 (sin movimientos).
 * 11. Invariante: computeGuaranteeFromMovements independiente del conductor.
 * 12. El flujo NO edita driver_id de la garantía original.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { GuaranteeMovement } from '../../src/data/garantiasTypes';
import { computeGuaranteeFromMovements } from '../../src/utils/garantiasCalc';

function resolveSource(relPath: string): string {
  return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

function movement(
  id: number,
  movementType: GuaranteeMovement['movementType'],
  amount: number,
  direction: GuaranteeMovement['direction'],
): GuaranteeMovement {
  return {
    id, empresaId: 'e', guaranteeId: 1, driverId: 'driver-A',
    vehicleId: null, movementType, amount, direction,
    observation: null, reason: null, relatedMovementId: null,
    createdBy: 'user', movementDate: '2026-08-20',
    createdAt: '2026-08-20T00:00:00Z', metadata: {},
  };
}

// ── 1. Modal importa ambas funciones de service ────────────────────────────────
test('CambiarConductorModal: importa closeDriverGuarantee y createDriverGuarantee', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  expect(src).toContain('closeDriverGuarantee');
  expect(src).toContain('createDriverGuarantee');
  expect(src).toContain('garantiasService');
});

// ── 2. Modal excluye conductor actual ──────────────────────────────────────────
test('CambiarConductorModal: excluye al conductor actual de la lista destino', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  // El filtro debe comparar c.id !== guarantee.driverId
  expect(src).toContain('guarantee.driverId');
  expect(src).toContain('!== guarantee.driverId');
});

// ── 3. Modal aviso de saldo no transferido ─────────────────────────────────────
test('CambiarConductorModal: muestra advertencia de saldo no transferido', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  expect(src).toContain('hasSaldo');
  expect(src).toContain('no se transfiere');
});

// ── 4. Modal llama close antes que create ─────────────────────────────────────
test('CambiarConductorModal: closeDriverGuarantee aparece antes que createDriverGuarantee en handleConfirm', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  const idxClose = src.indexOf('closeDriverGuarantee(');
  const idxCreate = src.indexOf('createDriverGuarantee(');
  expect(idxClose).toBeGreaterThan(-1);
  expect(idxCreate).toBeGreaterThan(-1);
  expect(idxClose).toBeLessThan(idxCreate); // close va primero
});

// ── 5. Modal no toca guarantee_movements ────────────────────────────────────────
test('CambiarConductorModal: no contiene referencias a guarantee_movements', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  expect(src).not.toContain('guarantee_movements');
});

// ── 6. Modal acepta userId para audit trail ────────────────────────────────────
test('CambiarConductorModal: acepta prop userId para audit trail', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  expect(src).toContain('userId');
  expect(src).toContain('createdBy');
});

// ── 7. Detalle tiene botón "Cambiar conductor" ─────────────────────────────────
test('GarantiaDetalle: tiene botón "Cambiar conductor"', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain('Cambiar conductor');
  expect(src).toContain('setShowCambiarConductor(true)');
});

// ── 8. Detalle importa CambiarConductorModal ──────────────────────────────────
test('GarantiaDetalle: importa CambiarConductorModal', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain('CambiarConductorModal');
  expect(src).toContain('<CambiarConductorModal');
});

// ── 9. Detalle pasa empresaId y userId ────────────────────────────────────────
test('GarantiaDetalle: pasa empresaId y userId a CambiarConductorModal', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  const idxModal = src.indexOf('<CambiarConductorModal');
  expect(idxModal).toBeGreaterThan(-1);
  const block = src.slice(idxModal, idxModal + 600);
  expect(block).toContain('empresaId=');
  expect(block).toContain('userId={user?.id}');
});

// ── 10. Invariante: nueva garantía inicia con balance 0 ──────────────────────
test('computeGuaranteeFromMovements: garantía sin movimientos tiene balance 0', () => {
  const result = computeGuaranteeFromMovements(1000, []);
  expect(result.currentBalance).toBe(0);
  expect(result.totalContributed).toBe(0);
  expect(result.totalDeducted).toBe(0);
  expect(result.pendingAmount).toBe(1000);
});

// ── 11. Invariante: cálculo no depende del conductor ─────────────────────────
test('computeGuaranteeFromMovements: resultado igual con distinto driverId', () => {
  const movs = [
    movement(1, 'initial_deposit', 800, 'credit'),
    movement(2, 'deduction', 200, 'debit'),
  ];
  const resA = computeGuaranteeFromMovements(1000, movs);
  const resB = computeGuaranteeFromMovements(1000, movs.map((m) => ({ ...m, driverId: 'driver-B' })));
  expect(resA.currentBalance).toBe(resB.currentBalance);
  expect(resA.totalContributed).toBe(resB.totalContributed);
  expect(resA.totalDeducted).toBe(resB.totalDeducted);
});

// ── 12. Flujo NO edita driver_id en la garantía original ─────────────────────
test('CambiarConductorModal: no llama a updateGuaranteeInfo (no edita in place)', () => {
  const src = resolveSource('../../src/components/garantias/CambiarConductorModal.tsx');
  // El flujo correcto es close+create, no update de la garantía existente
  expect(src).not.toContain('updateGuaranteeInfo');
  expect(src).not.toContain('update_driver_guarantee_info');
});
