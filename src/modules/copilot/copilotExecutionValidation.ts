/**
 * Validación de routing/ejecución — casos QA Copiloto estabilización.
 */
import type { AiToolName } from '../ai/types';
import type { AiToolContext } from '../ai/tools/runner';
import { matchCopilotPreRoute } from './copilotPreRouteMatch';
import { clearCopilotExecutionAudit } from './copilotExecutionAudit';
import {
  EMPTY_COPILOT_CONTEXT,
  type CopilotConversationContext,
  updateCopilotContextFromTool,
} from './copilotConversationContext';
import {
  clearCopilotFollowUpContext,
  seedCopilotFollowUpContext,
} from './copilotFollowUpContext';

export type CopilotExecutionCase = {
  id: number;
  query: string;
  expectedTool: AiToolName;
  expectedArgs?: Record<string, unknown>;
  forbiddenTools?: AiToolName[];
  minRows?: number;
  exactRows?: number;
  contextBefore?: CopilotConversationContext;
  followUpBefore?: Partial<import('./copilotFollowUpContext').CopilotFollowUpContext>;
  note?: string;
};

export const COPILOT_EXECUTION_CASES: CopilotExecutionCase[] = [
  {
    id: 1,
    query: 'cuantos documentos hay registrados',
    expectedTool: 'getDocumentosResumen',
  },
  {
    id: 2,
    query: 'cuantas alertas hay',
    expectedTool: 'getAlertasAutomaticas',
  },
  {
    id: 3,
    query: 'cuantos vencen esta semana',
    expectedTool: 'getDocumentosPorRango',
    expectedArgs: { dias: 7 },
  },
  {
    id: 4,
    query: 'que documentos del vehiculo 10 faltan',
    expectedTool: 'getDocumentosVehiculo',
    expectedArgs: { numero: 10 },
    forbiddenTools: ['getVehiculoPorNumero'],
  },
  {
    id: 5,
    query: 'cuanto es la utilidad del vehiculo numero 1',
    expectedTool: 'getUtilidadVehiculo',
    expectedArgs: { numero: 1 },
  },
  {
    id: 6,
    query: 'porque el vehiculo 1 tiene esa utilidad',
    expectedTool: 'getUtilidadVehiculoDetalle',
    expectedArgs: { numero: 1 },
    forbiddenTools: ['getUtilidadVehiculo'],
    contextBefore: {
      lastVehicleId: 1,
      lastVehiclePlaca: null,
      lastTopic: 'utilidad',
    },
  },
  {
    id: 7,
    query: 'a que categoria corresponden esos gastos',
    expectedTool: 'getGastosVehiculoDesglose',
    expectedArgs: { numero: 1 },
    contextBefore: {
      lastVehicleId: 1,
      lastVehiclePlaca: null,
      lastTopic: 'utilidad',
    },
  },
  {
    id: 8,
    query: 'cuanto se gasto en motor',
    expectedTool: 'getGastosVehiculoDesglose',
    expectedArgs: { numero: 1, filtroTexto: 'motor' },
    contextBefore: {
      lastVehicleId: 1,
      lastVehiclePlaca: null,
      lastTopic: 'gastos',
    },
  },
  {
    id: 9,
    query: 'cuantos subtipos hay',
    expectedTool: 'getGastosVehiculoDesglose',
    expectedArgs: { numero: 1 },
    contextBefore: {
      lastVehicleId: 1,
      lastVehiclePlaca: null,
      lastTopic: 'gastos',
    },
  },
  {
    id: 10,
    query: 'dame los 10 vehiculos con mejor utilidad historica',
    expectedTool: 'getTopVehiculosUtilidad',
    expectedArgs: { periodo: 'historico', limit: 10 },
    exactRows: 10,
  },
  {
    id: 11,
    query: 'y el segundo',
    expectedTool: 'getUtilidadVehiculo',
    expectedArgs: { numero: 2 },
    followUpBefore: {
      tool: 'getTopVehiculosUtilidad',
      rankingVehicleIds: [1, 2, 3, 4, 5],
      rankingIndex: 0,
      vehicleId: 1,
      fecha: 'historico',
    },
    note: 'follow-up ordinal desde ranking',
  },
  {
    id: 12,
    query: 'solo motor',
    expectedTool: 'getGastosVehiculoDesglose',
    expectedArgs: { numero: 1, filtroTexto: 'motor' },
    followUpBefore: {
      tool: 'getGastosVehiculoDesglose',
      vehicleId: 1,
    },
    note: 'follow-up filtro sin repetir vehiculo',
  },
  {
    id: 13,
    query: 'comparalo con el siguiente',
    expectedTool: 'getUtilidadVehiculo',
    expectedArgs: { numero: 2 },
    followUpBefore: {
      tool: 'getUtilidadVehiculo',
      vehicleId: 1,
      rankingVehicleIds: [1, 2, 3],
      rankingIndex: 0,
    },
    note: 'follow-up comparacion ranking +1',
  },
  {
    id: 14,
    query: 'muestrame documentos vencidos',
    expectedTool: 'getDetalleAlertas',
    expectedArgs: { tipo: 'documentos_vencidos' },
  },
  {
    id: 15,
    query: 'cuales son los 34 por vencer',
    expectedTool: 'getDetalleAlertas',
    expectedArgs: { tipo: 'documentos_por_vencer', limit: 34 },
  },
  {
    id: 16,
    query: 'vehiculos sin ingresos',
    expectedTool: 'getDetalleAlertas',
    expectedArgs: { tipo: 'sin_ingresos' },
  },
];

