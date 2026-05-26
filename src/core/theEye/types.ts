/**
 * The Eye Core — Generic types.
 * No imports from specific projects (La Moneda, etc.).
 * Projects implement these interfaces via adapters.
 */

export type TheEyeSeverity = 'info' | 'warning' | 'critical';

export type TheEyeEvidence = {
  label: string;
  value: string | number;
  formatted?: string;
};

export type TheEyeSuggestedAction = {
  /** Registered action id — must exist in the adapter's action registry. */
  id: string;
  label: string;
  description: string;
  actionType: 'navigate' | 'review' | 'report' | 'classify';
  payload?: Record<string, unknown>;
};

export type TheEyeInsight = {
  id: string;
  ruleId: string;
  /** Logical grouping (e.g. "Finanzas", "Operaciones"). Adapter-defined. */
  category: string;
  severity: TheEyeSeverity;
  title: string;
  description: string;
  evidence?: TheEyeEvidence[];
  suggestedActions?: TheEyeSuggestedAction[];
  /** ISO timestamp when the insight was generated. */
  timestamp: string;
};

/**
 * Runtime context passed to adapters and rules.
 * entityId = the tenant / company / project entity being analyzed.
 */
export type TheEyeContext = {
  projectId: string;
  entityId: string;
  dateRange: { desde: string; hasta: string };
  /** Adapter-specific payload; avoids coupling the core to concrete data shapes. */
  meta?: Record<string, unknown>;
};

/**
 * A deterministic rule.
 * Receives typed data + context; returns 0..N insights.
 * Must not have side effects.
 */
export type TheEyeRule<TData = unknown> = {
  id: string;
  name: string;
  description: string;
  /** Logical category for display grouping. */
  category: string;
  evaluate: (data: TData, context: TheEyeContext) => TheEyeInsight[];
};

/** Summary counts by severity. */
export type TheEyeInsightSummary = {
  total: number;
  critical: number;
  warning: number;
  info: number;
};

export function summarizeInsights(insights: TheEyeInsight[]): TheEyeInsightSummary {
  const summary: TheEyeInsightSummary = { total: 0, critical: 0, warning: 0, info: 0 };
  for (const i of insights) {
    summary.total++;
    summary[i.severity]++;
  }
  return summary;
}
