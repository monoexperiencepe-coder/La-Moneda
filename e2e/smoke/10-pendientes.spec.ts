import { test } from '../fixtures/console';
import { assertNotProduction, createQaTag, skipUnlessQaDbWrites } from '../helpers/qa';
import { markQaEntityCleaned } from '../helpers/qa-registry';
import {
  cleanupQaPendienteOrFail,
  completarPendienteByTitulo,
  createQaPendiente,
  expectPendienteVisible,
} from '../helpers/pendientes-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Pendientes CRUD', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.beforeEach(({ }, testInfo) => {
    skipUnlessQaDbWrites(test);
  });

  test('crear pendiente QA, completar y cleanup por API', async ({ page }) => {
    test.setTimeout(180_000);
    const titulo = createQaTag('pendiente');

    const { id } = await createQaPendiente(page, { titulo, descripcion: `${titulo} descripcion` });
    await expectPendienteVisible(page, titulo, 'backlog');

    await completarPendienteByTitulo(page, titulo);
    await expectPendienteVisible(page, titulo, 'completadas');

    await cleanupQaPendienteOrFail(id);
    markQaEntityCleaned(String(id), { kind: 'pendiente', method: 'api' });
  });
});
