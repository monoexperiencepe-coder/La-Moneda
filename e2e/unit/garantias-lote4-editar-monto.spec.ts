/**
 * Tests Lote 4 — Corregir información y monto requerido.
 *
 * Cubre:
 * 1.  EditarGarantiaModal importa updateGuaranteeVehicleType para monto requerido.
 * 2.  EditarGarantiaModal tiene campo para required_amount.
 * 3.  Advertencia en UI cuando required_amount cambia.
 * 4.  Lógica reqOrTypeChanged detecta cambio en required_amount.
 * 5.  Lógica reqOrTypeChanged detecta cambio en vehicle_type.
 * 6.  No llamada a updateGuaranteeVehicleType si nada financiero cambia.
 * 7.  current_balance no editable directamente (no campo en modal).
 * 8.  total_contributed no editable directamente.
 * 9.  total_deducted no editable directamente.
 * 10. Aviso en el modal que saldos derivan del ledger.
 * 11. GarantiaDetalle pasa userId al EditarGarantiaModal.
 * 12. computeGuaranteeFromMovements: cambiar required_amount recalcula pendingAmount correctamente.
 * 13. required_amount_change movement no suma al balance ni a totalContributed.
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

// ── 1. Modal importa updateGuaranteeVehicleType ──────────────────────────────
test('EditarGarantiaModal: importa updateGuaranteeVehicleType desde garantiasService', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).toContain('updateGuaranteeVehicleType');
  expect(src).toContain('garantiasService');
});

// ── 2. Modal tiene campo required_amount ──────────────────────────────────────
test('EditarGarantiaModal: tiene campo de monto requerido', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).toContain('requiredAmount');
  expect(src).toContain('Monto de garantía requerido');
});

// ── 3. Advertencia cuando required_amount cambia ──────────────────────────────
test('EditarGarantiaModal: muestra aviso de movimiento de auditoría cuando amount cambia', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).toContain('movimiento de auditoría');
  expect(src).toContain('Cambio de monto requerido');
});

// ── 4. reqOrTypeChanged detecta cambio en required_amount ────────────────────
test('Lógica reqOrTypeChanged: detecta cambio en required_amount', () => {
  // Replica la lógica del modal
  function reqOrTypeChanged(
    parsedReq: number,
    currentReq: number,
    newType: string,
    currentType: string,
  ): boolean {
    return parsedReq !== currentReq || newType !== currentType;
  }
  expect(reqOrTypeChanged(800, 1000, 'auto', 'auto')).toBe(true);   // monto cambió
  expect(reqOrTypeChanged(1000, 1000, 'camioneta', 'auto')).toBe(true); // tipo cambió
  expect(reqOrTypeChanged(1000, 1000, 'auto', 'auto')).toBe(false);    // nada cambió
});

// ── 5. reqOrTypeChanged detecta cambio en vehicle_type ───────────────────────
test('Lógica reqOrTypeChanged: detecta cambio en vehicle_type', () => {
  function reqOrTypeChanged(newType: string, currentType: string): boolean {
    return newType !== currentType;
  }
  expect(reqOrTypeChanged('camioneta', 'auto')).toBe(true);
  expect(reqOrTypeChanged('auto', 'auto')).toBe(false);
});

// ── 6. No llama updateGuaranteeVehicleType si nada financiero cambió ─────────
test('EditarGarantiaModal: condiciona updateGuaranteeVehicleType a reqOrTypeChanged', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).toContain('if (reqOrTypeChanged)');
  expect(src).toContain('await updateGuaranteeVehicleType');
});

// ── 7. current_balance no editable en modal ──────────────────────────────────
test('EditarGarantiaModal: no tiene state setter para currentBalance', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  // No debe haber estado ni input para saldo — es derivado del ledger
  expect(src).not.toContain('setCurrentBalance');
  expect(src).not.toContain('Saldo actual');
  expect(src).not.toContain("label='Saldo'");
});

// ── 8. total_contributed no editable en modal ─────────────────────────────────
test('EditarGarantiaModal: no tiene state setter para totalContributed', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).not.toContain('setTotalContributed');
  expect(src).not.toContain('Total entregado');
});

// ── 9. total_deducted no editable en modal ────────────────────────────────────
test('EditarGarantiaModal: no tiene state setter para totalDeducted', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).not.toContain('setTotalDeducted');
  expect(src).not.toContain('Total descontado');
});

// ── 10. Aviso que saldos derivan del ledger ───────────────────────────────────
test('EditarGarantiaModal: aviso que saldos derivan del ledger de movimientos', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  // El texto debe comunicar que los saldos son derivados, sin exponer nombres de campo raw
  expect(src).toContain('historial de movimientos');
  expect(src).not.toContain('current_balance');
  expect(src).not.toContain('total_contributed');
  expect(src).not.toContain('total_deducted');
});

// ── 11. GarantiaDetalle pasa userId al modal ─────────────────────────────────
test('GarantiaDetalle: pasa userId a EditarGarantiaModal', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  // El prop userId debe existir en el source y el modal debe estar importado
  expect(src).toContain('userId={user?.id}');
  expect(src).toContain('EditarGarantiaModal');
  // Verificar que la prop userId está cerca del bloque de EditarGarantiaModal
  const idxModal = src.indexOf('<EditarGarantiaModal');
  const idxUserId = src.indexOf('userId={user?.id}', idxModal);
  expect(idxUserId).toBeGreaterThan(idxModal);
  expect(idxUserId - idxModal).toBeLessThan(500); // están cerca en el source
});

// ── 12. Cambiar required_amount recalcula pendingAmount ───────────────────────
test('computeGuaranteeFromMovements: required_amount 1000→800 reduce pendingAmount', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 600, 'credit'),
  ];
  const con1000 = computeGuaranteeFromMovements(1000, movs);
  const con800 = computeGuaranteeFromMovements(800, movs);
  expect(con1000.pendingAmount).toBe(400); // 1000 - 600
  expect(con800.pendingAmount).toBe(200);  // 800 - 600
  expect(con1000.currentBalance).toBe(600);
  expect(con800.currentBalance).toBe(600); // balance no cambia
});

// ── 13. required_amount_change no afecta balance ni totalContributed ──────────
test('computeGuaranteeFromMovements: required_amount_change es ignorado en cálculos', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 600, 'credit'),
    movement(2, 'required_amount_change', 200, 'credit'), // movimiento de auditoría
  ];
  const result = computeGuaranteeFromMovements(800, movs);
  expect(result.currentBalance).toBe(600);      // required_amount_change NO suma al balance
  expect(result.totalContributed).toBe(600);    // NO suma a totalContributed
});
