import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { esControlFechaSinAlertaVencimiento, TIPOS_CONTROL_FECHA_OPTIONS } from '../../data/controlFechaCatalog';
import { formatDate, todayStr } from '../../utils/formatting';
import { diffDaysFromToday } from '../../utils/fleetPanel';
import { useRegistrosContext } from '../../context/RegistrosContext';
import type { ControlFechasHistoryFilters } from '../../services/controlFechasService';
import type { TipoControlFecha } from '../../data/types';
import { Trash2 } from 'lucide-react';

const emptyHistFilters = (): ControlFechasHistoryFilters => ({});

export interface ControlFechaRegistroPanelProps {
  /** Preselecciona vehículo en el alta y en el filtro del historial (p. ej. detalle de vehículo). */
  prefilledVehicleId?: number | null;
}

const ControlFechaRegistroPanel: React.FC<ControlFechaRegistroPanelProps> = ({ prefilledVehicleId = null }) => {
  const {
    vehicles,
    addControlFecha,
    deleteControlFecha,
    getVehicleLabel,
    controlFechasHistory,
    controlFechasHistoryTotal,
    controlFechasHistoryPage,
    controlFechasHistoryPageSize,
    controlFechasHistoryLoading,
    loadControlFechasHistory,
  } = useRegistrosContext();

  const active = vehicles.filter((v) => v.activo);
  const vehicleOpts = [
    { value: '', label: 'Seleccionar vehículo' },
    ...active.map((v) => ({ value: String(v.id), label: `${v.placa} · ${v.marca} ${v.modelo}` })),
  ];

  const [vehicleId, setVehicleId] = useState('');
  const [tipo, setTipo] = useState(TIPOS_CONTROL_FECHA_OPTIONS[0].value);
  const [fechaVencimiento, setFechaVencimiento] = useState(todayStr());
  const [comentarios, setComentarios] = useState('');
  const [busquedaPagina, setBusquedaPagina] = useState('');

  const [histVehicleId, setHistVehicleId] = useState('');
  const [histTipo, setHistTipo] = useState('');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');

  useEffect(() => {
    void loadControlFechasHistory(emptyHistFilters(), 0);
  }, [loadControlFechasHistory]);

  useEffect(() => {
    if (prefilledVehicleId == null) return;
    const ok = vehicles.some((v) => v.activo && v.id === prefilledVehicleId);
    if (!ok) return;
    setVehicleId(String(prefilledVehicleId));
    setHistVehicleId(String(prefilledVehicleId));
    void loadControlFechasHistory({ vehicleId: prefilledVehicleId }, 0);
  }, [prefilledVehicleId, vehicles, loadControlFechasHistory]);

  const aplicarFiltrosHistorial = useCallback(() => {
    const f: ControlFechasHistoryFilters = {};
    if (histVehicleId) f.vehicleId = Number(histVehicleId);
    if (histTipo) f.tipo = histTipo;
    if (histDesde) f.fechaVencimientoDesde = histDesde;
    if (histHasta) f.fechaVencimientoHasta = histHasta;
    void loadControlFechasHistory(f, 0);
  }, [histVehicleId, histTipo, histDesde, histHasta, loadControlFechasHistory]);

  const filasPaginaFiltradas = useMemo(() => {
    const q = busquedaPagina.trim().toLowerCase();
    if (!q) return controlFechasHistory;
    return controlFechasHistory.filter((c) => {
      const label = getVehicleLabel(c.vehicleId).toLowerCase();
      return (
        String(c.id).includes(q) ||
        c.tipo.toLowerCase().includes(q) ||
        (c.comentarios && c.comentarios.toLowerCase().includes(q)) ||
        label.includes(q) ||
        c.fechaVencimiento.includes(q)
      );
    });
  }, [controlFechasHistory, busquedaPagina, getVehicleLabel]);

  const totalPages =
    controlFechasHistoryTotal != null ? Math.max(1, Math.ceil(controlFechasHistoryTotal / controlFechasHistoryPageSize)) : 1;

  const guardar = () => {
    if (!vehicleId) return;
    void addControlFecha({
      vehicleId: Number(vehicleId),
      tipo,
      fechaVencimiento,
      fechaRegistro: todayStr(),
      comentarios: comentarios.trim(),
    }).then((created) => {
      if (!created) return;
      setComentarios('');
      setBusquedaPagina(String(created.id));
    });
  };

  const histTipoOpts = [{ value: '', label: 'Todos los tipos' }, ...TIPOS_CONTROL_FECHA_OPTIONS];

  return (
    <Card
      title="Registrar vencimiento"
      subtitle="Resumen en la grilla usa solo el vencimiento más lejano por tipo y vehículo (RPC en Supabase). El historial aquí abajo carga filas reales con filtros en servidor."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select label="Vehículo" options={vehicleOpts} value={vehicleId} onChange={setVehicleId} />
        <Select label="Tipo" options={TIPOS_CONTROL_FECHA_OPTIONS} value={tipo} onChange={(v) => setTipo(v as TipoControlFecha)} />
        <Input label="Fecha de vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        <Input label="Comentario (opcional)" value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!vehicleId}
          onClick={guardar}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold"
        >
          Guardar en Supabase
        </button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Historial (Supabase, paginado)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
          <Select
            label="Filtrar vehículo"
            options={[{ value: '', label: 'Todos' }, ...active.map((v) => ({ value: String(v.id), label: v.placa }))]}
            value={histVehicleId}
            onChange={setHistVehicleId}
          />
          <Select label="Filtrar tipo" options={histTipoOpts} value={histTipo} onChange={setHistTipo} />
          <Input label="Vence desde" type="date" value={histDesde} onChange={(e) => setHistDesde(e.target.value)} />
          <Input label="Vence hasta" type="date" value={histHasta} onChange={(e) => setHistHasta(e.target.value)} />
          <button
            type="button"
            onClick={aplicarFiltrosHistorial}
            className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Aplicar filtros
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="w-full sm:w-64 shrink-0">
            <Input
              label="Filtrar solo en esta página"
              value={busquedaPagina}
              onChange={(e) => setBusquedaPagina(e.target.value)}
              placeholder="id, placa, tipo, comentario…"
            />
          </div>
          <p className="text-[11px] text-gray-500 sm:text-right">
            Página {controlFechasHistoryPage + 1} de {totalPages}
            {controlFechasHistoryTotal != null && (
              <>
                {' '}
                · {controlFechasHistoryTotal} fila{controlFechasHistoryTotal !== 1 ? 's' : ''} en total
              </>
            )}
            {controlFechasHistoryLoading ? ' · cargando…' : ''}
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {controlFechasHistoryLoading && controlFechasHistory.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Cargando historial…</p>
          ) : controlFechasHistory.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Sin registros con estos filtros</p>
          ) : filasPaginaFiltradas.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nada coincide con el filtro de esta página</p>
          ) : (
            filasPaginaFiltradas.map((c) => {
              const d = diffDaysFromToday(c.fechaVencimiento);
              const sinVenc = esControlFechaSinAlertaVencimiento(c.tipo);
              const cls = sinVenc
                ? 'text-slate-600'
                : d < 0
                  ? 'text-red-600'
                  : d <= 30
                    ? 'text-amber-700'
                    : 'text-emerald-700';
              const rightLabel = sinVenc ? 'Referencia' : d < 0 ? `${Math.abs(d)} d venc.` : `${d} d`;
              return (
                <div key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      <span className="text-gray-400 font-normal">#{c.id}</span> · {c.tipo.replace(/_/g, ' ')} · {getVehicleLabel(c.vehicleId)}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(c.fechaVencimiento)}</p>
                    {c.comentarios ? <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{c.comentarios}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold ${cls}`} title={sinVenc ? 'Fecha de registro único (no vencimiento)' : undefined}>
                      {rightLabel}
                    </span>
                    <button
                      type="button"
                      title="Eliminar"
                      onClick={() => void deleteControlFecha(c.id)}
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={controlFechasHistoryLoading || controlFechasHistoryPage <= 0}
            onClick={() => {
              const f: ControlFechasHistoryFilters = {};
              if (histVehicleId) f.vehicleId = Number(histVehicleId);
              if (histTipo) f.tipo = histTipo;
              if (histDesde) f.fechaVencimientoDesde = histDesde;
              if (histHasta) f.fechaVencimientoHasta = histHasta;
              void loadControlFechasHistory(f, controlFechasHistoryPage - 1);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
          >
            ← Anterior
          </button>
          <button
            type="button"
            disabled={controlFechasHistoryLoading || controlFechasHistoryPage + 1 >= totalPages}
            onClick={() => {
              const f: ControlFechasHistoryFilters = {};
              if (histVehicleId) f.vehicleId = Number(histVehicleId);
              if (histTipo) f.tipo = histTipo;
              if (histDesde) f.fechaVencimientoDesde = histDesde;
              if (histHasta) f.fechaVencimientoHasta = histHasta;
              void loadControlFechasHistory(f, controlFechasHistoryPage + 1);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </Card>
  );
};

export default ControlFechaRegistroPanel;
