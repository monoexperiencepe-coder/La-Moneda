import { COPILOT_STRICT_FACT_MODE } from '../../config/copilotAudit';
import { executeAiTool, type AiToolContext } from '../ai/tools/runner';
import type { PermissionUser } from '../../utils/permissions';
import { auditCopilotInventory } from './auditCopilotInventory';
import { clearCopilotTraceHistory, getCopilotTraceSessions } from './copilotTrace';
import {
  auditCopilotExecution,
  clearCopilotExecutionAudit,
} from './copilotExecutionAudit';
import {
  formatCopilotExecutionReport,
  validateCopilotFullExecution,
  validateCopilotRouterOnly,
} from './copilotExecutionValidation';
import {
  getLastCopilotCertification,
  runCopilotCertification,
  type CopilotCertificationResult,
} from './copilotCertification';

type CopilotAuditCtx = {
  getUser: () => PermissionUser | null;
  getEmpresaId: () => string | null;
};

let auditCtx: CopilotAuditCtx | null = null;

export function registerCopilotAuditContext(ctx: CopilotAuditCtx): void {
  auditCtx = ctx;
}

declare global {
  interface Window {
    auditCopilot: () => ReturnType<typeof auditCopilotInventory>;
    auditCopilotExecution: () => ReturnType<typeof auditCopilotExecution>;
    runCopilotExecutionValidation: () => Promise<ReturnType<typeof formatCopilotExecutionReport>>;
    runCopilotCertification: () => Promise<CopilotCertificationResult | null>;
    getCopilotCertificationReport: () => CopilotCertificationResult | null;
    runCopilotAuditTests: () => Promise<unknown[]>;
    getCopilotTraceHistory: () => ReturnType<typeof getCopilotTraceSessions>;
    clearCopilotTraceHistory: () => void;
    /** Alias legibles en consola. */
    getCopilotTraceSessions: () => ReturnType<typeof getCopilotTraceSessions>;
    clearCopilotTraceSessions: () => void;
    COPILOT_STRICT_FACT_MODE: boolean;
  }
}

function logCopilotDebugRegistered(): void {
  console.log('[copilot-debug:registered]', {
    auditCopilot: typeof window.auditCopilot,
    auditCopilotExecution: typeof window.auditCopilotExecution,
    runCopilotExecutionValidation: typeof window.runCopilotExecutionValidation,
    runCopilotCertification: typeof window.runCopilotCertification,
    runCopilotAuditTests: typeof window.runCopilotAuditTests,
    getCopilotTraceHistory: typeof window.getCopilotTraceHistory,
    clearCopilotTraceHistory: typeof window.clearCopilotTraceHistory,
  });
}

