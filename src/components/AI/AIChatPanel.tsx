import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Navigation,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sendAiAssistantMessage } from '../../services/ai/aiAssistantService';
import { getAiQuickActionsForUser } from '../../modules/ai/quickActions';
import { permissionUserFromAuth } from '../../utils/permissions';
import { resolveActionRoute } from './AIResponseRenderer';
import {
  buildNavigateUrl,
  resolveCopilotActionFromSuggested,
} from '../../modules/copilot/copilotActions';
import { addCopilotNavHistory } from '../../modules/copilot/copilotSettings';
import { triggerCopilotHighlight } from '../../modules/copilot/copilotHighlight';
import type { AiChatMessage, AiSuggestedAction } from '../../modules/ai/types';
import AIMessageCard from './AIMessageCard';
import AIDebugPanel from './AIDebugPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newUserMessage(content: string): AiChatMessage {
  return {
    id: `u-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// Strip "Abriendo " prefix and trailing "…" to get a short history label
function toHistoryLabel(statusLabel: string): string {
  return statusLabel.replace(/^Abriendo\s+/i, '').replace(/…$/, '').trim();
}

// ─── Loading phase detection ──────────────────────────────────────────────────

type LoadingPhase =
  | 'analyzing'
  | 'summarizing'
  | 'checking_pending'
  | 'detecting_anomalies'
  | 'querying_vehicles'
  | 'querying_loans'
  | 'querying_expenses'
  | 'querying_income';

const PHASE_LABELS: Record<LoadingPhase, string> = {
  analyzing: 'Analizando datos…',
  summarizing: 'Generando resumen financiero…',
  checking_pending: 'Revisando pendientes de clasificación…',
  detecting_anomalies: 'Detectando posibles anomalías…',
  querying_vehicles: 'Analizando flota vehicular…',
  querying_loans: 'Consultando préstamos activos…',
  querying_expenses: 'Consultando gastos…',
  querying_income: 'Consultando ingresos…',
};

function detectPhase(message: string): LoadingPhase {
  const m = message.toLowerCase();
  if (m.includes('resume') || m.includes('resumen') || m.includes('mes')) return 'summarizing';
  if (m.includes('pendiente') || m.includes('clasificar') || m.includes('revisar'))
    return 'checking_pending';
  if (m.includes('duplicado') || m.includes('error') || m.includes('anomal') || m.includes('detectar'))
    return 'detecting_anomalies';
  if (m.includes('vehículo') || m.includes('vehiculo') || m.includes('flota') || m.includes('placa'))
    return 'querying_vehicles';
  if (m.includes('préstamo') || m.includes('prestamo') || m.includes('financiamiento'))
    return 'querying_loans';
  if (m.includes('gasto')) return 'querying_expenses';
  if (m.includes('ingreso')) return 'querying_income';
  return 'analyzing';
}

// ─── Context chips ────────────────────────────────────────────────────────────

interface ContextChip {
  id: string;
  label: string;
  prompt: string;
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function extractContextChips(messages: AiChatMessage[]): ContextChip[] {
  const lastAi = [...messages].reverse().find((m) => m.role === 'assistant' && m.structured);
  if (!lastAi?.structured) return [];

  const chips: ContextChip[] = [];
  const summary = (lastAi.structured.summary ?? '').toLowerCase();
  const data = lastAi.structured.data as Record<string, unknown> | null;

  const foundMonth = MONTH_NAMES.find((mo) => summary.includes(mo));
  if (foundMonth) {
    const label = foundMonth.charAt(0).toUpperCase() + foundMonth.slice(1);
    chips.push({ id: 'month', label: `📅 ${label}`, prompt: `Y en ${label}` });
  } else if (summary.includes('mes')) {
    chips.push({ id: 'month', label: '📅 Mes actual', prompt: 'Y del mes actual' });
  }

  if (summary.includes('combustible'))
    chips.push({ id: 'combustible', label: '⛽ Combustible', prompt: 'Solo combustible' });
  else if (summary.includes('mantenimiento'))
    chips.push({ id: 'mant', label: '🔧 Mantenimiento', prompt: 'Solo mantenimiento' });

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const pendCount =
      typeof (d.pendientes as Record<string, unknown>)?.count === 'number'
        ? ((d.pendientes as Record<string, unknown>).count as number)
        : null;
    if (pendCount != null && pendCount > 0)
      chips.push({
        id: 'pending',
        label: `⚠ ${pendCount} pendientes`,
        prompt: 'Muéstrame los pendientes sin clasificar',
      });
  }

  return chips.slice(0, 3);
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

const SkeletonCard: React.FC<{ phase: LoadingPhase }> = ({ phase }) => (
  <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <div className="h-4 w-4 rounded-full bg-indigo-100" />
      <div className="h-2.5 w-14 rounded-full bg-slate-100" />
    </div>
    <div className="space-y-2 mb-4">
      <div className="h-2.5 w-11/12 rounded-full bg-slate-100" />
      <div className="h-2.5 w-4/5 rounded-full bg-slate-100" />
      {(phase === 'summarizing' || phase === 'querying_expenses') && (
        <div className="h-2.5 w-3/5 rounded-full bg-slate-100" />
      )}
    </div>
    {(phase === 'summarizing' || phase === 'querying_expenses' || phase === 'querying_income') && (
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-20 rounded-2xl ${i % 2 === 0 ? 'bg-emerald-50/60' : 'bg-red-50/60'}`} />
        ))}
      </div>
    )}
  </div>
);

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingState: React.FC<{ phase: LoadingPhase }> = ({ phase }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
    <div className="flex items-center gap-1" aria-label="Procesando">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="block h-2 w-2 rounded-full bg-indigo-400"
          style={{ animation: `ai-pulse 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </div>
    <span className="text-xs font-medium text-slate-500">{PHASE_LABELS[phase]}</span>
  </div>
);

// ─── Message fade-in ──────────────────────────────────────────────────────────

const FadeIn: React.FC<{ children: React.ReactNode; isNew?: boolean }> = ({ children, isNew }) => (
  <div style={{ animation: isNew ? 'ai-fadein 0.3s ease-out' : undefined }}>{children}</div>
);

// ─── Nav status banner ────────────────────────────────────────────────────────

type NavStatus = { type: 'loading' | 'success' | 'error'; text: string };

const NAV_STATUS_STYLES: Record<NavStatus['type'], string> = {
  loading: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  error:   'border-amber-100  bg-amber-50  text-amber-700',
};

const NavStatusBanner: React.FC<{ status: NavStatus }> = ({ status }) => (
  <div
    className={`shrink-0 border-b px-3 py-2 text-xs font-medium sm:px-4 flex items-center gap-2 ${NAV_STATUS_STYLES[status.type]}`}
    style={{ animation: 'ai-fadein 0.2s ease-out' }}
  >
    {status.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    {status.type === 'error'   && <XCircle       className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    {status.type === 'loading' && (
      <span className="flex shrink-0 gap-0.5" aria-hidden>
        {[0, 80, 160].map((d) => (
          <span key={d} className="block h-1.5 w-1.5 rounded-full bg-indigo-400"
            style={{ animation: `ai-pulse 1.2s ease-in-out ${d}ms infinite` }} />
        ))}
      </span>
    )}
    <span className="truncate">{status.text}</span>
  </div>
);

// ─── Countdown auto-nav banner ────────────────────────────────────────────────

const COUNTDOWN_TOTAL = 3;
// SVG circle with r=13 → circumference ≈ 81.7
const CIRC = 2 * Math.PI * 13;

interface CountdownState {
  action: AiSuggestedAction;
  label: string;
  secs: number;
}

const CountdownBanner: React.FC<{
  countdown: CountdownState;
  onCancel: () => void;
}> = ({ countdown, onCancel }) => (
  <div
    className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-3 py-2.5 sm:px-4"
    style={{ animation: 'ai-fadein 0.2s ease-out' }}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Countdown ring */}
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <svg className="absolute inset-0 h-9 w-9 -rotate-90" viewBox="0 0 32 32" aria-hidden>
            <circle cx="16" cy="16" r="13" fill="none" stroke="#e0e7ff" strokeWidth="2.5" />
            <circle
              cx="16" cy="16" r="13"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - countdown.secs / COUNTDOWN_TOTAL)}
              style={{ transition: 'stroke-dashoffset 0.92s linear' }}
            />
          </svg>
          <span className="relative text-xs font-bold text-indigo-700">{countdown.secs}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-indigo-900">
            <Navigation className="mr-1 inline h-3 w-3" aria-hidden />
            Abriendo {countdown.label}
          </p>
          <p className="text-[10px] text-indigo-500">Auto-navegación activada</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-100"
      >
        Cancelar
      </button>
    </div>
    {/* Progress bar */}
    <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-indigo-100">
      <div
        className="h-full rounded-full bg-indigo-400"
        style={{
          width: `${(countdown.secs / COUNTDOWN_TOTAL) * 100}%`,
          transition: 'width 0.92s linear',
        }}
      />
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

type AIChatPanelProps = {
  variant?: 'page' | 'companion';
  autoNavigate?: boolean;
  className?: string;
};

const AIChatPanel: React.FC<AIChatPanelProps> = ({
  variant = 'page',
  autoNavigate = false,
  className = '',
}) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('analyzing');
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [configErrorShown, setConfigErrorShown] = useState(false);
  const [newestMsgId, setNewestMsgId] = useState<string | null>(null);
  const [navStatus, setNavStatus] = useState<NavStatus | null>(null);
  const [countdownAction, setCountdownAction] = useState<CountdownState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const permissionUser = useMemo(
    () => permissionUserFromAuth(user, profile?.email ?? null),
    [user, profile?.email],
  );
  const quickActions = useMemo(() => getAiQuickActionsForUser(permissionUser), [permissionUser]);
  const showDebug = import.meta.env.DEV || user.role === 'admin';
  const contextChips = useMemo(() => extractContextChips(messages), [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, loading]);

  // Countdown tick — decrements every second; at 0 navigates
  useEffect(() => {
    if (!countdownAction) return;
    if (countdownAction.secs <= 0) {
      const action = countdownAction.action;
      setCountdownAction(null);
      runCopilotNavigation(action);
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdownAction((prev) => (prev ? { ...prev, secs: prev.secs - 1 } : null));
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownAction]);

  const runCopilotNavigation = useCallback(
    (action: AiSuggestedAction) => {
      // Try copilot registry first
      const copilot = resolveCopilotActionFromSuggested(permissionUser, action);
      if (copilot) {
        if (!copilot.ok) {
          setNavStatus({ type: 'error', text: copilot.error });
          window.setTimeout(() => setNavStatus(null), 4000);
          return false;
        }
        const url = buildNavigateUrl(copilot);
        setNavStatus({ type: 'loading', text: copilot.statusLabel });
        navigate(url);
        window.setTimeout(() => {
          const histLabel = toHistoryLabel(copilot.statusLabel);
          addCopilotNavHistory({ label: histLabel, path: url });
          setNavStatus({ type: 'success', text: `${histLabel} abierto` });
          triggerCopilotHighlight();
          window.setTimeout(() => setNavStatus(null), 2000);
        }, 400);
        return true;
      }

      // Fallback: generic route resolver
      const resolved = resolveActionRoute(action, permissionUser);
      if (resolved) {
        const qs =
          resolved.params && Object.keys(resolved.params).length > 0
            ? `?${new URLSearchParams(resolved.params).toString()}`
            : '';
        const url = `${resolved.path}${qs}`;
        setNavStatus({ type: 'loading', text: 'Abriendo vista…' });
        navigate(url);
        window.setTimeout(() => {
          addCopilotNavHistory({ label: action.label ?? resolved.path, path: url });
          setNavStatus({ type: 'success', text: 'Vista abierta' });
          triggerCopilotHighlight();
          window.setTimeout(() => setNavStatus(null), 2000);
        }, 400);
        return true;
      }

      if (action.actionType === 'review' && action.label) {
        void sendMessage(action.label);
        return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, permissionUser],
  );

  const handleAction = useCallback(
    (action: AiSuggestedAction) => {
      runCopilotNavigation(action);
    },
    [runCopilotNavigation],
  );

  const tryAutoNavigate = useCallback(
    (assistant: AiChatMessage) => {
      if (!autoNavigate) return;
      const navAction = assistant.structured?.suggestedActions?.find(
        (a) => a.actionType === 'navigate' || a.actionType === 'apply_filters',
      );
      if (!navAction) return;
      setCountdownAction({ action: navAction, label: navAction.label ?? 'vista', secs: COUNTDOWN_TOTAL });
    },
    [autoNavigate],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !profile?.empresa_id) return;

      const phase = detectPhase(trimmed);
      setLoadingPhase(phase);

      const userMsg = newUserMessage(trimmed);
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setLastFailedPrompt(null);
      requestAnimationFrame(() => inputRef.current?.focus());

      try {
        const { assistant, error, retryable } = await sendAiAssistantMessage({
          message: trimmed,
          history: messages,
          user,
          email: profile.email,
          empresaId: profile.empresa_id,
        });
        setNewestMsgId(assistant.id);
        setMessages((prev) => [...prev, assistant]);
        tryAutoNavigate(assistant);
        if (error) {
          setLastFailedPrompt(retryable ? trimmed : null);
          if (error.includes('no configurado')) setConfigErrorShown(true);
        }
      } catch {
        const errId = `err-${Date.now()}`;
        setNewestMsgId(errId);
        setLastFailedPrompt(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: errId,
            role: 'assistant',
            content: 'Ocurrió un error inesperado. Intenta de nuevo.',
            structured: {
              summary: 'Ocurrió un error inesperado. Intenta de nuevo.',
              warnings: ['Error de red o cliente.'],
              suggestedActions: [],
              confidence: null,
            },
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, profile, user, tryAutoNavigate],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const hasMessages = messages.length > 0;

  return (
    <>
      <style>{`
        @keyframes ai-pulse {
          0%, 60%, 100% { transform: translateY(0) scale(1); opacity: 0.5; }
          30% { transform: translateY(-5px) scale(1.1); opacity: 1; }
        }
        @keyframes ai-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className={`flex flex-col overflow-hidden bg-white ${
          variant === 'companion'
            ? 'h-full min-h-0'
            : 'max-h-[calc(100dvh-180px)] min-h-[520px] rounded-2xl border border-slate-200/60 shadow-sm'
        } ${className}`}
      >
        {/* Countdown auto-nav banner (shown above navStatus) */}
        {countdownAction && (
          <CountdownBanner
            countdown={countdownAction}
            onCancel={() => setCountdownAction(null)}
          />
        )}

        {/* Nav status banner */}
        {navStatus && !countdownAction && <NavStatusBanner status={navStatus} />}

        {/* Config error banner */}
        {configErrorShown && (
          <div className="flex shrink-0 items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <p>
              Asistente IA no configurado. Configure <strong>AI_API_KEY</strong>, AI_PROVIDER y
              AI_MODEL en Supabase (Edge Function ai-assistant).
            </p>
          </div>
        )}

        {/* Quick actions top strip */}
        {hasMessages && quickActions.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/60 px-3 py-2 sm:px-4">
            {quickActions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void sendMessage(a.prompt)}
                disabled={loading}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-sm disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable message area */}
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">

          {/* Empty state */}
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-200">
                <Sparkles className="h-8 w-8 text-white" aria-hidden />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-800">Asistente Ejecutivo</p>
                <p className="mt-1 text-xs text-slate-500">
                  Análisis financiero · Solo lectura · Respuestas en tiempo real
                </p>
              </div>
              <div className="flex max-w-xs flex-wrap justify-center gap-2">
                {quickActions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => void sendMessage(a.prompt)}
                    disabled={loading}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:shadow hover:text-indigo-700 disabled:opacity-40"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 shadow-sm sm:max-w-[72%]">
                  <p className="text-sm leading-relaxed text-white">{m.content}</p>
                  <p className="mt-1 text-right text-[10px] text-indigo-200/60">
                    {formatMsgTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ) : m.structured ? (
              <FadeIn key={m.id} isNew={m.id === newestMsgId}>
                <div className="space-y-2">
                  <AIMessageCard
                    structured={m.structured}
                    toolsUsed={m.toolsUsed}
                    timestamp={m.createdAt}
                    onAction={handleAction}
                  />
                  {showDebug && m.debug && <AIDebugPanel debug={m.debug} />}
                </div>
              </FadeIn>
            ) : (
              <FadeIn key={m.id} isNew={m.id === newestMsgId}>
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
                  {m.content}
                </div>
              </FadeIn>
            ),
          )}

          {/* Loading: skeleton + typing state */}
          {loading && (
            <div className="space-y-2" style={{ animation: 'ai-fadein 0.2s ease-out' }}>
              <TypingState phase={loadingPhase} />
              <SkeletonCard phase={loadingPhase} />
            </div>
          )}

          {/* Retry */}
          {lastFailedPrompt && !loading && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void sendMessage(lastFailedPrompt)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:shadow"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Reintentar última consulta
              </button>
            </div>
          )}
        </div>

        {/* Input area */}
        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-slate-100 bg-white px-3 py-3 sm:px-4"
        >
          {/* Context chips */}
          {contextChips.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="self-center text-[10px] font-medium text-slate-400">
                <Zap className="mr-0.5 inline h-3 w-3" aria-hidden />
                Contexto:
              </span>
              {contextChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => void sendMessage(chip.prompt)}
                  disabled={loading}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Pregunta sobre gastos, pendientes, resumen del mes…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none ring-indigo-200 placeholder:text-slate-400 transition-all focus:bg-white focus:ring-2"
              disabled={loading || configErrorShown}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || configErrorShown}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:shadow-none"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Enter para enviar · Shift+Enter nueva línea
          </p>
        </form>
      </div>
    </>
  );
};

export default AIChatPanel;
