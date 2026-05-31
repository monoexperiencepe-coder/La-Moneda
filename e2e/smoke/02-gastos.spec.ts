import { test, expect } from '../fixtures/console';
import { assertNotProduction, qaTag, skipUnlessQaDbWrites, trackQaArtifact } from '../helpers/qa';
import { markQaEntityCleaned } from '../helpers/qa-registry';
import { expectQaGastoAbsentInSupabase, fetchQaGastoFromSupabase } from '../helpers/qa-supabase';
import {
  clickEditarGastoEnFila,
  clickEliminarGastoEnFila,
  clickMoverCategoriaEnFila,
  clickUndo,
  confirmDeleteGasto,
  confirmMoveGastoToCategoria,
  enterGastosCategoriaTab,
  expectGastoNotVisibleInHistorial,
  expectGastoVisibleInHistorial,
  openRegistrarGastoModal,
  registerGasto,
  saveEditarGastoModal,
} from '../helpers/gastos-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Gastos', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.describe('mutaciones (requieren QA_ALLOW_DB_WRITES=1)', () => {
    test.beforeEach(({ }, testInfo) => {
      skipUnlessQaDbWrites(test);
    });

    test('registrar gasto administrativo', async ({ page }) => {
      const tag = qaTag('admin');
      await openRegistrarGastoModal(page);
      await registerGasto(page, { categoria: 'administrativo_empresa', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Administrativos');
      await expectGastoVisibleInHistorial(page, tag);
    });

    test('registrar gasto financiero', async ({ page }) => {
      const tag = qaTag('fin');
      await openRegistrarGastoModal(page);
      await registerGasto(page, { categoria: 'financiero_prestamo', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Financieros');
      await expectGastoVisibleInHistorial(page, tag);
    });

    test('registrar gasto operativo por vehículo', async ({ page }) => {
      const tag = qaTag('op-veh');
      await openRegistrarGastoModal(page);
      await registerGasto(page, { categoria: 'operativo_vehiculo', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Operativos por vehículo');
      await expectGastoVisibleInHistorial(page, tag);
    });

    test('registrar gasto operativo flota general', async ({ page }) => {
      const tag = qaTag('op-flota');
      await openRegistrarGastoModal(page);
      await registerGasto(page, { categoria: 'operativo_flota_general', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Operativo flota general');
      await expectGastoVisibleInHistorial(page, tag);
    });

    test('registrar inversión con utilidad sin vehículo', async ({ page }) => {
      const tag = qaTag('inv-sin-veh');
      await openRegistrarGastoModal(page, { tipo: 'inversion' });
      await registerGasto(page, { categoria: 'inversion_compra', comentarios: tag, skipVehicle: true });
      await page.goto('/finanzas/inversiones/utilidad');
      await expectGastoVisibleInHistorial(page, tag);
    });

    test('editar un gasto QA en historial', async ({ page }) => {
      const tag = qaTag('edit');
      await openRegistrarGastoModal(page);
      await registerGasto(page, { categoria: 'administrativo_empresa', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Administrativos');
      await clickEditarGastoEnFila(page, tag);
      const edited = `${tag} editado`;
      await page.locator('#gasto-edit-comentarios').fill(edited);
      await saveEditarGastoModal(page);
      await expectGastoVisibleInHistorial(page, edited);
      trackQaArtifact(`gasto editado: ${edited}`);
    });

    test.describe('Fase A · Undo + Delete', () => {
      test('registrar gasto QA + undo', async ({ page }) => {
        test.setTimeout(90_000);
        const tag = qaTag('undo-create');
        await enterGastosCategoriaTab(page, 'Administrativos');
        await openRegistrarGastoModal(page, { skipNavigation: true });
        const { id: gastoId } = await registerGasto(page, {
          categoria: 'administrativo_empresa',
          comentarios: tag,
        });
        await expectGastoVisibleInHistorial(page, tag, { gastoId });

        await clickUndo(page);

        await expectGastoNotVisibleInHistorial(page, tag, { gastoId });
        await expectQaGastoAbsentInSupabase(gastoId);
        markQaEntityCleaned(gastoId, { method: 'none' });
        trackQaArtifact(`undo create OK: ${tag}`);
      });

      test('editar gasto QA + undo', async ({ page }) => {
        test.setTimeout(90_000);
        const tag = qaTag('undo-edit');
        const montoOriginal = '12.50';
        const montoEditado = '99.99';
        await enterGastosCategoriaTab(page, 'Administrativos');
        await openRegistrarGastoModal(page, { skipNavigation: true });
        const { id: gastoId } = await registerGasto(page, {
          categoria: 'administrativo_empresa',
          comentarios: tag,
          monto: montoOriginal,
        });
        await expectGastoVisibleInHistorial(page, tag, { gastoId });

        const before = await fetchQaGastoFromSupabase(gastoId);
        expect(before.comentarios).toBe(tag);

        await clickEditarGastoEnFila(page, tag, { gastoId, alreadyVisible: true });
        const edited = `${tag} EDITADO`;
        const editDialog = page.getByRole('dialog', { name: 'Editar registro' });
        await editDialog.locator('#gasto-edit-comentarios').fill(edited);
        await editDialog.getByLabel('Monto (PEN)').fill(montoEditado);
        await saveEditarGastoModal(page);
        await expectGastoVisibleInHistorial(page, edited, { gastoId });

        const afterEdit = await fetchQaGastoFromSupabase(gastoId);
        expect(afterEdit.comentarios).toBe(edited);

        await clickUndo(page);

        await expectGastoVisibleInHistorial(page, tag, { gastoId });
        const afterUndo = await fetchQaGastoFromSupabase(gastoId);
        expect(afterUndo.comentarios).toBe(tag);
        expect(afterUndo.monto).toBeCloseTo(Number(montoOriginal), 2);
        trackQaArtifact(`undo edit OK: ${tag}`);
      });

      test('mover categoría + undo', async ({ page }) => {
        test.setTimeout(120_000);
        const tag = qaTag('undo-move');
        await enterGastosCategoriaTab(page, 'Administrativos');
        await openRegistrarGastoModal(page, { skipNavigation: true });
        const { id: gastoId } = await registerGasto(page, {
          categoria: 'administrativo_empresa',
          comentarios: tag,
        });
        await expectGastoVisibleInHistorial(page, tag, { gastoId });

        await clickMoverCategoriaEnFila(page, tag, { gastoId, alreadyVisible: true });
        await confirmMoveGastoToCategoria(page, 'gastos_globales');
        await enterGastosCategoriaTab(page, 'Globales');
        await expectGastoVisibleInHistorial(page, tag, { gastoId });

        const moved = await fetchQaGastoFromSupabase(gastoId);
        expect(moved.tipo_gasto).toBe('gastos_globales');

        await clickUndo(page);

        await enterGastosCategoriaTab(page, 'Administrativos');
        await expectGastoVisibleInHistorial(page, tag, { gastoId });
        const reverted = await fetchQaGastoFromSupabase(gastoId);
        expect(reverted.tipo_gasto).toBe('administrativo_empresa');
        trackQaArtifact(`undo move OK: ${tag}`);
      });

      test('eliminar gasto QA', async ({ page }) => {
        test.setTimeout(90_000);
        const tag = qaTag('delete');
        await enterGastosCategoriaTab(page, 'Administrativos');
        await openRegistrarGastoModal(page, { skipNavigation: true });
        const { id: gastoId } = await registerGasto(page, {
          categoria: 'administrativo_empresa',
          comentarios: tag,
        });
        await expectGastoVisibleInHistorial(page, tag, { gastoId });

        await clickEliminarGastoEnFila(page, tag, { gastoId, alreadyVisible: true });
        await confirmDeleteGasto(page);

        await expectGastoNotVisibleInHistorial(page, tag, { gastoId });
        await expectQaGastoAbsentInSupabase(gastoId);
        markQaEntityCleaned(gastoId, { method: 'ui' });
        trackQaArtifact(`delete OK: ${tag}`);
      });
    });

    test('mover categoría de un gasto QA', async ({ page }) => {
      test.setTimeout(90_000);
      const tag = qaTag('move');
      await openRegistrarGastoModal(page);
      const { id: gastoId } = await registerGasto(page, { categoria: 'administrativo_empresa', comentarios: tag });
      await enterGastosCategoriaTab(page, 'Administrativos');
      await expectGastoVisibleInHistorial(page, tag, { gastoId });
      await clickMoverCategoriaEnFila(page, tag, { gastoId, alreadyVisible: true });
      await confirmMoveGastoToCategoria(page, 'gastos_globales');
      await enterGastosCategoriaTab(page, 'Globales');
      await expectGastoVisibleInHistorial(page, tag, { gastoId });
      // eslint-disable-next-line no-console
      console.log('[QA TEST] destination verified');
      trackQaArtifact(`gasto movido a globales: ${tag}`);
    });
  });

  test('filtrar historial por subtipo y abrir historial completo', async ({ page }) => {
    await enterGastosCategoriaTab(page, 'Administrativos');
    const subtipoSelect = page.getByLabel('Filtrar por subtipo');
    await subtipoSelect.waitFor({ state: 'visible' });
    const optionCount = await subtipoSelect.locator('option').count();
    if (optionCount > 1) {
      const value = await subtipoSelect.locator('option').nth(1).getAttribute('value');
      if (value) await subtipoSelect.selectOption(value);
    }
    await page.getByRole('button', { name: 'Ver historial completo' }).click();
    await expect(
      page.getByText(/Viendo historial completo|registros cargados de esta categoría/i).first(),
    ).toBeVisible({ timeout: 120_000 });
  });
});
