import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Descuento, Gasto, Ingreso } from '../../../data/types';
import { MESES } from '../../../data/catalogs';
import { gastosOperativosSolamente } from '../../../utils/cajaNegocio';
import { ingresoMontoPEN } from '../../../utils/moneda';
import { exportGastosCsv, exportIngresosCsv, exportMensualCsv } from '../../../utils/reportesExport';

interface ExportarSectionProps {
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos: Descuento[];
}

const ExportarSection: React.FC<ExportarSectionProps> = ({ ingresos, gastos, descuentos }) => {
  const gastosOp = useMemo(() => gastosOperativosSolamente(gastos), [gastos]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    const touch = (f: string) => {
      const y = Number(f.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    };
    for (const i of ingresos) touch(i.fecha);
    for (const g of gastosOp) touch(g.fecha);
    return [...ys].sort((a, b) => b - a);
  }, [ingresos, gastosOp]);

  const [exportYear, setExportYear] = useState(() => String(years[0] ?? new Date().getFullYear()));

  const mensualRows = useMemo(() => {
    const y = Number(exportYear);
    if (!Number.isFinite(y)) return [];
    const prefix = `${y}-`;
    return MESES.map((mes) => {
      const mm = String(mes.value).padStart(2, '0');
      const ing = ingresos
        .filter((i) => i.fecha.startsWith(prefix) && i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      const gas = gastosOp
        .filter((g) => g.fecha.startsWith(prefix) && g.fecha.slice(5, 7) === mm)
        .reduce((s, g) => s + g.monto, 0);
      const reb = descuentos
        .filter((d) => d.fecha.startsWith(prefix) && d.fecha.slice(5, 7) === mm)
        .reduce((s, d) => s + d.monto, 0);
      return { mes: mes.label, ingresos: ing, gastos: gas, utilidad: ing - gas + reb };
    });
  }, [ingresos, gastosOp, descuentos, exportYear]);

  return (
    <section className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Exportar información</h2>
        <p className="mt-1 text-sm text-slate-600">Descarga CSV para Excel o análisis externo. Sin PDF por ahora.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-1">
        <ExportButton
          title="Exportar gastos"
          description="Todos los gastos registrados (incluye categorías financieras)."
          onClick={() => exportGastosCsv(gastos)}
        />
        <ExportButton
          title="Exportar ingresos"
          description="Todos los ingresos con monto en soles de referencia."
          onClick={() => exportIngresosCsv(ingresos)}
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-900">Exportar reporte mensual</p>
              <p className="mt-0.5 text-sm text-slate-500">Ingresos, gastos operativos y resultado por mes.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {years.length > 0 ? (
                <select
                  value={exportYear}
                  onChange={(e) => setExportYear(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => exportMensualCsv(exportYear, mensualRows)}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
              >
                <Download size={16} />
                Descargar CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function ExportButton({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
    >
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
        <Download size={18} />
      </span>
    </button>
  );
}

export default ExportarSection;
