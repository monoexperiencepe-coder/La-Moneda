/**
 * Certificación Copiloto — respuestas reales vs datos de referencia (mismas fuentes que UI).
 */
import type { AiChatMessage, AiToolName } from '../ai/types';
import { executeAiTool, type AiToolContext } from '../ai/tools/runner';
import { sendAiAssistantMessage } from '../../services/ai/aiAssistantService';
import { extractMetricCards } from '../../utils/aiResponseParser';
import type { PermissionUser } from '../../utils/permissions';
import {
  auditCopilotExecution,
  clearCopilotExecutionAudit,
} from './copilotExecutionAudit';
import {
  deriveCopilotContextFromHistory,
  type CopilotConversationContext,
} from './copilotConversationContext';

export type CopilotCertificationRow = {
  id: string;
  query: string;
  tool: string | null;
  executionMs: number;
  rows: number | null;
  summary: string;
  cards: number;
  actions: number;
  contextBefore: CopilotConversationContext;
  contextAfter: CopilotConversationContext;
  pass: boolean;
  resultado: string;
  motivo: string;
  checks: string[];
};

export type CopilotCertificationResult = {
  generatedAt: string;
  rows: CopilotCertificationRow[];
  precision: number;
  passed: number;
  total: number;
  errores: string[];
  herramientasUsadas: string[];
  cacheHits: number;
  cacheMiss: number;
  reportMarkdown: string;
};

const CASES: { id: string; query: string }[] = [
  { id: 'A', query: 'cuantos vehiculos hay' },
  { id: 'B', query: 'cuantos conductores registrados hay' },
  { id: 'C', query: 'vehiculo numero 3' },
  { id: 'D', query: 'cuanto es la utilidad del vehiculo 1' },
  { id: 'E', query: 'porque el vehiculo 1 tiene esa utilidad' },
  { id: 'F', query: 'a que categoria corresponden esos gastos' },
  { id: 'G', query: 'cuanto se gasto en motor' },
  { id: 'H', query: 'cuantos documentos hay' },
  { id: 'I', query: 'cuantas alertas automaticas hay' },
  { id: 'J', query: 'que documentos vencen esta semana' },
  { id: 'K', query: 'top 10 utilidad historica' },
];

