import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Filter } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import ControlFechaRegistroPanel from '../../components/operaciones/ControlFechaRegistroPanel';
import { formatDate } from '../../utils/formatting';
import { buildControlFechasPivotMapByTipos } from '../../utils/controlFechasPivot';
import { DocTone, docColumnTone, docNearestExpiryIso, docRowWorstTone } from '../../utils/documentacionDocTone';
import { DOC_MODULE_COLUMNS } from '../../data/controlFechaCatalog';
import type { TipoControlFecha, Vehicle } from '../../data/types';

const DOC_TIPOS = DOC_MODULE_COLUMNS.map((c) => c.tipo);

type DocPivot = Partial<Record<TipoControlFecha, string>>;

type RowTone = Exclude<DocTone, 'neutral'>;

const TONE_CELL: Record<DocTone, string> = {
  late: 'bg-red-50 text-red-700 font-semibold',
  soon: 'bg-amber-50 text-amber-800 font-semibold',
  ok: 'bg-emerald-50 text-emerald-800',
  neutral: 'bg-slate-50 text-slate-700 border border-slate-100',
  empty: 'text-gray-300',
};

const TONE_DOT: Record<Exclude<RowTone, 'empty'>, string> = {
  late: 'bg-red-500',
  soon: 'bg-amber-400',
  ok: 'bg-emerald-500',
};

const DateCell: React.FC<{ date?: string; label: string; tipo: TipoControlFecha }> = ({ date, label, tipo }) => {
  const t = docColumnTone(date, tipo);
  if (t === 'empty') {
    return <span className="text-gray-300 text-xs select-none" title={`${label}: sin dato`}>—</span>;
  }
  const titleExtra = t === 'neutral' ? ' (fecha de referencia, no vencimiento)' : '';
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs tabular-nums ${TONE_CELL[t]}`}
      title={`${label}: ${formatDate(date!)}${titleExtra}`}
    >
      {formatDate(date!)}
    </span>
  );
};

const StatusBadge: React.FC<{ t: RowTone }> = ({ t }) => {
  if (t === 'empty') return <span className="text-gray-300 text-xs">—</span>;
  const labels: Record<Exclude<RowTone, 'empty'>, string> = { late: 'Vencido', soon: '≤ 30 d', ok: 'Al día' };
  const cls: Record<Exclude<RowTone, 'empty'>, string> = {
    late: 'bg-red-100 text-red-700 border-red-200',
    soon: 'bg-amber-100 text-amber-800 border-amber-200',
    ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls[t]}`}>
      <span className={`size-1.5 rounded-full ${TONE_DOT[t]}`} />
      {labels[t]}
    </span>
  );
};

interface VehicleRow {
  v: Vehicle;
  doc: DocPivot | undefined;
  wt: RowTone;
  nearest: string;
}

const MobileDocCard: React.FC<{ v: Vehicle; doc: DocPivot | undefined; wt: RowTone }> = ({ v, doc, wt }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
    <div className="flex justify-between items-start gap-2 mb-3">
      <div className="min-w-0">
        <p className="font-bold text-gray-900 text-sm">{v.placa}</p>
        <p className="text-xs text-gray-500 truncate">
          {v.marca} {v.modelo}
        </p>
      </div>
      <StatusBadge t={wt} />
    </div>
    <ul className="divide-y divide-gray-50 rounded-xl border border-gray-50 overflow-hidden">
      {DOC_MODULE_COLUMNS.map(({ tipo, label }) => (
        <li key={tipo} className="flex justify-between gap-3 px-2.5 py-2 text-xs bg-white">
          <span className="text-gray-500 shrink-0 max-w-[42%] truncate" title={label}>
            {label}
          </span>
          <div className="min-w-0 text-right">
            <DateCell date={doc?.[tipo]} label={label} tipo={tipo} />
          </div>
        </li>
      ))}
    </ul>
  </div>
);

type DocUrlFilter = 'vencidos' | 'porvencer' | 'alertas' | null;