export type CopilotValidationRow = {
  id: number;
  query: string;
  expectedTool: AiToolName;
  actualTool: AiToolName | null;
  routerOk: boolean;
  toolOk: boolean | null;
  pass: boolean;
  ms: number | null;
  rows: number | null;
  result: string;
  motivo: string;
};

function argsMatch(
  expected: Record<string, unknown> | undefined,
  actual: Record<string, unknown> | undefined,
): boolean {
  if (!expected) return true;
  const a = actual ?? {};
  for (const [k, v] of Object.entries(expected)) {
    if (a[k] !== v) return false;
  }
  return true;
}

export function validateCopilotRouterOnly(): CopilotValidationRow[] {
  clearCopilotFollowUpContext();
  return COPILOT_EXECUTION_CASES.map((c) => {
    if (c.followUpBefore) seedCopilotFollowUpContext(c.followUpBefore);
    else clearCopilotFollowUpContext();
    const ctx = c.contextBefore ?? EMPTY_COPILOT_CONTEXT;
    const match = matchCopilotPreRoute(c.query, ctx, { silent: true });
    const actualTool = match?.tool ?? null;
    let routerOk = actualTool === c.expectedTool;
    let motivo = routerOk ? 'Router OK' : `Esperado ${c.expectedTool}, obtuvo ${actualTool ?? 'null'}`;

    if (routerOk && !argsMatch(c.expectedArgs, match?.args)) {
      routerOk = false;
      motivo = `Tool OK pero args distintos: esperado ${JSON.stringify(c.expectedArgs)}, obtuvo ${JSON.stringify(match?.args ?? {})}`;
    }
    if (c.forbiddenTools?.includes(actualTool as AiToolName)) {
      routerOk = false;
      motivo = `Tool prohibida: ${actualTool}`;
    }

    return {
      id: c.id,
      query: c.query,
      expectedTool: c.expectedTool,
      actualTool,
      routerOk,
      toolOk: null,
      pass: routerOk,
      ms: null,
      rows: null,
      result: routerOk ? 'ROUTER OK' : 'ROUTER FAIL',
      motivo,
    };
  });
}