function asRecord(data: unknown): Record<string, unknown> | null {
  return data != null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function countRowsFromData(data: unknown): number | null {
  const d = asRecord(data);
  if (!d) return null;
  if (typeof d.count === 'number') return d.count;
  if (typeof d.totalVehiculos === 'number') return d.totalVehiculos;
  if (typeof d.totalConductores === 'number') return d.totalConductores;
  if (typeof d.totalDocumentos === 'number') return d.totalDocumentos;
  if (typeof d.totalAlertasAutomaticas === 'number') return d.totalAlertasAutomaticas;
  if (typeof d.cantidad === 'number') return d.cantidad;
  if (typeof d.cantidadSubtipos === 'number') return d.cantidadSubtipos;
  if (Array.isArray(d.lineas_ranking_compact)) return d.lineas_ranking_compact.length;
  if (Array.isArray(d.ranking)) return d.ranking.length;
  if (Array.isArray(d.items)) return d.items.length;
  if (Array.isArray(d.porSubtipo)) return d.porSubtipo.length;
  if (Array.isArray(d.porCategoria)) return d.porCategoria.length;
  return null;
}

function numClose(a: number, b: number, eps = 1): boolean {
  return Math.abs(a - b) <= eps;
}

function primaryTool(msg: AiChatMessage): string | null {
  return msg.toolsUsed?.[0] ?? msg.debug?.toolsUsed?.[0] ?? null;
}

type RefBundle = {
  flota: Record<string, unknown> | null;
  conductores: Record<string, unknown> | null;
  vehiculo3: Record<string, unknown> | null;
  utilidad1: Record<string, unknown> | null;
  utilidadDetalle1: Record<string, unknown> | null;
  gastosDesglose1: Record<string, unknown> | null;
  gastosMotor1: Record<string, unknown> | null;
  documentos: Record<string, unknown> | null;
  alertas: Record<string, unknown> | null;
  docsSemana: Record<string, unknown> | null;
  top10: Record<string, unknown> | null;
};

async function loadReferences(ctx: AiToolContext): Promise<RefBundle> {
  const load = async (tool: AiToolName, args: Record<string, unknown> = {}) => {
    const r = await executeAiTool(tool, args, ctx);
    return r.ok ? asRecord(r.data) : null;
  };
  const [
    flota,
    conductores,
    vehiculo3,
    utilidad1,
    utilidadDetalle1,
    gastosDesglose1,
    gastosMotor1,
    documentos,
    alertas,
    docsSemana,
    top10,
  ] = await Promise.all([
    load('getFlotaResumen'),
    load('getConteoConductores'),
    load('getVehiculoPorNumero', { numero: 3 }),
    load('getUtilidadVehiculo', { numero: 1 }),
    load('getUtilidadVehiculoDetalle', { numero: 1 }),
    load('getGastosVehiculoDesglose', { numero: 1 }),
    load('getGastosVehiculoDesglose', { numero: 1, filtroTexto: 'motor' }),
    load('getDocumentosResumen'),
    load('getAlertasAutomaticas'),
    load('getDocumentosPorRango', { dias: 7 }),
    load('getTopVehiculosUtilidad', { periodo: 'historico', limit: 10 }),
  ]);
  return {
    flota,
    conductores,
    vehiculo3,
    utilidad1,
    utilidadDetalle1,
    gastosDesglose1,
    gastosMotor1,
    documentos,
    alertas,
    docsSemana,
    top10,
  };
}

function validateCase(
  id: string,
  data: Record<string, unknown> | null,
  summary: string,
  tool: string | null,
  refs: RefBundle,
  priorUtilidadSummary?: string,
): { pass: boolean; resultado: string; motivo: string; checks: string[] } {
  const checks: string[] = [];
  const fail = (msg: string) => ({
    pass: false,
    resultado: 'FAIL',
    motivo: msg,
    checks,
  });
  const ok = (msg: string) => ({
    pass: true,
    resultado: 'PASS',
    motivo: msg,
    checks,
  });

  if (!data) return fail('Sin datos estructurados en la respuesta');

  switch (id) {
    case 'A': {
      const expected = Number(refs.flota?.totalVehiculos ?? refs.flota?.total ?? NaN);
      const actual = Number(data.totalVehiculos ?? data.total ?? NaN);
      if (!Number.isFinite(expected)) return fail('Referencia flota no disponible');
      if (!Number.isFinite(actual)) return fail(`Respuesta sin totalVehiculos (${actual})`);
      checks.push(`ref=${expected}`, `resp=${actual}`);
      if (actual !== expected) return fail(`Conteo ${actual} ≠ inventario ${expected}`);
      return ok(`Conteo ${actual} coincide con inventario`);
    }
    case 'B': {
      const expected = Number(refs.conductores?.totalConductores ?? NaN);
      const actual = Number(data.totalConductores ?? NaN);
      if (!Number.isFinite(expected)) return fail('Referencia conductores no disponible');
      checks.push(`ref=${expected}`, `resp=${actual}`);
      if (actual !== expected) return fail(`Conteo ${actual} ≠ pantalla ${expected}`);
      return ok(`Conteo ${actual} coincide con pantalla conductores`);
    }
    case 'C': {
      const ref = refs.vehiculo3;
      if (!ref?.encontrado) return fail('Vehículo #3 no encontrado en referencia');
      if (data.encontrado !== true) return fail('Respuesta: vehículo no encontrado');
      const placa = String(data.placa ?? '');
      const refPlaca = String(ref.placa ?? '');
      checks.push(`placa=${placa}`);
      if (!placa || placa !== refPlaca) return fail(`Placa ${placa} ≠ referencia ${refPlaca}`);
      const cond = (data.conductorAsignado as { nombre?: string } | null)?.nombre ?? null;
      const refCond = (ref.conductorAsignado as { nombre?: string } | null)?.nombre ?? null;
      if (refCond && cond !== refCond) {
        return fail(`Conductor "${cond}" ≠ referencia "${refCond}"`);
      }
      if (!refCond && cond) checks.push('conductor_resp_sin_ref');
      checks.push(refCond ? 'conductor_ok' : 'sin_conductor_ref');
      return ok(`Placa ${placa}${refCond ? `, conductor ${cond}` : ''}`);
    }
    case 'D': {
      const ing = Number(data.ingresos ?? data.ingresos_total ?? NaN);
      const gas = Number(data.gastos ?? data.gastos_total ?? NaN);
      const util = Number(data.utilidad ?? NaN);
      if (!Number.isFinite(ing) || !Number.isFinite(gas) || !Number.isFinite(util)) {
        return fail('Faltan ingresos/gastos/utilidad en respuesta');
      }
      checks.push(`ing=${ing}`, `gas=${gas}`, `util=${util}`);
      if (!numClose(util, ing - gas, 0.02)) {
        return fail(`Utilidad ${util} ≠ ingresos−gastos (${ing - gas})`);
      }
      const refUtil = Number(refs.utilidad1?.utilidad ?? NaN);
      if (Number.isFinite(refUtil) && !numClose(util, refUtil, 1)) {
        return fail(`Utilidad respuesta ${util} ≠ referencia ${refUtil}`);
      }
      return ok(`Utilidad ${util} = ingresos − gastos`);
    }
    case 'E': {
      const isDetalle =
        tool === 'getUtilidadVehiculoDetalle' ||
        data._tipo_metrica === 'utilidad_vehiculo_detalle';
      checks.push(isDetalle ? 'tool_detalle' : 'tool_no_detalle');
      if (tool === 'getUtilidadVehiculo') {
        return fail('Repite getUtilidadVehiculo en lugar de explicar');
      }
      const porSubtipo = Array.isArray(data.porSubtipo) ? data.porSubtipo : [];
      const conclusion = String(data.conclusion ?? '');
      const explica =
        porSubtipo.length > 0 ||
        conclusion.length > 20 ||
        /\b(rubro|principal|porque|desglose|subtipo|categor)/i.test(summary);
      if (!explica) return fail('No explica causas (sin desglose ni conclusión)');
      if (priorUtilidadSummary && summary.trim() === priorUtilidadSummary.trim()) {
        return fail('Repite la misma respuesta de utilidad sin explicar');
      }
      if (priorUtilidadSummary && summary.includes(priorUtilidadSummary.slice(0, 40))) {
        checks.push('warn:summary_parcialmente_igual');
      }
      return ok('Explica utilidad con desglose (no repetición simple)');
    }
    case 'F': {
      const porCat = Array.isArray(data.porCategoria) ? data.porCategoria : [];
      const porSub = Array.isArray(data.porSubtipo) ? data.porSubtipo : [];
      checks.push(`categorias=${porCat.length}`, `subtipos=${porSub.length}`);
      if (porCat.length === 0 && porSub.length === 0) {
        return fail('Sin categorías/subtipos en respuesta');
      }
      const refSub = Array.isArray(refs.gastosDesglose1?.porSubtipo)
        ? (refs.gastosDesglose1!.porSubtipo as unknown[]).length
        : 0;
      if (refSub > 0 && porSub.length === 0 && porCat.length === 0) {
        return fail('Referencia tiene gastos pero respuesta vacía');
      }
      return ok(`${porCat.length || porSub.length} rubros de gasto reales`);
    }
    case 'G': {
      const total = Number(data.total ?? NaN);
      const refTotal = Number(refs.gastosMotor1?.total ?? NaN);
      const filtro = String(data.filtroTexto ?? '');
      checks.push(`total=${total}`, `ref=${refTotal}`, `filtro=${filtro}`);
      if (!Number.isFinite(total)) return fail('Sin monto total en respuesta');
      if (Number.isFinite(refTotal) && !numClose(total, refTotal, 1)) {
        return fail(`Monto ${total} ≠ referencia motor ${refTotal}`);
      }
      if (filtro && filtro !== 'motor' && !summary.toLowerCase().includes('motor')) {
        checks.push('warn:filtro_no_motor');
      }
      return ok(`Gasto motor S/ ${total} consistente`);
    }
    case 'H': {
      const expected = Number(refs.documentos?.totalDocumentos ?? NaN);
      const actual = Number(data.totalDocumentos ?? NaN);
      checks.push(`ref=${expected}`, `resp=${actual}`);
      if (!Number.isFinite(expected)) return fail('Referencia documentos no disponible');
      if (actual !== expected) return fail(`Documentos ${actual} ≠ inventario ${expected}`);
      return ok(`${actual} documentos = inventario`);
    }
    case 'I': {
      const expected = Number(refs.alertas?.totalAlertasAutomaticas ?? refs.alertas?.count ?? NaN);
      const actual = Number(data.totalAlertasAutomaticas ?? data.count ?? NaN);
      checks.push(`ref=${expected}`, `resp=${actual}`);
      if (!Number.isFinite(expected)) return fail('Referencia alertas no disponible');
      if (actual !== expected) return fail(`Alertas ${actual} ≠ Qué hacer hoy ${expected}`);
      return ok(`${actual} alertas = Qué hacer hoy`);
    }
    case 'J': {
      const expected = Number(refs.docsSemana?.cantidad ?? refs.docsSemana?.count ?? NaN);
      const actual = Number(data.cantidad ?? data.count ?? NaN);
      const items = Array.isArray(data.items) ? data.items : [];
      const lista = Array.isArray(data.listaBreve) ? data.listaBreve : [];
      checks.push(`ref=${expected}`, `resp=${actual}`, `items=${items.length}`);
      if (!Number.isFinite(expected)) return fail('Referencia vencimientos no disponible');
      if (actual !== expected) return fail(`Cantidad ${actual} ≠ referencia ${expected}`);
      if (expected > 0 && items.length === 0 && lista.length === 0) {
        return fail('Hay vencimientos pero sin lista en respuesta');
      }
      return ok(`${actual} documentos vencen esta semana (lista real)`);
    }
    case 'K': {
      const lineas = Array.isArray(data.lineas_ranking_compact)
        ? data.lineas_ranking_compact
        : Array.isArray(data.lineas_ranking)
          ? data.lineas_ranking
          : Array.isArray(data.ranking)
            ? data.ranking
            : [];
      const refLineas = Array.isArray(refs.top10?.lineas_ranking_compact)
        ? refs.top10!.lineas_ranking_compact
        : Array.isArray(refs.top10?.ranking)
          ? refs.top10!.ranking
          : [];
      checks.push(`filas=${lineas.length}`, `ref_filas=${refLineas.length}`);
      if (lineas.length !== 10) return fail(`Esperadas 10 filas, obtuvo ${lineas.length}`);
      if (refLineas.length === 10 && lineas.length === 10) {
        const a0 = String(lineas[0] ?? '');
        const r0 = String(refLineas[0] ?? '');
        if (a0 && r0 && a0 !== r0) checks.push('warn:orden_ranking_diff');
      }
      return ok('10 filas completas de utilidad histórica');
    }
    default:
      return fail(`Caso desconocido ${id}`);
  }
}

export function formatCopilotCertificationReport(result: CopilotCertificationResult): string {
  const lines: string[] = [
    '# COPILOT CERTIFICATION REPORT',
    '',
    `Generado: ${result.generatedAt}`,
    '',
    '| ID | Pregunta | Tool | Tiempo | Resultado | PASS/FAIL |',
    '|---|----------|------|--------|-----------|---------|',
  ];

  for (const r of result.rows) {
    const q = r.query.replace(/\|/g, '\\|');
    lines.push(
      `| ${r.id} | ${q} | ${r.tool ?? '—'} | ${r.executionMs}ms | ${r.resultado} | ${r.pass ? 'PASS' : 'FAIL'} |`,
    );
  }

  lines.push('', '---', '');

  for (const r of result.rows) {
    lines.push(`## ${r.id}. ${r.query}`, '');
    lines.push(`- **Tool:** ${r.tool ?? '—'}`);
    lines.push(`- **Tiempo:** ${r.executionMs}ms`);
    lines.push(`- **Filas/dato:** ${r.rows ?? '—'}`);
    lines.push(`- **Respuesta:** ${r.summary.replace(/\n/g, ' ').slice(0, 500)}`);
    lines.push(`- **Resultado:** ${r.resultado}`);
    lines.push(`- **PASS/FAIL:** ${r.pass ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Motivo:** ${r.motivo}`);
    if (r.checks.length) lines.push(`- **Checks:** ${r.checks.join(', ')}`);
    lines.push('');
  }

  lines.push(
    '## Resumen',
    '',
    `- **Precisión:** ${result.precision}% (${result.passed}/${result.total})`,
    `- **Errores:** ${result.errores.length ? result.errores.join('; ') : 'ninguno'}`,
    `- **Herramientas usadas:** ${result.herramientasUsadas.join(', ') || '—'}`,
    `- **Cache hit:** ${result.cacheHits}`,
    `- **Cache miss:** ${result.cacheMiss}`,
    '',
  );

  return lines.join('\n');
}

function downloadMarkdown(filename: string, content: string): void {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn('[copilot:certification] No se pudo descargar reporte', e);
  }
}

