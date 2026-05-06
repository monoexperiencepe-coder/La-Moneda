import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, ChevronDown, ChevronLeft, Download, ListFilter } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate, todayStr, toDateOnlyString } from '../../utils/formatting';
import { gastoCajaComentarioParaLista } from '../../utils/gastoCajaDisplay';
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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

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

  /** Rango que cubre todos los movimientos cargados (para «ver todo el historial»). */
  const rangoHistorialCompleto = useMemo(() => {
    const hoy = todayStr();
    if (!gastosCaja.length) return { desde: '2000-01-01', hasta: hoy };
    let min = '';
    let max = '';
    for (const g of gastosCaja) {
      const d = toDateOnlyString(g.fecha);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { desde: min || '2000-01-01', hasta: max || hoy };
  }, [gastosCaja]);

  const verTodoElHistorial = useCallback(() => {
    setDesde(rangoHistorialCompleto.desde);
    setHasta(rangoHistorialCompleto.hasta);
    setCategoria('');
  }, [rangoHistorialCompleto]);

  const mostrandoHistorialCompleto =
    gastosCaja.length > 0 &&
    categoria === '' &&
    desde === rangoHistorialCompleto.desde &&
    hasta === rangoHistorialCompleto.hasta;

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
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 shrink-0"
        >
          <Download size={16} aria-hidden />
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            aria-expanded={filtrosAbiertos}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 transition-colors"
          >
            <ListFilter size={18} className="text-amber-700 shrink-0" aria-hidden />
            Filtros
            <ChevronDown
              size={16}
              className={`text-gray-500 shrink-0 transition-transform duration-200 ${filtrosAbiertos ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={verTodoElHistorial}
            disabled={gastosCaja.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/90 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm hover:border-amber-300 hover:from-amber-100 hover:to-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 transition-colors"
            title={gastosCaja.length === 0 ? 'Sin datos' : 'Ver todos los movimientos cargados'}
          >
            <CalendarRange size={17} className="shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            Todo el historial
          </button>
        </div>
        {!filtrosAbiertos && (
          <p className="text-xs text-gray-500 pl-0.5">
            Rango actual: <span className="font-medium text-gray-700">{desde}</span> →{' '}
            <span className="font-medium text-gray-700">{hasta}</span>
            {categoria ? (
              <>
                {' '}
                · <span className="font-medium text-gray-700">{categoria}</span>
              </>
            ) : null}
            {' · '}
            <button
              type="button"
              onClick={() => setFiltrosAbiertos(true)}
              className="text-amber-700 hover:text-amber-900 underline underline-offset-2 font-medium"
            >
              Cambiar filtros
            </button>
          </p>
        )}
      </div>

      {filtrosAbiertos && (
        <Card title="Filtros" subtitle="Rango de fechas por fecha de movimiento; categoría según columna en base.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <Select label="Categoría" options={categoriasOptions} value={categoria} onChange={setCategoria} />
          </div>
          {mostrandoHistorialCompleto && (
            <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Mostrando todos los movimientos cargados ({gastosCaja.length} registros). Usa las fechas o categoría para acotar.
            </p>
          )}
        </Card>
      )}

      <Card title="Listado" padding={false}>
        {/* Mobile cards */}
        <div className="block md:hidden px-3 py-3 space-y-2.5">
          {filtrados.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No hay registros con estos filtros. Si acabas de crear la tabla, ejecuta la migración SQL y el script de import.
            </div>
          ) : (
            filtrados.map((g: GastoCaja) => {
              const notaVisible = gastoCajaComentarioParaLista(g.comentarios);
              const comentarioCrudo = g.comentarios?.trim() ?? '';
              return (
                <div key={g.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400 font-medium">{formatDate(g.fecha)}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5 line-clamp-2">{g.concepto}</p>
                    </div>
                    <p className="text-sm font-bold text-amber-950 tabular-nums shrink-0">{formatCurrency(g.monto)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5 truncate">
                      {g.categoria}
                    </span>
                    <p className="text-[11px] text-gray-500 truncate text-right" title={comentarioCrudo || undefined}>
                      {notaVisible ?? '—'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50/90">
                <th className="py-3 px-4 font-semibold">Fecha</th>
                <th className="py-3 px-4 font-semibold">Concepto</th>
                <th className="py-3 px-4 font-semibold">Categoría</th>
                <th className="py-3 px-4 font-semibold text-right">Monto</th>
                <th className="py-3 px-4 font-semibold" title="Referencias Excel/revertidos se ocultan aquí; pasa el mouse para ver el texto guardado.">
                  Notas
                </th>
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
                filtrados.map((g: GastoCaja) => {
                  const notaVisible = gastoCajaComentarioParaLista(g.comentarios);
                  const comentarioCrudo = g.comentarios?.trim() ?? '';
                  return (
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
                      <span className="line-clamp-2" title={comentarioCrudo || undefined}>
                        {notaVisible ?? '—'}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default GastosCaja;
