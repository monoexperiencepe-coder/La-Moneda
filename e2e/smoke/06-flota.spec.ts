import { test } from '../fixtures/console';
import { assertNotProduction, qaTag, skipUnlessQaDbWrites, trackQaArtifact } from '../helpers/qa';
import {
  assignConductorToQaVehiculo,
  clearConductorFromQaVehiculo,
  createQaVehiculoForTest,
  deleteQaVehiculoViaUi,
  editQaVehiculo,
  expectEditFormValues,
  expectVehiculoDetalleShows,
  expectVehiculoNotVisibleInInventario,
  expectVehiculoVisibleInInventario,
  getVehiculoCard,
  registerQaVehiculoViaUi,
} from '../helpers/flota-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Flota (Fase C)', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.describe('mutaciones (requieren QA_ALLOW_DB_WRITES=1)', () => {
    test.beforeEach(({ }, testInfo) => {
      skipUnlessQaDbWrites(test);
    });

    test('registrar vehículo QA por UI', async ({ page }) => {
      test.setTimeout(120_000);
      const { placa } = await registerQaVehiculoViaUi(page);
      await expectVehiculoVisibleInInventario(page, placa);
      trackQaArtifact(`flota-registro OK: ${placa}`);
    });

    test('editar vehículo QA', async ({ page }) => {
      test.setTimeout(120_000);
      const baseModelo = qaTag('flota-base').slice(0, 48);
      const editedModelo = qaTag('flota-edited').slice(0, 48);
      const color = 'Azul QA';
      const observaciones = qaTag('flota-obs').slice(0, 64);

      const veh = await createQaVehiculoForTest({ modelo: baseModelo });
      await editQaVehiculo(page, veh.id, {
        modelo: editedModelo,
        color,
        observaciones,
      });

      await expectVehiculoDetalleShows(page, {
        vehicleId: veh.id,
        modeloFragment: editedModelo,
      });
      await expectEditFormValues(page, veh.id, {
        modelo: editedModelo,
        color,
        observaciones,
      });
      await expectVehiculoVisibleInInventario(page, veh.placa);
      trackQaArtifact(`flota-edit OK: ${veh.placa}`);
    });

    test('eliminar vehículo QA', async ({ page }) => {
      test.setTimeout(120_000);
      const veh = await createQaVehiculoForTest({ modelo: qaTag('flota-del').slice(0, 32) });
      await expectVehiculoVisibleInInventario(page, veh.placa);

      await deleteQaVehiculoViaUi(page, veh.id, veh.placa);
      await expectVehiculoNotVisibleInInventario(page, veh.placa);
      trackQaArtifact(`flota-delete OK: ${veh.placa}`);
    });

    test('asignar / reasignar conductor', async ({ page }) => {
      test.setTimeout(180_000);
      const veh = await createQaVehiculoForTest({ modelo: qaTag('flota-asig').slice(0, 32) });

      await expectVehiculoVisibleInInventario(page, veh.placa);
      const card = getVehiculoCard(page, veh.placa);
      await card.scrollIntoViewIfNeeded();
      const cardAssignBtn = card.getByRole('button', { name: /Asignar \/ Reasignar/i });
      if (!(await cardAssignBtn.isVisible().catch(() => false))) {
        test.skip(true, 'Sin permiso o botón Asignar no visible en tarjeta QA');
      }

      try {
        const { conductorLabel } = await assignConductorToQaVehiculo(page, veh.placa);
        await clearConductorFromQaVehiculo(page, veh.placa);
        trackQaArtifact(`flota-asignacion OK: ${veh.placa} · conductor=${conductorLabel}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/No hay conductores vigentes/i.test(msg)) {
          test.skip(true, 'Sin conductores vigentes en tenant QA');
        }
        throw err;
      }
    });
  });
});
