import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import type { Conductor, Gasto, Ingreso } from '../../data/types';
import { CATEGORIAS_GASTO_LABELS } from '../../data/catalogs';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatDateTimePe } from '../../utils/formatting';
import { conductorAsignadoLabel } from '../../utils/fleetPanel';
import {
  filterGastosRecentHours,
  filterIngresosRecentHours,
  recentRangeStats,
  RECENT_HOURS_OPTIONS,
  type RecentHoursOption,
} from '../../utils/recentRecordsWindow';

export type HomeRecentModalKind = 'ingreso' | 'gasto';

export interface HomeRecentRecordsModalProps {
  isOpen: boolean;
  kind: HomeRecentModalKind;
  onClose: () => void;
  ingresos: Ingreso[];
  gastos: Gasto[];
  conductores: Conductor[];
  getVehicleLabel: (vehicleId: number | string | null | undefined) => string;
  formatGlobalAmount: (amount: number, currency?: 'PEN' | 'USD') => string;
  formatRecordAmount: (
    amount: number,
    record: Ingreso | Gasto | null | undefined,
    opts?: { currency?: 'PEN' | 'USD'; signPrefix?: string },
  ) => string;
  canViewGlobal: boolean;
  canViewRecordAmount: (record: Ingreso | Gasto | null | undefined) => boolean;
}

function logRangeChange(kind: HomeRecentModalKind, hours: RecentHoursOption): void {
  if (!import.meta.env.DEV) return;
  console.warn('[home:recent-modal:range_change]', { kind, hours });
}

