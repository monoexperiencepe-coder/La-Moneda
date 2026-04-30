import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Trash2, Eye,
} from 'lucide-react';
import Badge from '../Common/Badge';
import Button from '../Common/Button';
import Select from '../Common/Select';
import Modal from '../Common/Modal';
import { Ingreso, Gasto, Vehicle } from '../../data/types';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { CATEGORIAS_GASTO_LABELS } from '../../data/catalogs';

type TableMode = 'ingresos' | 'gastos';

interface RegistrosTableProps {
  mode: TableMode;
  ingresos?: Ingreso[];
  gastos?: Gasto[];
  vehicles: Vehicle[];
  onDeleteIngreso?: (id: number) => void;
  onDeleteGasto?: (id: number) => void;
  /** Desde URL (ej. Inicio → cobros pendientes): preselecciona filtro estado de pago en ingresos. */
  initialEstadoPago?: string;
}

type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 por página' },
  { value: 25, label: '25 por página' },
  { value: 50, label: '50 por página' },
];

const ESTADO_PAGO_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'PAGADO', label: 'Pagado' },
];

/** Badge coloreado para estado_pago; null → no renderiza. */
const EstadoPagoBadge: React.FC<{ estado: string | null | undefined }> = ({ estado }) => {
  if (!estado) return null;
  if (estado === 'PENDIENTE')
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 uppercase tracking-wide">
        Pendiente
      </span>
    );
  if (estado === 'PAGADO')
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 uppercase tracking-wide">
        Pagado
      </span>
    );
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
      {estado}
    </span>
  );
};

/** Texto truncado con tooltip nativo si supera `maxLen` caracteres. */
const TruncatedText: React.FC<{ text: string | null | undefined; maxLen?: number; className?: string }> = ({
  text,
  maxLen = 60,
  className = '',
}) => {
  if (!text) return <span className="text-gray-400">—</span>;
  const isLong = text.length > maxLen;
  return (
    <span
      className={`block truncate max-w-[180px] ${className}`}
      title={isLong ? text : undefined}
    >
      {isLong ? `${text.slice(0, maxLen)}…` : text}
    </span>
  );
};

