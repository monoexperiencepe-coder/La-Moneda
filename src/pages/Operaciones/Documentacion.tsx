import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Filter } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import ControlFechaRegistroPanel from '../../components/operaciones/ControlFechaRegistroPanel';
import { formatDate } from '../../utils/formatting';
import { buildControlFechasPivotMapByTipos } from '../../utils/controlFechasPivot';
import {
  DocTone,
  docColumnTone,
  docNearestExpiryIso,
  docRowWorstTone,
} from '../../utils/documentacionDocTone';
import { DOC_MODULE_UI_COLUMNS } from '../../data/controlFechaCatalog';
import type { TipoControlFecha, Vehicle } from '../../data/types';

const DOC_TIPOS = DOC_MODULE_UI_COLUMNS.map((c) => c.tipo);

/** Contenedor único de scroll (vertical + horizontal); sticky solo funciona dentro de él. */
const DOC_TABLE_WRAP = 'hidden md:block overflow-auto max-h-[min(calc(100vh-14rem),720px)] overscroll-contain';
const DOC_TH_HEAD = 'bg-white py-2 px-1.5 text-center whitespace-nowrap border-b border-gray-100';
const DOC_TH_UNIT_HEAD =
  'sticky top-0 left-0 z-30 bg-white py-2 pl-3 pr-2 text-left border-r border-b border-gray-100 min-w-[9rem] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08),0_1px_0_0_rgb(229_231_235)]';
const DOC_TH_STICKY_TOP =
  'sticky top-0 z-20 bg-white border-b border-gray-100 shadow-[0_1px_0_0_rgb(229_231_235)]';
const DOC_TD_UNIT =
  'sticky left-0 z-10 border-r border-gray-100 min-w-[9rem] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]';

type DocPivot = Partial<Record<TipoControlFecha, string>>;

type RowStatusTone = 'empty' | 'ok' | 'soon' | 'late';

const TONE_CELL: Record<Exclude<DocTone, 'empty'>, string> = {
  late: 'bg-red-50 text-red-700 font-semibold',
  soon: 'bg-amber-50 text-amber-800 font-semibold',
  ok: 'bg-emerald-50 text-emerald-800',
  neutral: 'bg-slate-50 text-slate-700 border border-slate-100',
  mant: 'bg-red-50 text-red-700 font-semibold',
};

const TONE_DOT: Record<'late' | 'soon' | 'ok', string> = {
  late: 'bg-red-500',
  soon: 'bg-amber-400',
  ok: 'bg-emerald-500',
};

const DateCell: React.FC<{ date?: string; label: string; tipo: TipoControlFecha }> = ({ date, label, tipo }) => {
  const t = docColumnTone(date, tipo);
  if (t === 'empty') {
    return <span className="text-gray-300 text-xs select-none" title={`${label}: sin dato`}>—</span>;
  }
  const titleExtra =
    t === 'neutral' ? ' (fecha de referencia, no vencimiento)' : t === 'mant' ? ' (revisar mantenimiento)' : '';
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs tabular-nums ${TONE_CELL[t]}`}
      title={`${label}: ${formatDate(date!)}${titleExtra}`}
    >
      {formatDate(date!)}
    </span>
  );
};

const StatusBadge: React.FC<{ status: RowStatusTone }> = ({ status }) => {
  if (status === 'empty') return <span className="text-gray-300 text-xs">—</span>;
  const labels: Record<'late' | 'soon' | 'ok', string> = { late: 'Vencido', soon: '≤ 30 d', ok: 'Al día' };
  const cls: Record<'late' | 'soon' | 'ok', string> = {
    late: 'bg-red-100 text-red-700 border-red-200',
    soon: 'bg-amber-100 text-amber-800 border-amber-200',
    ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const tone = status === 'late' || status === 'soon' || status === 'ok' ? status : 'ok';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls[tone]}`}>
      <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {labels[tone]}
    </span>
  );
};

interface VehicleRow {
  v: Vehicle;
  doc: DocPivot | undefined;
  statusTone: RowStatusTone;
  nearest: string;
}

function stickyUnitBg(wt: RowStatusTone): string {
  if (wt === 'late') return 'bg-red-50';
  if (wt === 'soon') return 'bg-amber-50';
  return 'bg-white';
}

