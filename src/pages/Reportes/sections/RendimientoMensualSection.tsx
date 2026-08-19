import React, { useEffect, useMemo, useState } from 'react';
import type { Descuento, Gasto, Ingreso } from '../../../data/types';
import { MESES } from '../../../data/catalogs';
import { useAmountDisplay } from '../../../hooks/useAmountDisplay';
import { ingresoMontoPEN } from '../../../utils/moneda';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';
import { UpdatingChrome } from '../../../components/Loading';

interface RendimientoMensualSectionProps {
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos: Descuento[];
}

type MesRow = {
  mesLabel: string;
  ingresos: number;
  gastos: number;
  descuentos: number;
  resultado: number;
  hayMovimiento: boolean;
};

const RendimientoMensualSection: React.FC<RendimientoMensualSectionProps> = ({ ingresos, gastos, descuentos }) => {
  const { formatGlobalAmount } = useAmountDisplay();

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    const touch = (fecha: string) => {
      const y = Number(String(fecha).slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    };
    for (const i of ingresos) touch(i.fecha);
    for (const g of gastos) touch(g.fecha);
    for (const d of descuentos) touch(d.fecha);
    return [...ys].sort((a, b) => b - a);
  }, [ingresos, gastos, descuentos]);

  const [chartYear, setChartYear] = useState('');

  useEffect(() => {
    if (availableYears.length === 0) {
      setChartYear('');
      return;
    }
    setChartYear((prev) => {
      const n = prev ? Number(prev) : NaN;
      if (prev && Number.isFinite(n) && availableYears.includes(n)) return prev;
      return String(availableYears[0]);
    });
  }, [availableYears]);

  const { deferred: deferredChartYear, isRecalculating } = useDeferredRecalc(chartYear);
  const displayYear = deferredChartYear || chartYear;
  const chartYearNum = displayYear ? Number(displayYear) : NaN;

  const filasMes: MesRow[] = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) {
      return MESES.map((mes) => ({
        mesLabel: mes.label,
        ingresos: 0,
        gastos: 0,
        descuentos: 0,
        resultado: 0,
        hayMovimiento: false,
      }));
    }
    const prefix = `${chartYearNum}-`;
    return MESES.map((mes) => {
      const mm = String(mes.value).padStart(2, '0');
      const ing = ingresos
        .filter((i) => i.fecha.startsWith(prefix) && i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      const gas = gastos
        .filter((g) => g.fecha.startsWith(prefix) && g.fecha.slice(5, 7) === mm)
        .reduce((s, g) => s + g.monto, 0);
      const reb = descuentos
        .filter((d) => d.fecha.startsWith(prefix) && d.fecha.slice(5, 7) === mm)
        .reduce((s, d) => s + d.monto, 0);
      const resultado = ing - gas;
      return {
        mesLabel: mes.label,
        ingresos: ing,
        gastos: gas,
        descuentos: reb,
        resultado,
        hayMovimiento: ing !== 0 || gas !== 0 || reb !== 0,
      };
    });
  }, [ingresos, gastos, descuentos, chartYearNum]);

  const totalesAnio = useMemo(
    () =>
      filasMes.reduce(
        (acc, row) => ({
          ingresos: acc.ingresos + row.ingresos,
          gastos: acc.gastos + row.gastos,
          descuentos: acc.descuentos + row.descuentos,
          resultado: acc.resultado + row.resultado,
        }),
        { ingresos: 0, gastos: 0, descuentos: 0, resultado: 0 },
      ),
    [filasMes],
  );

  const mesesConMovimiento = useMemo(() => filasMes.filter((r) => r.hayMovimiento), [filasMes]);

  const statsMeses = useMemo(() => {
    if (mesesConMovimiento.length === 0) return null;
    let mejor = mesesConMovimiento[0];
    let peor = mesesConMovimiento[0];
    for (const m of mesesConMovimiento) {
      if (m.resultado > mejor.resultado) mejor = m;
      if (m.resultado < peor.resultado) peor = m;
    }
    return { mejor, peor };
  }, [mesesConMovimiento]);

  const maxAbsResultado = useMemo(() => {
    let m = 1;
    for (const r of filasMes) {
      if (r.hayMovimiento) m = Math.max(m, Math.abs(r.resultado));
    }
    return m;
  }, [filasMes]);

  const resultadoPositivo = totalesAnio.resultado >= 0;

  return (
    <section className="space-y-5 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Resultado general mensual</h2>
        <p className="mt-1 text-sm text-slate-600">
          Resultado del negocio por mes: ingresos − todos los gastos (misma definición que Resumen).
        </p>
        <p className="mt-1 text-sm text-slate-600">Mes por mes: cuánto entró, cuánto salió en total y qué quedó.</p>
      </div>

      {/* Año */}
      <div className="flex flex-wrap gap-2">
        {availableYears.length > 0 ? (
          availableYears.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setChartYear(String(y))}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                chartYear === String(y)
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'border border-slate-200/90 bg-white/95 text-slate-700 hover:border-violet-300 hover:shadow-sm backdrop-blur-sm'
              }`}
            >
              {y}
            </button>
          ))
        ) : (
          <p className="text-sm text-slate-500">Aún no hay datos para mostrar.</p>
        )}
      </div>

      {chartYear ? (
        <div className="filter-surface space-y-5">
          <UpdatingChrome active={isRecalculating} />
          <div className="space-y-5 stagger-children">
          {/* Resumen del año — lenguaje dueño */}
          <div
            className={`rounded-2xl border p-5 sm:p-6 backdrop-blur-sm ${
              resultadoPositivo
                ? 'border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white'
                : 'border-rose-200 bg-gradient-to-b from-rose-50/70 to-white'
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resultado del año {displayYear}</p>
            <p
              className={`mt-2 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl ${
                resultadoPositivo ? 'text-emerald-900' : 'text-rose-900'
              }`}
            >
              {formatGlobalAmount(totalesAnio.resultado)}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {resultadoPositivo ? (
                <>
                  En {displayYear}, después de todos los gastos registrados, el negocio cerró con{' '}
                  <strong>{formatGlobalAmount(totalesAnio.resultado)}</strong> a favor.
                </>
              ) : (
                <>
                  En {displayYear} los gastos superaron lo que entró por{' '}
                  <strong>{formatGlobalAmount(Math.abs(totalesAnio.resultado))}</strong>.
                </>
              )}
            </p>
            {totalesAnio.descuentos > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Descuentos del período:{' '}
                <strong className="text-slate-700">{formatGlobalAmount(totalesAnio.descuentos)}</strong>{' '}
                (no incluidos en el resultado; son una métrica operativa separada).
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ResumenChip label="Total que entró" value={formatGlobalAmount(totalesAnio.ingresos)} tone="emerald" />
            <ResumenChip label="Total que salió" value={formatGlobalAmount(totalesAnio.gastos)} tone="rose" />
            {statsMeses ? (
              <ResumenChip
                label="Mejor mes"
                value={`${statsMeses.mejor.mesLabel} · ${formatGlobalAmount(statsMeses.mejor.resultado)}`}
                tone="slate"
                small
              />
            ) : (
              <ResumenChip label="Meses con datos" value={String(mesesConMovimiento.length)} tone="slate" />
            )}
          </div>

          {/* Tabla simple */}
          <div className="glass-panel overflow-hidden border-slate-200 p-0">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
              <h3 className="text-sm font-bold text-slate-900">Detalle mes a mes</h3>
              <p className="mt-0.5 text-xs text-slate-500">Todos los gastos del negocio en la columna «Salió» (misma fórmula que Resumen).</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 sm:px-5">Mes</th>
                    <th className="px-3 py-3 text-right">Entró</th>
                    <th className="px-3 py-3 text-right">Salió</th>
                    <th className="px-4 py-3 text-right sm:px-5">Te quedó</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filasMes.map((row) => (
                    <MesTableRow key={row.mesLabel} row={row} maxAbs={maxAbsResultado} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-semibold text-slate-900">
                    <td className="px-4 py-3 sm:px-5">Total {displayYear}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-800">
                      {formatGlobalAmount(totalesAnio.ingresos)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-800">
                      {formatGlobalAmount(totalesAnio.gastos)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums sm:px-5 ${
                        resultadoPositivo ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      {formatGlobalAmount(totalesAnio.resultado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {statsMeses && statsMeses.peor.mesLabel !== statsMeses.mejor.mesLabel ? (
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
                El mes más difícil fue <strong className="text-slate-700">{statsMeses.peor.mesLabel}</strong> (
                {formatGlobalAmount(statsMeses.peor.resultado)}).
              </p>
            ) : null}
          </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

function ResumenChip({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'slate';
  small?: boolean;
}) {
  const bg =
    tone === 'emerald'
      ? 'border-emerald-100 bg-emerald-50/60'
      : tone === 'rose'
        ? 'border-rose-100 bg-rose-50/60'
        : 'border-slate-100 bg-slate-50/80';
  const lbl =
    tone === 'emerald' ? 'text-emerald-800' : tone === 'rose' ? 'text-rose-800' : 'text-slate-600';
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${lbl}`}>{label}</p>
      <p className={`mt-1 font-bold tabular-nums text-slate-900 ${small ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

function MesTableRow({ row, maxAbs }: { row: MesRow; maxAbs: number }) {
  const { formatGlobalAmount } = useAmountDisplay();
  if (!row.hayMovimiento) {
    return (
      <tr className="text-slate-400">
        <td className="px-4 py-2.5 font-medium sm:px-5">{row.mesLabel}</td>
        <td colSpan={3} className="px-4 py-2.5 text-xs italic sm:px-5">
          Sin movimientos registrados
        </td>
      </tr>
    );
  }

  const barPct = Math.min(100, (Math.abs(row.resultado) / maxAbs) * 100);
  const barPos = row.resultado >= 0;

  return (
    <tr className="hover:bg-slate-50/80">
      <td className="px-4 py-3 font-medium text-slate-900 sm:px-5">
        <span className="block">{row.mesLabel}</span>
        <span className="mt-1.5 block h-1.5 max-w-[120px] overflow-hidden rounded-full bg-slate-100">
          <span
            className={`block h-full rounded-full ${barPos ? 'bg-emerald-400' : 'bg-rose-400'}`}
            style={{ width: `${barPct}%` }}
          />
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatGlobalAmount(row.ingresos)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatGlobalAmount(row.gastos)}</td>
      <td
        className={`px-4 py-3 text-right font-semibold tabular-nums sm:px-5 ${
          row.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'
        }`}
      >
        {formatGlobalAmount(row.resultado)}
      </td>
    </tr>
  );
}

export default RendimientoMensualSection;