export async function validateCopilotFullExecution(
  ctx: AiToolContext,
): Promise<CopilotValidationRow[]> {
  const { executeAiTool } = await import('../ai/tools/runner');
  clearCopilotExecutionAudit();
  clearCopilotFollowUpContext();
  let conv = { ...EMPTY_COPILOT_CONTEXT };
  const rows: CopilotValidationRow[] = [];

  for (const c of COPILOT_EXECUTION_CASES) {
    if (c.contextBefore) conv = { ...c.contextBefore };
    if (c.followUpBefore) seedCopilotFollowUpContext(c.followUpBefore);
    else clearCopilotFollowUpContext();
    const match = matchCopilotPreRoute(c.query, conv);
    const actualTool = match?.tool ?? null;
    let routerOk = actualTool === c.expectedTool && argsMatch(c.expectedArgs, match?.args);
    let motivo = routerOk ? 'Router OK' : `Router: esperado ${c.expectedTool}, obtuvo ${actualTool ?? 'null'}`;

    if (!match) {
      rows.push({
        id: c.id,
        query: c.query,
        expectedTool: c.expectedTool,
        actualTool: null,
        routerOk: false,
        toolOk: false,
        pass: false,
        ms: null,
        rows: null,
        result: 'FAIL',
        motivo: 'Sin match en pre-router',
      });
      continue;
    }

    const t0 = performance.now();
    const r = await executeAiTool(match.tool, match.args ?? {}, ctx);
    const ms = Math.round(performance.now() - t0);

    let rowCount: number | null = null;
    if (r.ok && r.data && typeof r.data === 'object') {
      const d = r.data as Record<string, unknown>;
      rowCount =
        typeof d.count === 'number'
          ? d.count
          : Array.isArray(d.lineas_ranking_compact)
            ? d.lineas_ranking_compact.length
            : Array.isArray(d.ranking)
              ? d.ranking.length
              : typeof d.cantidadSubtipos === 'number'
                ? d.cantidadSubtipos
                : null;
    }

    let toolOk = r.ok;
    if (c.exactRows != null && rowCount !== c.exactRows) {
      toolOk = false;
      motivo += ` | filas esperadas ${c.exactRows}, obtuvo ${rowCount}`;
    }
    if (c.minRows != null && (rowCount ?? 0) < c.minRows) {
      toolOk = false;
      motivo += ` | filas mín ${c.minRows}, obtuvo ${rowCount}`;
    }
    if (!r.ok) {
      motivo += ` | tool error: ${r.error}`;
    }

    if (c.forbiddenTools?.includes(match.tool)) {
      routerOk = false;
      toolOk = false;
      motivo = `Tool prohibida ejecutada: ${match.tool}`;
    }

    const pass = routerOk && toolOk;
    rows.push({
      id: c.id,
      query: c.query,
      expectedTool: c.expectedTool,
      actualTool: match.tool,
      routerOk,
      toolOk,
      pass,
      ms,
      rows: rowCount,
      result: pass ? 'OK' : 'FAIL',
      motivo: pass ? 'OK' : motivo,
    });

    if (r.ok) {
      conv = updateCopilotContextFromTool(conv, match.tool, r.data);
    }
  }

  return rows;
}

export function formatCopilotExecutionReport(rows: CopilotValidationRow[]): string {
  const lines: string[] = [
    '# COPILOT EXECUTION REPORT',
    '',
    `Generado: ${new Date().toISOString()}`,
    '',
    '| # | Pregunta | Tool usada | Tiempo | Resultado | OK/FAIL | Motivo |',
    '|---|----------|------------|--------|-----------|---------|--------|',
  ];

  for (const r of rows) {
    const q = r.query.replace(/\|/g, '\\|');
    const motivo = r.motivo.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const toolUsed = r.actualTool ?? '—';
    const tiempo = r.ms != null ? `${r.ms}ms` : '—';
    lines.push(
      `| ${r.id} | ${q} | ${toolUsed} | ${tiempo} | ${r.result} | ${r.pass ? 'OK' : 'FAIL'} | ${motivo} |`,
    );
  }

  lines.push('');
  for (const r of rows) {
    lines.push(`## ${r.id}. ${r.query}`);
    lines.push('');
    lines.push(`- **Tool usada:** ${r.actualTool ?? '—'} (esperada: ${r.expectedTool})`);
    lines.push(`- **Tiempo:** ${r.ms != null ? `${r.ms}ms` : '—'}`);
    lines.push(`- **Resultado:** ${r.result}`);
    lines.push(`- **OK/FAIL:** ${r.pass ? 'OK' : 'FAIL'}`);
    lines.push(`- **Motivo:** ${r.motivo}`);
    lines.push('');
  }

  const passed = rows.filter((r) => r.pass).length;
  lines.push(`**Resumen:** ${passed}/${rows.length} OK`, '');
  return lines.join('\n');
}
