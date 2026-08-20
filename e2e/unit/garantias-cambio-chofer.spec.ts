/**
 * Tests unitarios para "GARANTÍAS: Editar / Cambiar Chofer".
 *
 * Escenarios cubiertos:
 * 1.  SQL: update_driver_guarantee_info existe en migration y es SECURITY DEFINER
 * 2.  SQL: set search_path = '' aplicado (hardening)
 * 3.  SQL: chequea que solo admin/contador/socio pueden ejecutar
 * 4.  SQL: chequea conductor_ya_tiene_garantia_activa si driver cambia
 * 5.  SQL: NOT modifica required_amount, current_balance, total_contributed, total_deducted
 * 6.  SQL: NOT modifica guarantee_movements (historial inmutable)
 * 7.  SQL: valida que garantía no esté cerrada/devuelta
 * 8.  SQL: valida conductor pertenece a empresa
 * 9.  SQL: valida vehículo pertenece a empresa (si se indica)
 * 10. Service: mapeo de error conductor_ya_tiene_garantia_activa
 * 11. Service: mapeo de error garantia_cerrada
 * 12. Service: mapeo de error conductor_no_pertenece_empresa
 * 13. Service: mapeo de error vehiculo_no_pertenece_empresa
 * 14. Conservación financiera: computeGuaranteeFromMovements no cambia si solo cambia driver_id
 * 15. Modal: fuente importa updateGuaranteeInfo desde garantiasService
 * 16. Detalle: botón "Editar información" disponible en source de GarantiaDetalle
 * 17. Detalle: EditarGarantiaModal importado en GarantiaDetalle
 * 18. Modal: campos protegidos ausentes del form (required_amount, current_balance, etc.)
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GuaranteeMovement } from '../../src/data/garantiasTypes';
import { computeGuaranteeFromMovements } from '../../src/utils/garantiasCalc';

function resolveSource(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
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

// ── 1. SQL: función existe en la migración y es SECURITY DEFINER ───────────
test('SQL: update_driver_guarantee_info declarada como security definer', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain('create or replace function public.update_driver_guarantee_info');
  expect(sql.toLowerCase()).toContain('security definer');
});

// ── 2. SQL: search_path = '' (hardening máximo) ───────────────────────────
test('SQL: set search_path = \'\' aplicado en update_driver_guarantee_info', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain("set search_path = ''");
});

// ── 3. SQL: solo admin/contador/socio autorizados ─────────────────────────
test('SQL: chequea rol admin/contador/socio en update_driver_guarantee_info', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain("'admin', 'contador', 'socio'");
  expect(sql).toContain('rol_sin_permiso');
});

// ── 4. SQL: verifica que nuevo conductor no tenga garantía activa ──────────
test('SQL: chequea conductor_ya_tiene_garantia_activa al cambiar driver', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain('conductor_ya_tiene_garantia_activa');
  // Solo aplica cuando el conductor cambia: debe excluir el id actual
  expect(sql).toContain('id         <> p_guarantee_id');
});

// ── 5. SQL: NOT modifica campos financieros ────────────────────────────────
test('SQL: update no toca required_amount, current_balance, total_contributed, total_deducted', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  // Bloque UPDATE solo debe setear campos no financieros
  const updateBlock = sql.match(/update public\.driver_guarantees\s+set([\s\S]*?)where/);
  expect(updateBlock).not.toBeNull();
  const setClause = updateBlock![1];
  expect(setClause).not.toContain('required_amount');
  expect(setClause).not.toContain('current_balance');
  expect(setClause).not.toContain('total_contributed');
  expect(setClause).not.toContain('total_deducted');
  // Sí debe contener los campos editables
  expect(setClause).toContain('driver_id');
  expect(setClause).toContain('current_vehicle_id');
  expect(setClause).toContain('vehicle_type');
  expect(setClause).toContain('notes');
});

// ── 6. SQL: no toca guarantee_movements ───────────────────────────────────
test('SQL: migration no contiene ningún UPDATE/INSERT en guarantee_movements', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  // Cualquier escritura en guarantee_movements sería un bug
  expect(sql).not.toMatch(/update\s+public\.guarantee_movements/i);
  expect(sql).not.toMatch(/insert\s+into\s+public\.guarantee_movements/i);
});

// ── 7. SQL: rechaza garantías cerradas/devueltas ──────────────────────────
test('SQL: rechaza garantía cerrada o devuelta con garantia_cerrada', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain('garantia_cerrada');
  expect(sql).toContain("status in ('cerrada', 'devuelta')");
});

// ── 8. SQL: valida conductor pertenece a empresa ──────────────────────────
test('SQL: valida conductor_no_pertenece_empresa', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain('conductor_no_pertenece_empresa');
  expect(sql).toContain('from public.conductores');
});

// ── 9. SQL: valida vehículo pertenece a empresa (si se indica) ─────────────
test('SQL: valida vehiculo_no_pertenece_empresa cuando p_current_vehicle_id no es null', () => {
  const sql = resolveSource('../../supabase/migration_garantias_update_info.sql');
  expect(sql).toContain('vehiculo_no_pertenece_empresa');
  expect(sql).toContain('p_current_vehicle_id is not null');
  expect(sql).toContain('from public.vehiculos');
});

// ── 10. Service: mapeo de conductor_ya_tiene_garantia_activa ──────────────
test('Service: error conductor_ya_tiene_garantia_activa se mapea con mensaje legible', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('El conductor seleccionado ya tiene una garantía activa.');
  expect(src).toContain('conductor_ya_tiene_garantia_activa');
});

// ── 11. Service: mapeo de garantia_cerrada ────────────────────────────────
test('Service: error garantia_cerrada se mapea con mensaje legible', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('No se puede editar una garantía cerrada o devuelta.');
});

// ── 12. Service: mapeo de conductor_no_pertenece_empresa ──────────────────
test('Service: error conductor_no_pertenece_empresa se mapea con mensaje legible', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('El conductor no pertenece a esta empresa.');
});

// ── 13. Service: mapeo de vehiculo_no_pertenece_empresa ───────────────────
test('Service: error vehiculo_no_pertenece_empresa se mapea con mensaje legible', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('El vehículo no pertenece a esta empresa.');
});

// ── 14. Conservación financiera: cambiar driver_id no altera saldos ────────
test('financiero: computeGuaranteeFromMovements es independiente de driver_id', () => {
  const movs = [
    movement(1, 'initial_deposit', 600, 'credit'),
    movement(2, 'deduction', 100, 'debit'),
    movement(3, 'deposit', 50, 'credit'),
  ];
  const resultA = computeGuaranteeFromMovements(600, movs);
  // Simular cambio de driver_id en los movimientos (snapshot inmutable)
  const movsWithNewDriver = movs.map((m) => ({ ...m, driverId: 'driver-B' }));
  const resultB = computeGuaranteeFromMovements(600, movsWithNewDriver);
  // Los saldos no dependen de driverId
  expect(resultA.currentBalance).toBe(resultB.currentBalance);
  expect(resultA.totalContributed).toBe(resultB.totalContributed);
  expect(resultA.totalDeducted).toBe(resultB.totalDeducted);
  expect(resultA.status).toBe(resultB.status);
});

// ── 15. Modal: importa updateGuaranteeInfo ────────────────────────────────
test('EditarGarantiaModal importa updateGuaranteeInfo desde garantiasService', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  expect(src).toContain('updateGuaranteeInfo');
  expect(src).toContain("from '../../services/garantiasService'");
});

// ── 16. Detalle: botón "Editar información" en source ─────────────────────
test('GarantiaDetalle tiene botón "Editar información"', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain('Editar información');
  expect(src).toContain('setShowEdit');
});

// ── 17. Detalle: EditarGarantiaModal importado ────────────────────────────
test('GarantiaDetalle importa EditarGarantiaModal', () => {
  const src = resolveSource('../../src/pages/Operaciones/GarantiaDetalle.tsx');
  expect(src).toContain("import EditarGarantiaModal from '../../components/garantias/EditarGarantiaModal'");
  expect(src).toContain('<EditarGarantiaModal');
});

// ── 18. Modal: campos financieros ausentes en el form ─────────────────────
test('EditarGarantiaModal no renderiza campos financieros protegidos', () => {
  const src = resolveSource('../../src/components/garantias/EditarGarantiaModal.tsx');
  // required_amount, current_balance, total_contributed, total_deducted no deben
  // aparecer como inputs modificables (solo driver, vehicle, type, notes)
  expect(src).not.toContain('requiredAmount');
  expect(src).not.toContain('currentBalance');
  expect(src).not.toContain('totalContributed');
  expect(src).not.toContain('totalDeducted');
  // Campos editables deben estar presentes
  expect(src).toContain('driverId');
  expect(src).toContain('vehicleType');
  expect(src).toContain('notes');
});
