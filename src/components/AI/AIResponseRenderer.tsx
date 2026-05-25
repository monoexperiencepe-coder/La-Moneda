import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Clock,
  BarChart3,
  ExternalLink,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import type { AiStructuredResponse, AiSuggestedAction } from '../../modules/ai/types';
import {
  resolveCopilotActionFromSuggested,
} from '../../modules/copilot/copilotActions';
import { useAuth } from '../../context/AuthContext';
import { permissionUserFromAuth, type PermissionUser } from '../../utils/permissions';
import {
  extractMetricCards,
  extractSimpleTable,
  sanitizeAiAssistantText,
  type AiMetricCard,
} from '../../utils/aiResponseParser';

// ─── Deep-link resolver ────────────────────────────────────────────────────────

export interface ResolvedAction {
  path: string;
  params?: Record<string, string>;
}

/**
 * Resuelve una acción sugerida a una ruta con query params opcionales.
 * Soporta `payload.route` explícita y `payload.params` como filtros.
 */
export function resolveActionRoute(
  action: AiSuggestedAction,
  user?: PermissionUser | null,
): ResolvedAction | null {
  if (user) {
    const copilot = resolveCopilotActionFromSuggested(user, action);
    if (copilot?.ok) {
      return { path: copilot.path, params: copilot.params };
    }
    if (copilot && !copilot.ok && copilot.denied) return null;
  }

  const payload = action.payload as
    | { route?: string; params?: Record<string, string>; tipo_gasto?: string; estado?: string }
    | undefined;

  // Use explicit route from payload
  let path = typeof payload?.route === 'string' ? payload.route : null;
  const extraParams: Record<string, string> = {};

  // Collect optional filter params from payload
  if (payload?.params && typeof payload.params === 'object') {
    Object.assign(extraParams, payload.params);
  }
  if (payload?.tipo_gasto) extraParams.tipo_gasto = payload.tipo_gasto;
  if (payload?.estado) extraParams.estado = payload.estado;

  if (!path) {
    // Infer path from label + description keywords
    const text = `${action.label} ${action.description}`.toLowerCase();

    if (text.includes('duplicado') || text.includes('anomalía') || text.includes('anomalia')) {
      path = '/finanzas/gastos';
      extraParams.filter ??= 'duplicados';
    } else if (text.includes('pendiente') || text.includes('clasificaci')) {
      path = '/finanzas/ia-clasificacion';
    } else if (text.includes('combustible')) {
      path = '/finanzas/gastos';
      extraParams.tipo_gasto ??= 'combustible';
    } else if (text.includes('mantenimiento')) {
      path = '/finanzas/gastos';
      extraParams.tipo_gasto ??= 'mantenimiento';
    } else if (text.includes('gasto') || text.includes('movimiento')) {
      path = '/finanzas/gastos';
    } else if (text.includes('ingreso')) {
      path = '/finanzas/ingresos';
    } else if (text.includes('préstamo') || text.includes('prestamo') || text.includes('financiamiento')) {
      path = '/finanzas/financiamiento';
    } else if (text.includes('vehículo') || text.includes('vehiculo') || text.includes('flota')) {
      path = '/operaciones/flota';
    } else if (text.includes('resumen') || text.includes('dashboard')) {
      path = '/finanzas/resumen';
    }
  }

  if (!path) return null;
  return Object.keys(extraParams).length > 0 ? { path, params: extraParams } : { path };
}

// ─── Metric card ──────────────────────────────────────────────────────────────

type CardVariant = AiMetricCard['variant'];

const CARD_STYLES: Record<CardVariant, { bg: string; label: string; value: string; iconBg: string; iconColor: string }> = {
  green: {
    bg: 'border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-white',
    label: 'text-emerald-600',
    value: 'text-emerald-900',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  red: {
    bg: 'border-red-100 bg-gradient-to-br from-red-50/80 via-white to-white',
    label: 'text-red-500',
    value: 'text-red-800',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-500',
  },
  blue: {
    bg: 'border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-white',
    label: 'text-indigo-600',
    value: 'text-indigo-900',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  amber: {
    bg: 'border-amber-100 bg-gradient-to-br from-amber-50/80 via-white to-white',
    label: 'text-amber-600',
    value: 'text-amber-900',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  gray: {
    bg: 'border-slate-200 bg-gradient-to-br from-slate-50/80 via-white to-white',
    label: 'text-slate-500',
    value: 'text-slate-700',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
  },
};

const CARD_ICONS: Record<CardVariant, React.ReactNode> = {
  green: <TrendingUp className="h-4 w-4" aria-hidden />,
  red: <TrendingDown className="h-4 w-4" aria-hidden />,
  blue: <BarChart3 className="h-4 w-4" aria-hidden />,
  amber: <Clock className="h-4 w-4" aria-hidden />,
  gray: <Minus className="h-4 w-4" aria-hidden />,
};

const MetricCard: React.FC<{ card: AiMetricCard }> = ({ card }) => {
  const s = CARD_STYLES[card.variant];
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${s.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${s.label}`}>{card.label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor}`}>
          {CARD_ICONS[card.variant]}
        </span>
      </div>
      <div>
        <p className={`text-xl font-bold leading-none tracking-tight ${s.value}`}>{card.value}</p>
        {card.subtitle && (
          <p className="mt-1.5 text-[11px] leading-tight text-slate-400">{card.subtitle}</p>
        )}
      </div>
    </div>
  );
};

// ─── Summary text ─────────────────────────────────────────────────────────────

const SummaryText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className={`leading-relaxed text-slate-700 ${i === 0 ? 'text-sm font-medium' : 'text-sm'}`}>
          {line}
        </p>
      ))}
    </div>
  );
};

