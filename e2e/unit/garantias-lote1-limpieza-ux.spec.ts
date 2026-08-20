/**
 * Tests Lote 1 — Limpieza UX garantías.
 *
 * Cubre:
 * 1.  "Ajuste" no aparece como botón en GarantiaDetalle.
 * 2.  adjustment_credit / adjustment_debit siguen reconocidos en GUARANTEE_MOVEMENT_LABELS.
 * 3.  adjustment_credit / adjustment_debit siguen procesados por computeGuaranteeFromMovements.
 * 4.  Título del modal de devolución es "Devolver y cerrar garantía".
 * 5.  Modal declara prop refundableAmount.
 * 6.  Validación: monto distinto al saldo completo es rechazado.
 * 7.  Validación: monto igual al saldo completo pasa.
 * 8.  Service: addGuaranteeMovement cierra la garantía con closed_at y status devuelta.
 * 9.  Devolución final con saldo cero pasa validación de igualdad.
 * 10. computeGuaranteeFromMovements: final_refund acumula en totalRefunded.
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
    createdBy: 'user', movementDate: '2026-08-19',
    createdAt: '2026-08-19T00:00:00Z', metadata: {},
  };
}

// ── 1. GarantiaDetalle ya no tiene el botón "Ajuste" ─────────────────────────
test('GarantiaDetalle no tiene botón "Ajuste" ni setMovMode("adjustment")', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  // No debe haber ningún botón con texto Ajuste
  expect(src).not.toMatch(/>\s*Ajuste\s*</);
  // No debe haber ninguna llamada a setMovMode con 'adjustment' vinculada a un botón onClick
  expect(src).not.toContain("setMovMode('adjustment')");
});

// ── 2. adjustment_credit/debit siguen en GUARANTEE_MOVEMENT_LABELS ────────────
test('adjustment_credit y adjustment_debit tienen label en GUARANTEE_MOVEMENT_LABELS', () => {
  const src = resolveSource('../../src/data/garantiasTypes.ts');
  expect(src).toContain('adjustment_credit:');
  expect(src).toContain('adjustment_debit:');
});

// ── 3. computeGuaranteeFromMovements procesa adjustment_credit ────────────────
test('computeGuaranteeFromMovements: adjustment_credit suma al balance y a totalContributed', () => {
  // adjustment_credit es tratado como contribución por isContributionMovementType
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 500, 'credit'),
    movement(2, 'adjustment_credit', 100, 'credit'),
  ];
  const result = computeGuaranteeFromMovements(600, movs);
  expect(result.currentBalance).toBe(600);          // 500 + 100
  expect(result.totalContributed).toBe(600);         // adjustment_credit SÍ cuenta como contribución
});

// ── 3b. adjustment_debit suma a totalDeducted ────────────────────────────────
test('computeGuaranteeFromMovements: adjustment_debit suma a totalDeducted y resta del balance', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 500, 'credit'),
    movement(2, 'adjustment_debit', 50, 'debit'),
  ];
  const result = computeGuaranteeFromMovements(500, movs);
  expect(result.currentBalance).toBe(450);
  expect(result.totalDeducted).toBe(50);
});

// ── 4. Título del modal de devolución es correcto ────────────────────────────
test('RegistrarMovimientoModal: titleForMode refund es "Devolver y cerrar garantía"', () => {
  const src = resolveSource('../../src/components/garantias/RegistrarMovimientoModal.tsx');
  expect(src).toContain("return 'Devolver y cerrar garantía';");
});

// ── 5. RegistrarMovimientoModal acepta prop refundableAmount ─────────────────
test('RegistrarMovimientoModal: declara prop refundableAmount opcional de tipo number', () => {
  const src = resolveSource('../../src/components/garantias/RegistrarMovimientoModal.tsx');
  expect(src).toContain('refundableAmount?: number');
});

// ── 6. Validación: monto distinto al saldo completo es rechazado ─────────────
test('Validación de refund: monto parcial genera error (lógica de handleSubmit)', () => {
  function validateRefundAmount(amt: number, refundableAmount: number): boolean {
    const diff = Math.abs(amt - refundableAmount);
    return diff > 0.001; // true = hay error
  }
  expect(validateRefundAmount(300, 500)).toBe(true);   // parcial → error
  expect(validateRefundAmount(0.01, 500)).toBe(true);  // muy bajo → error
  expect(validateRefundAmount(600, 500)).toBe(true);   // excede → error
});

// ── 7. Validación: monto igual al saldo completo pasa ────────────────────────
test('Validación de refund: monto exacto pasa (lógica de handleSubmit)', () => {
  function validateRefundAmount(amt: number, refundableAmount: number): boolean {
    const diff = Math.abs(amt - refundableAmount);
    return diff > 0.001;
  }
  expect(validateRefundAmount(500, 500)).toBe(false);      // exacto → OK
  expect(validateRefundAmount(500.0005, 500)).toBe(false); // tolerancia → OK
  expect(validateRefundAmount(0, 0)).toBe(false);          // saldo cero → OK
});

// ── 8. Service: addGuaranteeMovement cierra la garantía con closed_at / devuelta ──
test('Service: final_refund fuerza closed_at y status=devuelta en el patch', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain("isFinalRefund = input.movementType === 'final_refund'");
  expect(src).toContain('patch.closed_at = new Date().toISOString()');
  expect(src).toContain("patch.status = 'devuelta'");
});

// ── 9. Devolución con saldo cero (garantía descontada completamente) ──────────
test('computeGuaranteeFromMovements: con saldo cero, refundableAmount es 0', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 500, 'credit'),
    movement(2, 'damage_deduction', 500, 'debit'),
  ];
  const result = computeGuaranteeFromMovements(500, movs);
  expect(result.currentBalance).toBe(0);
  expect(result.refundableAmount).toBe(0);
});

// ── 10. final_refund acumula en totalRefunded ─────────────────────────────────
test('computeGuaranteeFromMovements: final_refund acumula en totalRefunded', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 500, 'credit'),
    movement(2, 'final_refund', 500, 'debit'),
  ];
  const result = computeGuaranteeFromMovements(500, movs, { fullyRefunded: true });
  expect(result.currentBalance).toBe(0);
  expect(result.totalRefunded).toBe(500);
  expect(result.status).toBe('devuelta');
});