let lastCertification: CopilotCertificationResult | null = null;

export function getLastCopilotCertification(): CopilotCertificationResult | null {
  return lastCertification;
}

export async function runCopilotCertification(opts: {
  user: PermissionUser;
  email?: string | null;
  empresaId: string;
  onProgress?: (label: string) => void;
}): Promise<CopilotCertificationResult> {
  clearCopilotExecutionAudit();
  const ctx: AiToolContext = { user: opts.user, empresaId: opts.empresaId };

  opts.onProgress?.('Cargando referencias…');
  const refs = await loadReferences(ctx);

  const history: AiChatMessage[] = [];
  const rows: CopilotCertificationRow[] = [];
  let priorUtilidadSummary: string | undefined;
  const toolsUsed = new Set<string>();

  for (const c of CASES) {
    opts.onProgress?.(`Certificando ${c.id}: ${c.query.slice(0, 40)}…`);
    const contextBefore = deriveCopilotContextFromHistory(history);
    const t0 = performance.now();

    const userMsg: AiChatMessage = {
      id: `cert-user-${c.id}`,
      role: 'user',
      content: c.query,
      createdAt: new Date().toISOString(),
    };
    history.push(userMsg);

    const { assistant, error } = await sendAiAssistantMessage({
      message: c.query,
      history: history.slice(0, -1),
      user: opts.user,
      email: opts.email,
      empresaId: opts.empresaId,
      skipCache: true,
    });

    const executionMs = Math.round(assistant.debug?.durationMs ?? performance.now() - t0);
    history.push(assistant);

    const data = asRecord(assistant.structured?.data);
    const summary = assistant.structured?.summary ?? assistant.content ?? '';
    const tool = primaryTool(assistant);
    if (tool) toolsUsed.add(tool);

    const cards = extractMetricCards(data).length;
    const actions = assistant.structured?.suggestedActions?.length ?? 0;
    const rowCount = countRowsFromData(data);

    let validation = validateCase(c.id, data, summary, tool, refs, priorUtilidadSummary);
    if (error && !validation.pass) {
      validation = {
        ...validation,
        pass: false,
        resultado: 'FAIL',
        motivo: `${validation.motivo}; error: ${error}`,
      };
    } else if (error) {
      validation.checks.push(`error:${error}`);
    }

    if (c.id === 'D') priorUtilidadSummary = summary;

    const contextAfter = deriveCopilotContextFromHistory(history);

    const row: CopilotCertificationRow = {
      id: c.id,
      query: c.query,
      tool,
      executionMs,
      rows: rowCount,
      summary,
      cards,
      actions,
      contextBefore: { ...contextBefore },
      contextAfter: { ...contextAfter },
      pass: validation.pass,
      resultado: validation.resultado,
      motivo: validation.motivo,
      checks: validation.checks,
    };
    rows.push(row);

    console.log('[copilot:certification]', {
      id: c.id,
      pass: row.pass,
      tool: row.tool,
      executionMs: row.executionMs,
      rows: row.rows,
      motivo: row.motivo,
    });
  }

  const audit = auditCopilotExecution();
  const passed = rows.filter((r) => r.pass).length;
  const total = rows.length;
  const precision = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
  const errores = rows.filter((r) => !r.pass).map((r) => `${r.id}: ${r.motivo}`);

  const result: CopilotCertificationResult = {
    generatedAt: new Date().toISOString(),
    rows,
    precision,
    passed,
    total,
    errores,
    herramientasUsadas: [...toolsUsed],
    cacheHits: audit.cacheHits,
    cacheMiss: audit.cacheMiss,
    reportMarkdown: '',
  };
  result.reportMarkdown = formatCopilotCertificationReport(result);
  lastCertification = result;

  downloadMarkdown('COPILOT_CERTIFICATION_REPORT.md', result.reportMarkdown);
  console.log(result.reportMarkdown);
  console.table(
    rows.map((r) => ({
      id: r.id,
      pass: r.pass,
      tool: r.tool,
      ms: r.executionMs,
      rows: r.rows,
    })),
  );

  return result;
}
