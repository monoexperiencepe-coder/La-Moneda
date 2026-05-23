import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, LogOut, History } from 'lucide-react';
import Card from '../../components/Common/Card';
import AporteRegistroModal from '../../components/Finanzas/AporteRegistroModal';
import AporteRetiroModal from '../../components/Finanzas/AporteRetiroModal';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { supabase } from '../../lib/supabase';
import {
  APORTE_TIPO_RETIRO,
  aporteMontoNeto,
  deleteAporteAccionista,
  fetchAportesAccionistas,
  insertAporteAccionista,
} from '../../services/aportesAccionistasService';
import type { AporteAccionista, Moneda } from '../../data/types';
import { formatCurrency, formatDate, formatDateTimePe, formatUSD } from '../../utils/formatting';
import { EMPRESA_ID } from '../../config/app';
import { canUseFinanciamiento, permissionUserFromAuth } from '../../utils/permissions';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function tipoAporteEtiqueta(tipo: string): string {
  return String(tipo ?? '').trim() === APORTE_TIPO_RETIRO ? 'Retiro' : tipo;
}

function mergeAporteRow(prev: AporteAccionista[], row: AporteAccionista): AporteAccionista[] {
  const m = new Map(prev.map((r) => [r.id, r]));
  m.set(row.id, row);
  return [...m.values()].sort((a, b) => {
    const df = b.fechaAporte.localeCompare(a.fechaAporte);
    if (df !== 0) return df;
    return b.id.localeCompare(a.id);
  });
}

function sortHistorialDesc(a: AporteAccionista, b: AporteAccionista): number {
  let c = b.fechaAporte.localeCompare(a.fechaAporte);
  if (c !== 0) return c;
  c = (b.createdAt || '').localeCompare(a.createdAt || '');
  if (c !== 0) return c;
  return b.id.localeCompare(a.id);
}

type HistorialFiltro = 'todos' | 'aportes' | 'retiros';

type ReloadOpts = { background?: boolean };

