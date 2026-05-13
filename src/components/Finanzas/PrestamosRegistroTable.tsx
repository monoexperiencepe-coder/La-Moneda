import React, { useCallback, useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import type {
  ModalidadPagoPrestamo,
  Moneda,
  PrestamoFinancieroDetalle,
  PrestamoFinancieroEstado,
} from '../../data/types';
import { calcularPrestamoFinancieroInfo } from '../../utils/prestamosFinancierosCalc';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function modalidadEtiqueta(m: ModalidadPagoPrestamo): string {
  return m === 'cuota_fija' ? 'Cuota fija' : 'Tasa anual';
}

function tasaFmt(p: PrestamoFinancieroDetalle['prestamo']): string {
  if (p.modalidadPago === 'cuota_fija') return '—';
  if (p.tasaAnual == null || !Number.isFinite(p.tasaAnual)) return '—';
  return `${(p.tasaAnual * 100).toLocaleString('es-PE', { maximumFractionDigits: 4 })}%`;
}

type FiltroEstado = 'todos' | PrestamoFinancieroEstado;
type FiltroMoneda = 'todos' | Moneda;
type FiltroModalidad = 'todos' | ModalidadPagoPrestamo;

type SortKey =
  | 'fechaInicio'
  | 'prestamista'
  | 'tituloRef'
  | 'estado'
  | 'monedaCapital'
  | 'montoOriginal'
  | 'capitalActual'
  | 'modalidad'
  | 'tasaAnual'
  | 'interesMensual'
  | 'totalPagadoEst'
  | 'fechaCancelacion';

function rowSortValue(row: PrestamoFinancieroDetalle, key: SortKey): string | number {
  const { prestamo: p, tramos } = row;
  const calc = calcularPrestamoFinancieroInfo(p, tramos);
  switch (key) {
    case 'fechaInicio':
      return p.fechaInicio || '';
    case 'prestamista':
      return (p.prestamista || '').toLowerCase();
    case 'tituloRef':
      return (p.titulo?.trim() || p.codigo?.trim() || '').toLowerCase();
    case 'estado':
      return p.estado;
    case 'monedaCapital':
      return p.monedaCapital;
    case 'montoOriginal':
      return p.montoOriginal;
    case 'capitalActual':
      return calc.capitalActualEstimado;
    case 'modalidad':
      return p.modalidadPago;
    case 'tasaAnual':
      return p.tasaAnual != null && Number.isFinite(p.tasaAnual) ? p.tasaAnual : Number.NaN;
    case 'interesMensual':
      return p.interesMensualActual;
    case 'totalPagadoEst':
      return calc.totalInteresPagadoEstimado;
    case 'fechaCancelacion':
      return p.fechaCancelacion || '';
    default:
      return '';
  }
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function SortTh({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sortKey === columnKey;
  const flexAlign = align === 'right' ? 'justify-end text-right' : 'justify-start text-left';
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        title={active ? (sortDir === 'asc' ? 'Orden descendente' : 'Orden ascendente') : 'Clic para ordenar'}
        className={`group/th w-full min-h-[1.5rem] -mx-0.5 px-0.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 rounded hover:bg-slate-100 hover:text-indigo-800 transition-colors inline-flex items-center gap-0.5 ${flexAlign}`}
      >
        <span>{label}</span>
        {active ? (
          <span className="text-indigo-600 tabular-nums text-[9px] leading-none shrink-0" aria-hidden>
            {sortDir === 'asc' ? '▲' : '▼'}
          </span>
        ) : (
          <span className="text-slate-300 group-hover/th:text-slate-400 text-[8px] leading-none shrink-0" aria-hidden>
            ↕
          </span>
        )}
      </button>
    </th>
  );
}

export interface PrestamosRegistroTableProps {
  detalle: PrestamoFinancieroDetalle[];
  canEdit: boolean;
  onEdit: (row: PrestamoFinancieroDetalle) => void;
  scrollToCardId: (prestamoId: number) => void;
}

const PrestamosRegistroTable: React.FC<PrestamosRegistroTableProps> = ({
  detalle,
  canEdit,
  onEdit,
  scrollToCardId,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [moneda, setMoneda] = useState<FiltroMoneda>('todos');
  const [modalidad, setModalidad] = useState<FiltroModalidad>('todos');
  const [tramosModal, setTramosModal] = useState<PrestamoFinancieroDetalle | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('fechaInicio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const onHeaderSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const calcTramosModal = useMemo(() => {
    if (!tramosModal) return null;
    return calcularPrestamoFinancieroInfo(tramosModal.prestamo, tramosModal.tramos);
  }, [tramosModal]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtered = detalle.filter(({ prestamo: p }) => {
      if (estado !== 'todos' && p.estado !== estado) return false;
      if (moneda !== 'todos' && p.monedaCapital !== moneda) return false;
      if (modalidad !== 'todos' && p.modalidadPago !== modalidad) return false;
      if (q) {
        const blob = `${p.codigo} ${p.prestamista} ${p.titulo}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = rowSortValue(a, sortKey);
      const vb = rowSortValue(b, sortKey);
      const cmp = compareSortValues(va, vb) * mult;
      if (cmp !== 0) return cmp;
      return a.prestamo.id - b.prestamo.id;
    });
  }, [detalle, busqueda, estado, moneda, modalidad, sortKey, sortDir]);

  const labelClass = 'block text-[9px] font-semibold text-slate-600 mb-px uppercase tracking-wide';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300';
  const th = 'py-1 pr-2 font-semibold text-slate-600 whitespace-nowrap';
  const td = 'py-1 pr-2 align-top text-slate-800';

  const tramosOrdenadosModal = tramosModal
    ? [...tramosModal.tramos].sort((a, b) => a.orden - b.orden || a.id - b.id)
    : [];

  return (
    <section className="rounded-lg border border-slate-200/90 bg-white shadow-sm shadow-slate-200/30 overflow-hidden">
      <div className="px-2.5 py-1.5 sm:px-3 border-b border-slate-100 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={labelClass}>Buscar</label>
            <input
              type="search"
              className={inputClass}
              placeholder="Prestamista, título o código"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select className={inputClass} value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
              <option value="todos">Todos</option>
              <option value="activo">Activo</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Moneda capital</label>
            <select className={inputClass} value={moneda} onChange={(e) => setMoneda(e.target.value as FiltroMoneda)}>
              <option value="todos">Todas</option>
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Modalidad</label>
            <select
              className={inputClass}
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as FiltroModalidad)}
            >
              <option value="todos">Todas</option>
              <option value="tasa_anual">Tasa anual</option>
              <option value="cuota_fija">Cuota fija</option>
            </select>
          </div>
        </div>
        <p className="text-[9px] text-slate-400 mt-1 tabular-nums">
          Mostrando <span className="font-semibold text-slate-600">{filas.length}</span> de {detalle.length}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-[10px] sm:text-[11px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
              <SortTh
                label="Fecha inicio"
                columnKey="fechaInicio"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={`${th} pl-2 sm:pl-2.5`}
              />
              <SortTh
                label="Prestamista"
                columnKey="prestamista"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Título / ref."
                columnKey="tituloRef"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Estado"
                columnKey="estado"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Mon. capital"
                columnKey="monedaCapital"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Capital orig."
                columnKey="montoOriginal"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                align="right"
                className={`${th} text-right`}
              />
              <SortTh
                label="Capital actual"
                columnKey="capitalActual"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                align="right"
                className={`${th} text-right`}
              />
              <SortTh
                label="Modalidad"
                columnKey="modalidad"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Tasa anual"
                columnKey="tasaAnual"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <SortTh
                label="Cuota / int. mensual"
                columnKey="interesMensual"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                align="right"
                className={`${th} text-right`}
              />
              <SortTh
                label="Total pagado est."
                columnKey="totalPagadoEst"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                align="right"
                className={`${th} text-right`}
              />
              <SortTh
                label="Fecha cancelación"
                columnKey="fechaCancelacion"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onHeaderSort}
                className={th}
              />
              <th
                scope="col"
                className={`${th} pr-2 sm:pr-2.5 sticky right-0 bg-slate-50/95 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] text-[9px] font-semibold uppercase tracking-wide text-slate-600`}
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((row) => {
              const { prestamo: p, tramos } = row;
              const calc = calcularPrestamoFinancieroInfo(p, tramos);
              const tieneTramos = tramos.length > 0;
              return (
                <tr key={p.id} className="group border-b border-slate-100 hover:bg-slate-50/60">
                  <td className={`${td} pl-2 sm:pl-2.5 whitespace-nowrap text-slate-700`}>{formatDate(p.fechaInicio)}</td>
                  <td className={`${td} max-w-[140px]`}>
                    <span className="font-medium line-clamp-2" title={p.prestamista}>
                      {p.prestamista || `#${p.id}`}
                    </span>
                  </td>
                  <td className={`${td} max-w-[120px] text-slate-600 truncate`} title={p.titulo || p.codigo}>
                    {p.titulo?.trim() || p.codigo?.trim() || '—'}
                  </td>
                  <td className={td}>
                    <span
                      className={
                        p.estado === 'activo'
                          ? 'rounded px-1 py-px text-[9px] font-bold uppercase bg-emerald-100 text-emerald-900'
                          : 'rounded px-1 py-px text-[9px] font-bold uppercase bg-red-100 text-red-900'
                      }
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{p.monedaCapital}</td>
                  <td className={`${td} text-right tabular-nums font-medium`}>{montoFmt(p.montoOriginal, p.monedaCapital)}</td>
                  <td className={`${td} text-right tabular-nums`}>{montoFmt(calc.capitalActualEstimado, p.monedaCapital)}</td>
                  <td className={td}>{modalidadEtiqueta(p.modalidadPago)}</td>
                  <td className={`${td} tabular-nums`}>{tasaFmt(p)}</td>
                  <td className={`${td} text-right tabular-nums font-semibold text-slate-900`}>
                    {montoFmt(p.interesMensualActual, p.monedaPago)}
                  </td>
                  <td className={`${td} text-right tabular-nums text-indigo-900/90`}>
                    {montoFmt(calc.totalInteresPagadoEstimado, p.monedaPago)}
                  </td>
                  <td className={`${td} whitespace-nowrap text-slate-600`}>
                    {p.fechaCancelacion ? formatDate(p.fechaCancelacion) : '—'}
                  </td>
                  <td
                    className={`${td} pr-2 sm:pr-2.5 sticky right-0 bg-white group-hover:bg-slate-50/60 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)]`}
                  >
                    <div className="flex flex-col gap-1 min-w-[7.5rem]">
                      <button
                        type="button"
                        onClick={() => scrollToCardId(p.id)}
                        className="text-left rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Ver en tarjeta
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-left rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-100"
                        >
                          Editar condiciones
                        </button>
                      ) : null}
                      {tieneTramos || p.requiereTramos ? (
                        <button
                          type="button"
                          disabled={!tieneTramos}
                          onClick={() => tieneTramos && setTramosModal({ prestamo: p, tramos })}
                          title={!tieneTramos ? 'Sin filas de tramos cargadas' : undefined}
                          className="text-left rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Ver tramos
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filas.length === 0 ? (
        <p className="text-[11px] text-slate-500 px-2.5 py-3 sm:px-3 text-center border-t border-slate-100">
          Ningún préstamo coincide con los filtros.
        </p>
      ) : null}

      <Modal
        isOpen={tramosModal != null}
        onClose={() => setTramosModal(null)}
        title={
          tramosModal
            ? `Tramos · ${tramosModal.prestamo.prestamista || `Préstamo #${tramosModal.prestamo.id}`}`
            : 'Tramos'
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={() => setTramosModal(null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        }
      >
        {tramosModal && tramosOrdenadosModal.length === 0 ? (
          <p className="text-sm text-slate-600">
            Este préstamo está marcado con tramos pero no hay filas en <code className="text-xs bg-slate-100 px-1 rounded">prestamos_tramos</code> (import o RLS).
          </p>
        ) : tramosModal && calcTramosModal ? (
          <div className="overflow-x-auto -mx-1">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                  <th className="py-1 pr-2">Orden</th>
                  <th className="py-1 pr-2">Desde</th>
                  <th className="py-1 pr-2">Hasta</th>
                  <th className="py-1 pr-2">Modalidad</th>
                  <th className="py-1 pr-2 text-right">Capital ref.</th>
                  <th className="py-1 pr-2">Tasa</th>
                  <th className="py-1 pr-2 text-right">Cuota / int.</th>
                  <th className="py-1 pr-2">Evento</th>
                </tr>
              </thead>
              <tbody>
                {tramosOrdenadosModal.map((t) => {
                  const linea = calcTramosModal.porTramo.find((x) => x.tramoId === t.id);
                  const cuota = linea != null ? montoFmt(linea.interesMensualEfectivo, t.monedaPago) : '—';
                  const tasaTxt =
                    t.modalidadPago === 'tasa_anual' && t.tasaAnual != null && Number.isFinite(t.tasaAnual)
                      ? `${(t.tasaAnual * 100).toLocaleString('es-PE', { maximumFractionDigits: 4 })}%`
                      : '—';
                  return (
                    <tr key={t.id} className="border-b border-slate-50">
                      <td className="py-1 pr-2 tabular-nums">{t.orden}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{formatDate(t.desde)}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{t.hasta ? formatDate(t.hasta) : '—'}</td>
                      <td className="py-1 pr-2">{modalidadEtiqueta(t.modalidadPago)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {t.capitalReferencial != null && Number.isFinite(t.capitalReferencial)
                          ? montoFmt(t.capitalReferencial, t.monedaCapital)
                          : '—'}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">{tasaTxt}</td>
                      <td className="py-1 pr-2 text-right font-medium tabular-nums">{cuota}</td>
                      <td className="py-1 pr-2 text-slate-600 max-w-[160px] truncate" title={`${t.evento} ${t.nota}`}>
                        {t.evento || t.nota || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

export default PrestamosRegistroTable;
