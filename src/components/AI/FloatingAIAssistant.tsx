import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Maximize2, Minimize2, Shrink, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canUseAiAssistant } from '../../modules/ai/permissions';
import { permissionUserFromAuth } from '../../utils/permissions';
import {
  getCopilotAutoNavigate,
  getCopilotNavHistory,
  getCopilotPanelOpen,
  setCopilotAutoNavigate,
  setCopilotPanelOpen,
  type CopilotNavHistoryItem,
} from '../../modules/copilot/copilotSettings';
import AIChatPanel from './AIChatPanel';
import { COPILOT_FAB_POSITION_CLASS, COPILOT_FAB_Z_CLASS } from '../../modules/copilot/copilotFabPlacement';

// ─── Component ────────────────────────────────────────────────────────────────

const FloatingAIAssistant: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const permissionUser = permissionUserFromAuth(user, profile?.email ?? null);
  const canUse = canUseAiAssistant(permissionUser);

  const [open, setOpen] = useState(() => getCopilotPanelOpen());
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [autoNavigate, setAutoNavigate] = useState(() => getCopilotAutoNavigate());
  const [navHistory, setNavHistory] = useState<CopilotNavHistoryItem[]>(() => getCopilotNavHistory());

  const hideOnFullPage = location.pathname === '/asistente';

  useEffect(() => {
    setCopilotPanelOpen(open);
  }, [open]);

  // Refresh nav history after each navigation (AIChatPanel writes it then navigate() fires)
  useEffect(() => {
    setNavHistory(getCopilotNavHistory());
  }, [location.pathname, location.search]);

  if (!canUse || hideOnFullPage) return null;

  const visibleHistory = navHistory.slice(0, 3);

  // ── Minimized / closed → FAB ──────────────────────────────────────────────
  if (!open || minimized) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        className={`copilot-fab-pulse fixed ${COPILOT_FAB_Z_CLASS} flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-700 hover:shadow-xl ${COPILOT_FAB_POSITION_CLASS}`}
        aria-label="Abrir Copiloto IA"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Copiloto</span>
        <span className="sm:hidden">IA</span>
      </button>
    );
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-[8998] bg-slate-900/20 backdrop-blur-[1px] sm:hidden"
        aria-hidden
        onClick={() => setMinimized(true)}
      />

      <aside
        className={[
          'copilot-panel-enter fixed z-[8999] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 rounded-t-2xl',
          expanded ? 'max-h-[96vh]' : 'max-h-[min(88vh,780px)]',
          // Desktop: floating panel — normal vs expanded
          expanded
            ? 'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:rounded-2xl sm:w-[min(720px,calc(100vw-2rem))] sm:h-[calc(100vh-2rem)]'
            : 'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:rounded-2xl sm:h-[min(700px,calc(100vh-5rem))] sm:w-[min(560px,calc(100vw-2rem))]',
        ].join(' ')}
        aria-label="Copiloto Navegador"
      >
        {/* Mobile drag handle */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">Copiloto Navegador</p>
              <p className="truncate text-[10px] text-slate-500">Consulta y navega en el sistema</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setAutoNavigate((prev) => {
                  const next = !prev;
                  setCopilotAutoNavigate(next);
                  return next;
                });
              }}
              title={autoNavigate ? 'Auto-navegación activada — click para desactivar' : 'Auto-navegación desactivada — click para activar'}
              className={`hidden rounded-lg px-2 py-1 text-[10px] font-semibold transition-all sm:inline ${
                autoNavigate
                  ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Auto {autoNavigate ? 'ON' : 'OFF'}
            </button>
            {/* Expand / Collapse — desktop only */}
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="hidden rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 sm:inline-flex sm:items-center"
              aria-label={expanded ? 'Contraer copiloto' : 'Expandir copiloto'}
              title={expanded ? 'Contraer' : 'Expandir'}
            >
              {expanded ? <Shrink className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
              aria-label="Minimizar copiloto"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
              aria-label="Cerrar copiloto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Navigation history chips */}
        {visibleHistory.length > 0 && (
          <div className="shrink-0 border-b border-slate-100 px-3 py-1.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-1">
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Reciente:
              </span>
              {visibleHistory.map((item) => (
                <button
                  key={item.path + item.ts}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-sm"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AIChatPanel
            variant="companion"
            autoNavigate={autoNavigate}
            className="h-full min-h-0"
            onNavigate={() => {
              setMinimized(true);
              setExpanded(false);
            }}
          />
        </div>
      </aside>
    </>
  );
};

export default FloatingAIAssistant;