// ─── Section label ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</p>
);

// ─── Data table ───────────────────────────────────────────────────────────────

const DataTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
    <table className="min-w-full text-left text-[11px]">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/60">
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 font-semibold text-slate-500">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {rows.map((row, i) => (
          <tr key={i} className="text-slate-700 transition-colors hover:bg-slate-50/40">
            {row.map((cell, j) => (
              <td key={j} className="max-w-[160px] truncate px-3 py-2" title={cell}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Action button ────────────────────────────────────────────────────────────

type ActionHandler = (action: AiSuggestedAction) => void;

const ActionButton: React.FC<{ action: AiSuggestedAction; onAction?: ActionHandler }> = ({
  action,
  onAction,
}) => {
  const { user, profile } = useAuth();
  const permissionUser = permissionUserFromAuth(user, profile?.email ?? null);
  const resolved = resolveActionRoute(action, permissionUser);
  const isNavigate =
    (action.actionType === 'navigate' || action.actionType === 'apply_filters') && resolved != null;
  const isReview = action.actionType === 'review';
  const clickable = isNavigate || isReview;

  const hasParams = resolved != null && resolved.params && Object.keys(resolved.params).length > 0;

  return (
    <button
      type="button"
      onClick={clickable ? () => onAction?.(action) : undefined}
      disabled={!clickable}
      className={[
        'group flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left text-xs transition-all duration-150',
        clickable
          ? 'cursor-pointer border-indigo-100 bg-indigo-50/50 text-indigo-900 hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-sm active:scale-[0.99]'
          : 'cursor-default border-slate-100 bg-slate-50/60 text-slate-600',
      ].join(' ')}
    >
      <span
        className={[
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
          clickable ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400',
        ].join(' ')}
      >
        {isNavigate ? (
          <ExternalLink className="h-3 w-3" aria-hidden />
        ) : isReview ? (
          <ArrowRight className="h-3 w-3" aria-hidden />
        ) : (
          <DollarSign className="h-3 w-3" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-semibold leading-snug">
          {action.label}
          {clickable && (
            <ChevronRight className="h-3 w-3 translate-x-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
          )}
        </span>
        <span className="mt-0.5 block leading-snug text-slate-500">{action.description}</span>
        {hasParams && resolved?.params && (
          <span className="mt-1 flex flex-wrap gap-1">
            {Object.entries(resolved.params).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center rounded-md bg-indigo-100/60 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
              >
                {k}: {v}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
};

// ─── Main renderer ────────────────────────────────────────────────────────────

type Props = {
  structured: AiStructuredResponse;
  onAction?: ActionHandler;
};

const AIResponseRenderer: React.FC<Props> = ({ structured, onAction }) => {
  const cleanSummary = sanitizeAiAssistantText(structured.summary ?? '');
  const warnings = structured.warnings ?? [];
  const actions = structured.suggestedActions ?? [];
  const metricCards = extractMetricCards(
    structured.data as Record<string, unknown> | unknown[] | null,
  );
  const table =
    metricCards.length === 0
      ? extractSimpleTable(structured.data as Record<string, unknown> | unknown[] | null)
      : null;

  const hasContent =
    cleanSummary ||
    metricCards.length > 0 ||
    table ||
    warnings.length > 0 ||
    actions.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {cleanSummary && <SummaryText text={cleanSummary} />}

      {/* Metrics */}
      {metricCards.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Métricas del periodo</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {metricCards.map((card) => (
              <MetricCard key={card.label} card={card} />
            ))}
          </div>
        </div>
      )}

      {/* Data table */}
      {table && (
        <div className="space-y-2">
          <SectionLabel>Detalle</SectionLabel>
          <DataTable headers={table.headers} rows={table.rows} />
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Alertas</SectionLabel>
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50/80 px-3.5 py-3 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                <span className="leading-relaxed">{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Acciones sugeridas</SectionLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actions.map((a, i) => (
              <ActionButton key={i} action={a} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIResponseRenderer;
