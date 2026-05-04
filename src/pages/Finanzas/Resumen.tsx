import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import Card from '../../components/Common/Card';
import Select from '../../components/Common/Select';
import Input from '../../components/Common/Input';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, todayStr, toDateOnlyString } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { esControlFechaSinAlertaVencimiento } from '../../data/controlFechaCatalog';
import type { Vehicle, Ingreso, Gasto, KilometrajeRegistro, ControlFecha } from '../../data/types';

function monthRange(year: number, month: number): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const desde = `${year}-${pad(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  const hasta = `${year}-${pad(month)}-${pad(last)}`;
  return { desde, hasta };
}

function diffDaysToday(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export interface ResumenVehiculoFila {
  vehicle: Vehicle;
  totalIngresos: number;
  totalGastos: number;
  utilidad: number;
  nIngresos: number;
  nGastos: number;
  ultimoKm: number | null;
  vencidos: number;
  proximos30: number;
}

/** Cruza filas con `vehicle_id` bigint / number / string sin mismatch por tipo en runtime. */
function vehicleIdMatch(rowVid: number | null | undefined, vehId: number): boolean {
  if (rowVid == null) return false;
  return Number(rowVid) === Number(vehId);
}

function buildRows(
  vehicles: Vehicle[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  kilometrajes: KilometrajeRegistro[],
  controlFechas: ControlFecha[],
  desde: string,
  hasta: string,
): ResumenVehiculoFila[] {
  const inPeriod = (fecha: string) => {
    const d = toDateOnlyString(fecha);
    return d !== '' && d >= desde && d <= hasta;
  };

  return vehicles.map((v) => {
    const ingFiltrados = ingresos.filter((i) => vehicleIdMatch(i.vehicleId, v.id) && inPeriod(i.fecha));
    const gasFiltrados = gastos.filter((g) => vehicleIdMatch(g.vehicleId, v.id) && inPeriod(g.fecha));

    const totalIngresos = ingFiltrados.reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const totalGastos = gasFiltrados.reduce((s, g) => s + g.monto, 0);

    const kmRows = kilometrajes
      .filter((k) => vehicleIdMatch(k.vehicleId, v.id) && toDateOnlyString(k.fecha) <= hasta)
      .sort((a, b) => {
        const fd = b.fecha.localeCompare(a.fecha);
        if (fd !== 0) return fd;
        return b.id - a.id;
      });
    const ultimoKm = kmRows[0]?.kilometraje ?? null;

    const fechasV = controlFechas.filter((c) => vehicleIdMatch(c.vehicleId, v.id));
    let vencidos = 0;
    let proximos30 = 0;
    for (const c of fechasV) {
      if (esControlFechaSinAlertaVencimiento(c.tipo)) continue;
      const d = diffDaysToday(c.fechaVencimiento);
      if (d < 0) vencidos++;
      else if (d <= 30) proximos30++;
    }

    return {
      vehicle: v,
      totalIngresos,
      totalGastos,
      utilidad: totalIngresos - totalGastos,
      nIngresos: ingFiltrados.length,
      nGastos: gasFiltrados.length,
      ultimoKm,
      vencidos,
      proximos30,
    };
  });
}

const PERIODO_TIPO = [
  { value: 'mes', label: 'Mes calendario' },
  { value: 'rango', label: 'Rango de fechas' },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Suma días a una fecha YYYY-MM-DD en calendario local. */
function addDaysLocal(iso: string, deltaDays: number): string {
  const [yy, mm, dd] = iso.split('-').map(Number);
  const d = new Date(yy, (mm ?? 1) - 1, dd ?? 1);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const MESES = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const Resumen: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, kilometrajes, controlFechas } = useRegistrosContext();

  const now = new Date();
  const [periodMode, setPeriodMode] = useState<'mes' | 'rango'>('mes');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [filterVehicleId, setFilterVehicleId] = useState('');

  const [rangeDesde, setRangeDesde] = useState(() => monthRange(now.getFullYear(), now.getMonth() + 1).desde);
  const [rangeHasta, setRangeHasta] = useState(() => monthRange(now.getFullYear(), now.getMonth() + 1).hasta);

  const y = Number(year) || now.getFullYear();
  const m = Math.min(12, Math.max(1, Number(month) || 1));

  const { desde, hasta } = useMemo(() => {
    if (periodMode === 'mes') return monthRange(y, m);
    let d = rangeDesde.trim();
    let h = rangeHasta.trim();
    if (!d) d = todayStr();
    if (!h) h = todayStr();
    if (d > h) [d, h] = [h, d];
    return { desde: d, hasta: h };
  }, [periodMode, y, m, rangeDesde, rangeHasta]);

  /** Toda la flota: el Excel RESUMEN suele incluir unidades aunque estén inactivas si tienen movimiento. */
  const baseVehicles = useMemo(
    () => [...vehicles].sort((a, b) => a.id - b.id),
    [vehicles],
  );

  const vehiclesForTable = useMemo(() => {
    if (!filterVehicleId) return baseVehicles;
    const id = Number(filterVehicleId);
    return baseVehicles.filter((v) => v.id === id);
  }, [baseVehicles, filterVehicleId]);

  const rows = useMemo(
    () =>
      buildRows(vehiclesForTable, ingresos, gastos, kilometrajes, controlFechas, desde, hasta),
    [vehiclesForTable, ingresos, gastos, kilometrajes, controlFechas, desde, hasta],
  );

  const totales = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        totalIngresos: acc.totalIngresos + r.totalIngresos,
        totalGastos: acc.totalGastos + r.totalGastos,
        utilidad: acc.utilidad + r.utilidad,
        nIngresos: acc.nIngresos + r.nIngresos,
        nGastos: acc.nGastos + r.nGastos,
        vencidos: acc.vencidos + r.vencidos,
        proximos30: acc.proximos30 + r.proximos30,
      }),
      {
        totalIngresos: 0,
        totalGastos: 0,
        utilidad: 0,
        nIngresos: 0,
        nGastos: 0,
        vencidos: 0,
        proximos30: 0,
      },
    );
  }, [rows]);

  const yearsOptions = useMemo(() => {
    const cur = now.getFullYear();
    let minY = cur - 15;
    let maxY = cur + 1;
    const bump = (s: string) => {
      const d = toDateOnlyString(s);
      if (d.length >= 4) {
        const y = Number(d.slice(0, 4));
        if (Number.isFinite(y)) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    };
    ingresos.forEach((i) => bump(i.fecha));
    gastos.forEach((g) => bump(g.fecha));
    const list: { value: string; label: string }[] = [];
    for (let yy = maxY; yy >= minY; yy--) list.push({ value: String(yy), label: String(yy) });
    return list;
  }, [now, ingresos, gastos]);

  const vehicleFilterOptions = [
    { value: '', label: 'Todos los vehículos' },
    ...baseVehicles.map((v) => ({
      value: String(v.id),
      label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
    })),
  ];

  const exportCsv = useCallback(() => {
    const header = [
      'ID',
      'Placa',
      'Marca',
      'Modelo',
      'Ingresos_S/',
      'Gastos_S/',
      'Utilidad_S/',
      'N_ingresos',
      'N_gastos',
      'Ultimo_km',
      'Vencidos',
      'Proximos_30d',
    ];
    const lines = [header.join(';')];
    for (const r of rows) {
      lines.push(
        [
          r.vehicle.id,
          r.vehicle.placa,
          r.vehicle.marca,
          r.vehicle.modelo,
          r.totalIngresos.toFixed(2),
          r.totalGastos.toFixed(2),
          r.utilidad.toFixed(2),
          r.nIngresos,
          r.nGastos,
          r.ultimoKm ?? '',
          r.vencidos,
          r.proximos30,
        ].join(';'),
      );
    }
    lines.push(
      [
        'TOTAL',
        '',
        '',
        '',
        totales.totalIngresos.toFixed(2),
        totales.totalGastos.toFixed(2),
        totales.utilidad.toFixed(2),
        totales.nIngresos,
        totales.nGastos,
        '',
        totales.vencidos,
        totales.proximos30,
      ].join(';'),
    );
    const bom = '\ufeff';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resumen_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, totales, desde, hasta]);

  const periodoLabel =
    periodMode === 'mes'
      ? `${MESES.find((x) => x.value === String(m))?.label ?? m} ${y}`
      : `${desde} → ${hasta}`;

  const applyPresetRango = (preset: 'este_mes' | 'mes_anterior' | 'ultimos_30' | 'anio_calendario') => {
    const t = todayStr();
    const ty = Number(t.slice(0, 4));
    const tm = Number(t.slice(5, 7));
    if (preset === 'este_mes') {
      const mr = monthRange(ty, tm);
      setRangeDesde(mr.desde);
      setRangeHasta(mr.hasta);
      return;
    }
    if (preset === 'mes_anterior') {
      let pm = tm - 1;
      let py = ty;
      if (pm < 1) {
        pm = 12;
        py -= 1;
      }
      const mr = monthRange(py, pm);
      setRangeDesde(mr.desde);
      setRangeHasta(mr.hasta);
      return;
    }
    if (preset === 'ultimos_30') {
      setRangeHasta(t);
      setRangeDesde(addDaysLocal(t, -29));
      return;
    }
    /* Año natural según la fecha "desde" (si eliges otro año, ajústalo en el date picker antes). */
    const yRef = Number((rangeDesde || t).slice(0, 4));
    setRangeDesde(`${yRef}-01-01`);
    setRangeHasta(`${yRef}-12-31`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📋 Resumen</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Por periodo y vehículo (estilo Excel RESUMEN) — mes completo o rango libre; datos desde ingresos, gastos, KMS y vencimientos
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

      <Card title="Filtros" subtitle={`Periodo activo: ${desde} → ${hasta}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            label="Tipo de periodo"
            options={[...PERIODO_TIPO]}
            value={periodMode}
            onChange={(v) => {
              const mode = v as 'mes' | 'rango';
              setPeriodMode(mode);
              if (mode === 'rango') {
                const mr = monthRange(y, m);
                setRangeDesde(mr.desde);
                setRangeHasta(mr.hasta);
              }
            }}
          />
          {periodMode === 'mes' ? (
            <>
              <Select label="Año" options={yearsOptions} value={year} onChange={setYear} />
              <Select label="Mes" options={MESES} value={month} onChange={setMonth} />
            </>
          ) : (
            <>
              <Input
                label="Desde"
                type="date"
                value={rangeDesde}
                onChange={(e) => setRangeDesde(e.target.value)}
              />
              <Input
                label="Hasta"
                type="date"
                value={rangeHasta}
                onChange={(e) => setRangeHasta(e.target.value)}
              />
            </>
          )}
          <Select
            label="Vehículo"
            options={vehicleFilterOptions}
            value={filterVehicleId}
            onChange={setFilterVehicleId}
          />
        </div>

        {periodMode === 'rango' && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 mr-1">Atajos:</span>
            <button
              type="button"
              onClick={() => applyPresetRango('este_mes')}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-200 font-medium text-gray-700"
            >
              Este mes
            </button>
            <button
              type="button"
              onClick={() => applyPresetRango('mes_anterior')}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-200 font-medium text-gray-700"
            >
              Mes anterior
            </button>
            <button
              type="button"
              onClick={() => applyPresetRango('ultimos_30')}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-200 font-medium text-gray-700"
            >
              Últimos 30 días
            </button>
            <button
              type="button"
              onClick={() => applyPresetRango('anio_calendario')}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-violet-50 hover:border-violet-200 font-medium text-gray-700"
              title="Usa el año de la fecha «Desde» (cámbiala para otro año)"
            >
              Año completo ({Number((rangeDesde || todayStr()).slice(0, 4))})
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Ingresos/gastos usan <strong>fecha de movimiento</strong> dentro del periodo. En <strong>rango</strong> puedes cruzar meses o trimestres.
          Si ves ceros, revisa fechas o el año donde cargaste datos. Último km: último KMS con fecha ≤ fin del periodo. Vencimientos: estado actual (no dependen del periodo).
        </p>
      </Card>

      <Card title={`Resumen — ${periodoLabel}`} padding={false}>
        <div className="overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50/90">
                <th className="py-3 px-4 font-semibold">Vehículo</th>
                <th className="py-3 px-4 font-semibold text-right">Ingresos</th>
                <th className="py-3 px-4 font-semibold text-right">Gastos</th>
                <th className="py-3 px-4 font-semibold text-right">Utilidad</th>
                <th className="py-3 px-4 font-semibold text-center">N° ing.</th>
                <th className="py-3 px-4 font-semibold text-center">N° gas.</th>
                <th className="py-3 px-4 font-semibold text-right">Último km</th>
                <th className="py-3 px-4 font-semibold text-center">Venc.</th>
                <th className="py-3 px-4 font-semibold text-center">≤30 d</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    No hay vehículos en la flota para este filtro.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.vehicle.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900">
                        #{r.vehicle.id} {r.vehicle.marca} {r.vehicle.modelo}
                      </span>
                      <span className="block text-xs text-gray-500">{r.vehicle.placa}</span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-emerald-700 font-medium">
                      {formatCurrency(r.totalIngresos)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-red-600 font-medium">
                      {formatCurrency(r.totalGastos)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right tabular-nums font-bold ${
                        r.utilidad >= 0 ? 'text-emerald-800' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(r.utilidad)}
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums text-gray-700">{r.nIngresos}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-gray-700">{r.nGastos}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-800">
                      {r.ultimoKm != null ? r.ultimoKm.toLocaleString('es-PE') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.vencidos > 0 ? (
                        <span className="inline-flex min-w-[1.75rem] justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                          {r.vencidos}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.proximos30 > 0 ? (
                        <span className="inline-flex min-w-[1.75rem] justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                          {r.proximos30}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-200">
                  <td className="py-3 px-4 text-slate-900">Totales</td>
                  <td className="py-3 px-4 text-right tabular-nums text-emerald-800">
                    {formatCurrency(totales.totalIngresos)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-red-700">
                    {formatCurrency(totales.totalGastos)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right tabular-nums ${
                      totales.utilidad >= 0 ? 'text-emerald-900' : 'text-red-800'
                    }`}
                  >
                    {formatCurrency(totales.utilidad)}
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums">{totales.nIngresos}</td>
                  <td className="py-3 px-4 text-center tabular-nums">{totales.nGastos}</td>
                  <td className="py-3 px-4 text-right text-slate-400">—</td>
                  <td className="py-3 px-4 text-center tabular-nums text-red-800">{totales.vencidos}</td>
                  <td className="py-3 px-4 text-center tabular-nums text-amber-900">{totales.proximos30}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Resumen;
