import { test, expect } from '../fixtures/console';
import { assertNotProduction, createQaTag, skipUnlessQaDbWrites } from '../helpers/qa';
import { markQaEntityCleaned } from '../helpers/qa-registry';
import { expectQaIngresoAbsentInSupabase } from '../helpers/qa-supabase';
import {
  expectIngresoNotVisibleInHistorial,
  expectIngresoVisibleInHistorial,
  openRegistrarIngresoModal,
  registerIngreso,
  undoCreateIngreso,
} from '../helpers/ingresos-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Ingresos CRUD + undo', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.beforeEach(({ }, testInfo) => {
    skipUnlessQaDbWrites(test);
  });

  test('registrar ingreso QA + deshacer + verificar ausencia en BD', async ({ page }) => {
    test.setTimeout(120_000);
    const tag = createQaTag('ingreso-undo');

    await openRegistrarIngresoModal(page);
    const { id, monto, vehicleHint } = await registerIngreso(page, { comentarios: tag, monto: '77.77' });
    await expectIngresoVisibleInHistorial(page, { monto, vehicleHint });

    await undoCreateIngreso(page);

    await expectIngresoNotVisibleInHistorial(page, { monto, vehicleHint });
    await expectQaIngresoAbsentInSupabase(id);
    markQaEntityCleaned(id, { kind: 'ingreso', method: 'none' });
  });
});
