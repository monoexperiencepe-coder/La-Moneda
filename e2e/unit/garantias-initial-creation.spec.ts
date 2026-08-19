import { expect, test } from '@playwright/test';
import type { GuaranteeMovement } from '../../src/data/garantiasTypes';
import { computeGuaranteeFromMovements, validateNewMovement } from '../../src/utils/garantiasCalc';

function movement(
  id: number,
  movementType: GuaranteeMovement['movementType'],
  amount: number,
  direction: GuaranteeMovement['direction'],
): GuaranteeMovement {
  return {
    id, empresaId: 'empresa', guaranteeId: 1, driverId: 'driver', vehicleId: null,
    movementType, amount, direction, observation: null, reason: null,
    relatedMovementId: null, createdBy: 'user', movementDate: '2026-08-19',
    createdAt: '2026-08-19T00:00:00Z', metadata: {},
  };
}

test('A: requerida 600 y entrega inicial 600 queda completa', () => {
  const result = computeGuaranteeFromMovements(600, [movement(1, 'initial_deposit', 600, 'credit')]);
  expect(result).toMatchObject({ totalContributed: 600, currentBalance: 600, pendingAmount: 0, status: 'completa' });
});

test('B: requerida 1000 y entrega inicial 600 queda incompleta', () => {
  const result = computeGuaranteeFromMovements(1000, [movement(1, 'initial_deposit', 600, 'credit')]);
  expect(result).toMatchObject({ totalContributed: 600, currentBalance: 600, pendingAmount: 400, status: 'incompleta' });
});

test('C: requerida 1000 y entrega inicial 0 queda sin garantía', () => {
  const result = computeGuaranteeFromMovements(1000, []);
  expect(result).toMatchObject({ totalContributed: 0, currentBalance: 0, pendingAmount: 1000, status: 'sin_garantia' });
});

test('una garantía completa de 600 admite descuento de 100 y queda pendiente de reponer', () => {
  const initial = movement(1, 'initial_deposit', 600, 'credit');
  const guarantee = {
    id: 1, empresaId: 'empresa', driverId: 'driver', currentVehicleId: null,
    vehicleType: 'auto' as const, requiredAmount: 600, currentBalance: 600,
    totalContributed: 600, totalDeducted: 0, status: 'completa' as const,
    closedAt: null, notes: null, createdBy: 'user', createdAt: '', updatedAt: '',
  };
  expect(validateNewMovement({ guarantee, movements: [initial], movementType: 'other_deduction', amount: 100 })).toBeNull();
  const result = computeGuaranteeFromMovements(600, [initial, movement(2, 'other_deduction', 100, 'debit')]);
  expect(result).toMatchObject({ currentBalance: 500, totalDeducted: 100, pendingAmount: 100, status: 'con_descuentos_pendientes' });
});
