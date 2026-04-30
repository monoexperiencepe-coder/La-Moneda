import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronLeft, Filter } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import DocumentationForm from '../../components/Forms/DocumentationForm';
import { formatDate, isExpiringSoon, isExpired } from '../../utils/formatting';
import type { TipoControlFecha, Vehicle } from '../../data/types';

/* ─── Columns ────────────────────────────────────────────────────────── */
const DOC_COLS: { tipo: TipoControlFecha; th: string; label: string }[] = [
  { tipo: 'SOAT', th: 'SOAT', label: 'SOAT' },
  { tipo: 'RT_PARTICULAR', th: 'RT particular', label: 'R.T. Particular' },
  { tipo: 'RT_TAXI', th: 'RT detaxi', label: 'R.T. Detaxi' },
  { tipo: 'AFOCAT_TAXI', th: 'AFOCAT', label: 'AFOCAT' },
];

/* ─── Pivot ──────────────────────────────────────────────────────────── */
type DocPivot = Partial<Record<TipoControlFecha, string>>;

function buildPivot(
  controlFechas: { vehicleId: number | null; tipo: TipoControlFecha; fechaVencimiento: string }[],
): Map<number, DocPivot> {
  const docSet = new Set(DOC_COLS.map((x) => x.tipo));
  const map = new Map<number, DocPivot>();
  for (const c of controlFechas) {
    if (c.vehicleId == null || !docSet.has(c.tipo)) continue;
    const row = map.get(c.vehicleId) ?? {};
    const prev = row[c.tipo];
    if (!prev || c.fechaVencimiento > prev) row[c.tipo] = c.fechaVencimiento;
    map.set(c.vehicleId, row);
  }
  return map;
}

/* ─── Per-date tone ──────────────────────────────────────────────────── */
type Tone = 'empty' | 'ok' | 'soon' | 'late';

function tone(date: string | undefined): Tone {
  if (!date) return 'empty';
  if (isExpired(date)) return 'late';
  if (isExpiringSoon(date, 30)) return 'soon';
  return 'ok';
}

/** Worst tone across all doc types for a vehicle row. */
function rowTone(doc: DocPivot | undefined): Tone {
  if (!doc) return 'empty';
  let worst: Tone = 'empty';
  for (const { tipo } of DOC_COLS) {
    const t = tone(doc[tipo]);
    if (t === 'late') return 'late';
    if (t === 'soon') worst = 'soon';
    else if (t === 'ok' && worst === 'empty') worst = 'ok';
  }
  return worst;
}

/** Earliest upcoming expiry date across doc types (for sorting). */
function nearestExpiry(doc: DocPivot | undefined): string {
  if (!doc) return '9999';
  let nearest = '9999';
  for (const { tipo } of DOC_COLS) {
    const d = doc[tipo];
    if (d && d < nearest) nearest = d;
  }
  return nearest;
}

/* ─── Subcomponents ──────────────────────────────────────────────────── */
const TONE_CELL: Record<Tone, string> = {
  late: 'bg-red-50 text-red-700 font-semibold',
  soon: 'bg-amber-50 text-amber-800 font-semibold',
  ok: 'bg-emerald-50 text-emerald-800',
  empty: 'text-gray-300',
};

const TONE_DOT: Record<Exclude<Tone, 'empty'>, string> = {
  late: 'bg-red-500',
  soon: 'bg-amber-400',
  ok: 'bg-emerald-500',
};

