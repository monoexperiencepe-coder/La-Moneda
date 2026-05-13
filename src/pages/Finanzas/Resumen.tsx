import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import Card from '../../components/Common/Card';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, todayStr, toDateOnlyString } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { calculateKPIs, calculateFinancialKPIs } from '../../utils/calculations';

type ResumenPreset = 'mes_actual' | 'mes_anterior' | 'anio_actual' | 'todo' | 'personalizado';

const CATEGORIA_MAP = [
  { key: 'operativo_vehiculo', label: 'Operativos' },
  { key: 'administrativo_empresa', label: 'Administrativos' },
  { key: 'financiero_prestamo', label: 'Financieros' },
  { key: 'planilla_laboral', label: 'Planilla' },
  { key: 'inversion_compra', label: 'Inversión con utilidad' },
  { key: 'representacion_interna', label: 'Representación interna' },
  { key: 'gastos_globales', label: 'Globales' },
] as const;

function monthRange(year: number, month: number): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const desde = `${year}-${pad(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  const hasta = `${year}-${pad(month)}-${pad(last)}`;
  return { desde, hasta };
}

function monthLabel(month: number): string {
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return names[Math.max(1, Math.min(12, month)) - 1];
}

function getRangeByPreset(
  preset: ResumenPreset,
  customYear: number,
  customMonth: number | 'all',
): { desde: string | null; hasta: string | null; label: string } {
  const t = todayStr();
  const yy = Number(t.slice(0, 4));
  const mm = Number(t.slice(5, 7));
  if (preset === 'mes_actual') {
    const r = monthRange(yy, mm);
    return { ...r, label: 'Mes actual' };
  }
  if (preset === 'mes_anterior') {
    const pm = mm === 1 ? 12 : mm - 1;
    const py = mm === 1 ? yy - 1 : yy;
    const r = monthRange(py, pm);
    return { ...r, label: 'Mes anterior' };
  }
  if (preset === 'anio_actual') {
    return { desde: `${yy}-01-01`, hasta: `${yy}-12-31`, label: 'Año actual' };
  }
  if (preset === 'personalizado') {
    if (customMonth === 'all') {
      return {
        desde: `${customYear}-01-01`,
        hasta: `${customYear}-12-31`,
        label: `Personalizado: ${customYear} (todo el año)`,
      };
    }
    const r = monthRange(customYear, customMonth);
    return { ...r, label: `Personalizado: ${monthLabel(customMonth)} ${customYear}` };
  }
  return { desde: null, hasta: null, label: 'Todo' };
}

function normalizeTipoGasto(raw: string | null | undefined, hasVehicle: boolean): string {
  const t = (raw ?? '').trim();
  if (!t) return hasVehicle ? 'operativo_vehiculo' : 'gastos_globales';
  const legacyMap: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    personal_socios: 'personal_socios_familiares',
    operativo_flota_global: 'gastos_globales',
  };
  const mapped = legacyMap[t] ?? t;
  if (mapped === 'personal_socios_familiares' || mapped === 'representacion_interna' || mapped === 'personales') return 'representacion_interna';
  return mapped;
}

const Resumen: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, vehicles, cajaNegocioVehiculo } = useRegistrosContext();
  const [preset, setPreset] = useState<ResumenPreset>('mes_actual');
  const current = todayStr();
  const currentYear = Number(current.slice(0, 4));
  const currentMonth = Number(current.slice(5, 7));
  const [customYear, setCustomYear] = useState<number>(currentYear);
  const [customMonth, setCustomMonth] = useState<number | 'all'>(currentMonth);
  const range = useMemo(
    () => getRangeByPreset(preset, customYear, customMonth),
    [preset, customYear, customMonth],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const i of ingresos) {
      const y = Number(toDateOnlyString(i.fecha)?.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    for (const g of gastos) {
      const y = Number(toDateOnlyString(g.fecha)?.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    years.add(currentYear);
    return [...years].sort((a, b) => b - a);
  }, [ingresos, gastos, currentYear]);

  const inPeriod = (fecha: string) => {
    const d = toDateOnlyString(fecha);
    if (!d) return false;
    if (!range.desde || !range.hasta) return true;
    return d >= range.desde && d <= range.hasta;
  };

  const ingresosP = useMemo(() => ingresos.filter((i) => inPeriod(i.fecha)), [ingresos, range]);
  const gastosP = useMemo(() => gastos.filter((g) => inPeriod(g.fecha)), [gastos, range]);
  const cajaP = useMemo(() => cajaNegocioVehiculo.filter((row) => inPeriod(row.fecha)), [cajaNegocioVehiculo, range]);

  const totalIngresos = useMemo(() => ingresosP.reduce((s, i) => s + ingresoMontoPEN(i), 0), [ingresosP]);
  const totalGastos = useMemo(() => gastosP.reduce((s, g) => s + g.monto, 0), [gastosP]);
  const totalCajaPeriodo = useMemo(() => cajaP.reduce((s, x) => s + x.monto, 0), [cajaP]);
  const resultadoNeto = totalIngresos - totalGastos;
  const margenPct = totalIngresos > 0 ? (resultadoNeto / totalIngresos) * 100 : null;

  const pendienteIngresos = useMemo(
    () => ingresosP.filter((i) => (i.estadoPago ?? '').toUpperCase() === 'PENDIENTE'),
    [ingresosP],
  );
  const pendienteMonto = useMemo(
    () => pendienteIngresos.reduce((s, i) => s + ingresoMontoPEN(i), 0),
    [pendienteIngresos],
  );

  const hasData = ingresosP.length > 0 || gastosP.length > 0;

  const distribucion = useMemo(() => {
    const total = totalGastos;
    const acc: Record<string, number> = Object.fromEntries(CATEGORIA_MAP.map((c) => [c.key, 0]));
    for (const g of gastosP) {
      const k = normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null);
      if (acc[k] != null) acc[k] += g.monto;
    }
    return CATEGORIA_MAP.map((c) => {
      const monto = acc[c.key] ?? 0;
      const pct = total > 0 ? (monto / total) * 100 : 0;
      return { key: c.key, label: c.label, monto, pct };
    }).sort((a, b) => b.monto - a.monto);
  }, [gastosP, totalGastos]);

  const byKey = Object.fromEntries(distribucion.map((d) => [d.key, d.monto]));
  const alertas = useMemo(() => {
    const out: { tone: 'danger' | 'warning' | 'success'; text: string }[] = [];
    if (resultadoNeto < 0) out.push({ tone: 'danger', text: 'Resultado del período negativo (gastos superan ingresos).' });
    if (totalIngresos > 0 && (byKey.financiero_prestamo ?? 0) > totalIngresos * 0.3) {
      out.push({ tone: 'danger', text: 'Gasto financiero alto respecto a ingresos del período.' });
    }
    if (totalIngresos > 0 && (byKey.planilla_laboral ?? 0) > totalIngresos * 0.25) {
      out.push({ tone: 'warning', text: 'Planilla elevada frente a ingresos del período.' });
    }
    if (totalGastos > 0 && (byKey.gastos_globales ?? 0) > totalGastos * 0.1) {
      out.push({ tone: 'warning', text: 'Gastos globales relevantes: conviene revisar clasificación.' });
    }
    if (!out.length) out.push({ tone: 'success', text: 'Sin alertas críticas en las reglas automáticas.' });
    return out;
  }, [resultadoNeto, totalIngresos, totalGastos, byKey]);

  const alertasUrgentes = alertas.filter((a) => a.tone !== 'success');
  const alertaOk = alertas.find((a) => a.tone === 'success');

  const topOperativosVehiculo = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of gastosP) {
      const k = normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null);
      if (k !== 'operativo_vehiculo') continue;
      if (g.vehicleId == null) continue;
      map.set(g.vehicleId, (map.get(g.vehicleId) ?? 0) + g.monto);
    }
    return [...map.entries()]
      .map(([vehicleId, monto]) => {
        const v = vehicles.find((x) => x.id === vehicleId);
        const name = v ? `${v.marca} ${v.modelo} (${v.placa})` : `Unidad #${vehicleId}`;
        return { vehicleId, name, monto };
      })
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);
  }, [gastosP, vehicles]);

  const legacy = useMemo(() => calculateKPIs(ingresosP, gastosP, []), [ingresosP, gastosP]);
  const intel = useMemo(() => calculateFinancialKPIs(ingresosP, gastosP), [ingresosP, gastosP]);

  const fmt = (v: number) => (hasData ? formatCurrency(v) : '—');

  const quickLinkClass =
    'inline-flex items-center gap-1 rounded-xl border border-violet-200/80 bg-white px-3 py-2 text-xs font-semibold text-violet-900 shadow-sm hover:bg-violet-50 sm:text-sm';

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8 animate-fade-in">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/90">Finanzas</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resumen ejecutivo</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vista rápida del período. El detalle por módulo está en Ingresos, Gastos o Reportes.
          </p>
        </div>
      </div>

      <Card title="Período" subtitle={`${range.label}${range.desde && range.hasta ? ` · ${range.desde} → ${range.hasta}` : ''}`}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'mes_actual', label: 'Mes actual' },
              { id: 'mes_anterior', label: 'Mes anterior' },
              { id: 'anio_actual', label: 'Año actual' },
              { id: 'todo', label: 'Todo' },
              { id: 'personalizado', label: 'Personalizado' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                preset === p.id
                  ? 'border-violet-400 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'personalizado' && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select className="input-field" value={customYear} onChange={(e) => setCustomYear(Number(e.target.value))}>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">Todo el año</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {alertasUrgentes.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-950">Atención</p>
          <ul className="mt-2 space-y-2">
            {alertasUrgentes.map((a, i) => (
              <li
                key={`${a.text}-${i}`}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  a.tone === 'danger'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-amber-200 bg-amber-100/80 text-amber-950'
                }`}
              >
                {a.text}
              </li>
            ))}
          </ul>
        </div>
      ) : alertaOk ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-center text-sm font-medium text-emerald-900">
          {alertaOk.text}
        </p>
      ) : null}

      {/* Héroe: un solo número + contexto */}
      <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/90 to-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-800/90">Resultado del período</p>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
          {hasData ? formatCurrency(resultadoNeto) : '—'}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">Ingresos</span> del período menos{' '}
          <span className="font-semibold text-slate-800">todos los gastos</span> registrados (todas las categorías). Es distinto
          del &quot;margen&quot; del menú principal, que usa solo gastos operativos.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 border-t border-violet-100 pt-5 sm:grid-cols-3">
          <div className="rounded-xl bg-white/90 px-3 py-3 text-center ring-1 ring-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ingresos</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-800">{fmt(totalIngresos)}</p>
          </div>
          <div className="rounded-xl bg-white/90 px-3 py-3 text-center ring-1 ring-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gastos (total)</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-red-800">{fmt(totalGastos)}</p>
          </div>
          <div className="rounded-xl bg-white/90 px-3 py-3 text-center ring-1 ring-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sobre ingresos</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {hasData && margenPct != null ? `${margenPct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Utilidad operativa (ref.)</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(intel.utilidad_operativa)}</p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">Ingresos − solo gastos operativos.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Caja negocio (mismo período)</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-teal-900">{fmt(totalCajaPeriodo)}</p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">Movimientos aparte de alquiler y operativo.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cobros pendientes</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-900">
              {pendienteIngresos.length > 0 ? formatCurrency(pendienteMonto) : '—'}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              {pendienteIngresos.length > 0 ? (
                <>
                  {pendienteIngresos.length} en este período ·{' '}
                  <Link to="/finanzas/ingresos?cobro=pendiente" className="font-semibold text-amber-800 underline">
                    Ver en Ingresos
                  </Link>
                </>
              ) : (
                'Ninguno en las fechas elegidas.'
              )}
            </p>
          </div>
        </div>
      </section>

      <Card title="¿Dónde se fueron los gastos?" subtitle="Partes del total de gastos del período.">
        {totalGastos <= 0 ? (
          <p className="text-sm text-slate-500">Sin gastos en este período.</p>
        ) : (
          <div className="space-y-3">
            {distribucion.map((d) => (
              <div key={d.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{d.label}</span>
                  <span className="tabular-nums text-slate-600">
                    {formatCurrency(d.monto)} · {d.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-violet-500"
                    style={{ width: `${Math.max(0, Math.min(100, d.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Mayor costo operativo por unidad" subtitle="Solo categoría operativos en este período.">
        {topOperativosVehiculo.length === 0 ? (
          <p className="text-sm text-slate-500">Sin gastos operativos en el período.</p>
        ) : (
          <div className="space-y-2">
            {topOperativosVehiculo.map((x, idx) => (
              <div key={x.vehicleId} className="flex items-center justify-between text-sm">
                <span className="text-slate-800">
                  {idx + 1}. {x.name}
                </span>
                <span className="font-semibold tabular-nums text-red-700">{formatCurrency(x.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ir al detalle</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/finanzas/ingresos" className={quickLinkClass}>
            Ingresos <ArrowRight size={14} className="opacity-70" />
          </Link>
          <Link to="/finanzas/gastos" className={quickLinkClass}>
            Gastos <ArrowRight size={14} className="opacity-70" />
          </Link>
          <Link to="/finanzas/reportes" className={quickLinkClass}>
            Reportes <ArrowRight size={14} className="opacity-70" />
          </Link>
          <Link to="/finanzas/caja-negocio" className={quickLinkClass}>
            Utilidad / caja <ArrowRight size={14} className="opacity-70" />
          </Link>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Tendencias mes a mes y comparativas: <strong>Reportes</strong>.
        </p>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-800">Desglose contable (equipo)</summary>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">Margen menú Finanzas (solo operativos)</p>
            <p className="mt-1 tabular-nums">Ingresos: {formatCurrency(legacy.totalIngresos)}</p>
            <p className="tabular-nums">Gastos operativos: {formatCurrency(legacy.totalGastos)}</p>
            <p className="mt-1 font-semibold tabular-nums text-violet-900">Margen: {formatCurrency(legacy.margenNeto)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">Buckets financieros (mismo período)</p>
            <p className="tabular-nums">Operativos: {formatCurrency(intel.gastos_operativos)}</p>
            <p className="tabular-nums">Financieros: {formatCurrency(intel.gastos_financieros)}</p>
            <p className="tabular-nums">Adm. + planilla: {formatCurrency(intel.gastos_administrativos)}</p>
            <p className="mt-1 font-semibold tabular-nums">Utilidad neta simple: {formatCurrency(intel.utilidad_neta_simple)}</p>
          </div>
        </div>
      </details>
    </div>
  );
};

export default Resumen;
