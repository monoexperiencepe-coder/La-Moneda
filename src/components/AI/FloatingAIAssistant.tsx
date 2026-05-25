import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Minimize2, Sparkles, X } from 'lucide-react';
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

// ─── Context label builder ────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  operativo_vehiculo: 'Operativo',
  caja_negocio: 'Caja',
  financiamiento: 'Financiamiento',
  combustible: 'Combustible',
  mantenimiento: 'Mantenimiento',
  arreglo_linea_escape: 'Línea de escape',
  autopartes: 'Autopartes',
};

function buildContextLabel(pathname: string, search: string): string | null {
  const sp = new URLSearchParams(search);
  const year = sp.get('year');
  const month = sp.get('month');
  const tipoGasto = sp.get('tipo_gasto');
  const placa = sp.get('placa');
  const vehicleId = sp.get('vehicleId');

  const parts: string[] = [];

  if (pathname.startsWith('/finanzas/ingresos')) parts.push('Ingresos');
  else if (pathname.startsWith('/finanzas/gastos')) parts.push('Gastos');
  else if (pathname.startsWith('/finanzas/inversiones/generales')) parts.push('Inv. Generales');
  else if (pathname.startsWith('/finanzas/inversiones')) parts.push('Inversiones');
  else if (pathname.startsWith('/finanzas/ia-clasificacion')) parts.push('Pendientes IA');
  else if (pathname.startsWith('/finanzas')) parts.push('Finanzas');
  else if (pathname.startsWith('/vehiculos/')) {
    const seg = decodeURIComponent(pathname.split('/')[2] ?? '');
    parts.push(`Vehículo ${seg}`);
  } else if (pathname.startsWith('/vehiculos')) parts.push('Vehículos');
  else if (pathname.startsWith('/operaciones/docs')) parts.push('Documentación');
  else if (pathname.startsWith('/operaciones')) parts.push('Operaciones');
  else if (pathname === '/') parts.push('Inicio');
  else return null;

  if (tipoGasto) parts.push(TIPO_LABELS[tipoGasto] ?? tipoGasto.replace(/_/g, ' '));
  if (placa) parts.push(placa);
  else if (vehicleId) parts.push(`#${vehicleId}`);
  if (year) parts.push(year);
  if (month) parts.push(`mes ${month}`);

  return parts.join(' · ');
}

// ─── Component ────────────────────────────────────────────────────────────────

const FloatingAIAssistant: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const permissionUser = permissionUserFromAuth(user, profile?.email ?? null);
  const canUse = canUseAiAssistant(permissionUser);

  const [open, setOpen] = useState(() => getCopilotPanelOpen());
  const [minimized, setMinimized] = useState(false);
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

  const contextLabel = buildContextLabel(location.pathname, location.search);
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
        className="copilot-fab-pulse fixed bottom-20 right-4 z-[9000] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-700 hover:shadow-xl sm:bottom-6 sm:right-6"
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
        className="copilot-panel-enter fixed z-[8999] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl inset-x-0 bottom-0 max-h-[min(85vh,720px)] rounded-t-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[min(640px,calc(100vh-5.5rem))] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-2xl"
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

        {/* Context bar — current page + active filters */}
        {contextLabel && (
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 sm:px-4">
            <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">
              <MapPin className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate">{contextLabel}</span>
            </p>
          </div>
        )}

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
          <AIChatPanel variant="companion" autoNavigate={autoNavigate} className="h-full min-h-0" />
        </div>
      </aside>
    </>
  );
};

export default FloatingAIAssistant;
