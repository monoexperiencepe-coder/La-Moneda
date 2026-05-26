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
  buildExecutiveView,
  type AiMetricCard,
  type ExecutiveViewModel,
} from '../../utils/aiResponseParser';

// ─── Deep-link resolver ────────────────────────────────────────────────────────

export interface ResolvedAction {
  path: string;
  params?: Record<string, string>;
}

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

  let path = typeof payload?.route === 'string' ? payload.route : null;
  const extraParams: Record<string, string> = {};

  if (payload?.params && typeof payload.params === 'object') {
    Object.assign(extraParams, payload.params);
  }
  if (payload?.tipo_gasto) extraParams.tipo_gasto = payload.tipo_gasto;
  if (payload?.estado) extraParams.estado = payload.estado;

  if (!path) {
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

// ─── Metric card (compact) ────────────────────────────────────────────────────

type CardVariant = AiMetricCard['variant'];

const CARD_STYLES: Record<CardVariant, { bg: string; label: string; value: string }> = {
  green: { bg: 'border-emerald-100/80 bg-emerald-50/40', label: 'text-emerald-700', value: 'text-emerald-900' },
  red: { bg: 'border-red-100/80 bg-red-50/40', label: 'text-red-600', value: 'text-red-900' },
  blue: { bg: 'border-indigo-100/80 bg-indigo-50/40', label: 'text-indigo-600', value: 'text-indigo-900' },
  amber: { bg: 'border-amber-100/80 bg-amber-50/40', label: 'text-amber-700', value: 'text-amber-900' },
  gray: { bg: 'border-slate-200/80 bg-slate-50/60', label: 'text-slate-500', value: 'text-slate-800' },
};

const CARD_ICONS: Record<CardVariant, React.ReactNode> = {
  green: <TrendingUp className="h-3.5 w-3.5" aria-hidden />,
  red: <TrendingDown className="h-3.5 w-3.5" aria-hidden />,
  blue: <BarChart3 className="h-3.5 w-3.5" aria-hidden />,
  amber: <Clock className="h-3.5 w-3.5" aria-hidden />,
  gray: <Minus className="h-3.5 w-3.5" aria-hidden />,
};

const CompactMetric: React.FC<{ card: AiMetricCard }> = ({ card }) => {
  const s = CARD_STYLES[card.variant];
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${s.bg}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={s.label}>{CARD_ICONS[card.variant]}</span>
        <span className={`truncate text-[11px] font-semibold ${s.label}`}>{card.label}</span>
      </div>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${s.value}`}>{card.value}</span>
    </div>
  );
};

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

  return (
    <button
      type="button"
      data-copilot-suggested-action=""
      onClick={clickable ? () => onAction?.(action) : undefined}
      disabled={!clickable}
      className={[
        'group flex w-full items-start gap-3 rounded-xl border p-3 text-left text-xs transition-all duration-150',
        clickable
          ? 'cursor-pointer border-indigo-100 bg-indigo-50/40 text-indigo-900 hover:border-indigo-200 hover:bg-indigo-50 active:scale-[0.99]'
          : 'cursor-default border-slate-100 bg-slate-50/50 text-slate-600',
      ].join(' ')}
    >
      <span
        className={[
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
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
            <ChevronRight className="h-3 w-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
          )}
        </span>
        {action.description?.trim() ? (
          <span className="mt-0.5 block leading-snug text-slate-500">{action.description}</span>
        ) : null}
      </span>
    </button>
  );
};

// ─── Executive render ─────────────────────────────────────────────────────────

function ExecutiveBullets({ bullets }: { bullets: ExecutiveViewModel['bullets'] }) {
  if (!bullets.length) return null;
  return (
    <ul className="space-y-2.5">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-slate-700">
          <span className="mt-0.5 shrink-0 text-slate-300" aria-hidden>•</span>
          <span className="min-w-0">
            {b.label ? (
              <>
                <span className="font-medium text-slate-800">{b.label}</span>
                <span className="mt-0.5 block tabular-nums text-slate-700">{b.value}</span>
              </>
            ) : (
              <span>{b.value}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExecutiveWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <p
          key={i}
          className="flex items-start gap-2 rounded-xl border border-amber-100/90 bg-amber-50/70 px-3 py-2.5 text-[12px] leading-snug text-amber-950"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          <span>{w}</span>
        </p>
      ))}
    </div>
  );
}

/** Renderiza respuesta ejecutiva limpia (sin JSON ni labels técnicos). */
export function renderExecutiveResponse(
  structured: AiStructuredResponse,
  onAction?: ActionHandler,
): React.ReactElement | null {
  const view = buildExecutiveView(structured);
  const hasContent =
    view.headline
    || view.bullets.length > 0
    || view.metricCards.length > 0
    || view.table
    || view.warnings.length > 0
    || view.actions.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-3.5">
      {view.headline ? (
        <p className="text-[13px] font-medium leading-relaxed text-slate-800">{view.headline}</p>
      ) : null}

      <ExecutiveBullets bullets={view.bullets} />

      {view.metricCards.length > 0 ? (
        <div className="space-y-2">
          {view.metricCards.map((card) => (
            <CompactMetric key={card.label} card={card} />
          ))}
        </div>
      ) : null}

      {view.table ? (
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white/80">
          <table className="min-w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {view.table.headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {view.table.rows.map((row, i) => (
                <tr key={i} className="text-slate-700">
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-[160px] truncate px-3 py-2" title={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ExecutiveWarnings warnings={view.warnings} />

      {view.actions.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 pt-0.5 sm:grid-cols-2">
          {view.actions.map((a, i) => (
            <ActionButton key={i} action={a} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  structured: AiStructuredResponse;
  onAction?: ActionHandler;
};

const AIResponseRenderer: React.FC<Props> = ({ structured, onAction }) => (
  <>{renderExecutiveResponse(structured, onAction)}</>
);

export default AIResponseRenderer;
