import { qaDbWritesEnabled, qaSessionLog } from './helpers/qa';
import { cleanupQaEntities, formatCleanupReportSummary } from './helpers/qa-cleanup';
import { getFailedQaEntities, getPendingQaEntities } from './helpers/qa-registry';

export default async function globalTeardown(): Promise<void> {
  if (qaSessionLog.length > 0) {
    // eslint-disable-next-line no-console
    console.info('\n[QA_AUTO] Registros creados en esta sesión:');
    for (const line of qaSessionLog) {
      // eslint-disable-next-line no-console
      console.info(`  · ${line}`);
    }
  }

  if (!qaDbWritesEnabled()) {
    // eslint-disable-next-line no-console
    console.info('[QA_AUTO] QA_ALLOW_DB_WRITES≠1 — cleanup automático omitido.');
    return;
  }

  // eslint-disable-next-line no-console
  console.info('[QA CLEANUP] start · globalTeardown (fin de suite)');
  const report = await cleanupQaEntities();
  // eslint-disable-next-line no-console
  console.info(`\n${formatCleanupReportSummary(report)}`);

  const stillPending = getPendingQaEntities();
  const stillFailed = getFailedQaEntities();
  if (stillPending.length > 0 || stillFailed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      '[QA_AUTO] CLEANUP INCOMPLETO — revisa e2e/.qa-artifacts/cleanup-report.json y elimina manualmente por prefijo [QA_AUTO].',
    );
  }
}
