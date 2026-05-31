import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

type FlowRow = {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  durationMs: number;
  error?: string;
};

class FlowSummaryReporter implements Reporter {
  private rows: FlowRow[] = [];
  private startedAt = 0;

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = Date.now();
    this.rows = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.titlePath().slice(1).join(' › ');
    this.rows.push({
      title,
      status: result.status,
      durationMs: result.duration,
      error: result.error?.message,
    });
  }

  onEnd(result: FullResult): void {
    const totalMs = Date.now() - this.startedAt;
    const passed = this.rows.filter((r) => r.status === 'passed');
    const failed = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut');
    const skipped = this.rows.filter((r) => r.status === 'skipped');

    // eslint-disable-next-line no-console
    console.info('\n========== La Moneda · QA Smoke (Playwright) ==========');
    // eslint-disable-next-line no-console
    console.info(`Duración total: ${(totalMs / 1000).toFixed(1)}s · Estado global: ${result.status}`);
    // eslint-disable-next-line no-console
    console.info(`Pasaron: ${passed.length} · Fallaron: ${failed.length} · Omitidos: ${skipped.length}`);

    if (passed.length > 0) {
      // eslint-disable-next-line no-console
      console.info('\n✓ Tests pasados:');
      for (const r of passed) {
        // eslint-disable-next-line no-console
        console.info(`  · ${r.title} (${(r.durationMs / 1000).toFixed(1)}s)`);
      }
    }

    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.info('\n✗ Tests fallidos (revisar screenshot en test-results/):');
      for (const r of failed) {
        // eslint-disable-next-line no-console
        console.info(`  · ${r.title} (${(r.durationMs / 1000).toFixed(1)}s)`);
        if (r.error) {
          const firstLine = r.error.split('\n')[0]?.slice(0, 240);
          // eslint-disable-next-line no-console
          console.info(`    → ${firstLine}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.info('\nReporte HTML: playwright-report/index.html');
    // eslint-disable-next-line no-console
    console.info('====================================================\n');
  }
}

export default FlowSummaryReporter;