const AportesPanel: React.FC = () => {
  const { canEditFinances, profile, user } = useAuth();
  const canLoadFinanciamiento = useMemo(
    () => canUseFinanciamiento(permissionUserFromAuth(user, profile?.email ?? null)),
    [user, profile?.email],
  );
  const tenantEmpresaId = profile?.empresa_id;
  const realtimeEmpresaId = (tenantEmpresaId?.trim() || EMPRESA_ID) ?? '';
  const { toast, showUndoToast } = useRegistrosContext();
  const [rows, setRows] = useState<AporteAccionista[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registroOpen, setRegistroOpen] = useState(false);
  const [retiroOpen, setRetiroOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historialFiltro, setHistorialFiltro] = useState<HistorialFiltro>('todos');

  const reload = useCallback(async (opts?: ReloadOpts) => {
    const background = opts?.background ?? false;
    if (!canLoadFinanciamiento) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    if (!tenantEmpresaId?.trim() && !EMPRESA_ID) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      setError('Falta empresa_id en el entorno.');
      console.error('[AportesPanel] Falta empresa_id');
      return;
    }
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const { rows: next, error: fetchErr } = await fetchAportesAccionistas(tenantEmpresaId);
      setRows(next);
      setError(fetchErr);
      if (fetchErr) {
        console.error('[AportesPanel] Supabase:', fetchErr, { empresa_id: tenantEmpresaId });
      }
      if (!fetchErr && next.length === 0) {
        console.warn('[AportesPanel] Lista vacía.', { empresa_id: tenantEmpresaId, revision: 'RLS / import v3' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar aportes';
      setError(msg);
      setRows([]);
      console.error('[AportesPanel] Excepción:', e, { empresa_id: tenantEmpresaId });
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [canLoadFinanciamiento, tenantEmpresaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Otros usuarios o pestañas: reflejar INSERT/UPDATE/DELETE sin recargar la página. */
  useEffect(() => {
    if (!canLoadFinanciamiento || !realtimeEmpresaId) return;
    const channel = supabase
      .channel(`aportes-accionistas-${realtimeEmpresaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aportes_accionistas',
          filter: `empresa_id=eq.${realtimeEmpresaId}`,
        },
        () => {
          void reload({ background: true });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            '[AportesPanel] Realtime no disponible para aportes_accionistas. Activa la replicación de esta tabla en Supabase (Database → Replication) si quieres actualización multi-sesión.',
          );
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canLoadFinanciamiento, realtimeEmpresaId, reload]);

  const onMovimientoGuardado = useCallback(
    async (row: AporteAccionista) => {
      const esRetiro = String(row.tipo ?? '').trim() === APORTE_TIPO_RETIRO;
      setRows((prev) => mergeAporteRow(prev, row));
      await reload({ background: true });
      toast.success(
        esRetiro ? 'Retiro registrado' : 'Aporte registrado',
        `${row.accionista || 'Accionista'} · ${montoFmt(Math.abs(row.monto), row.moneda)}`,
      );
    },
    [reload, toast],
  );

  const totalesPorMoneda = useMemo(() => {
    let pen = 0;
    let usd = 0;
    for (const r of rows) {
      const net = aporteMontoNeto(r);
      if (r.moneda === 'USD') usd += net;
      else pen += net;
    }
    return { pen, usd };
  }, [rows]);

  const sugerenciasAccionista = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const n = r.accionista.trim();
      if (n) s.add(n);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const porAccionista = useMemo(() => {
    const map = new Map<string, { pen: number; usd: number }>();
    for (const r of rows) {
      const key = r.accionista.trim() || '(sin nombre)';
      const cur = map.get(key) ?? { pen: 0, usd: 0 };
      const net = aporteMontoNeto(r);
      if (r.moneda === 'USD') cur.usd += net;
      else cur.pen += net;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => {
      const ta = a[1].pen + a[1].usd * 4;
      const tb = b[1].pen + b[1].usd * 4;
      return tb - ta;
    });
  }, [rows]);

  const historialRows = useMemo(() => {
    const base = [...rows];
    const filtered =
      historialFiltro === 'todos'
        ? base
        : historialFiltro === 'retiros'
          ? base.filter((r) => String(r.tipo ?? '').trim() === APORTE_TIPO_RETIRO)
          : base.filter((r) => String(r.tipo ?? '').trim() !== APORTE_TIPO_RETIRO);
    return filtered.sort(sortHistorialDesc);
  }, [rows, historialFiltro]);

  const handleDeleteRow = useCallback(
    async (r: AporteAccionista) => {
      if (!canEditFinances) return;
      const esRetiro = String(r.tipo ?? '').trim() === APORTE_TIPO_RETIRO;
      const tipoTxt = esRetiro ? 'retiro' : 'aporte';
      const msg = `¿Eliminar este ${tipoTxt} de ${r.accionista || '(sin nombre)'} — ${montoFmt(Math.abs(r.monto), r.moneda)}? Podrás deshacerlo desde el aviso «Deshacer».`;
      if (!window.confirm(msg)) return;
      setDeletingId(r.id);
      try {
        const { error: delErr } = await deleteAporteAccionista(r.id, tenantEmpresaId);
        if (delErr) {
          toast.error('No se pudo eliminar', delErr);
          return;
        }
        await reload({ background: true });
        showUndoToast({
          message: 'Registro eliminado',
          detail: `${tipoTxt} quitado de la lista.`,
          undoAction: {
            type: 'delete',
            label: `Restaurar ${esRetiro ? 'retiro' : 'aporte'}`,
            entityType: 'aporte',
            entityId: r.id,
            undo: async () => {
              const { error: insErr } = await insertAporteAccionista(
                {
                  accionista: r.accionista,
                  vehiculoReferencia: r.vehiculoReferencia,
                  monto: r.monto,
                  moneda: r.moneda,
                  fechaAporte: r.fechaAporte,
                  generaInteres: r.generaInteres,
                  tipo: r.tipo,
                  observaciones: r.observaciones,
                },
                tenantEmpresaId,
              );
              if (insErr) throw new Error(insErr);
              await reload({ background: true });
            },
          },
        });
      } finally {
        setDeletingId(null);
      }
    },
    [canEditFinances, reload, toast, showUndoToast],
  );

  const busy = loading || refreshing;

  return (
    <div className="space-y-3 sm:space-y-4">
      {EMPRESA_ID ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 shadow-sm shadow-slate-200/30">
          <div className="min-w-0 text-[11px] text-slate-600 leading-snug">
            {error ? (
              <span className="text-red-700 font-medium">{error}</span>
            ) : loading && rows.length === 0 ? (
              <span className="text-slate-500">Cargando aportes…</span>
            ) : (
              <>
                <span className="font-semibold text-slate-800 tabular-nums">{rows.length}</span> aporte
                {rows.length === 1 ? '' : 's'}
                <span className="text-slate-400 hidden sm:inline"> · </span>
                <span className="text-slate-400 hidden sm:inline">
                  Nuevo aporte / retiro de capital desde la app.
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEditFinances ? (
              <>
                <button
                  type="button"
                  onClick={() => setRegistroOpen(true)}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Nuevo aporte
                </button>
                <button
                  type="button"
                  onClick={() => setRetiroOpen(true)}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 shadow-sm hover:bg-amber-100 hover:border-amber-300 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Retiro de aportes
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void reload({ background: true })}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              Actualizar
            </button>
          </div>
        </div>
      ) : null}
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 leading-snug">
        <strong className="font-semibold">Importante:</strong> No genera interés. Es capital aportado.{' '}
        <span className="font-semibold">Montos en dólares (US$)</span> salvo que una fila indique explícitamente PEN en base de
        datos. Los retiros se registran como línea aparte y restan en los totales; eliminar una fila borra ese movimiento del
        historial visible.
      </div>

      {!EMPRESA_ID ? (
        <Card title="Configuración">
          <p className="text-sm text-gray-600">
            Define <code className="text-xs bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code> para cargar datos.
          </p>
        </Card>
      ) : loading ? (
        <p className="text-xs text-slate-500 py-10 text-center">Cargando aportes…</p>
      ) : error ? (
        <Card title="Error al cargar aportes">
          <p className="text-sm text-red-700">{error}</p>
          <p className="text-xs text-gray-600 mt-2 font-mono break-all">empresa_id: {EMPRESA_ID}</p>
          <p className="text-xs text-gray-500 mt-2">
            Revisa consola, migración <code className="bg-gray-100 px-1 rounded">migration_financiamiento_aportes_prestamos_v3.sql</code> y RLS en{' '}
            <code className="bg-gray-100 px-1 rounded">aportes_accionistas</code>.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card title="Sin aportes">
          <p className="text-sm text-gray-600 mb-2">
            No hay registros visibles en <code className="text-xs bg-gray-100 px-1 rounded">aportes_accionistas</code> para esta
            empresa.
          </p>
          {canEditFinances ? (
            <button
              type="button"
              onClick={() => setRegistroOpen(true)}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Registrar primer aporte
            </button>
          ) : null}
          <p className="text-xs text-gray-500">Si ya importaste v3, revisa RLS y rol en user_profiles en Supabase.</p>
        </Card>
      ) : (
        <>
          <Card title="Total neto aportado" subtitle="Suma por moneda: aportes menos retiros registrados (convención: US$).">
            <div className="flex flex-wrap gap-3 text-sm">
              {totalesPorMoneda.usd !== 0 ? (
                <span className="font-semibold text-slate-900">{montoFmt(totalesPorMoneda.usd, 'USD')}</span>
              ) : null}
              {totalesPorMoneda.pen !== 0 ? (
                <span className="font-semibold text-slate-700">{montoFmt(totalesPorMoneda.pen, 'PEN')}</span>
              ) : null}
              {totalesPorMoneda.pen === 0 && totalesPorMoneda.usd === 0 ? (
                <span className="text-slate-500">—</span>
              ) : null}
            </div>
          </Card>

          <Card title="Por accionista">
            <ul className="space-y-2 text-sm">
              {porAccionista.map(([nombre, t]) => (
                <li key={nombre} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-slate-800">{nombre}</span>
                  <span className="text-slate-600 tabular-nums text-xs sm:text-sm">
                    {t.usd !== 0 ? <span className="mr-2 font-semibold text-slate-900">{montoFmt(t.usd, 'USD')}</span> : null}
                    {t.pen !== 0 ? <span>{montoFmt(t.pen, 'PEN')}</span> : null}
                    {t.usd === 0 && t.pen === 0 ? <span className="text-slate-400">—</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Historial de movimientos"
            subtitle="Aportes y retiros en orden cronológico (más recientes primero). «Registrado» es la hora en que se guardó en el sistema."
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <History className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
              {(
                [
                  { id: 'todos' as const, label: 'Todos' },
                  { id: 'aportes' as const, label: 'Solo aportes' },
                  { id: 'retiros' as const, label: 'Solo retiros' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHistorialFiltro(id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-colors ${
                    historialFiltro === id
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {historialRows.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No hay movimientos con este filtro.</p>
            ) : (
              <ul className="space-y-0 divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden bg-slate-50/40">
                {historialRows.map((r) => {
                  const esRetiro = String(r.tipo ?? '').trim() === APORTE_TIPO_RETIRO;
                  const net = aporteMontoNeto(r);
                  return (
                    <li key={r.id} className={`flex flex-col sm:flex-row sm:items-start gap-1 px-2.5 py-2 text-[11px] sm:text-xs ${esRetiro ? 'bg-amber-50/50' : 'bg-white'}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 whitespace-nowrap">{formatDate(r.fechaAporte)}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide ${
                            esRetiro ? 'bg-amber-200/80 text-amber-950' : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {esRetiro ? 'Retiro' : 'Aporte'}
                        </span>
                        <span className="text-slate-700 font-medium truncate">{r.accionista || '(sin nombre)'}</span>
                        <span
                          className={`tabular-nums font-semibold whitespace-nowrap ${net < 0 ? 'text-amber-900' : 'text-slate-900'}`}
                        >
                          {net < 0 ? '−' : '+'}
                          {montoFmt(Math.abs(r.monto), r.moneda)}
                        </span>
                        <span className="text-slate-500">{r.moneda}</span>
                      </div>
                      <div className="flex flex-col sm:items-end gap-0.5 text-[10px] text-slate-500 sm:text-right shrink-0 sm:max-w-[45%]">
                        <span className="tabular-nums">Registrado: {formatDateTimePe(r.createdAt)}</span>
                        {r.observaciones.trim() ? (
                          <span className="text-slate-600 line-clamp-2 break-words" title={r.observaciones}>
                            {r.observaciones.trim()}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Lista de aportes">
            <div className="overflow-x-auto -mx-1">
              <table className="min-w-full text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wide">
                    <th className="py-1.5 pr-2 font-medium">Fecha</th>
                    <th className="py-1.5 pr-2 font-medium">Accionista</th>
                    <th className="py-1.5 pr-2 font-medium">Vehículo ref.</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Monto</th>
                    <th className="py-1.5 pr-2 font-medium">Moneda</th>
                    <th className="py-1.5 pr-2 font-medium">Tipo</th>
                    <th className="py-1.5 font-medium max-w-[100px] sm:max-w-[140px]">Obs.</th>
                    {canEditFinances ? (
                      <th className="py-1.5 pl-2 text-right font-medium w-[1%] whitespace-nowrap">Acciones</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const esRetiro = String(r.tipo ?? '').trim() === APORTE_TIPO_RETIRO;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-slate-50 align-top ${esRetiro ? 'bg-amber-50/40' : ''}`}
                      >
                        <td className="py-2 pr-2 whitespace-nowrap text-slate-700">{formatDate(r.fechaAporte)}</td>
                        <td className="py-2 pr-2 text-slate-800">{r.accionista}</td>
                        <td className="py-2 pr-2 text-slate-600 max-w-[140px] sm:max-w-[200px] truncate" title={r.vehiculoReferencia ?? ''}>
                          {r.vehiculoReferencia ?? '—'}
                        </td>
                        <td
                          className={`py-2 pr-2 text-right font-semibold tabular-nums whitespace-nowrap ${
                            esRetiro ? 'text-amber-900' : 'text-slate-900'
                          }`}
                        >
                          {esRetiro ? <span aria-hidden>− </span> : null}
                          {montoFmt(Math.abs(r.monto), r.moneda)}
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap text-slate-600">{r.moneda}</td>
                        <td className="py-2 pr-2 text-slate-500">{tipoAporteEtiqueta(r.tipo)}</td>
                        <td
                          className="py-2 text-slate-500 max-w-[100px] sm:max-w-[140px] truncate text-[10px] sm:text-[11px]"
                          title={r.observaciones.trim() || undefined}
                        >
                          {r.observaciones.trim() ? r.observaciones.trim() : '—'}
                        </td>
                        {canEditFinances ? (
                          <td className="py-2 pl-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => void handleDeleteRow(r)}
                              disabled={busy || deletingId === r.id}
                              className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
                              title="Eliminar esta fila"
                              aria-label={`Eliminar ${tipoAporteEtiqueta(r.tipo)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <AporteRegistroModal
        isOpen={registroOpen}
        onClose={() => setRegistroOpen(false)}
        onSaved={onMovimientoGuardado}
      />
      <AporteRetiroModal
        isOpen={retiroOpen}
        onClose={() => setRetiroOpen(false)}
        onSaved={onMovimientoGuardado}
        sugerenciasAccionista={sugerenciasAccionista}
      />
    </div>
  );
};

export default AportesPanel;