const Documentacion: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { vehicles, controlFechas } = useRegistrosContext();

  const docQuery = ((): DocUrlFilter => {
    const d = searchParams.get('doc');
    if (d === 'vencidos' || d === 'porvencer' || d === 'alertas') return d;
    return null;
  })();

  const clearDocQuery = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('doc');
    setSearchParams(next, { replace: true });
  };

  const [soloProblemas, setSoloProblemas] = useState(false);
  type SortKey = 'placa' | 'vencimiento';
  const [sortBy, setSortBy] = useState<SortKey>('vencimiento');

  const pivot = useMemo(() => buildControlFechasPivotMapByTipos(controlFechas, DOC_TIPOS), [controlFechas]);

  const allRows: VehicleRow[] = useMemo(() => {
    return vehicles.map((v) => {
      const doc = pivot.get(v.id);
      const wt = docRowWorstTone(doc, DOC_MODULE_COLUMNS);
      return { v, doc, wt, nearest: docNearestExpiryIso(doc, DOC_MODULE_COLUMNS) };
    });
  }, [vehicles, pivot]);

  const alertCount = useMemo(() => allRows.filter((r) => r.wt === 'late' || r.wt === 'soon').length, [allRows]);

  const visibleRows = useMemo(() => {
    let rows = allRows;
    if (docQuery === 'vencidos') rows = allRows.filter((r) => r.wt === 'late');
    else if (docQuery === 'porvencer') rows = allRows.filter((r) => r.wt === 'soon');
    else if (docQuery === 'alertas') rows = allRows.filter((r) => r.wt === 'late' || r.wt === 'soon');
    else if (soloProblemas) rows = allRows.filter((r) => r.wt === 'late' || r.wt === 'soon');
    if (sortBy === 'vencimiento') {
      rows = [...rows].sort((a, b) => a.nearest.localeCompare(b.nearest) || a.v.placa.localeCompare(b.v.placa));
    } else {
      rows = [...rows].sort((a, b) => a.v.placa.localeCompare(b.v.placa));
    }
    return rows;
  }, [allRows, soloProblemas, sortBy, docQuery]);

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto px-1 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/operaciones')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Documentación</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Vencimientos desde Supabase (control_fechas): SOAT, RT, AFOCAT, GNV, ATU, brevete y más.
              {alertCount > 0 && <span className="ml-1.5 font-semibold text-red-600">· {alertCount} con alerta</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById('registro-vencimiento-supabase')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="shrink-0 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          Registrar vencimiento
        </button>
      </div>

      {docQuery && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/80 px-3 py-2 text-xs text-primary-900">
          <span className="font-semibold">
            {docQuery === 'vencidos' && 'Solo documentos vencidos'}
            {docQuery === 'porvencer' && 'Solo por vencer (≤30 días)'}
            {docQuery === 'alertas' && 'Solo con alerta (vencido o próximo)'}
          </span>
          <button type="button" onClick={clearDocQuery} className="ml-auto font-semibold text-primary-700 hover:underline">
            Quitar filtro
          </button>
        </div>
      )}

      {alertCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <AlertTriangle size={15} className="shrink-0 text-red-600" />
          <p className="text-xs font-semibold text-red-800">
            {allRows.filter((r) => r.wt === 'late').length > 0 && (
              <span className="mr-2">
                {allRows.filter((r) => r.wt === 'late').length} vencido
                {allRows.filter((r) => r.wt === 'late').length > 1 ? 's' : ''}
              </span>
            )}
            {allRows.filter((r) => r.wt === 'soon').length > 0 && (
              <span className="text-amber-800">
                {allRows.filter((r) => r.wt === 'soon').length} por vencer (≤30 d)
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setSoloProblemas(true);
              setSortBy('vencimiento');
            }}
            className="ml-auto shrink-0 text-[11px] font-semibold text-red-700 hover:underline"
          >
            Ver solo estos →
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
            <span className="font-medium text-gray-700">Leyenda:</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="size-2 rounded-full bg-red-500" />
              vencido
            </span>
            <span className="inline-flex items-center gap-1 ml-1.5">
              <span className="size-2 rounded-full bg-amber-400" />
              ≤30 d
            </span>
            <span className="inline-flex items-center gap-1 ml-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              al día
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (docQuery) clearDocQuery();
                setSoloProblemas((p) => !p);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                soloProblemas && !docQuery ? 'border-red-300 bg-red-100 text-red-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter size={11} />
              Solo con problemas
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:outline-none cursor-pointer max-w-[min(100%,220px)]"
            >
              <option value="vencimiento">Ordenar: vencimiento más cercano</option>
              <option value="placa">Ordenar: placa A→Z</option>
            </select>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {docQuery === 'vencidos' && 'Ningún vehículo con documentación vencida.'}
            {docQuery === 'porvencer' && 'Ningún vehículo con vencimiento en los próximos 30 días.'}
            {docQuery === 'alertas' && 'Ningún vehículo con alertas de vencimiento.'}
            {!docQuery && soloProblemas && 'Ningún vehículo con alertas activas.'}
            {!docQuery && !soloProblemas && 'No hay vehículos cargados'}
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3 p-3 bg-gray-50/40">
              {visibleRows.map(({ v, doc, wt }) => (
                <MobileDocCard key={v.id} v={v} doc={doc} wt={wt} />
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left min-w-[1100px]">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-white border-b border-gray-100">
                    <th className="py-2 pl-3 pr-2 sticky left-0 bg-white z-10" style={{ boxShadow: '2px 0 6px -2px rgba(0,0,0,0.07)' }}>
                      Unidad
                    </th>
                    {DOC_MODULE_COLUMNS.map(({ tipo, th }) => (
                      <th key={tipo} className="py-2 px-1.5 text-center whitespace-nowrap">
                        {th}
                      </th>
                    ))}
                    <th className="py-2 pl-2 pr-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleRows.map(({ v, doc, wt }) => {
                    const rowAccent =
                      wt === 'late'
                        ? 'border-l-2 border-l-red-400 bg-red-50/30 hover:bg-red-50/60'
                        : wt === 'soon'
                          ? 'border-l-2 border-l-amber-400 bg-amber-50/20 hover:bg-amber-50/50'
                          : 'border-l-2 border-l-transparent hover:bg-violet-50/30';
                    return (
                      <tr key={v.id} className={`transition-colors ${rowAccent}`}>
                        <td
                          className="py-2.5 pl-3 pr-2 sticky left-0 z-[1] bg-inherit"
                          style={{ boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)' }}
                        >
                          <div className="font-semibold text-gray-900 text-xs sm:text-sm leading-tight">{v.placa}</div>
                          <div className="text-[10px] text-gray-500 truncate max-w-[9rem] sm:max-w-[13rem]">
                            {v.marca} {v.modelo}
                          </div>
                        </td>
                        {DOC_MODULE_COLUMNS.map(({ tipo, label }) => (
                          <td key={tipo} className="py-2.5 px-1.5 text-center align-middle">
                            <DateCell date={doc?.[tipo]} label={label} tipo={tipo} />
                          </td>
                        ))}
                        <td className="py-2.5 pl-2 pr-3 text-center align-middle">
                          <StatusBadge t={wt} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(soloProblemas || docQuery) && (
          <div className="border-t border-gray-100 px-3 py-2 text-center">
            <button
              type="button"
              onClick={() => {
                setSoloProblemas(false);
                clearDocQuery();
              }}
              className="text-xs text-purple-600 hover:underline font-medium"
            >
              Mostrar todos los vehículos
            </button>
          </div>
        )}
      </div>

      <div id="registro-vencimiento-supabase" className="scroll-mt-24">
        <ControlFechaRegistroPanel />
      </div>
    </div>
  );
};

export default Documentacion;
