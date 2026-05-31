import { test } from '../fixtures/console';
import { assertNotProduction, qaDocTag, skipUnlessQaDbWrites, trackQaArtifact, isoDateOffset } from '../helpers/qa';
import {
  deleteQaDocumentoViaUi,
  editQaDocumento,
  expectDocumentoEstadoPorVencer,
  expectDocumentoNotVisible,
  expectDocumentoVisible,
  registerQaDocumento,
} from '../helpers/documentacion-form';

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Documentación (Fase D)', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.describe('mutaciones (requieren QA_ALLOW_DB_WRITES=1)', () => {
    test.beforeEach(({ }, testInfo) => {
      skipUnlessQaDbWrites(test);
    });

    test('crear documento QA', async ({ page }) => {
      test.setTimeout(180_000);
      const tag = qaDocTag();
      await registerQaDocumento(page, {
        tag,
        tipo: 'OTRO_VENCIMIENTO',
        fechaVencimiento: isoDateOffset(400),
      });
      await expectDocumentoVisible(page, tag);
      trackQaArtifact(`doc-create OK: ${tag}`);
    });

    test('editar documento QA', async ({ page }) => {
      test.setTimeout(180_000);
      const tag = qaDocTag('create');
      const editedTag = qaDocTag('edited');

      await registerQaDocumento(page, {
        tag,
        tipo: 'OTRO_VENCIMIENTO',
        fechaVencimiento: isoDateOffset(400),
      });
      await expectDocumentoVisible(page, tag);

      await editQaDocumento(page, tag, {
        tipo: 'GPS',
        comentarios: editedTag,
        fechaVencimiento: isoDateOffset(15),
      });

      await expectDocumentoVisible(page, editedTag);
      await expectDocumentoNotVisible(page, tag);
      await expectDocumentoEstadoPorVencer(page, editedTag);
      trackQaArtifact(`doc-edit OK: ${editedTag}`);
    });

    test('eliminar documento QA', async ({ page }) => {
      test.setTimeout(180_000);
      const tag = qaDocTag();
      const { id } = await registerQaDocumento(page, { tag, tipo: 'OTRO_VENCIMIENTO' });
      await expectDocumentoVisible(page, tag);

      await deleteQaDocumentoViaUi(page, tag, id);
      await expectDocumentoNotVisible(page, tag);
      trackQaArtifact(`doc-delete OK: ${tag}`);
    });
  });
});
