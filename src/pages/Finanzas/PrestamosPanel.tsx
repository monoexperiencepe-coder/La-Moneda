import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import Card from '../../components/Common/Card';
import { supabase } from '../../lib/supabase';
import { fetchPrestamosFinancierosDetalle } from '../../services/prestamosFinancierosService';
import type {
  Moneda,
  PrestamoFinanciero,
  PrestamoFinancieroCalculoInfo,
  PrestamoFinancieroDetalle,
  PrestamoFinancieroTramo,
} from '../../data/types';
import { calcularPrestamoFinancieroInfo } from '../../utils/prestamosFinancierosCalc';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import { EMPRESA_ID } from '../../config/app';
import { useAuth } from '../../context/AuthContext';
import PrestamoEditModal from '../../components/Finanzas/PrestamoEditModal';
import PrestamosRegistroTable from '../../components/Finanzas/PrestamosRegistroTable';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function timelinePeriodLabel(desde: string, hasta: string | null): string {
  const d = desde.trim().slice(0, 10);
  const h = hasta?.trim() ? hasta.trim().slice(0, 10) : '';
  const yStart = d.slice(0, 4);
  if (!h) return `${yStart} → actual`;
  const yEnd = h.slice(0, 4);
  if (yStart === yEnd) return `${formatDate(d)} — ${formatDate(h)}`;
  return `${yStart} → ${yEnd}`;
}

function eventoTimelineLegible(evento: string, nota: string): string {
  const e = evento.trim();
  const n = nota.trim();
  if (!e && !n) return 'Cambio de condiciones';
  if (e.toLowerCase().includes('retiro') || n.toLowerCase().includes('retir')) return 'Retiro de capital';
  if (e === 'inicio') return 'Inicio';
  return e ? e.replace(/_/g, ' ') : n.slice(0, 48) + (n.length > 48 ? '…' : '');
}

function eventoTimelineCorto(evento: string, nota: string): string {
  const legible = eventoTimelineLegible(evento, nota);
  if (legible.length <= 22) return legible;
  return `${legible.slice(0, 20)}…`;
}

/** Capital referencial que bajó al pasar del tramo anterior al siguiente (misma moneda capital). */
function capitalReducidoEntreTramos(
  anterior: PrestamoFinancieroTramo,
  siguiente: PrestamoFinancieroTramo,
): { monto: number; moneda: Moneda } | null {
  const c0 = anterior.capitalReferencial;
  const c1 = siguiente.capitalReferencial;
  if (c0 == null || c1 == null || !Number.isFinite(c0) || !Number.isFinite(c1)) return null;
  if (c1 >= c0 - 0.005) return null;
  return { monto: Math.round((c0 - c1) * 100) / 100, moneda: siguiente.monedaCapital };
}

/** Primer tramo con capital referencial por debajo del capital original del contrato. */
function reduccionVsCapitalOriginal(
  montoOriginal: number,
  primerTramo: PrestamoFinancieroTramo,
  monedaPrestamo: Moneda,
): { monto: number; moneda: Moneda } | null {
  const c = primerTramo.capitalReferencial;
  if (c == null || !Number.isFinite(c) || !Number.isFinite(montoOriginal) || montoOriginal <= 0) return null;
  if (montoOriginal <= c + 0.005) return null;
  return { monto: Math.round((montoOriginal - c) * 100) / 100, moneda: monedaPrestamo };
}

function modalidadEtiqueta(p: PrestamoFinanciero): string {
  return p.modalidadPago === 'cuota_fija' ? 'Cuota fija mensual' : 'Tasa anual';
}

interface PrestamoCardProps {
  detalle: PrestamoFinancieroDetalle;
  numeroEnLista: number;
  canEdit: boolean;
  onEdit: () => void;
}