function paymentLabel(metodo: string, detalle: string): string {
  const parts = [metodo, detalle].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function gastoClasificacionLine(g: Gasto): string {
  const cat = g.categoria ? CATEGORIAS_GASTO_LABELS[g.categoria] ?? g.categoria : '';
  const tipo = g.tipo?.trim() || g.tipo_gasto?.trim() || '';
  const sub = g.subTipo?.trim() || g.subtipo_gasto?.trim() || g.subcategoria?.trim() || '';
  return [cat, tipo, sub].filter(Boolean).join(' · ') || '—';
}

function gastoConceptoLine(g: Gasto): string {
  const parts = [g.motivo, g.pagadoA, g.comentarios, g.detalleOperativo]
    .map((s) => s?.trim())
    .filter(Boolean);
  if (!parts.length) return '—';
  const joined = parts.join(' · ');
  return joined.length > 120 ? `${joined.slice(0, 117)}…` : joined;
}

const HomeRecentRecordsModal: React.FC<HomeRecentRecordsModalProps> = ({
  isOpen,
  kind,
  onClose,
  ingresos,
  gastos,
  conductores,
  getVehicleLabel,
  formatGlobalAmount,
  formatRecordAmount,
  canViewGlobal,
  canViewRecordAmount,
}) => {
  const [hours, setHours] = useState<RecentHoursOption>(24);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setHours(24);
    setNowMs(Date.now());
  }, [isOpen, kind]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  const filteredIngresos = useMemo(
    () => (kind === 'ingreso' ? filterIngresosRecentHours(ingresos, hours, nowMs) : []),
    [kind, ingresos, hours, nowMs],
  );

  const filteredGastos = useMemo(
    () => (kind === 'gasto' ? filterGastosRecentHours(gastos, hours, nowMs) : []),
    [kind, gastos, hours, nowMs],
  );

  const rows = kind === 'ingreso' ? filteredIngresos : filteredGastos;
  const count = rows.length;

  const totalVisible = useMemo(() => {
    if (kind === 'ingreso') {
      return filteredIngresos.reduce((s, r) => {
        if (!canViewGlobal && !canViewRecordAmount(r)) return s;
        return s + ingresoMontoPEN(r);
      }, 0);
    }
    return filteredGastos.reduce((s, r) => {
      if (!canViewGlobal && !canViewRecordAmount(r)) return s;
      return s + r.monto;
    }, 0);
  }, [kind, filteredIngresos, filteredGastos, canViewGlobal, canViewRecordAmount]);

  const stats = useMemo(
    () => recentRangeStats(totalVisible, count, hours),
    [totalVisible, count, hours],
  );

  const title = kind === 'ingreso' ? 'Ingresos recientes' : 'Gastos recientes';
  const emptyLabel =
    kind === 'ingreso'
      ? `No hay ingresos en las últimas ${hours} horas.`
      : `No hay gastos en las últimas ${hours} horas.`;

  const formatTotal = () => {
    if (!canViewGlobal && count > 0 && totalVisible === 0) {
      return formatGlobalAmount(0);
    }
    return formatGlobalAmount(totalVisible);
  };

  const formatAvg = (n: number) => {
    if (!canViewGlobal && count > 0 && totalVisible === 0) return formatGlobalAmount(0);
    return formatGlobalAmount(n);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {RECENT_HOURS_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setHours(h);
                logRangeChange(kind, h);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                hours === h
                  ? kind === 'ingreso'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Últimas {h} h
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricChip label="Total" value={formatTotal()} />
          <MetricChip label="Registros" value={String(count)} numeric />
          <MetricChip label="Promedio / registro" value={formatAvg(stats.promedioRegistro)} />
          <MetricChip
            label="Promedio / día"
            value={formatAvg(stats.promedioDia)}
            hint={`~${formatAvg(stats.promedioHora)}/h`}
          />
        </div>

        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-500">
            {emptyLabel}
          </p>
        ) : (
          <ul className="max-h-[min(50vh,420px)] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
            {kind === 'ingreso'
              ? filteredIngresos.map((r) => (
                  <IngresoRow
                    key={r.id}
                    ingreso={r}
                    conductores={conductores}
                    getVehicleLabel={getVehicleLabel}
                    formatRecordAmount={formatRecordAmount}
                    canViewRecordAmount={canViewRecordAmount}
                  />
                ))
              : filteredGastos.map((r) => (
                  <GastoRow
                    key={r.id}
                    gasto={r}
                    getVehicleLabel={getVehicleLabel}
                    formatRecordAmount={formatRecordAmount}
                    canViewRecordAmount={canViewRecordAmount}
                  />
                ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

function MetricChip({
  label,
  value,
  numeric,
  hint,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold text-gray-900 ${numeric ? 'tabular-nums' : ''}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-gray-400 tabular-nums">{hint}</p> : null}
    </div>
  );
}

function IngresoRow({
  ingreso,
  conductores,
  getVehicleLabel,
  formatRecordAmount,
  canViewRecordAmount,
}: {
  ingreso: Ingreso;
  conductores: Conductor[];
  getVehicleLabel: (vehicleId: number | string | null | undefined) => string;
  formatRecordAmount: HomeRecentRecordsModalProps['formatRecordAmount'];
  canViewRecordAmount: HomeRecentRecordsModalProps['canViewRecordAmount'];
}) {
  const when = formatDateTimePe(ingreso.createdAt || ingreso.fechaRegistro || ingreso.fecha);
  const vid = ingreso.vehicleId;
  const vehicleLine =
    vid != null ? getVehicleLabel(vid) : ingreso.esExtraordinario ? 'Sin vehículo' : '—';
  const conductorLine =
    vid != null ? conductorAsignadoLabel(conductores, Number(vid)) : '—';
  const monto = ingresoMontoPEN(ingreso);
  const currency = ingreso.moneda === 'USD' ? 'USD' : 'PEN';

  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold text-gray-500 tabular-nums">{when}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{vehicleLine}</p>
        {conductorLine !== '—' ? (
          <p className="text-xs text-gray-500 truncate">Conductor: {conductorLine}</p>
        ) : null}
        <p className="text-xs text-gray-400 truncate">
          {paymentLabel(ingreso.metodoPago, ingreso.metodoPagoDetalle)}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
        {canViewRecordAmount(ingreso)
          ? formatRecordAmount(monto, ingreso, { currency, signPrefix: '+' })
          : formatRecordAmount(monto, ingreso, { currency })}
      </p>
    </li>
  );
}

function GastoRow({
  gasto,
  getVehicleLabel,
  formatRecordAmount,
  canViewRecordAmount,
}: {
  gasto: Gasto;
  getVehicleLabel: (vehicleId: number | string | null | undefined) => string;
  formatRecordAmount: HomeRecentRecordsModalProps['formatRecordAmount'];
  canViewRecordAmount: HomeRecentRecordsModalProps['canViewRecordAmount'];
}) {
  const when = formatDateTimePe(gasto.createdAt || gasto.fechaRegistro || gasto.fecha);

  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold text-gray-500 tabular-nums">{when}</p>
        <p className="text-sm font-medium text-gray-900 truncate">
          {gasto.vehicleId != null ? getVehicleLabel(gasto.vehicleId) : 'Sin vehículo'}
        </p>
        <p className="text-xs text-gray-600 truncate">{gastoClasificacionLine(gasto)}</p>
        <p className="text-xs text-gray-500 line-clamp-2">{gastoConceptoLine(gasto)}</p>
        <p className="text-xs text-gray-400 truncate">
          {paymentLabel(gasto.metodoPago, gasto.metodoPagoDetalle)}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold tabular-nums text-rose-700">
        {canViewRecordAmount(gasto)
          ? formatRecordAmount(gasto.monto, gasto, { signPrefix: '−' })
          : formatRecordAmount(gasto.monto, gasto)}
      </p>
    </li>
  );
}

export default HomeRecentRecordsModal;