export function registerCopilotAuditWindow(): void {
  if (typeof window === 'undefined') return;

  window.COPILOT_STRICT_FACT_MODE = COPILOT_STRICT_FACT_MODE;

  window.auditCopilot = () => {
    const user = auditCtx?.getUser() ?? null;
    return auditCopilotInventory(user);
  };

  window.auditCopilotExecution = () => auditCopilotExecution();

  window.runCopilotExecutionValidation = async () => {
    const user = auditCtx?.getUser();
    const empresaId = auditCtx?.getEmpresaId();
    if (!user || !empresaId) {
      console.error('[copilot:execution-validation] Requiere sesión activa y empresaId');
      const routerRows = validateCopilotRouterOnly();
      return formatCopilotExecutionReport(routerRows);
    }
    clearCopilotExecutionAudit();
    const ctx: AiToolContext = { user, empresaId };
    const rows = await validateCopilotFullExecution(ctx);
    const report = formatCopilotExecutionReport(rows);
    console.log(report);
    console.table(
      rows.map((r) => ({
        id: r.id,
        tool: r.actualTool,
        pass: r.pass,
        ms: r.ms,
        rows: r.rows,
      })),
    );
    return report;
  };

  window.runCopilotCertification = async () => {
    const user = auditCtx?.getUser();
    const empresaId = auditCtx?.getEmpresaId();
    if (!user || !empresaId) {
      console.error('[copilot:certification] Requiere sesión activa y empresaId');
      return null;
    }
    console.info('[copilot:certification] Iniciando certificación real (11 casos)…');
    const result = await runCopilotCertification({ user, empresaId });
    console.info(
      `[copilot:certification] ${result.passed}/${result.total} PASS (${result.precision}%) — reporte descargado`,
    );
    return result;
  };

  window.getCopilotCertificationReport = () => getLastCopilotCertification();

  window.getCopilotTraceHistory = () => getCopilotTraceSessions();
  window.clearCopilotTraceHistory = () => clearCopilotTraceHistory();
  window.getCopilotTraceSessions = window.getCopilotTraceHistory;
  window.clearCopilotTraceSessions = window.clearCopilotTraceHistory;

  window.runCopilotAuditTests = async () => {
    const user = auditCtx?.getUser();
    const empresaId = auditCtx?.getEmpresaId();
    if (!user || !empresaId) {
      console.error('[copilot:audit-tests] Requiere sesión activa y empresaId');
      return [];
    }

    const ctx: AiToolContext = { user, empresaId };

    type AuditRow = {
      query: string;
      tool: string;
      ok: boolean;
      rows: number | null;
      totalVehiculos?: number | null;
      totalConductores?: number | null;
      totalAlertasAutomaticas?: number | null;
      totalGastosPen?: number | null;
      pass: boolean;
      checks: string[];
      error?: string;
      fuente?: string;
      tiempoMs: number;
    };

    const results: AuditRow[] = [];

    const push = (row: AuditRow) => {
      console.log('[copilot:audit-test]', JSON.stringify(row));
      results.push(row);
    };

    // 1. Vehículos
    {
      const t0 = performance.now();
      const r = await executeAiTool('getFlotaResumen', {}, ctx);
      const d =
        r.ok && r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const totalVehiculos = Number(d.totalVehiculos ?? d.total ?? 0);
      const checks: string[] = [];
      if (r.ok) checks.push('ok');
      if (totalVehiculos > 0) checks.push('totalVehiculos>0');
      if (totalVehiculos === 82) checks.push('totalVehiculos=82');
      push({
        query: 'cuantos vehiculos',
        tool: 'getFlotaResumen',
        ok: r.ok,
        rows: totalVehiculos,
        totalVehiculos,
        pass: r.ok && totalVehiculos > 0,
        checks,
        error: r.ok ? undefined : r.error,
        fuente: String(d.fuente ?? 'public.vehiculos+conductores'),
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    // 2. Conductores
    {
      const t0 = performance.now();
      const r = await executeAiTool('getConteoConductores', {}, ctx);
      const d =
        r.ok && r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const totalConductores = Number(d.totalConductores ?? 0);
      const flota = await executeAiTool('getFlotaResumen', {}, ctx);
      const flotaTotal =
        flota.ok && flota.data && typeof flota.data === 'object'
          ? Number((flota.data as { totalVehiculos?: number; total?: number }).totalVehiculos ??
              (flota.data as { total?: number }).total ??
              0)
          : null;
      const checks: string[] = [];
      if (r.ok) checks.push('ok');
      if (totalConductores > 0) checks.push('totalConductores>0');
      if (flotaTotal != null && totalConductores !== flotaTotal) {
        checks.push('distinto_de_vehiculos');
      } else if (flotaTotal != null && totalConductores === flotaTotal) {
        checks.push('WARN:igual_que_vehiculos');
      }
      push({
        query: 'cuantos conductores',
        tool: 'getConteoConductores',
        ok: r.ok,
        rows: totalConductores,
        totalConductores,
        pass: r.ok && totalConductores > 0,
        checks,
        error: r.ok ? undefined : r.error,
        fuente: String(d.fuente ?? 'public.conductores'),
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    // 3. Ingresos hoy
    {
      const t0 = performance.now();
      const r = await executeAiTool('getIngresosPeriodo', { periodo: 'today' }, ctx);
      const d = r.ok && r.data && typeof r.data === 'object' ? (r.data as { count?: number }) : {};
      push({
        query: 'ingresos hoy',
        tool: 'getIngresosPeriodo',
        ok: r.ok,
        rows: d.count ?? null,
        pass: r.ok,
        checks: r.ok ? ['ok'] : [],
        error: r.ok ? undefined : r.error,
        fuente: 'public.ingresos',
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    // 4. Gastos 2024
    {
      const t0 = performance.now();
      const r = await executeAiTool('getGastosPeriodo', { anio: 2024 }, ctx);
      const d =
        r.ok && r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const count = Number(d.count ?? 0);
      const totalGastosPen = Number(d.total_gastos_pen ?? 0);
      const checks: string[] = [];
      if (r.ok) checks.push('ok');
      if (count > 0) checks.push('rows>0');
      if (totalGastosPen > 0) checks.push('total>0');
      if (d.historico_disponible === true) checks.push('historico_disponible');
      push({
        query: 'gastos 2024',
        tool: 'getGastosPeriodo',
        ok: r.ok,
        rows: count,
        totalGastosPen,
        pass: r.ok && count > 0 && totalGastosPen > 0,
        checks,
        error: r.ok ? undefined : r.error,
        fuente: 'public.gastos',
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    // 5. Alertas
    {
      const t0 = performance.now();
      const r = await executeAiTool('getAlertasAutomaticas', {}, ctx);
      const d =
        r.ok && r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const totalAlertas = Number(d.totalAlertasAutomaticas ?? d.count ?? 0);
      const checks: string[] = [];
      if (r.ok) checks.push('ok');
      if (totalAlertas > 0) checks.push('totalAlertas>0');
      if (totalAlertas >= 100) checks.push('totalAlertas~Home');
      push({
        query: 'alertas activas',
        tool: 'getAlertasAutomaticas',
        ok: r.ok,
        rows: totalAlertas,
        totalAlertasAutomaticas: totalAlertas,
        pass: r.ok && totalAlertas > 0,
        checks,
        error: r.ok ? undefined : r.error,
        fuente: String(d.fuente ?? 'computeTodayReview'),
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    // 6. Top utilidad
    {
      const t0 = performance.now();
      const r = await executeAiTool('getTopVehiculosUtilidad', { periodo: 'historico' }, ctx);
      const d =
        r.ok && r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const count = Number(d.count ?? (Array.isArray(d.ranking) ? d.ranking.length : 0));
      const checks: string[] = [];
      if (r.ok) checks.push('ok');
      if (count === 10) checks.push('rows=10');
      else if (count > 0) checks.push(`rows=${count}`);
      push({
        query: 'top utilidad',
        tool: 'getTopVehiculosUtilidad',
        ok: r.ok,
        rows: count,
        pass: r.ok && count > 0,
        checks,
        error: r.ok ? undefined : r.error,
        fuente: 'public.ingresos+gastos',
        tiempoMs: Math.round(performance.now() - t0),
      });
    }

    console.table(
      results.map((r) => ({
        query: r.query,
        tool: r.tool,
        pass: r.pass,
        rows: r.rows,
        checks: r.checks.join(','),
        tiempoMs: r.tiempoMs,
      })),
    );
    return results;
  };

  logCopilotDebugRegistered();

  if (import.meta.env.DEV) {
    console.info(
      '[copilot:audit] window.auditCopilot() | window.auditCopilotExecution() | window.runCopilotExecutionValidation() | window.runCopilotCertification() | window.runCopilotAuditTests() | /copilot-debug | STRICT_FACT_MODE=',
      COPILOT_STRICT_FACT_MODE,
    );
  }
}

/** Registra window.* y contexto de sesión (p. ej. al montar /copilot-debug). */
export function ensureCopilotAuditRegistered(ctx?: CopilotAuditCtx): void {
  if (ctx) registerCopilotAuditContext(ctx);
  registerCopilotAuditWindow();
}