function PrestamoEjecutivoCard({ detalle, numeroEnLista, canEdit, onEdit }: PrestamoCardProps) {
  const { prestamo: p, tramos } = detalle;
  const calc = useMemo(() => calcularPrestamoFinancieroInfo(p, tramos), [p, tramos]);
  const tramosOrdenados = useMemo(
    () => [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id),
    [tramos],
  );

  const activo = p.estado === 'activo';

  return (
    <article
      id={`prestamo-registro-${p.id}`}
      className={
        activo
          ? 'rounded-lg border border-slate-200/90 bg-white shadow-sm shadow-slate-200/20 overflow-hidden'
          : 'rounded-lg border border-red-200/80 bg-white shadow-sm shadow-red-200/25 overflow-hidden'
      }
    >
      <header
        className={
          activo
            ? 'relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-2.5 py-2 sm:px-3 sm:py-2'
            : 'relative bg-gradient-to-br from-red-950 via-red-900 to-red-950 px-2.5 py-2 sm:px-3 sm:py-2'
        }
      >
        <div
          className={
            activo
              ? 'absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(99,102,241,0.14),transparent)] pointer-events-none'
              : 'absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(252,165,165,0.2),transparent)] pointer-events-none'
          }
          aria-hidden
        />
        <div className="relative flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="flex min-w-0 gap-1.5 sm:gap-2">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15 text-[10px] font-bold text-white ring-1 ring-white/25 tabular-nums sm:h-7 sm:w-7 sm:text-[11px]"
              aria-label={`Préstamo ${numeroEnLista} de la lista`}
            >
              {numeroEnLista}
            </span>
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-sm sm:text-base font-semibold tracking-tight text-white leading-tight">
                {p.prestamista || `Préstamo #${p.id}`}
              </h2>
              {p.titulo?.trim() ? (
                <p className="text-[10px] text-white/70 leading-snug truncate" title={p.titulo}>
                  {p.titulo.trim()}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-px text-[9px] font-bold text-white ring-1 ring-white/15"
                  title="moneda_capital"
                >
                  Moneda capital: {p.monedaCapital}
                </span>
                <span
                  className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-px text-[9px] font-bold text-white ring-1 ring-white/15"
                  title="moneda_pago"
                >
                  Moneda pago: {p.monedaPago}
                </span>
                <span className="inline-flex items-center rounded-md bg-violet-400/25 px-1.5 py-px text-[9px] font-semibold text-violet-100 ring-1 ring-violet-300/25">
                  {modalidadEtiqueta(p)}
                </span>
                <span
                  className={
                    activo
                      ? 'inline-flex items-center rounded-md bg-emerald-400/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-400/30'
                      : 'inline-flex items-center rounded-md bg-red-500/25 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-red-100 ring-1 ring-red-400/45'
                  }
                >
                  {activo ? 'Activo' : 'Cancelado'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch sm:items-end gap-1">
            {canEdit ? (
              <div className="flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/25 transition-colors"
                >
                  Editar condiciones
                </button>
              </div>
            ) : null}
            <div className="flex flex-col items-start sm:items-end gap-0 rounded-md bg-white/10 px-2 py-1.5 ring-1 ring-white/12 sm:min-w-[140px]">
            <span className="text-[8px] font-medium uppercase tracking-wide text-white/50 leading-none">Valor cuota</span>
            <span className="text-lg sm:text-xl font-bold tabular-nums tracking-tight text-white leading-none mt-0.5">
              {montoFmt(p.interesMensualActual, p.monedaPago)}
            </span>
            {p.modalidadPago === 'cuota_fija' ? (
              <span className="text-[8px] text-white/45 leading-none mt-0.5">Cuota fija</span>
            ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-50/80">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1.5">
          <KpiTile label="Capital original" value={montoFmt(p.montoOriginal, p.monedaCapital)} accent />
          <KpiTile label="Capital actual" value={montoFmt(calc.capitalActualEstimado, p.monedaCapital)} accent />
          <KpiTile label="Moneda capital" value={p.monedaCapital} />
          <KpiTile label="Moneda pago" value={p.monedaPago} />
          <KpiTile label="Modalidad" value={modalidadEtiqueta(p)} />
          {p.modalidadPago === 'cuota_fija' ? (
            <KpiTile
              label="Importe mensual (cuota fija)"
              value={
                p.cuotaFijaMensual != null && Number.isFinite(p.cuotaFijaMensual)
                  ? montoFmt(p.cuotaFijaMensual, p.monedaPago)
                  : montoFmt(p.interesMensualActual, p.monedaPago)
              }
            />
          ) : (
            <KpiTile
              label="Tasa anual"
              value={
                p.tasaAnual != null && Number.isFinite(p.tasaAnual)
                  ? `${(p.tasaAnual * 100).toLocaleString('es-PE', { maximumFractionDigits: 4 })}%`
                  : '—'
              }
            />
          )}
          <KpiTile label="Meses estimados" value={String(calc.mesesPagadosEstimados)} />
          <KpiTile
            label="Total pagado estimado"
            value={montoFmt(calc.totalInteresPagadoEstimado, p.monedaPago)}
            highlight
          />
        </div>
      </div>

      {tramosOrdenados.length > 0 ? (
        <div className="px-2.5 pb-1.5 pt-0 sm:px-3 sm:pb-2">
          <h3 className="text-[8px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tramos</h3>
          <TramosTimeline
            tramos={tramosOrdenados}
            calc={calc}
            montoOriginal={p.montoOriginal}
            monedaCapitalPrestamo={p.monedaCapital}
          />
        </div>
      ) : null}

      <details className="group border-t border-slate-100 bg-slate-50/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1 sm:px-3 text-[10px] font-medium text-slate-600 hover:bg-slate-100/80 transition-colors [&::-webkit-details-marker]:hidden">
          <span>Más información</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-1 px-2.5 pb-1.5 pt-0 sm:px-3 sm:pb-2 text-[10px] text-slate-600">
          <ul className="space-y-0.5 leading-snug">
            <li>
              <span className="text-slate-400">Inicio contrato:</span>{' '}
              <span className="font-medium text-slate-700">{formatDate(p.fechaInicio)}</span>
            </li>
            <li>
              <span className="text-slate-400">Tope estimaciones:</span>{' '}
              <span className="font-medium text-slate-700">{formatDate(calc.fechaTopeCalculo)}</span>
            </li>
            {p.fechaCancelacion ? (
              <li>
                <span className="text-slate-400">Cancelación:</span>{' '}
                <span className="font-medium text-slate-700">{formatDate(p.fechaCancelacion)}</span>
              </li>
            ) : null}
            {p.requiereTramos ? (
              <li>
                <span className="text-slate-400">Tramos:</span>{' '}
                <span className="font-medium text-slate-700">requiere tramos (Excel)</span>
              </li>
            ) : null}
          </ul>
          {(p.observaciones?.trim() || p.notas?.trim()) ? (
            <div className="rounded-md bg-white border border-slate-200/80 px-1.5 py-1 text-[9px] text-slate-600 leading-snug whitespace-pre-wrap">
              {p.observaciones?.trim() || p.notas?.trim()}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function KpiTile({
  label,
  value,
  accent,
  highlight,
  className = '',
}: {
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-md px-1.5 py-1 border border-slate-200/90 shadow-none',
        highlight
          ? 'bg-indigo-50/90 border-indigo-200/60 text-indigo-950'
          : accent
            ? 'bg-white text-slate-900'
            : 'bg-white text-slate-800',
        className,
      ].join(' ')}
    >
      <p className="text-[8px] font-medium uppercase tracking-wide text-slate-500 mb-px leading-none">{label}</p>
      <p className={`text-[11px] sm:text-xs font-semibold tabular-nums tracking-tight leading-tight ${highlight ? 'text-indigo-950' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

function TramosTimeline({
  tramos,
  calc,
  montoOriginal,
  monedaCapitalPrestamo,
}: {
  tramos: PrestamoFinancieroTramo[];
  calc: PrestamoFinancieroCalculoInfo;
  montoOriginal: number;
  monedaCapitalPrestamo: Moneda;
}) {
  return (
    <div className="relative pl-0 sm:pl-0.5">
      <div
        className="absolute left-[5px] sm:left-[6px] top-0.5 bottom-1.5 w-px bg-gradient-to-b from-indigo-200/90 via-slate-200/70 to-transparent"
        aria-hidden
      />

      <div className="space-y-0">
        {tramos.map((t, idx) => {
          const linea = calc.porTramo.find((x) => x.tramoId === t.id);
          const monedaCuota = t.monedaPago;
          const cuota = linea != null ? montoFmt(linea.interesMensualEfectivo, monedaCuota) : '—';
          const periodo = timelinePeriodLabel(t.desde, t.hasta);
          const siguiente = tramos[idx + 1];
          const mostrarPuente = idx < tramos.length - 1;
          const refCap =
            t.capitalReferencial != null && Number.isFinite(t.capitalReferencial)
              ? montoFmt(t.capitalReferencial, t.monedaCapital)
              : null;
          const mesesTxt = linea != null && linea.meses > 0 ? `~${linea.meses} meses` : null;
          const tooltipDetalle = [refCap ? `Capital ref.: ${refCap}` : null, mesesTxt].filter(Boolean).join(' · ') || undefined;

          const menosOriginal =
            idx === 0 ? reduccionVsCapitalOriginal(montoOriginal, t, monedaCapitalPrestamo) : null;
          const reduccionPuente = mostrarPuente && siguiente ? capitalReducidoEntreTramos(t, siguiente) : null;

          return (
            <div key={t.id} className="relative pb-1.5 last:pb-0">
              <div className="flex gap-1.5 sm:gap-2">
                <div className="relative z-[1] mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 ring-2 ring-white shadow-sm" />
                <div className="min-w-0 flex-1 pt-0" title={tooltipDetalle}>
                  <p className="text-[9px] sm:text-[10px] font-medium text-slate-700 leading-tight">{periodo}</p>
                  <p className="text-xs sm:text-sm font-bold tabular-nums text-indigo-950 leading-tight mt-px">
                    {cuota}
                    <span className="text-[10px] sm:text-[11px] font-semibold text-indigo-700/80">/mes</span>
                    <span className="text-[8px] font-normal text-slate-400 ml-0.5">{monedaCuota}</span>
                  </p>
                  {menosOriginal ? (
                    <p className="mt-0.5 text-[9px] font-semibold tabular-nums text-red-600 leading-tight">
                      −{montoFmt(menosOriginal.monto, menosOriginal.moneda)} vs capital original
                    </p>
                  ) : null}
                </div>
              </div>

              {mostrarPuente && siguiente ? (
                <div className="ml-0.5 sm:ml-0.5 flex flex-col gap-0 py-0.5 pl-4 sm:pl-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <ArrowDown className="h-2.5 w-2.5 shrink-0 text-slate-300" strokeWidth={2.5} aria-hidden />
                    {reduccionPuente ? (
                      <span className="text-[10px] font-bold tabular-nums text-red-600 tracking-tight">
                        −{montoFmt(reduccionPuente.monto, reduccionPuente.moneda)} menos capital
                      </span>
                    ) : null}
                    {(() => {
                      const ev = eventoTimelineCorto(siguiente.evento, siguiente.nota);
                      const redundante =
                        reduccionPuente != null &&
                        (ev === 'Retiro de capital' || ev.toLowerCase().includes('retiro'));
                      if (!ev || redundante) return null;
                      return <span className="text-[9px] text-slate-400">{ev}</span>;
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ReloadOpts = { background?: boolean };

const PrestamosPanel: React.FC = () => {
  const { canEditFinances } = useAuth();
  const [prestamoModal, setPrestamoModal] = useState<
    | { open: false }
    | { open: true; mode: 'create' }
    | { open: true; mode: 'edit'; detalle: PrestamoFinancieroDetalle }
  >({ open: false });
  const [detalle, setDetalle] = useState<PrestamoFinancieroDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tramosError, setTramosError] = useState<string | null>(null);
  const debounceRealtimeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHiddenRef = useRef(false);

  const reload = useCallback(async (opts?: ReloadOpts) => {
    const background = opts?.background ?? false;
    if (!EMPRESA_ID) {
      setDetalle([]);
      setLoading(false);
      setRefreshing(false);
      setError('Falta VITE_EMPRESA_ID en el entorno.');
      console.error('[PrestamosPanel] Falta VITE_EMPRESA_ID');
      return;
    }
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setTramosError(null);
    try {
      const { detalle: rows, error: fetchErr, tramosError: trErr } = await fetchPrestamosFinancierosDetalle();
      setDetalle(rows);
      setError(fetchErr);
      setTramosError(trErr);
      if (fetchErr) {
        console.error('[PrestamosPanel] Supabase préstamos:', fetchErr, { empresa_id: EMPRESA_ID });
      }
      if (trErr) {
        console.error('[PrestamosPanel] Supabase tramos:', trErr, { empresa_id: EMPRESA_ID });
      }
      if (!fetchErr && rows.length === 0) {
        console.warn('[PrestamosPanel] Lista vacía.', { empresa_id: EMPRESA_ID, revision: 'RLS / import / empresa_id' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar préstamos';
      setError(msg);
      setDetalle([]);
      console.error('[PrestamosPanel] Excepción:', e, { empresa_id: EMPRESA_ID });
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const scheduleBackgroundReload = useCallback(() => {
    if (debounceRealtimeRef.current) clearTimeout(debounceRealtimeRef.current);
    debounceRealtimeRef.current = setTimeout(() => {
      debounceRealtimeRef.current = null;
      void reload({ background: true });
    }, 450);
  }, [reload]);

  /** Actualización automática al modificar préstamos o tramos (requiere Realtime habilitado en Supabase para esas tablas). */
  useEffect(() => {
    if (!EMPRESA_ID) return undefined;
    const channel = supabase
      .channel(`prestamos-panel-${EMPRESA_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prestamos_financieros',
          filter: `empresa_id=eq.${EMPRESA_ID}`,
        },
        () => {
          scheduleBackgroundReload();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prestamos_tramos',
        },
        () => {
          scheduleBackgroundReload();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[PrestamosPanel] Realtime:', status, '(los datos siguen actualizables con «Actualizar»)');
        }
      });

    return () => {
      if (debounceRealtimeRef.current) {
        clearTimeout(debounceRealtimeRef.current);
        debounceRealtimeRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [EMPRESA_ID, scheduleBackgroundReload]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === 'visible' && wasHiddenRef.current && EMPRESA_ID) {
        wasHiddenRef.current = false;
        void reload({ background: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const scrollToPrestamoCard = useCallback((prestamoId: number) => {
    const el = document.getElementById(`prestamo-registro-${prestamoId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const detalleOrdenado = useMemo(() => {
    return [...detalle].sort((a, b) => {
      const ca = a.prestamo.capitalActualEstimado;
      const cb = b.prestamo.capitalActualEstimado;
      if (cb !== ca) return cb - ca;
      const ia = a.prestamo.interesMensualActual;
      const ib = b.prestamo.interesMensualActual;
      if (ib !== ia) return ib - ia;
      return b.prestamo.id - a.prestamo.id;
    });
  }, [detalle]);

  const busy = loading || refreshing;

  return (
    <div className="space-y-2 sm:space-y-3">
      {EMPRESA_ID ? (
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 shadow-sm shadow-slate-200/30">
          <div className="min-w-0 text-[11px] text-slate-600 leading-snug">
            {error ? (
              <span className="text-red-700 font-medium">{error}</span>
            ) : loading && detalle.length === 0 ? (
              <span className="text-slate-500">Cargando préstamos…</span>
            ) : (
              <>
                <span className="font-semibold text-slate-800 tabular-nums">{detalle.length}</span> préstamo
                {detalle.length === 1 ? '' : 's'}
                <span className="text-slate-400 hidden sm:inline"> · </span>
                <span className="text-slate-400 hidden sm:inline">
                  Los cuadros se refrescan al guardar ediciones, al cambiar datos en la base o al volver a esta pestaña.
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {canEditFinances ? (
              <button
                type="button"
                onClick={() => setPrestamoModal({ open: true, mode: 'create' })}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Nuevo préstamo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void reload({ background: true })}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              Actualizar
            </button>
          </div>
        </div>
      ) : null}
      {tramosError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-950 leading-snug">
          No se pudieron cargar los tramos: {tramosError}. Revisa consola y RLS en{' '}
          <code className="text-[10px] bg-white/80 px-1 rounded">prestamos_tramos</code>.
        </div>
      ) : null}

      {!EMPRESA_ID ? (
        <Card title="Configuración">
          <p className="text-sm text-gray-600">
            Define <code className="text-xs bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code> para cargar datos.
          </p>
        </Card>
      ) : loading ? (
        <p className="text-xs text-slate-500 py-5 text-center">Cargando préstamos…</p>
      ) : error ? (
        <Card title="Error al cargar préstamos">
          <p className="text-sm text-red-700">{error}</p>
          <p className="text-xs text-gray-600 mt-2 font-mono break-all">empresa_id: {EMPRESA_ID}</p>
          <p className="text-xs text-gray-500 mt-2">
            Revisa la consola del navegador (mensaje Supabase), migración v3 y políticas RLS para{' '}
            <code className="bg-gray-100 px-1 rounded">prestamos_financieros</code>.
          </p>
        </Card>
      ) : detalle.length === 0 ? (
        <Card title="Sin préstamos">
          <p className="text-sm text-gray-600 mb-3">
            No hay filas visibles para <span className="font-mono text-xs">{EMPRESA_ID}</span> (tabla vacía o RLS sin coincidencia).
          </p>
          {canEditFinances ? (
            <button
              type="button"
              onClick={() => setPrestamoModal({ open: true, mode: 'create' })}
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Registrar primer préstamo
            </button>
          ) : null}
          <details className="text-sm text-gray-600 rounded-lg bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer font-medium text-gray-700">Qué revisar en Supabase</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-gray-600">
              <li>Importar o ejecutar seed de préstamos si la tabla está vacía.</li>
              <li>
                Coincidencia de <code className="bg-gray-100 px-1 rounded">empresa_id</code> con{' '}
                <code className="bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code>.
              </li>
              <li>
                Permisos RLS y rol en <code className="bg-gray-100 px-1 rounded">user_profiles</code>.
              </li>
            </ul>
          </details>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 sm:gap-2.5">
          {detalleOrdenado.map((row, idx) => (
            <PrestamoEjecutivoCard
              key={row.prestamo.id}
              detalle={row}
              numeroEnLista={idx + 1}
              canEdit={canEditFinances}
              onEdit={() => setPrestamoModal({ open: true, mode: 'edit', detalle: row })}
            />
          ))}
          <PrestamosRegistroTable
            detalle={detalle}
            canEdit={canEditFinances}
            onEdit={(row) => setPrestamoModal({ open: true, mode: 'edit', detalle: row })}
            scrollToCardId={scrollToPrestamoCard}
          />
        </div>
      )}

      <PrestamoEditModal
        isOpen={prestamoModal.open}
        mode={prestamoModal.open ? prestamoModal.mode : 'create'}
        detalle={prestamoModal.open && prestamoModal.mode === 'edit' ? prestamoModal.detalle : null}
        onClose={() => setPrestamoModal({ open: false })}
        onSaved={() => void reload({ background: true })}
      />

    </div>
  );
};

export default PrestamosPanel;
