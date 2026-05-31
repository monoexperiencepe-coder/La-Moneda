import { test, expect } from '../fixtures/console';
import { assertNotProduction, qaTag, skipUnlessQaDbWrites, trackQaArtifact } from '../helpers/qa';
import {
  expectKmMaintenanceAlert,
  expectKmNotVisible,
  expectKmSummaryUpdated,
  expectKmVisible,
  registerQaKm,
  registerQaVehiculoIfNeeded,
  undoQaKm,
} from '../helpers/kilometraje-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Kilometraje', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.describe('mutaciones (requieren QA_ALLOW_DB_WRITES=1)', () => {
    test.beforeEach(({ }, testInfo) => {
      skipUnlessQaDbWrites(test);
    });

    test('registrar kilometraje QA + undo', async ({ page }) => {
      test.setTimeout(120_000);
      const tag = qaTag('km-basic');
      const kmValue = 42_000 + (Date.now() % 1000);

      const veh = await registerQaVehiculoIfNeeded(page);
      const { id: kmId } = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag,
        kilometraje: kmValue,
      });

      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: kmValue, tag });
      await expectKmSummaryUpdated(page, { vehiclePlaca: veh.placa, ultimoRegistroKm: kmValue });

      await undoQaKm(page, kmId);

      await expectKmNotVisible(page, { vehiclePlaca: veh.placa, kilometraje: kmValue });
      trackQaArtifact(`km-basic undo OK: ${tag}`);
    });

    test('alerta mantenimiento 5000 km', async ({ page }) => {
      test.setTimeout(180_000);
      const baseTag = qaTag('km-alert-base');
      const updateTag = qaTag('km-alert-update');
      const baseKm = 10_000;
      const updateKm = 15_100;

      const veh = await registerQaVehiculoIfNeeded(page);

      const base = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag: baseTag,
        kilometraje: baseKm,
        tipo: 'simple',
        kmMantenimiento: baseKm,
      });

      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: baseKm, tag: baseTag });

      const update = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag: updateTag,
        kilometraje: updateKm,
        tipo: 'solo_km',
      });

      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: baseKm, tag: baseTag });
      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: updateKm, tag: updateTag });
      await expectKmMaintenanceAlert(page, { vehiclePlaca: veh.placa, variacionKm: updateKm - baseKm });

      await undoQaKm(page, update.id);
      await expectKmNotVisible(page, { vehiclePlaca: veh.placa, kilometraje: updateKm });
      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: baseKm, tag: baseTag });

      trackQaArtifact(`km-alert OK: ${updateTag} (base km queda en cleanup)`);
    });
  });
});