const DateCell: React.FC<{ date?: string; label: string }> = ({ date, label }) => {
  const t = tone(date);
  if (t === 'empty') {
    return <span className="text-gray-300 text-xs select-none" title={`${label}: sin dato`}>—</span>;
  }
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs tabular-nums ${TONE_CELL[t]}`}
      title={`${label}: ${formatDate(date!)}`}
    >
      {formatDate(date!)}
    </span>
  );
};

const StatusBadge: React.FC<{ t: Tone }> = ({ t }) => {
  if (t === 'empty') return <span className="text-gray-300 text-xs">—</span>;
  const labels: Record<Exclude<Tone, 'empty'>, string> = { late: 'Vencido', soon: '≤ 30 d', ok: 'Al día' };
  const cls: Record<Exclude<Tone, 'empty'>, string> = {
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

/* ─── Accordion ──────────────────────────────────────────────────────── */
const Accordion: React.FC<{
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, badge, defaultOpen = false, children }) => (
  <details
    open={defaultOpen}
    className="group rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden"
  >
    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-gray-800 truncate">{title}</span>
        {badge}
      </div>
      <ChevronDown size={16} className="shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="border-t border-gray-100">{children}</div>
  </details>
);

/* ─── Row data ───────────────────────────────────────────────────────── */
interface VehicleRow {
  v: Vehicle;
  doc: DocPivot | undefined;
  wt: Tone;
  nearest: string;
}

/* ─── Page ───────────────────────────────────────────────────────────── */
const Documentacion: React.FC = () => {
  const navigate = useNavigate();
  const { documentaciones, vehicles, controlFechas, addDocumentacion } = useRegistrosContext();
  const { open } = useDrawer();

  const [soloProblemas, setSoloProblemas] = useState(false);
  type SortKey = 'placa' | 'vencimiento';
  const [sortBy, setSortBy] = useState<SortKey>('vencimiento');

  const pivot = useMemo(() => buildPivot(controlFechas), [controlFechas]);

  const getVehicle = (id: number) => vehicles.find((v) => v.id === id);

  /* Build rows with pre-computed worst tone and nearest expiry. */
  const allRows: VehicleRow[] = useMemo(() => {
    return vehicles.map((v) => {
      const doc = pivot.get(v.id);
      return { v, doc, wt: rowTone(doc), nearest: nearestExpiry(doc) };
    });
  }, [vehicles, pivot]);

  const alertCount = useMemo(
    () => allRows.filter((r) => r.wt === 'late' || r.wt === 'soon').length,
    [allRows],
  );

  const visibleRows = useMemo(() => {
    let rows = soloProblemas ? allRows.filter((r) => r.wt === 'late' || r.wt === 'soon') : allRows;
    if (sortBy === 'vencimiento') {
      rows = [...rows].sort((a, b) => a.nearest.localeCompare(b.nearest) || a.v.placa.localeCompare(b.v.placa));
    } else {
      rows = [...rows].sort((a, b) => a.v.placa.localeCompare(b.v.placa));
    }
    return rows;
  }, [allRows, soloProblemas, sortBy]);

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto">

      {/* ── Header ── */}
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
              {vehicles.length} unidad{vehicles.length !== 1 ? 'es' : ''}
              {alertCount > 0 && (
                <span className="ml-1.5 font-semibold text-red-600">· {alertCount} con alerta</span>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => open('documentation')}
          className="shrink-0 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          + Rápido
        </button>
      </div>

      {/* ── Alert strip ── */}
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
            onClick={() => { setSoloProblemas(true); setSortBy('vencimiento'); }}
            className="ml-auto shrink-0 text-[11px] font-semibold text-red-700 hover:underline"
          >
            Ver solo estos →
          </button>
        </div>
      )}

      {/* ── Main table ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
        {/* Table toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="font-medium text-gray-700">Leyenda:</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="size-2 rounded-full bg-red-500" />vencido
            </span>
            <span className="inline-flex items-center gap-1 ml-1.5">
              <span className="size-2 rounded-full bg-amber-400" />≤30 d
            </span>
            <span className="inline-flex items-center gap-1 ml-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />al día
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              type="button"
              onClick={() => setSoloProblemas((p) => !p)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                soloProblemas
                  ? 'border-red-300 bg-red-100 text-red-800'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter size={11} />
              Solo con problemas
            </button>
            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="vencimiento">Ordenar: vencimiento más cercano</option>
              <option value="placa">Ordenar: placa A→Z</option>
            </select>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {soloProblemas ? 'Ningún vehículo con alertas activas 🎉' : 'No hay vehículos cargados'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[540px]">
              <thead>
                <tr className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white border-b border-gray-100">
                  <th className="py-2 pl-3 pr-2 sticky left-0 bg-white z-10" style={{ boxShadow: '2px 0 6px -2px rgba(0,0,0,0.07)' }}>
                    Unidad
                  </th>
                  {DOC_COLS.map(({ tipo, th }) => (
                    <th key={tipo} className="py-2 px-2 text-center whitespace-nowrap">{th}</th>
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
                      {/* Sticky vehicle column */}
                      <td
                        className="py-2.5 pl-3 pr-2 sticky left-0 z-[1] bg-inherit"
                        style={{ boxShadow: '2px 0 6px -2px rgba(0,0,0,0.06)' }}
                      >
                        <div className="font-semibold text-gray-900 text-xs sm:text-sm leading-tight">{v.placa}</div>
                        <div className="text-[10px] text-gray-500 truncate max-w-[9rem] sm:max-w-[13rem]">
                          {v.marca} {v.modelo}
                        </div>
                      </td>
                      {/* Doc date cells */}
                      {DOC_COLS.map(({ tipo, label }) => (
                        <td key={tipo} className="py-2.5 px-2 text-center align-middle">
                          <DateCell date={doc?.[tipo]} label={label} />
                        </td>
                      ))}
                      {/* Status */}
                      <td className="py-2.5 pl-2 pr-3 text-center align-middle">
                        <StatusBadge t={wt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {soloProblemas && (
          <div className="border-t border-gray-100 px-3 py-2 text-center">
            <button
              type="button"
              onClick={() => setSoloProblemas(false)}
              className="text-xs text-purple-600 hover:underline font-medium"
            >
              Mostrar todos los vehículos
            </button>
          </div>
        )}
      </div>

      {/* ── Secondary: Register form ── */}
      <Accordion title="Registrar documentación" badge={
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 font-medium">solo sesión</span>
      }>
        <div className="p-4">
          <DocumentationForm vehicles={vehicles} onSubmit={addDocumentacion} />
        </div>
      </Accordion>

      {/* ── Secondary: Manual history ── */}
      {documentaciones.length > 0 && (
        <Accordion
          title={`Historial manual (${documentaciones.length})`}
          badge={<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 font-medium">no sincroniza con Supabase</span>}
        >
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {documentaciones.map((d) => {
              const vehicle = getVehicle(d.vehicleId);
              const hasAlert = ['soat', 'rtParticular', 'rtDetaxi', 'afocatTaxi'].some((k) => {
                const dt = d[k as keyof typeof d] as string;
                return dt && (isExpired(dt) || isExpiringSoon(dt, 30));
              });
              return (
                <div key={d.id} className="px-4 py-3 grid sm:grid-cols-[1fr,auto] gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {vehicle ? `${vehicle.placa} · ${vehicle.marca}` : `Carro #${d.vehicleId}`}
                    </p>
                    <p className="text-gray-500">{d.motivo} · {formatDate(d.fecha)}</p>
                    {d.notas && <p className="text-gray-400 italic mt-0.5">{d.notas}</p>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 sm:justify-end items-start text-[11px]">
                    {([['SOAT', d.soat], ['RT p.', d.rtParticular], ['RT t.', d.rtDetaxi], ['AFO', d.afocatTaxi]] as [string, string][]).map(
                      ([lb, dt]) =>
                        dt ? (
                          <span key={lb} className="whitespace-nowrap">
                            <span className="text-gray-400">{lb}: </span>
                            <span className={isExpired(dt) ? 'text-red-600 font-medium' : isExpiringSoon(dt, 30) ? 'text-amber-700 font-medium' : 'text-emerald-700'}>
                              {formatDate(dt)}
                            </span>
                          </span>
                        ) : null,
                    )}
                    {hasAlert && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-semibold border border-amber-200 text-[10px]">Revisar</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Accordion>
      )}
    </div>
  );
};

export default Documentacion;
