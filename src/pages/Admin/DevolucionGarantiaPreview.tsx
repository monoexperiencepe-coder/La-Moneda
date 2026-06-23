import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import Button from '../../components/Common/Button';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useEnsureGastosFullForUtilidad } from '../../hooks/useEnsureGastosFullForUtilidad';
import { formatCurrency, formatDate } from '../../utils/formatting';
import {
  applyDevolucionGarantiaBatch,
  clearDevolucionGarantiaBatchSnapshot,
  loadDevolucionGarantiaBatchSnapshot,
  rollbackDevolucionGarantiaBatch,
  saveDevolucionGarantiaBatchSnapshot,
  type DevolucionGarantiaApplySummary,
  type DevolucionGarantiaBatchSnapshot,
} from '../../audit/applyDevolucionGarantiaBatch';
import {
  buildDevolucionGarantiaAuditPlan,
  computeDevolucionGarantiaImpacto,
  countOperativoVehiculoSoloDevolucion,
  DEVOLUCION_GARANTIA_AUDIT_ACTION,
  DEVOLUCION_GARANTIA_REFERENCIA_MANUAL,
  DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
  DEVOLUCION_GARANTIA_TARGET_TIPO,
  findDevolucionGarantiaCandidatos,
} from '../../audit/devolucionGarantiaReclasificacion';
import { formatVehicleIdPlaca, formatVehicleIdFallback } from '../../utils/vehicleDisplayNumber';
import { getOperativoSubtipoLabel } from '../../utils/operativoSubtipo';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';

