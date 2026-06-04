/**
 * Genera COPILOT_EXECUTION_REPORT.md validando routing del pre-router (sin Supabase).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatCopilotExecutionReport,
  validateCopilotRouterOnly,
} from '../src/modules/copilot/copilotExecutionValidation.ts';

const rows = validateCopilotRouterOnly();
const report = formatCopilotExecutionReport(rows);
const outPath = resolve(process.cwd(), 'COPILOT_EXECUTION_REPORT.md');
writeFileSync(outPath, report, 'utf8');

const passed = rows.filter((r) => r.pass).length;
console.log(`[copilot:router-audit] ${passed}/${rows.length} OK → ${outPath}`);
for (const r of rows) {
  console.log(
    `  ${r.pass ? 'OK' : 'FAIL'} #${r.id} ${r.query.slice(0, 40)} → ${r.actualTool ?? 'null'}`,
  );
}
if (passed < rows.length) process.exitCode = 1;
