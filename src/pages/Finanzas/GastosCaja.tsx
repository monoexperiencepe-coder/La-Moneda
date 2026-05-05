import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate, todayStr, toDateOnlyString } from '../../utils/formatting';
import type { GastoCaja } from '../../data/types';

function inRange(fecha: string, desde: string, hasta: string): boolean {
  const d = toDateOnlyString(fecha);
  if (!d) return false;
  return d >= desde && d <= hasta;
}

const GastosCaja: React.FC = () => {
  const navigate = useNavigate();
  const { gastosCaja } = useRegistrosContext();

  const t = todayStr();
  const [desde, setDesde] = useState(() => t.slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(t);
  const [categoria, setCategoria] = useState('');

  const categoriasOptions = useMemo(() => {
    const set = new Set<string>();
    gastosCaja.forEach((g) => set.add(g.categoria || 'CAJA_GENERAL'));
    const list = [...set].sort();
    return [{ value: '', label: 'Todas las categorías' }, ...list.map((c) => ({ value: c, label: c }))];
  }, [gastosCaja]);

  const filtrados = useMemo(() => {
    let d = desde.trim();
    let h = hasta.trim();
    if (!d) d = '2000-01-01';
    if (!h) h = todayStr();
    if (d > h) [d, h] = [h, d];
    return gastosCaja.filter((g) => {
      if (!inRange(g.fecha, d, h)) return false;
      if (categoria && (g.categoria || '') !== categoria) return false;
      return true;
    });
  }, [gastosCaja, desde, hasta, categoria]);

  const totalFiltrado = useMemo(() => filtrados.reduce((s, g) => s + g.monto, 0), [filtrados]);
  const totalGlobal = useMemo(() => gastosCaja.reduce((s, g) => s + g.monto, 0), [gastosCaja]);

  const exportCsv = useCallback(() => {
    const header = ['id', 'fecha', 'concepto', 'monto', 'categoria', 'comentarios'];
    const lines = [header.join(';')];
    for (const g of filtrados) {
      lines.push(
        [
          g.id,
          g.fecha,
          `"${String(g.concepto).replace(/"/g, '""')}"`,
          g.monto.toFixed(2),
          g.categoria,
          `"${String(g.comentarios).replace(/"/g, '""')}"`,
        ].join(';'),
      );
    }
    const bom = '\ufeff';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gastos_caja_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtrados, desde, hasta]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🏧 Gastos de caja</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Movimientos del Excel (hoja GASTOS). No son gastos operativos por vehículo ni entran en la tabla de{' '}
              <strong>Gastos</strong> de unidad.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold shadow-sm"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-xs text-amber-900 font-medium mb-1">Total (filtros activos)</p>
          <p className="text-2xl font-bold text-amber-950 tabular-nums">{formatCurrency(totalFiltrado)}</p>
          <p className="text-[11px] text-amber-800 mt-1">{filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">Total cargado (empresa)</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(totalGlobal)}</p>
          <p className="text-[11px] text-gray-500 mt-1">{gastosCaja.length} registro{gastosCaja.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <Card title="Filtros" subtitle="Rango de fechas por fecha de movimiento; categoría según columna en base.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <Select label="Categoría" options={categoriasOptions} value={categoria} onChange={setCategoria} />
        </div>
      </Card>

      <Card title="Listado" padding={false}>
        <div className="overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50/90">
                <th className="py-3 px-4 font-semibold">Fecha</th>
                <th className="py-3 px-4 font-semibold">Concepto</th>
                <th className="py-3 px-4 font-semibold">Categoría</th>
                <th className="py-3 px-4 font-semibold text-right">Monto</th>
                <th className="py-3 px-4 font-semibold">Comentarios</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    No hay registros con estos filtros. Si acabas de crear la tabla, ejecuta la migración SQL y el script de import.
                  </td>
                </tr>
              ) : (
                filtrados.map((g: GastoCaja) => (
                  <tr key={g.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{formatDate(g.fecha)}</td>
                    <td className="py-2.5 px-4 text-gray-900 max-w-md">
                      <span className="line-clamp-2" title={g.concepto}>
                        {g.concepto}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-600 text-xs font-medium">{g.categoria}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-amber-950">{formatCurrency(g.monto)}</td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs max-w-xs">
                      <span className="line-clamp-2" title={g.comentarios}>
                        {g.comentarios || '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default GastosCaja;