const MobileDocCard: React.FC<{ v: Vehicle; doc: DocPivot | undefined; status: RowStatusTone }> = ({
  v,
  doc,
  status,
}) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
    <div className="flex justify-between items-start gap-2 mb-3">
      <div className="min-w-0">
        <p className="font-bold text-gray-900 text-sm">#{v.id} · {v.placa}</p>
        <p className="text-xs text-gray-500 truncate">
          {v.marca} {v.modelo}
        </p>
      </div>
      <StatusBadge status={status} />
    </div>
    <ul className="divide-y divide-gray-50 rounded-xl border border-gray-50 overflow-hidden">
      {DOC_MODULE_UI_COLUMNS.map(({ tipo, label }) => (
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
  type SortKey = 'unidad' | 'placa' | 'vencimiento';
  const [sortBy, setSortBy] = useState<SortKey>('unidad');

  const pivot = useMemo(() => buildControlFechasPivotMapByTipos(controlFechas, DOC_TIPOS), [controlFechas]);

  const allRows: VehicleRow[] = useMemo(() => {
    return vehicles.map((v) => {
      const doc = pivot.get(v.id);
      const statusTone = docRowWorstTone(doc, DOC_MODULE_UI_COLUMNS);
      return { v, doc, statusTone, nearest: docNearestExpiryIso(doc, DOC_MODULE_UI_COLUMNS) };
    });
  }, [vehicles, pivot]);

  const vencidosCount = useMemo(
    () => allRows.filter((r) => r.statusTone === 'late').length,
    [allRows],
  );
  const porVencerCount = useMemo(
    () => allRows.filter((r) => r.statusTone === 'soon').length,
    [allRows],
  );
  const alertCount = vencidosCount + porVencerCount;

  const visibleRows = useMemo(() => {
    let rows = allRows;
    if (docQuery === 'vencidos') rows = allRows.filter((r) => r.statusTone === 'late');
    else if (docQuery === 'porvencer') rows = allRows.filter((r) => r.statusTone === 'soon');
    else if (docQuery === 'alertas') rows = allRows.filter((r) => r.statusTone === 'late' || r.statusTone === 'soon');
    else if (soloProblemas) rows = allRows.filter((r) => r.statusTone === 'late' || r.statusTone === 'soon');
    if (sortBy === 'unidad') {
      rows = [...rows].sort((a, b) => a.v.id - b.v.id);
    } else if (sortBy === 'vencimiento') {
      rows = [...rows].sort((a, b) => a.nearest.localeCompare(b.nearest) || a.v.id - b.v.id);
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
      </div>

      <ControlFechaRegistroPanel historialSearchMode="documentacion" formExpandedDefault />

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
            {vencidosCount > 0 && (
              <span className="mr-2">
                {vencidosCount} vencido{vencidosCount > 1 ? 's' : ''}
              </span>
            )}
            {porVencerCount > 0 && (
              <span className="text-amber-800">
                {porVencerCount} por vencer (≤30 d)
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

      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft">
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
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:outline-none cursor-pointer max-w-[min(100%,240px)]"
            >
              <option value="unidad">Ordenar: unidad #1 → #N</option>
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
              {visibleRows.map(({ v, doc, statusTone }) => (
                <MobileDocCard key={v.id} v={v} doc={doc} status={statusTone} />
              ))}
            </div>

            <div className={DOC_TABLE_WRAP}>
              <table className="w-full border-separate border-spacing-0 text-left min-w-[980px]">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className={DOC_TH_UNIT_HEAD}>Unidad</th>
                    {DOC_MODULE_UI_COLUMNS.map(({ tipo, th }) => (
                      <th key={tipo} className={`${DOC_TH_HEAD} ${DOC_TH_STICKY_TOP}`}>
                        {th}
                      </th>
                    ))}
                    <th className={`py-2 pl-2 pr-3 text-center ${DOC_TH_STICKY_TOP}`}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ v, doc, statusTone }) => {
                    const rowAccent =
                      statusTone === 'late'
                        ? 'border-l-2 border-l-red-400 bg-red-50/30 hover:bg-red-50/60'
                        : statusTone === 'soon'
                          ? 'border-l-2 border-l-amber-400 bg-amber-50/20 hover:bg-amber-50/50'
                          : 'border-l-2 border-l-transparent hover:bg-violet-50/30';
                    const unitBg = stickyUnitBg(statusTone);
                    return (
                      <tr key={v.id} className={`transition-colors border-b border-gray-50 ${rowAccent}`}>
                        <td className={`py-2.5 pl-3 pr-2 align-top ${DOC_TD_UNIT} ${unitBg}`}>
                          <div className="font-semibold text-gray-900 text-xs sm:text-sm leading-tight">
                            #{v.id} · {v.placa}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate max-w-[9rem] sm:max-w-[13rem]">
                            {v.marca} {v.modelo}
                          </div>
                        </td>
                        {DOC_MODULE_UI_COLUMNS.map(({ tipo, label }) => (
                          <td key={tipo} className="py-2.5 px-1.5 text-center align-middle bg-inherit">
                            <DateCell date={doc?.[tipo]} label={label} tipo={tipo} />
                          </td>
                        ))}
                        <td className="py-2.5 pl-2 pr-3 text-center align-middle">
                          <StatusBadge status={statusTone} />
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
    </div>
  );
};

export default Documentacion;
