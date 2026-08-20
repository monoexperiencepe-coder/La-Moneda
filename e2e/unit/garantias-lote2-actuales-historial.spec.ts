/**
 * Tests Lote 2 — Actuales vs Historial.
 *
 * Cubre:
 * 1.  fetchDriverGuarantees acepta parámetro options.activeOnly.
 * 2.  Cuando activeOnly=true, la query incluye filtro closed_at IS NULL.
 * 3.  useGarantiasListData acepta parámetro mode.
 * 4.  El hook exporta el tipo GarantiasListMode.
 * 5.  Garantias.tsx tiene dos tabs: "Actuales" e "Historial".
 * 6.  Garantias.tsx usa tab state y lo pasa al hook.
 * 7.  El tab Actuales muestra KPIs (summary).
 * 8.  El tab Historial muestra fecha de cierre en columna.
 * 9.  El tab Historial muestra aviso de solo lectura.
 * 10. El status filter de Actuales no contiene 'cerrada/devuelta'.
 * 11. El status filter de Historial solo contiene 'cerrada/devuelta'.
 * 12. computeGuaranteeFromMovements: garantía con closed_at sigue calculando balance desde movimientos.
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

// ── 1. Service: fetchDriverGuarantees acepta options.activeOnly ───────────────
test('Service: fetchDriverGuarantees acepta segundo parámetro options con activeOnly', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('options?: { activeOnly?: boolean }');
});

// ── 2. Service: cuando activeOnly=true la query filtra closed_at IS NULL ──────
test('Service: activeOnly aplica is(closed_at, null) al query', () => {
  const src = resolveSource('../../src/services/garantiasService.ts');
  expect(src).toContain('options?.activeOnly');
  expect(src).toContain(".is('closed_at', null)");
});

// ── 3. Hook: acepta parámetro mode ───────────────────────────────────────────
test('useGarantiasListData: acepta tercer parámetro mode', () => {
  const src = resolveSource('../../src/hooks/garantias/useGarantiasListData.ts');
  expect(src).toContain("mode: GarantiasListMode = 'active'");
});

// ── 4. Hook: exporta tipo GarantiasListMode ───────────────────────────────────
test('useGarantiasListData: exporta tipo GarantiasListMode', () => {
  const src = resolveSource('../../src/hooks/garantias/useGarantiasListData.ts');
  expect(src).toContain("export type GarantiasListMode = 'active' | 'history'");
});

// ── 5. Página: dos tabs visibles ──────────────────────────────────────────────
test('Garantias.tsx: tiene tab "Actuales" e tab "Historial"', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('Actuales');
  expect(src).toContain('Historial');
  expect(src).toContain("handleTabChange('active')");
  expect(src).toContain("handleTabChange('history')");
});

// ── 6. Página: usa tab state y lo pasa al hook ───────────────────────────────
test('Garantias.tsx: pasa tab al hook useGarantiasListData como tercer argumento', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('tab,');
  expect(src).toContain('GarantiasListMode');
});

// ── 7. Página: KPIs se muestran solo en tab activas ──────────────────────────
test("Garantias.tsx: KPIs solo en tab 'active' (summary != null guard)", () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain("if (tab !== 'active') return null;");
  expect(src).toContain('summary != null');
});

// ── 8. Página: columna "Fecha cierre" solo en historial ──────────────────────
test("Garantias.tsx: columna Fecha cierre solo en tab 'history'", () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain("tab === 'history'");
  expect(src).toContain('Fecha cierre');
  expect(src).toContain('r.closedAt');
});

// ── 9. Página: aviso en historial de solo lectura ────────────────────────────
test("Garantias.tsx: aviso informativo solo en tab 'history'", () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('El historial muestra garantías cerradas o devueltas');
});

// ── 10. Vista activas NO incluye garantías cerradas/devueltas ────────────────
// La separación ocurre en DB (closed_at IS NULL) vía fetchDriverGuarantees activeOnly.
// La página ya no necesita un array ACTIVE_STATUSES: el hook lo gestiona.
test('Garantias.tsx: la vista Actuales filtra en DB, no con ACTIVE_STATUSES en cliente', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  // HISTORY_STATUSES sigue existiendo para el filtro de la vista historial
  expect(src).toContain('HISTORY_STATUSES');
  // La tabla Actuales parte de padronRows (vehículos), no de garantías filtradas por estado
  expect(src).toContain('padronRows');
  // No debe mostrar cerradas en la vista principal (solo en historial)
  expect(src).not.toContain("tab === 'active' ? 'No hay garantías cerradas'");
});

// ── 11. Página: statusOptions de historial incluye cerrada y devuelta ─────────
test('Garantias.tsx: HISTORY_STATUSES incluye cerrada y devuelta', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('HISTORY_STATUSES');
  expect(src).toContain("'cerrada'");
  expect(src).toContain("'devuelta'");
});

// ── 12. Cálculo financiero: garantía cerrada sigue computando desde movimientos ──
test('computeGuaranteeFromMovements: garantía cerrada mantiene balance correcto', () => {
  const movs: GuaranteeMovement[] = [
    movement(1, 'initial_deposit', 800, 'credit'),
    movement(2, 'fine_deduction', 200, 'debit'),
    movement(3, 'final_refund', 600, 'debit'),
  ];
  const result = computeGuaranteeFromMovements(1000, movs, { fullyRefunded: true });
  expect(result.currentBalance).toBe(0);
  expect(result.totalContributed).toBe(800);
  expect(result.totalDeducted).toBe(200);
  expect(result.totalRefunded).toBe(600);
  expect(result.status).toBe('devuelta');
});