const RegistrosTable: React.FC<RegistrosTableProps> = ({
  mode, ingresos = [], gastos = [], vehicles, onDeleteIngreso, onDeleteGasto, initialEstadoPago = '',
}) => {
  const [query, setQuery] = useState('');
  const [filterEstadoPago, setFilterEstadoPago] = useState(() => (mode === 'ingresos' ? initialEstadoPago : ''));
  useEffect(() => {
    if (mode === 'ingresos') setFilterEstadoPago(initialEstadoPago ?? '');
  }, [mode, initialEstadoPago]);
  const [sortKey, setSortKey] = useState<string>('fecha');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<Ingreso | Gasto | null>(null);

  const getVehicleLabel = (vehicleId: number | null) => {
    if (!vehicleId) return 'General';
    const v = vehicles.find(v => v.id === vehicleId);
    return v ? `${v.marca} ${v.modelo} (${v.placa})` : `#${vehicleId}`;
  };

  const rawData = mode === 'ingresos' ? ingresos : gastos;

  const filtered = useMemo(() => {
    let data = rawData;

    /* ── Filtro estado_pago (solo ingresos) ── */
    if (mode === 'ingresos' && filterEstadoPago) {
      data = (data as Ingreso[]).filter(i => i.estadoPago === filterEstadoPago);
    }

    /* ── Búsqueda libre ── */
    if (!query.trim()) return data;
    const lower = query.toLowerCase();
    return data.filter(item => {
      const vehicleLabel = getVehicleLabel('vehicleId' in item ? item.vehicleId : null).toLowerCase();
      if (mode === 'ingresos') {
        const i = item as Ingreso;
        return (
          i.tipo.toLowerCase().includes(lower) ||
          (i.subTipo ?? '').toLowerCase().includes(lower) ||
          `${i.metodoPago} ${i.metodoPagoDetalle} ${i.celularMetodo ?? ''}`.toLowerCase().includes(lower) ||
          i.comentarios.toLowerCase().includes(lower) ||
          (i.detalleOperativo ?? '').toLowerCase().includes(lower) ||
          (i.tipoOperacion ?? '').toLowerCase().includes(lower) ||
          (i.estadoPago ?? '').toLowerCase().includes(lower) ||
          i.fecha.includes(lower) ||
          vehicleLabel.includes(lower)
        );
      } else {
        const g = item as Gasto;
        return (
          `${g.tipo} ${g.subTipo ?? ''}`.toLowerCase().includes(lower) ||
          g.categoria.toLowerCase().includes(lower) ||
          g.motivo.toLowerCase().includes(lower) ||
          g.pagadoA.toLowerCase().includes(lower) ||
          `${g.metodoPago} ${g.metodoPagoDetalle} ${g.celularMetodo ?? ''}`.toLowerCase().includes(lower) ||
          g.comentarios.toLowerCase().includes(lower) ||
          (g.detalleOperativo ?? '').toLowerCase().includes(lower) ||
          (g.categoriaReal ?? '').toLowerCase().includes(lower) ||
          g.fecha.includes(lower) ||
          vehicleLabel.includes(lower)
        );
      }
    });
  }, [rawData, query, mode, filterEstadoPago]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortKey === 'fecha') { aVal = a.fecha; bVal = b.fecha; }
      else if (sortKey === 'monto') { aVal = a.monto; bVal = b.monto; }
      else if (sortKey === 'vehiculo') {
        aVal = getVehicleLabel('vehicleId' in a ? a.vehicleId : null);
        bVal = getVehicleLabel('vehicleId' in b ? b.vehicleId : null);
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 inline-flex flex-col">
      <ChevronUp size={10} className={sortKey === col && sortDir === 'asc' ? 'text-primary-500' : 'text-gray-300'} />
      <ChevronDown size={10} className={sortKey === col && sortDir === 'desc' ? 'text-primary-500' : 'text-gray-300'} />
    </span>
  );

  const confirmDelete = () => {
    if (deleteId === null) return;
    if (mode === 'ingresos') onDeleteIngreso?.(deleteId);
    else onDeleteGasto?.(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-soft">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder={`Buscar ${mode === 'ingresos' ? 'ingresos' : 'gastos'}...`}
            className="input-field pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro estado_pago — solo ingresos */}
          {mode === 'ingresos' && (
            <div className="w-44">
              <Select
                options={ESTADO_PAGO_OPTIONS}
                value={filterEstadoPago}
                onChange={v => { setFilterEstadoPago(String(v)); setPage(1); }}
              />
            </div>
          )}
          <span className="text-xs text-gray-400">{filtered.length} registros</span>
          <div className="w-40">
            <Select
              options={PAGE_SIZE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              value={pageSize}
              onChange={v => { setPageSize(Number(v)); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th
                className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                onClick={() => handleSort('fecha')}
              >
                Fecha <SortIcon col="fecha" />
              </th>
              <th
                className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => handleSort('vehiculo')}
              >
                Vehículo <SortIcon col="vehiculo" />
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                {mode === 'ingresos' ? 'Tipo / Sub tipo' : 'Categoría / Motivo'}
              </th>
              {/* Columna nueva: contexto operativo */}
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                {mode === 'ingresos' ? 'Operación / Estado' : 'Cat. real / Contexto'}
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                Método de pago
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                {mode === 'ingresos' ? 'Comentarios' : 'Pagado a / obs.'}
              </th>
              <th
                className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                onClick={() => handleSort('monto')}
              >
                Monto <SortIcon col="monto" />
              </th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  {query || filterEstadoPago
                    ? 'No se encontraron resultados para los filtros aplicados'
                    : 'Sin registros disponibles'}
                </td>
              </tr>
            ) : (
              paginated.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  {/* Fecha */}
                  <td className="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(item.fecha)}
                  </td>

                  {/* Vehículo */}
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {getVehicleLabel('vehicleId' in item ? item.vehicleId : null)}
                  </td>

                  {/* Tipo / Categoría */}
                  <td className="px-3 py-3">
                    {mode === 'ingresos' ? (
                      <div>
                        <Badge variant="success">{(item as Ingreso).tipo}</Badge>
                        {(item as Ingreso).subTipo && (
                          <p className="text-xs text-gray-500 mt-0.5">{(item as Ingreso).subTipo}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Badge variant="warning" size="sm">
                          {CATEGORIAS_GASTO_LABELS[(item as Gasto).categoria]}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-0.5">{(item as Gasto).motivo}</p>
                      </div>
                    )}
                  </td>

                  {/* Contexto operativo */}
                  <td className="px-3 py-3 text-xs max-w-[200px]">
                    {mode === 'ingresos' ? (
                      <div className="space-y-1">
                        {(item as Ingreso).tipoOperacion && (
                          <p className="text-gray-600 font-medium truncate" title={(item as Ingreso).tipoOperacion ?? undefined}>
                            {(item as Ingreso).tipoOperacion}
                          </p>
                        )}
                        <EstadoPagoBadge estado={(item as Ingreso).estadoPago} />
                        {(item as Ingreso).detalleOperativo && (
                          <TruncatedText
                            text={(item as Ingreso).detalleOperativo}
                            className="text-gray-400 mt-0.5"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {(item as Gasto).categoriaReal && (
                          <p className="text-gray-600 font-medium truncate" title={(item as Gasto).categoriaReal ?? undefined}>
                            {(item as Gasto).categoriaReal}
                          </p>
                        )}
                        {(item as Gasto).detalleOperativo && (
                          <TruncatedText
                            text={(item as Gasto).detalleOperativo}
                            className="text-gray-400"
                          />
                        )}
                      </div>
                    )}
                  </td>

                  {/* Método de pago */}
                  <td className="px-3 py-3 text-xs text-gray-700 max-w-[160px]">
                    <p className="font-medium text-gray-800">{item.metodoPago}</p>
                    {item.metodoPagoDetalle && (
                      <p className="text-gray-500 truncate" title={item.metodoPagoDetalle}>
                        {item.metodoPagoDetalle}
                      </p>
                    )}
                    {item.celularMetodo && (
                      <p className="text-gray-400 mt-0.5">{item.celularMetodo}</p>
                    )}
                  </td>

                  {/* Comentarios / Pagado a */}
                  <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px]">
                    {mode === 'ingresos' ? (
                      <span className="truncate block" title={item.comentarios || undefined}>
                        {item.comentarios || '—'}
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        {(item as Gasto).pagadoA?.trim() ? (
                          <p className="text-gray-800 font-medium truncate" title={(item as Gasto).pagadoA}>
                            → {(item as Gasto).pagadoA}
                          </p>
                        ) : null}
                        {(item as Gasto).comentarios?.trim() ? (
                          <p className="text-gray-500 truncate" title={(item as Gasto).comentarios}>
                            {(item as Gasto).comentarios}
                          </p>
                        ) : !(item as Gasto).pagadoA?.trim() ? (
                          <span className="text-gray-400">—</span>
                        ) : null}
                      </div>
                    )}
                  </td>

                  {/* Monto */}
                  <td className="px-5 py-3 text-right">
                    {mode === 'ingresos' ? (
                      <div className="text-sm font-bold text-emerald-600">
                        {(item as Ingreso).moneda === 'USD' ? (
                          <>
                            <span>+{formatUSD((item as Ingreso).monto)}</span>
                            <span className="block text-[10px] font-normal text-gray-500">
                              ≈ {formatCurrency(ingresoMontoPEN(item as Ingreso))}
                            </span>
                          </>
                        ) : (
                          <span>+{formatCurrency((item as Ingreso).monto)}</span>
                        )}
                      </div>
                    ) : (item as Gasto).monto < 0 ? (
                      <span className="text-sm font-bold text-emerald-600" title="Descuento / rebaja">
                        −{formatCurrency(Math.abs((item as Gasto).monto))}
                        <span className="block text-[10px] font-normal text-gray-500">rebaja</span>
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-red-500">
                        −{formatCurrency((item as Gasto).monto)}
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setViewItem(item)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary-500 transition-colors"
                        title="Ver detalles"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Mostrando {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} de {sorted.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum = i + 1;
            if (totalPages > 5) {
              if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                  page === pageNum ? 'bg-primary-500 text-white' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Modal: confirmar eliminación ── */}
      <Modal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Confirmar eliminación"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
        </p>
      </Modal>

      {/* ── Modal: ver detalles ── */}
      {viewItem && (
        <Modal
          isOpen={!!viewItem}
          onClose={() => setViewItem(null)}
          title="Detalles del registro"
          size="sm"
          footer={<Button onClick={() => setViewItem(null)}>Cerrar</Button>}
        >
          <dl className="space-y-3">
            {/* ─ Campos comunes ─ */}
            <div className="flex justify-between">
              <dt className="text-xs text-gray-500 font-medium">Fecha movimiento</dt>
              <dd className="text-sm text-gray-900">{formatDate(viewItem.fecha)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-xs text-gray-500 font-medium">Vehículo</dt>
              <dd className="text-sm text-gray-900">{getVehicleLabel('vehicleId' in viewItem ? viewItem.vehicleId : null)}</dd>
            </div>

            {mode === 'ingresos' ? (
              <>
                {/* ─ Tipo / subTipo ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo</dt>
                  <dd><Badge variant="success">{(viewItem as Ingreso).tipo}</Badge></dd>
                </div>
                {(viewItem as Ingreso).subTipo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Sub tipo</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).subTipo}</dd>
                  </div>
                )}

                {/* ─ Contexto operativo (ingresos) ─ */}
                {(viewItem as Ingreso).tipoOperacion && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo operación</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).tipoOperacion}</dd>
                  </div>
                )}
                {(viewItem as Ingreso).estadoPago && (
                  <div className="flex justify-between gap-4 items-center">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Estado pago</dt>
                    <dd><EstadoPagoBadge estado={(viewItem as Ingreso).estadoPago} /></dd>
                  </div>
                )}
                {(viewItem as Ingreso).detalleOperativo && (
                  <div>
                    <dt className="text-xs text-gray-500 font-medium mb-1">Detalle operativo</dt>
                    <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                      {(viewItem as Ingreso).detalleOperativo}
                    </dd>
                  </div>
                )}

                {/* ─ Pago ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Método de pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).metodoPago}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Detalle pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).metodoPagoDetalle || '—'}</dd>
                </div>
                {(viewItem as Ingreso).celularMetodo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Celular / cuenta</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).celularMetodo}</dd>
                  </div>
                )}

                {/* ─ Moneda ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Moneda</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).moneda ?? 'PEN'}</dd>
                </div>
                {((viewItem as Ingreso).moneda === 'USD' || (viewItem as Ingreso).tipoCambio) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo cambio (S/ × US$)</dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {(viewItem as Ingreso).tipoCambio != null ? (viewItem as Ingreso).tipoCambio?.toFixed(4) : '—'}
                    </dd>
                  </div>
                )}
                {(viewItem as Ingreso).moneda === 'USD' && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Equiv. ref. soles</dt>
                    <dd className="text-sm text-gray-900 text-right">{formatCurrency(ingresoMontoPEN(viewItem as Ingreso))}</dd>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Fecha registro</dt>
                  <dd className="text-sm text-gray-900">{formatDate((viewItem as Ingreso).fechaRegistro)}</dd>
                </div>
              </>
            ) : (
              <>
                {/* ─ Tipo / sub ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo (Fact)</dt>
                  <dd className="text-sm text-gray-900 text-right font-medium">{(viewItem as Gasto).tipo}</dd>
                </div>
                {(viewItem as Gasto).subTipo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Sub tipo</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).subTipo}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 font-medium">Categoría KPI</dt>
                  <dd className="text-sm text-gray-900">{CATEGORIAS_GASTO_LABELS[(viewItem as Gasto).categoria]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 font-medium">Motivo</dt>
                  <dd className="text-sm text-gray-900">{(viewItem as Gasto).motivo}</dd>
                </div>

                {/* ─ Contexto operativo (gastos) ─ */}
                {(viewItem as Gasto).categoriaReal && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Cat. real (Excel)</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).categoriaReal}</dd>
                  </div>
                )}
                {(viewItem as Gasto).subcategoria && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Subcategoría</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).subcategoria}</dd>
                  </div>
                )}
                {(viewItem as Gasto).detalleOperativo && (
                  <div>
                    <dt className="text-xs text-gray-500 font-medium mb-1">Detalle operativo</dt>
                    <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                      {(viewItem as Gasto).detalleOperativo}
                    </dd>
                  </div>
                )}

                {/* ─ Período ─ */}
                {((viewItem as Gasto).fechaDesde || (viewItem as Gasto).fechaHasta) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Período</dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {(viewItem as Gasto).fechaDesde ? formatDate((viewItem as Gasto).fechaDesde!) : '—'}
                      {' → '}
                      {(viewItem as Gasto).fechaHasta ? formatDate((viewItem as Gasto).fechaHasta!) : '—'}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Fecha registro</dt>
                  <dd className="text-sm text-gray-900">{formatDate((viewItem as Gasto).fechaRegistro)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Método de pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).metodoPago}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Detalle pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).metodoPagoDetalle || '—'}</dd>
                </div>
                {(viewItem as Gasto).celularMetodo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Celular / cuenta</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).celularMetodo}</dd>
                  </div>
                )}
                {(viewItem as Gasto).pagadoA?.trim() && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Pagado a</dt>
                    <dd className="text-sm text-gray-900 text-right font-medium">{(viewItem as Gasto).pagadoA}</dd>
                  </div>
                )}
              </>
            )}

            {/* ─ Monto ─ */}
            <div className="flex justify-between">
              <dt className="text-xs text-gray-500 font-medium">
                {mode === 'gastos' && viewItem.monto < 0 ? 'Rebaja (descuento)' : 'Monto'}
              </dt>
              <dd
                className={`text-sm font-bold ${
                  mode === 'ingresos'
                    ? 'text-emerald-600'
                    : viewItem.monto < 0
                      ? 'text-emerald-600'
                      : 'text-red-500'
                }`}
              >
                {mode === 'ingresos' && (
                  (viewItem as Ingreso).moneda === 'USD' ? (
                    <div className="text-right">
                      <span className="block">{formatUSD((viewItem as Ingreso).monto)}</span>
                      <span className="block text-xs font-normal text-gray-500">
                        ≈ {formatCurrency(ingresoMontoPEN(viewItem as Ingreso))}
                      </span>
                    </div>
                  ) : (
                    formatCurrency(viewItem.monto)
                  )
                )}
                {mode === 'gastos' && viewItem.monto < 0 && <>−{formatCurrency(Math.abs(viewItem.monto))}</>}
                {mode === 'gastos' && viewItem.monto >= 0 && <>−{formatCurrency(viewItem.monto)}</>}
              </dd>
            </div>

            {/* ─ Comentarios ─ */}
            {viewItem.comentarios?.trim() && (
              <div>
                <dt className="text-xs text-gray-500 font-medium mb-1">
                  {mode === 'gastos' ? 'Observaciones' : 'Comentarios'}
                </dt>
                <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                  {viewItem.comentarios}
                </dd>
              </div>
            )}
          </dl>
        </Modal>
      )}
    </div>
  );
};

export default RegistrosTable;