const DevolucionGarantiaPreview: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { gastos, vehicles, reloadGastosFull, toast } = useRegistrosContext();
  const { gastosLoadScope, isLoadingGastosFull, gastosReadyForUtilidad } = useEnsureGastosFullForUtilidad();

  const tenantEmpresaId = profile?.empresa_id ?? null;

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastApplySummary, setLastApplySummary] = useState<DevolucionGarantiaApplySummary | null>(null);
  const [rollbackSnapshot, setRollbackSnapshot] = useState<DevolucionGarantiaBatchSnapshot | null>(() =>
    loadDevolucionGarantiaBatchSnapshot(),
  );

  const vehicleLabel = (id: number | string) => {
    const v = vehicles.find((x) => String(x.id) === String(id));
    return v ? formatVehicleIdPlaca(v) : formatVehicleIdFallback(id);
  };

  const candidatos = useMemo(() => findDevolucionGarantiaCandidatos(gastos), [gastos]);
  const impacto = useMemo(() => computeDevolucionGarantiaImpacto(candidatos), [candidatos]);
  const referenciaSoloDevolucion = useMemo(
    () => countOperativoVehiculoSoloDevolucion(gastos),
    [gastos],
  );
  const auditPlan = useMemo(
    () => buildDevolucionGarantiaAuditPlan(gastos, candidatos),
    [gastos, candidatos],
  );
  const gastosById = useMemo(() => new Map(gastos.map((g) => [String(g.id), g])), [gastos]);

  const loadingHistorico = !gastosReadyForUtilidad;
  const canApply = candidatos.length > 0 && !loadingHistorico && !batchBusy && !!tenantEmpresaId;
  const canRollback = !!rollbackSnapshot && rollbackSnapshot.entries.length > 0 && !batchBusy && !!tenantEmpresaId;

  useEffect(() => {
    setRollbackSnapshot(loadDevolucionGarantiaBatchSnapshot());
  }, [lastApplySummary]);

  const handleApply = useCallback(async () => {
    if (!tenantEmpresaId || candidatos.length === 0) return;
    setBatchBusy(true);
    setBatchProgress({ current: 0, total: candidatos.length });
    try {
      const summary = await applyDevolucionGarantiaBatch({
        candidatos,
        gastosById,
        tenantEmpresaId,
        onProgress: (p) => setBatchProgress({ current: p.current, total: p.total }),
      });
      setLastApplySummary(summary);
      if (summary.exitos > 0) {
        const snapshot: DevolucionGarantiaBatchSnapshot = {
          batchId: summary.batchId,
          appliedAt: new Date().toISOString(),
          entries: summary.rollbackEntries,
          summary: {
            exitos: summary.exitos,
            fallos: summary.fallos,
            montoTotal: summary.montoTotal,
          },
        };
        saveDevolucionGarantiaBatchSnapshot(snapshot);
        setRollbackSnapshot(snapshot);
      }
      await reloadGastosFull();
      setApplyModalOpen(false);
      if (summary.fallos === 0) {
        toast.success(
          'Reclasificación aplicada',
          `${summary.exitos} gasto${summary.exitos !== 1 ? 's' : ''} movido${summary.exitos !== 1 ? 's' : ''} a financiero_prestamo / compra_activo.`,
        );
      } else {
        toast.error(
          'Lote con errores',
          `${summary.exitos} aplicados, ${summary.fallos} fallidos. Revisa la consola.`,
        );
      }
    } catch (e) {
      toast.error('Error al aplicar', e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setBatchBusy(false);
      setBatchProgress(null);
    }
  }, [tenantEmpresaId, candidatos, gastosById, reloadGastosFull, toast]);

  const handleRollback = useCallback(async () => {
    if (!tenantEmpresaId || !rollbackSnapshot) return;
    setBatchBusy(true);
    setBatchProgress({ current: 0, total: rollbackSnapshot.entries.length });
    try {
      const summary = await rollbackDevolucionGarantiaBatch({
        snapshot: rollbackSnapshot,
        tenantEmpresaId,
        onProgress: (p) => setBatchProgress({ current: p.current, total: p.total }),
      });
      await reloadGastosFull();
      setRollbackModalOpen(false);
      if (summary.fallos === 0) {
        clearDevolucionGarantiaBatchSnapshot();
        setRollbackSnapshot(null);
        toast.success(
          'Rollback completado',
          `${summary.exitos} registro${summary.exitos !== 1 ? 's' : ''} restaurado${summary.exitos !== 1 ? 's' : ''} a operativo_vehiculo.`,
        );
      } else {
        toast.error(
          'Rollback parcial',
          `${summary.exitos} restaurados, ${summary.fallos} fallidos.`,
        );
      }
    } catch (e) {
      toast.error('Error en rollback', e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setBatchBusy(false);
      setBatchProgress(null);
    }
  }, [tenantEmpresaId, rollbackSnapshot, reloadGastosFull, toast]);

  const origenLabel = labelTipoGastoFinanciero('operativo_vehiculo');
  const destinoLabel = `${labelTipoGastoFinanciero(DEVOLUCION_GARANTIA_TARGET_TIPO)} / ${DEVOLUCION_GARANTIA_TARGET_SUBTIPO}`;

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/configuracion')}
          className="mt-0.5 p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
          aria-label="Volver"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
            Admin · reclasificación en lote
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Devoluciones garantía → compra activo</h1>
          <p className="mt-1 text-sm text-gray-600 leading-snug">
            Candidatos en <strong>operativo_vehiculo</strong> cuyo texto indica devolución de garantía.
            Destino: <strong>{DEVOLUCION_GARANTIA_TARGET_TIPO}</strong> /{' '}
            <strong>{DEVOLUCION_GARANTIA_TARGET_SUBTIPO}</strong> manteniendo{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">vehicle_id</code>, monto, fecha y comentarios.
          </p>
        </div>
      </div>

      {lastApplySummary && lastApplySummary.exitos > 0 ? (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/90 p-4 flex gap-3">
          <ShieldCheck className="shrink-0 text-emerald-700 mt-0.5" size={22} />
          <div className="text-sm text-emerald-950 space-y-1 min-w-0">
            <p className="font-bold">Última aplicación: {lastApplySummary.exitos} registro{lastApplySummary.exitos !== 1 ? 's' : ''}</p>
            <p className="text-emerald-900/90 leading-snug">
              Lote <span className="font-mono text-xs">{lastApplySummary.batchId.slice(0, 8)}…</span> ·{' '}
              {formatCurrency(lastApplySummary.montoTotal)} · {lastApplySummary.fallos} error
              {lastApplySummary.fallos !== 1 ? 'es' : ''}.
              {rollbackSnapshot ? ' Rollback disponible por IDs del lote.' : null}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/90 p-4 flex gap-3">
          <ShieldAlert className="shrink-0 text-amber-700 mt-0.5" size={22} />
          <div className="text-sm text-amber-950 space-y-1">
            <p className="font-bold">Preview confirmado — listo para aplicar</p>
            <p className="text-amber-900/90 leading-snug">
              Solo se reclasificarán los {candidatos.length} IDs detectados por el preview. Los 3 restantes
              quedan fuera (manual). Monto, fecha, comentario y método de pago no se alteran.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!canApply}
          loading={batchBusy && applyModalOpen}
          onClick={() => setApplyModalOpen(true)}
        >
          Aplicar reclasificación ({candidatos.length})
        </Button>
        {canRollback ? (
          <Button
            type="button"
            variant="outline"
            disabled={batchBusy}
            icon={<RotateCcw size={16} />}
            onClick={() => setRollbackModalOpen(true)}
          >
            Rollback último lote ({rollbackSnapshot?.entries.length ?? 0})
          </Button>
        ) : null}
      </div>

      {loadingHistorico ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <Loader2 size={16} className="animate-spin text-violet-600" />
          Cargando histórico completo de gastos ({gastosLoadScope === 'full' ? 'finalizando…' : 'fetch full…'})
        </div>
      ) : (
        <p className="text-xs text-emerald-700 font-medium">
          Histórico completo cargado — búsqueda sobre {gastos.length.toLocaleString('es-PE')} gastos en memoria.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Resumen de detección</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detectados (DEVOLUCION + GARANTIA)</p>
            <p className="mt-1 font-black text-slate-900 tabular-nums">
              {impacto.cantidad} registro{impacto.cantidad !== 1 ? 's' : ''} · {formatCurrency(impacto.montoTotal)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Referencia historial manual</p>
            <p className="mt-1 font-black text-slate-700 tabular-nums">
              {DEVOLUCION_GARANTIA_REFERENCIA_MANUAL.cantidad} registros ·{' '}
              {formatCurrency(DEVOLUCION_GARANTIA_REFERENCIA_MANUAL.montoTotal)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600 leading-snug">
              Búsqueda «devolucion» en operativo_vehiculo con vehículo:{' '}
              <span className="font-semibold tabular-nums">
                {referenciaSoloDevolucion.cantidad} / {formatCurrency(referenciaSoloDevolucion.montoTotal)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Registros</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-gray-900">{impacto.cantidad}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Monto total</p>
          <p className="mt-1 text-xl font-black tabular-nums text-rose-800">
            {formatCurrency(impacto.montoTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Impacto utilidad</p>
          <p className="mt-1 text-lg font-black tabular-nums text-emerald-900">
            +{formatCurrency(impacto.deltaUtilidadOperativa)}
          </p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">Dashboard gastos</p>
          <p className="mt-1 text-xs text-indigo-950 leading-snug">
            Operativos vehículo:{' '}
            <span className="font-bold tabular-nums">{formatCurrency(impacto.dashboard.operativoVehiculo.deltaMonto)}</span>
            <br />
            Financieros:{' '}
            <span className="font-bold tabular-nums">
              +{formatCurrency(impacto.dashboard.financieroPrestamo.deltaMonto)}
            </span>
            <br />
            Total gastos: sin cambio
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <h2 className="text-sm font-bold text-gray-900">Candidatos confirmados</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {candidatos.length === 0
              ? 'No quedan candidatos pendientes con los criterios actuales.'
              : `${candidatos.length} ID${candidatos.length !== 1 ? 's' : ''} del preview — solo estos se aplicarán en lote.`}
          </p>
        </div>

        {candidatos.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            {loadingHistorico || isLoadingGastosFull
              ? 'Esperando carga del histórico…'
              : 'Sin candidatos pendientes (ya aplicados o no detectados).'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[1020px]">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Vehículo</th>
                  <th className="px-3 py-2.5 min-w-[260px]">Texto real del registro</th>
                  <th className="px-3 py-2.5">Subtipo actual</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                  <th className="px-3 py-2.5">Categoría actual</th>
                  <th className="px-3 py-2.5">Categoría nueva</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{c.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDate(c.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{vehicleLabel(c.vehicleId)}</td>
                    <td className="px-3 py-2 text-xs text-gray-900 max-w-[360px]" title={c.textoReal}>
                      <span className="line-clamp-2">{c.textoReal}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[140px]">
                      <span className="block truncate" title={c.subtipoActual ?? undefined}>
                        {c.subtipoActual ? getOperativoSubtipoLabel(c.subtipoActual) : '—'}
                      </span>
                      {c.subtipoActual ? (
                        <span className="block text-[10px] text-gray-400 font-mono truncate">{c.subtipoActual}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-rose-800">
                      {formatCurrency(c.monto)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-medium text-gray-800">{c.categoriaActualLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-medium text-indigo-900">{c.categoriaNuevaLabel}</span>
                      <span className="block text-[10px] text-indigo-700">{c.subtipoNuevoLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-indigo-950">Auditoría al aplicar</h2>
          <p className="text-xs text-indigo-900/80 mt-0.5 leading-snug">
            Cada registro generará un evento{' '}
            <code className="bg-white/80 px-1 rounded text-[11px]">{DEVOLUCION_GARANTIA_AUDIT_ACTION}</code> en{' '}
            <code className="bg-white/80 px-1 rounded text-[11px]">financial_audit_logs</code> con categoría/subtipo
            anterior y nuevo. Pendiente: {auditPlan.length} evento{auditPlan.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>

      <Modal
        isOpen={applyModalOpen}
        onClose={() => !batchBusy && setApplyModalOpen(false)}
        title="Confirmar reclasificación en lote"
        size="lg"
        closeLocked={batchBusy}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={batchBusy} onClick={() => setApplyModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={batchBusy} disabled={!canApply} onClick={() => void handleApply()}>
              {batchBusy && batchProgress
                ? `Aplicando ${batchProgress.current}/${batchProgress.total}…`
                : `Confirmar y aplicar ${candidatos.length}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-gray-800">
          <p className="leading-snug">
            Vas a reclasificar <strong className="tabular-nums">{candidatos.length}</strong> gastos confirmados en
            preview. Esta acción escribe en la base de datos.
          </p>
          <dl className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Cantidad</dt>
              <dd className="font-bold tabular-nums">{candidatos.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Monto total</dt>
              <dd className="font-bold tabular-nums text-rose-800">{formatCurrency(impacto.montoTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Origen</dt>
              <dd className="font-medium">{origenLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Destino</dt>
              <dd className="font-medium text-indigo-900">{destinoLabel}</dd>
            </div>
          </dl>
          <p className="text-xs text-gray-600 leading-snug">
            Se mantienen id, fecha, monto, vehicle_id, comentarios y método de pago. Solo cambian{' '}
            <code className="bg-gray-100 px-1 rounded">tipo_gasto</code> y{' '}
            <code className="bg-gray-100 px-1 rounded">subtipo_gasto</code>.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={rollbackModalOpen}
        onClose={() => !batchBusy && setRollbackModalOpen(false)}
        title="Rollback del último lote"
        size="md"
        closeLocked={batchBusy}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={batchBusy} onClick={() => setRollbackModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={batchBusy} disabled={!canRollback} onClick={() => void handleRollback()}>
              {batchBusy && batchProgress
                ? `Revirtiendo ${batchProgress.current}/${batchProgress.total}…`
                : 'Confirmar rollback'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-gray-800">
          <p className="leading-snug">
            Restaurará <strong>{rollbackSnapshot?.entries.length ?? 0}</strong> gastos a su categoría anterior (
            <strong>operativo_vehiculo</strong> y subtipo original).
          </p>
          {rollbackSnapshot ? (
            <p className="text-xs text-gray-500 font-mono">
              Lote {rollbackSnapshot.batchId.slice(0, 8)}… · aplicado{' '}
              {new Date(rollbackSnapshot.appliedAt).toLocaleString('es-PE')}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default DevolucionGarantiaPreview;
