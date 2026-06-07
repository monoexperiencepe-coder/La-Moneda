import { test, expect } from '../fixtures/console';
import { assertNotProduction, createQaTag, skipUnlessQaDbWrites } from '../helpers/qa';
import { markQaEntityCleaned } from '../helpers/qa-registry';
import {
  cerrarIndisponibilidadOnVehicle,
  cleanupQaVehicleDowntimeOrFail,
  expectPlacaEnDisponibilidadDashboard,
  readVehiculoFinanzasSnapshot,
  registerIndisponibilidadOnVehicle,
  resolveVehicleIdForTest,
} from '../helpers/disponibilidad-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Disponibilidad operativa', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.beforeEach(({ }, testInfo) => {
    skipUnlessQaDbWrites(test);
  });

  test('registrar indisponibilidad QA sin alterar utilidad del vehículo', async ({ page }) => {
    test.setTimeout(180_000);
    const vehicleId = await resolveVehicleIdForTest(page, 1);
    const comentario = createQaTag('downtime');

    const before = await readVehiculoFinanzasSnapshot(page, vehicleId);

    let downtimeId: number;
    try {
      const created = await registerIndisponibilidadOnVehicle(page, { vehicleId, comentario });
      downtimeId = created.id;
      await expectPlacaEnDisponibilidadDashboard(page, created.placa || '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/vehicle_downtime|404|relation|does not exist/i.test(msg)) {
        test.skip(true, 'Tabla vehicle_downtime no disponible — ejecuta supabase/migration_vehicle_downtime.sql');
      }
      throw err;
    }

    const after = await readVehiculoFinanzasSnapshot(page, vehicleId);
    expect(after.ingresos).toBe(before.ingresos);
    expect(after.gastos).toBe(before.gastos);
    expect(after.utilidadReal).toBe(before.utilidadReal);

    await cerrarIndisponibilidadOnVehicle(page, vehicleId);
    await cleanupQaVehicleDowntimeOrFail(downtimeId);
    markQaEntityCleaned(String(downtimeId), { kind: 'vehicle_downtime', method: 'api' });
  });
});
