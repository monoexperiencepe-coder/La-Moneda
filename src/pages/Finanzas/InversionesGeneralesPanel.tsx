import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { fetchInversionesGeneralesVehiculo } from '../../services/inversionesGeneralesVehiculoService';
import type { InversionGeneralVehiculo, Moneda } from '../../data/types';
import { formatCurrency, formatUSD } from '../../utils/formatting';
import { EMPRESA_ID } from '../../config/app';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

type SortKey = 'numero' | 'referencia' | 'placa' | 'modelo' | 'monto' | 'moneda';

function cmpStrEmptyLast(a: string, b: string, mul: 1 | -1): number {
  const ea = !a.trim();
  const eb = !b.trim();
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  return mul * a.localeCompare(b, 'es', { sensitivity: 'base' });
}

/** Orden numérico de monto entre monedas distintas es solo orientativo. */
function compareInversionesRow(a: InversionGeneralVehiculo, b: InversionGeneralVehiculo, key: SortKey, mul: 1 | -1): number {
  switch (key) {
    case 'numero': {
      const na = a.vehiculoNumero ?? 10_000;
      const nb = b.vehiculoNumero ?? 10_000;
      if (na !== nb) return mul * (na - nb);
      return mul * a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    }
    case 'referencia':
      return mul * a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    case 'placa':
      return cmpStrEmptyLast(a.placa ?? '', b.placa ?? '', mul);
    case 'modelo':
      return cmpStrEmptyLast(a.modelo ?? '', b.modelo ?? '', mul);
    case 'monto': {
      const d = a.montoTotal - b.montoTotal;
      if (d !== 0) return mul * d;
      const mc = a.moneda.localeCompare(b.moneda);
      if (mc !== 0) return mc;
      return a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    }
    case 'moneda': {
      const mc = a.moneda.localeCompare(b.moneda);
      if (mc !== 0) return mul * mc;
      return mul * (a.montoTotal - b.montoTotal);
    }
    default:
      return 0;
  }
}

function SortGlyph({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="inline h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
  return dir === 'asc' ? (
    <ChevronUp className="inline h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
  ) : (
    <ChevronDown className="inline h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
  );
}

const InversionesGeneralesPanel: React.FC = () => {
  const [rows, setRows] = useState<InversionGeneralVehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

  const reload = useCallback(async () => {
    if (!EMPRESA_ID) {
      setRows([]);
      setLoading(false);
      setError('Falta VITE_EMPRESA_ID');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInversionesGeneralesVehiculo();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalesPorMoneda = useMemo(() => {
    let penSum = 0;
    let usdSum = 0;
    for (const r of rows) {
      if (r.moneda === 'USD') usdSum += r.montoTotal;
      else penSum += r.montoTotal;
    }
    return { penSum, usdSum };
  }, [rows]);

  const handleSortHeader = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'monto' ? 'desc' : 'asc' };
    });
  }, []);

  const displayRows = useMemo(() => {
    if (!sort.key) return rows;
    const arr = [...rows];
    const mul: 1 | -1 = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => compareInversionesRow(a, b, sort.key!, mul));
    return arr;
  }, [rows, sort]);

  const sortThBtn =
    'inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 rounded px-0.5 -mx-0.5';

  if (!EMPRESA_ID) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Define <code className="text-xs bg-white px-1 rounded">VITE_EMPRESA_ID</code> para ver inversiones generales.
      </p>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-snug">
        Este valor representa el costo total de inversión inicial del vehículo para operar, no un gasto operativo. Ordená la
        tabla desde los encabezados (monto: primer clic de mayor a menor; PEN y USD mezclados solo como referencia numérica).
      </p>

      {loading ? (
        <p className="text-sm text-slate-500 py-6">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          No hay filas en <code className="text-xs bg-slate-100 px-1 rounded">inversiones_generales_vehiculo</code>. Ejecuta la
          migración SQL y el import desde Excel (hoja VALOR DE INVERSION).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">Vehículos con dato</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-violet-950">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">Total invertido (por moneda)</p>
              <div className="mt-1 space-y-1 text-lg font-bold tabular-nums text-violet-950">
                {totalesPorMoneda.usdSum > 0 ? <p>{montoFmt(totalesPorMoneda.usdSum, 'USD')}</p> : null}
                {totalesPorMoneda.penSum > 0 ? <p>{montoFmt(totalesPorMoneda.penSum, 'PEN')}</p> : null}
                {totalesPorMoneda.usdSum <= 0 && totalesPorMoneda.penSum <= 0 ? (
                  <p className="text-slate-500 font-normal text-base">—</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wide text-[10px] sm:text-[11px]">
                  <th className="px-3 py-2" aria-sort={sort.key === 'numero' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('numero')}>
                      N° <SortGlyph active={sort.key === 'numero'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className="px-3 py-2" aria-sort={sort.key === 'referencia' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('referencia')}>
                      Referencia / vehículo <SortGlyph active={sort.key === 'referencia'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className="px-3 py-2" aria-sort={sort.key === 'placa' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('placa')}>
                      Placa <SortGlyph active={sort.key === 'placa'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className="px-3 py-2" aria-sort={sort.key === 'modelo' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('modelo')}>
                      Modelo <SortGlyph active={sort.key === 'modelo'} dir={sort.dir} />
                    </button>
                  </th>
                  <th
                    className="px-3 py-2 text-right"
                    title="Entre PEN y USD el orden por cifra es orientativo."
                    aria-sort={sort.key === 'monto' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className={`${sortThBtn} w-full justify-end`} onClick={() => handleSortHeader('monto')}>
                      Monto total <SortGlyph active={sort.key === 'monto'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className="px-3 py-2" aria-sort={sort.key === 'moneda' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('moneda')}>
                      Moneda <SortGlyph active={sort.key === 'moneda'} dir={sort.dir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-3 py-2 tabular-nums text-slate-600">{r.vehiculoNumero ?? '—'}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.vehiculoReferencia}</td>
                    <td className="px-3 py-2 text-slate-600">{r.placa ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.modelo ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{montoFmt(r.montoTotal, r.moneda)}</td>
                    <td className="px-3 py-2 text-slate-500">{r.moneda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default InversionesGeneralesPanel;
