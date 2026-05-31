import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import Card from '../../components/Common/Card';
import Button from '../../components/Common/Button';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import {
  canApplyDataQualityFixes,
  canViewDataQualityTools,
  isDataQualityToolsEnabled,
} from '../../config/dataQualityTools';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import {
  auditDataQualitySubtipos,
  previewDataQualityFixes,
  type DataQualityConfidence,
  type SubtipoQualitySuggestion,
} from '../../audit/auditDataQualitySubtipos';
import { isAutoApplyEligible } from '../../audit/dataQualitySubtipoPolicy';
import {
  applyDataQualitySubtipoBatch,
  applyDataQualitySubtipoSuggestion,
} from '../../services/dataQualitySubtipoService';
import {
  clearDataQualityLocalAction,
  setDataQualityLocalAction,
} from '../../data/dataQualitySubtipoStore';
import { REVISION_USER_LABEL } from '../../config/app';

const CONF_LABELS: Record<DataQualityConfidence, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const SubtipoConciliacion: React.FC = () => {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const { gastos, reloadGastosFull, toast } = useRegistrosContext();
  const canView = canViewDataQualityTools(role);
  const canApply = canApplyDataQualityFixes(role);
  const toolsOn = isDataQualityToolsEnabled();

  const [filterCat, setFilterCat] = useState('');
  const [filterConf, setFilterConf] = useState('');
  const [showIgnored, setShowIgnored] = useState(false);
  const [onlyActionable, setOnlyActionable] = useState(true);
  const [selected, setSelected] = useState<SubtipoQualitySuggestion | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [auditNonce, setAuditNonce] = useState(0);

  const audit = useMemo(() => {
    void auditNonce;
    return auditDataQualitySubtipos(gastos);
  }, [gastos, auditNonce]);

  const filtered = useMemo(() => {
    return audit.suggestions.filter((s) => {
      if (onlyActionable && (!s.needsChange || s.issue === 'ok')) return false;
      if (!showIgnored && s.localAction === 'ignored') return false;
      if (filterCat && s.categoria !== filterCat) return false;
      if (filterConf && s.confidence !== filterConf) return false;
      return true;
    });
  }, [audit.suggestions, filterCat, filterConf, showIgnored, onlyActionable]);

  const highBatch = useMemo(
    () =>
      audit.suggestions.filter(
        (s) =>
          s.localAction !== 'ignored'
          && isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido),
      ),
    [audit.suggestions],
  );

  const categoriaOptions = useMemo(() => {
    const cats = Object.keys(audit.byCategory).sort();
    return [
      { value: '', label: 'Todas las categorías' },
      ...cats.map((c) => ({ value: c, label: labelTipoGastoFinanciero(c) })),
    ];
  }, [audit.byCategory]);

  const refreshAudit = useCallback(() => {
    setAuditNonce((n) => n + 1);
  }, []);

  const handleApplyOne = async (s: SubtipoQualitySuggestion) => {
    if (!canApply) return;
    setBusyId(s.gastoId);
    try {
      const appliedBy = profile?.email?.trim() || REVISION_USER_LABEL;
      const res = await applyDataQualitySubtipoSuggestion(s, appliedBy, profile?.empresa_id);
      if (!res.ok) {
        toast.error('No se aplicó', res.error);
        return;
      }
      toast.success('Aplicado', `Gasto #${s.gastoId} actualizado (subtipo + Fact interno).`);
      await reloadGastosFull();
      refreshAudit();
    } finally {
      setBusyId(null);
    }
  };

  const handleBatch = async () => {
    if (!canApply) return;
    setBatchBusy(true);
    try {
      const appliedBy = profile?.email?.trim() || REVISION_USER_LABEL;
      const { applied, failed } = await applyDataQualitySubtipoBatch(
        highBatch,
        appliedBy,
        profile?.empresa_id,
      );
      if (failed.length > 0) {
        toast.error(
          'Lote parcial',
          `${applied} aplicados, ${failed.length} fallidos. Revisa consola [data-quality:apply-batch].`,
        );
      } else {
        toast.success('Lote aplicado', `${applied} registros actualizados.`);
      }
      setBatchOpen(false);
      await reloadGastosFull();
      refreshAudit();
    } finally {
      setBatchBusy(false);
    }
  };

  if (!toolsOn) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center text-gray-600">
        <ShieldAlert className="mx-auto mb-3 text-amber-600" size={40} />
        <p className="font-semibold text-gray-900">Herramientas desactivadas</p>
        <p className="mt-2 text-sm">
          Define <code className="bg-gray-100 px-1 rounded">VITE_DATA_QUALITY_TOOLS=1</code> en el entorno
          para habilitar conciliación de subtipos.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/configuracion')}>
          Volver
        </Button>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center text-gray-600">
        <p className="font-semibold">Sin permiso</p>
        <p className="mt-2 text-sm">Solo admin o socio pueden acceder a esta herramienta.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10">
      <button
        type="button"
        onClick={() => navigate('/configuracion')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft size={16} />
        Configuración
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Conciliación de subtipos</h1>
          <p className="mt-1 text-sm text-gray-500 max-w-2xl">
            Revisa históricos con subtipo legacy o Fact desalineado. No modifica montos, fechas ni vehículos.
            Para cambiar categoría financiera usa «Mover categoría».
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              previewDataQualityFixes(gastos);
              refreshAudit();
            }}
          >
            Preview (consola)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refreshAudit()}>
            <RefreshCw size={14} className="mr-1" />
            Recalcular
          </Button>
          {canApply && (
            <Button
              size="sm"
              onClick={() => setBatchOpen(true)}
              disabled={highBatch.length === 0}
            >
              Aplicar lote alta confianza ({highBatch.length})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase text-gray-400 font-bold">Total</p>
          <p className="text-lg font-bold">{audit.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-gray-400 font-bold">OK</p>
          <p className="text-lg font-bold text-emerald-700">{audit.ok}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-gray-400 font-bold">Revisar</p>
          <p className="text-lg font-bold text-amber-700">{audit.requiresReview}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase text-gray-400 font-bold">Alta confianza</p>
          <p className="text-lg font-bold text-indigo-700">{audit.highConfidence}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Categoría"
            options={categoriaOptions}
            value={filterCat}
            onChange={setFilterCat}
          />
          <Select
            label="Confianza"
            options={[
              { value: '', label: 'Todas' },
              { value: 'high', label: 'Alta' },
              { value: 'medium', label: 'Media' },
              { value: 'low', label: 'Baja' },
            ]}
            value={filterConf}
            onChange={setFilterConf}
          />
          <div className="flex flex-col gap-2 justify-end text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyActionable}
                onChange={(e) => setOnlyActionable(e.target.checked)}
              />
              Solo pendientes de corrección
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => setShowIgnored(e.target.checked)}
              />
              Mostrar ignorados
            </label>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Fact global: {audit.factDataSummary.totalRegistros} registros · mismatch tipo{' '}
          {audit.factDataSummary.mismatchTipoFact} · mismatch subtipo{' '}
          {audit.factDataSummary.mismatchSubtipoFact}
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">Categoría</th>
                <th className="px-2 py-2 text-left">Subtipo actual</th>
                <th className="px-2 py-2 text-left">Fact actual</th>
                <th className="px-2 py-2 text-left">Sugerido</th>
                <th className="px-2 py-2 text-left">Conf.</th>
                <th className="px-2 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Sin registros para los filtros actuales.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 200).map((s) => (
                  <tr key={s.gastoId} className="border-t border-gray-100 hover:bg-gray-50/80">
                    <td className="px-2 py-2 font-mono">{s.gastoId}</td>
                    <td className="px-2 py-2">{labelTipoGastoFinanciero(s.categoria)}</td>
                    <td className="px-2 py-2 max-w-[120px] truncate" title={s.subtipoActual}>
                      {s.subtipoActual}
                    </td>
                    <td className="px-2 py-2 max-w-[140px] truncate" title={`${s.tipoFactActual} · ${s.subTipoFactActual}`}>
                      {s.tipoFactActual ?? '—'}
                      {s.subTipoFactActual ? ` · ${s.subTipoFactActual}` : ''}
                    </td>
                    <td className="px-2 py-2 max-w-[140px] truncate text-indigo-900" title={s.subtipoOficialSugerido ?? ''}>
                      {s.subtipoOficialSugerido ?? '—'}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          s.confidence === 'high'
                            ? 'text-emerald-700 font-semibold'
                            : s.confidence === 'low'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                        }
                      >
                        {CONF_LABELS[s.confidence]}
                      </span>
                      {s.localAction === 'ignored' && (
                        <span className="block text-[10px] text-gray-400">ignorado</span>
                      )}
                      {s.localAction === 'manual_review' && (
                        <span className="block text-[10px] text-gray-400">manual</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
                          Ver
                        </Button>
                        {canApply
                          && isAutoApplyEligible(
                            s.confidence,
                            s.subtipoActual,
                            s.subtipoOficialSugerido,
                          ) && (
                          <Button
                            size="sm"
                            loading={busyId === s.gastoId}
                            disabled={busyId != null || s.localAction === 'ignored'}
                            onClick={() => void handleApplyOne(s)}
                          >
                            Aplicar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDataQualityLocalAction(s.gastoId, 'ignored', profile?.email);
                            refreshAudit();
                          }}
                        >
                          Ignorar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDataQualityLocalAction(s.gastoId, 'manual_review', profile?.email);
                            refreshAudit();
                          }}
                        >
                          Manual
                        </Button>
                        {s.localAction && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              clearDataQualityLocalAction(s.gastoId);
                              refreshAudit();
                            }}
                          >
                            Quitar marca
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <p className="px-4 py-2 text-xs text-gray-400 border-t">
            Mostrando 200 de {filtered.length}. Ajusta filtros o usa consola para el listado completo.
          </p>
        )}
      </Card>

      <Modal
        isOpen={selected != null}
        onClose={() => setSelected(null)}
        title={selected ? `Gasto #${selected.gastoId}` : 'Detalle'}
        footer={<Button onClick={() => setSelected(null)}>Cerrar</Button>}
      >
        {selected && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Categoría</dt>
              <dd>{labelTipoGastoFinanciero(selected.categoria)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Subtipo actual → sugerido</dt>
              <dd>
                {selected.subtipoActual} → {selected.subtipoOficialSugerido ?? '(sin sugerencia)'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Fact actual</dt>
              <dd>
                {selected.tipoFactActual ?? '—'} / {selected.subTipoFactActual ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Fact sugerido</dt>
              <dd>
                {selected.tipoFactSugerido ?? '—'} / {selected.subTipoFactSugerido ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Confianza / issue</dt>
              <dd>
                {CONF_LABELS[selected.confidence]} — {selected.issue}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Razón</dt>
              <dd className="text-gray-800">{selected.razon}</dd>
            </div>
          </dl>
        )}
      </Modal>

      <Modal
        isOpen={batchOpen}
        onClose={() => !batchBusy && setBatchOpen(false)}
        title="Aplicar lote (solo alta confianza)"
        footer={
          <>
            <Button variant="ghost" disabled={batchBusy} onClick={() => setBatchOpen(false)}>
              Cancelar
            </Button>
            <Button loading={batchBusy} disabled={!canApply} onClick={() => void handleBatch()}>
              Confirmar {highBatch.length} cambios
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700 leading-relaxed">
          Se actualizarán <strong>{highBatch.length}</strong> registros con confianza{' '}
          <strong>alta</strong>.
        </p>
        <ul className="mt-3 text-xs text-gray-600 list-disc pl-4 space-y-1">
          <li>Solo campos: subtipo_gasto, tipo, sub_tipo, categoría KPI, motivo, revisado_at.</li>
          <li>No se modifican monto, moneda, fecha, vehículo ni método de pago.</li>
          <li>No se cambia tipo_gasto (categoría financiera).</li>
        </ul>
      </Modal>
    </div>
  );
};

export default SubtipoConciliacion;
