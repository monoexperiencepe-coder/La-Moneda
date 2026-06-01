import { test, expect } from '../fixtures/console';
import { assertNotProduction, qaTag, skipUnlessQaDbWrites, trackQaArtifact } from '../helpers/qa';
import {
  expectKmMaintenanceAlert,
  expectKmMantVisible,
  expectKmNotVisible,
  expectKmSummaryUpdated,
  expectKmValidationBlocked,
  expectKmVisible,
  KM_AT_LEAST_ONE_ERROR,
  registerQaKm,
  registerQaVehiculoIfNeeded,
  undoQaKm,
} from '../helpers/kilometraje-form';
import { buildKilometrajePayload } from '../../src/utils/kilometrajeForm';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Kilometraje', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.describe('validación buildKilometrajePayload (unit)', () => {
    const base = {
      vehicleId: 1,
      fecha: '2026-05-30',
      descripcionExtra: '[QA_AUTO] test',
    };

    test('simple: ambos vacíos → error unificado', () => {
      const r = buildKilometrajePayload({
        ...base,
        tipo: 'simple',
        kilometrajeRaw: '',
        kmMantenimientoRaw: '',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe(KM_AT_LEAST_ONE_ERROR);
    });

    test('simple: solo odómetro → ok', () => {
      const r = buildKilometrajePayload({
        ...base,
        tipo: 'simple',
        kilometrajeRaw: '12000',
        kmMantenimientoRaw: '',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.row.kilometraje).toBe(12000);
        expect(r.row.kmMantenimiento).toBe(12000);
      }
    });

    test('simple: solo km mantenimiento → ok (odómetro null)', () => {
      const r = buildKilometrajePayload({
        ...base,
        tipo: 'simple',
        kilometrajeRaw: '',
        kmMantenimientoRaw: '11000',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.row.kilometraje).toBeNull();
        expect(r.row.kmMantenimiento).toBe(11000);
      }
    });

    test('simple: ambos llenos → ok', () => {
      const r = buildKilometrajePayload({
        ...base,
        tipo: 'simple',
        kilometrajeRaw: '12500',
        kmMantenimientoRaw: '12000',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.row.kilometraje).toBe(12500);
        expect(r.row.kmMantenimiento).toBe(12000);
      }
    });
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

    test('registrar solo kilometraje actual (simple)', async ({ page }) => {
      test.setTimeout(120_000);
      const tag = qaTag('km-solo-act');
      const kmValue = 33_000 + (Date.now() % 1000);

      const veh = await registerQaVehiculoIfNeeded(page);
      const { id: kmId } = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag,
        kilometraje: kmValue,
        tipo: 'simple',
      });

      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: kmValue, tag });
      trackQaArtifact(`km-solo-act OK: ${tag}`);
      await undoQaKm(page, kmId);
    });

    test('registrar solo kilometraje de mantenimiento', async ({ page }) => {
      test.setTimeout(120_000);
      const tag = qaTag('km-solo-mant');
      const kmMant = 22_000 + (Date.now() % 1000);

      const veh = await registerQaVehiculoIfNeeded(page);
      const { id: kmId } = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag,
        kmMantenimiento: kmMant,
        tipo: 'simple',
      });

      await expectKmMantVisible(page, { vehiclePlaca: veh.placa, kmMantenimiento: kmMant, tag });
      trackQaArtifact(`km-solo-mant OK: ${tag}`);
      await undoQaKm(page, kmId);
    });

    test('ambos vacíos bloquea guardado', async ({ page }) => {
      test.setTimeout(120_000);
      const veh = await registerQaVehiculoIfNeeded(page);
      await expectKmValidationBlocked(page, { vehicleId: veh.id, tipo: 'simple' });
      trackQaArtifact('km-both-empty blocked OK');
    });

    test('ambos llenos (simple)', async ({ page }) => {
      test.setTimeout(120_000);
      const tag = qaTag('km-both');
      const kmMant = 18_000 + (Date.now() % 500);
      const kmAct = kmMant + 350;

      const veh = await registerQaVehiculoIfNeeded(page);
      const { id: kmId } = await registerQaKm(page, {
        vehicleId: veh.id,
        vehiclePlaca: veh.placa,
        tag,
        kilometraje: kmAct,
        kmMantenimiento: kmMant,
        tipo: 'simple',
      });

      await expectKmVisible(page, { vehiclePlaca: veh.placa, kilometraje: kmAct, tag });
      await expectKmMantVisible(page, { vehiclePlaca: veh.placa, kmMantenimiento: kmMant, tag });
      trackQaArtifact(`km-both OK: ${tag}`);
      await undoQaKm(page, kmId);
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
