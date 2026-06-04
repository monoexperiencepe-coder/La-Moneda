import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CalendarClock, Gauge, PiggyBank, Sparkles, Target, TrendingUp } from 'lucide-react';
import Input from '../../components/Common/Input';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { calculateKPIs } from '../../utils/calculations';
import { useUtilidadRealCalculos } from '../../hooks/useUtilidadRealCalculos';
import { buildMetasGuia } from '../../utils/metasGuiaCoach';
import { ingresoMontoPEN } from '../../utils/moneda';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';
;

const STORAGE_KEY = 'laMoneda_metas_v1';

type MetasStored = {
  /** Meta de unidades activas al cierre del año en curso */
  targetActiveUnits: number | null;
};

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

function daysUntilCalendarYearEnd(now = new Date()): number {
  const y = now.getFullYear();
  const end = new Date(y, 11, 31, 23, 59, 59);
  const d = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, d);
}

function monthsApproxFromDays(days: number): number {
  return Math.max(1, Math.round(days / 30.44));
}

const Metas: React.FC = () => {
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, descuentos, inversionesVehiculo } = useRegistrosContext();

  const kpis = useMemo(() => calculateKPIs(ingresos, gastos, descuentos), [ingresos, gastos, descuentos]);

  const gastosOp = useMemo(() => gastosOperativosSolamente(gastos), [gastos]);

  const activos = useMemo(() => vehicles.filter((v) => v.activo).length, [vehicles]);
  const inactivos = useMemo(() => vehicles.filter((v) => !v.activo).length, [vehicles]);

  const { porVehiculo, gastosReadyForUtilidad } = useUtilidadRealCalculos({
    pantalla: 'Metas.margenMediano',
  });

  const rentability = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return porVehiculo
      .map((row) => {
        const vehicle = vehicles.find((v) => v.id === row.vehicleId);
        if (!vehicle) return null;
        return {
          vehicle,
          totalIngresos: row.ingresosTotal,
          totalGastos: row.gastosTotal,
          totalDescuentos: 0,
          margen: row.utilidadReal,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => b.margen - a.margen);
  }, [porVehiculo, vehicles, gastosReadyForUtilidad]);

  const margenes = useMemo(() => rentability.map((r) => r.margen), [rentability]);
  const margenMediano = useMemo(() => median(margenes), [margenes]);

  const year = new Date().getFullYear();
  const yearPrefix = `${year}-`;

  const ingresosYtdPorVehiculoPromedio = useMemo(() => {
    if (activos <= 0) return null;
    const ingYtd = ingresos
      .filter((i) => i.fecha.startsWith(yearPrefix))
      .reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const mesesTranscurridos = Math.max(1, new Date().getMonth() + 1);
    return ingYtd / activos / mesesTranscurridos;
  }, [ingresos, activos, yearPrefix]);

  const medianaInversionPorUnidad = useMemo(() => {
    const byVeh = new Map<number, number>();
    for (const inv of inversionesVehiculo) {
      const vid = inv.vehicleId;
      if (vid == null) continue;
      const pen = inv.totalInversionPen;
      if (pen == null || pen <= 0) continue;
      byVeh.set(vid, (byVeh.get(vid) ?? 0) + pen);
    }
    return median([...byVeh.values()]);
  }, [inversionesVehiculo]);

  const [targetInput, setTargetInput] = useState('');
  const [savedTarget, setSavedTarget] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as MetasStored;
      if (parsed.targetActiveUnits != null && Number.isFinite(parsed.targetActiveUnits)) {
        setSavedTarget(Math.round(parsed.targetActiveUnits));
        setTargetInput(String(Math.round(parsed.targetActiveUnits)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((n: number | null) => {
    const payload: MetasStored = { targetActiveUnits: n };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setSavedTarget(n);
  }, []);

  const handleGuardarMeta = () => {
    const n = Number(String(targetInput).replace(/\s/g, ''));
    if (!Number.isFinite(n) || n < 1) {
      persist(null);
      setTargetInput('');
      return;
    }
    persist(Math.round(n));
    setTargetInput(String(Math.round(n)));
  };

  const diasRestantes = useMemo(() => daysUntilCalendarYearEnd(), []);
  const mesesApprox = monthsApproxFromDays(diasRestantes);

  const metaNumerica = savedTarget;
  const brecha =
    metaNumerica != null ? Math.max(0, Math.round(metaNumerica) - activos) : null;
  const ritmoMensual =
    brecha != null && brecha > 0 ? brecha / mesesApprox : brecha === 0 ? 0 : null;

  const capitalOrdenMagnitud =
    medianaInversionPorUnidad != null && brecha != null && brecha > 0
      ? brecha * medianaInversionPorUnidad
      : null;

  const guia = useMemo(
    () =>
      buildMetasGuia({
        year,
        activos,
        totalVehiculos: vehicles.length,
        inactivos,
        metaUnits: metaNumerica,
        brechaUnits: brecha,
        diasHastaFinAnio: diasRestantes,
        mesesAprox: mesesApprox,
        ritmoMensualUnidades: ritmoMensual,
        kpis,
        margenMedianoVehiculo: margenMediano,
        ingresoMensualPromedioPorActivo: ingresosYtdPorVehiculoPromedio,
        medianaInversionPen: medianaInversionPorUnidad,
        capitalIncrementalEstimado: capitalOrdenMagnitud,
        rentability,
      }, formatGlobalAmount),
    [
      year,
      activos,
      vehicles.length,
      inactivos,
      metaNumerica,
      brecha,
      diasRestantes,
      mesesApprox,
      ritmoMensual,
      kpis,
      margenMediano,
      ingresosYtdPorVehiculoPromedio,
      medianaInversionPorUnidad,
      capitalOrdenMagnitud,
      rentability,
      formatGlobalAmount,
    ],
  );

  const aplicarDelta = (delta: number) => {
    const next = Math.max(1, activos + delta);
    setTargetInput(String(next));
    persist(next);
  };

  const establecerMetaExacta = (n: number) => {
    setTargetInput(String(n));
    persist(n);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          aria-label="Volver"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="text-primary-600 shrink-0" size={26} aria-hidden />
            Metas · Plan de flota
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Guía con tus datos actuales: ritmo, brechas y órdenes de magnitud (no es pronóstico financiero).
          </p>
        </div>
      </div>

      {/* Contexto temporal */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-soft flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="p-2.5 rounded-xl bg-slate-900 text-white">
            <CalendarClock size={22} aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Horizonte</p>
            <p className="text-sm font-bold text-slate-900">
              Hasta 31 dic {year}
            </p>
            <p className="text-xs text-slate-500">
              ~{diasRestantes} días · ~{mesesApprox} meses (aprox.)
            </p>
          </div>
        </div>
        <div className="h-10 w-px bg-slate-200 hidden sm:block" />
        <div className="flex items-center gap-3 flex-1 min-w-[180px]">
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
            <Gauge size={22} aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Flota hoy</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{activos} activas</p>
            <p className="text-xs text-slate-500">{vehicles.length} vehículos en sistema</p>
          </div>
        </div>
      </div>

      {/* Definir meta */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800">Tu meta para fin de año</h2>
        <p className="text-xs text-gray-500">
          Ejemplo: llegar a <strong>100 unidades activas</strong> o incorporar <strong>20 más</strong> que las que tienes hoy.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Unidades activas objetivo (31 dic)"
              type="number"
              min={1}
              placeholder={`Ej. ${Math.max(activos + 10, 50)}`}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleGuardarMeta}
            className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold shadow-sm shrink-0"
          >
            Guardar meta
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] text-gray-400 self-center mr-1">Atajos:</span>
          <button
            type="button"
            onClick={() => aplicarDelta(5)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            +5 vs hoy
          </button>
          <button
            type="button"
            onClick={() => aplicarDelta(10)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            +10 vs hoy
          </button>
          <button
            type="button"
            onClick={() => aplicarDelta(20)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            +20 vs hoy
          </button>
          <button
            type="button"
            onClick={() => establecerMetaExacta(100)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100"
          >
            Meta 100 activas
          </button>
        </div>
      </div>

      {/* Copiloto: guía desde datos */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50/90 shadow-soft">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-indigo-400/15 to-transparent rounded-bl-[100%]" aria-hidden />
        <div className="relative p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles size={22} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-indigo-950 flex items-center gap-2 flex-wrap">
                Copiloto de metas
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-100/90 px-2 py-0.5 rounded-md">
                  lectura automática
                </span>
              </h2>
              <p className="text-xs text-indigo-800/80 mt-1 leading-relaxed">
                Texto generado con reglas sobre tu flota, márgenes e inversiones cargadas. No usa chat externo; puedes conectar un
                modelo de IA después vía API si lo deseas.
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug border-l-4 border-indigo-500 pl-3">{guia.headline}</p>
          <div className="space-y-4">
            {guia.bloques.map((bloque) => (
              <div key={bloque.titulo} className="rounded-xl bg-white/85 border border-indigo-100/90 p-4 shadow-sm">
                <h3 className="text-[11px] font-bold text-indigo-900 uppercase tracking-wide mb-2">{bloque.titulo}</h3>
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  {bloque.items.map((txt, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-indigo-500 shrink-0 font-bold">·</span>
                      <span>{txt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">{guia.pie}</p>
        </div>
      </div>

      {/* Camino */}
      {metaNumerica != null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-600" aria-hidden />
            Camino hasta la meta
          </h2>
          {metaNumerica <= activos ? (
            <p className="text-sm text-emerald-700 font-medium">
              Ya cumples o superas la meta ({activos} ≥ {metaNumerica}). Sube el objetivo si quieres planificar más crecimiento.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Brecha</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">{brecha} unidades</p>
                </div>
                <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
                  <p className="text-[11px] text-primary-700 font-semibold uppercase tracking-wide">Ritmo necesario</p>
                  <p className="text-2xl font-bold text-primary-900 tabular-nums">
                    ~{ritmoMensual != null ? ritmoMensual.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-primary-700 mt-1">unidades / mes (aprox.)</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                  <p className="text-[11px] text-amber-800 font-semibold uppercase tracking-wide">Recordatorio</p>
                  <p className="text-xs text-amber-900 leading-snug mt-1">
                    Es un <strong>promedio</strong>: en la práctica algunos meses traen más altas y otros menos (compras, documentación,
                    baja de unidades).
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lectura de tus datos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800">Qué dicen tus números (referencia)</h2>
        <p className="text-xs text-gray-500">
          Sirven para contextualizar el esfuerzo; cada unidad nueva puede rendir distinto al histórico.
        </p>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3 items-start">
            <span className="mt-0.5 text-emerald-600 shrink-0">
              <TrendingUp size={18} aria-hidden />
            </span>
            <div>
              <span className="font-semibold text-gray-800">Margen mediano por vehículo activo (histórico Fact)</span>
              <p className="text-gray-600 tabular-nums mt-0.5">
                {margenMediano != null ? formatGlobalAmount(margenMediano) : 'Sin datos suficientes'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Mitad de tu flota activa está por encima y mitad por debajo de este margen acumulado (ingresos − gastos operativos +
                rebajes).
              </p>
            </div>
          </li>
          <li className="flex gap-3 items-start">
            <span className="mt-0.5 text-sky-600 shrink-0">
              <Gauge size={18} aria-hidden />
            </span>
            <div>
              <span className="font-semibold text-gray-800">Ingresos del año · promedio mensual por activo</span>
              <p className="text-gray-600 tabular-nums mt-0.5">
                {ingresosYtdPorVehiculoPromedio != null
                  ? `${formatGlobalAmount(ingresosYtdPorVehiculoPromedio)} / mes / vehículo`
                  : 'Sin activos o sin ingresos'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Aproximación: total ingresos {year} entre unidades activas y meses transcurridos del año.
              </p>
            </div>
          </li>
          <li className="flex gap-3 items-start">
            <span className="mt-0.5 text-violet-600 shrink-0">
              <PiggyBank size={18} aria-hidden />
            </span>
            <div>
              <span className="font-semibold text-gray-800">Inversión registrada · mediana por unidad</span>
              <p className="text-gray-600 tabular-nums mt-0.5">
                {medianaInversionPorUnidad != null ? formatGlobalAmount(medianaInversionPorUnidad) : 'Sin inversiones en PEN'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Suma de filas <code className="text-[10px] bg-gray-100 px-1 rounded">inversiones_vehiculo</code> por vehículo. Solo
                orden de magnitud si tus compras futuras son parecidas.
              </p>
            </div>
          </li>
        </ul>

        {capitalOrdenMagnitud != null && brecha != null && brecha > 0 && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/80 px-4 py-3 text-sm">
            <p className="font-semibold text-violet-950">Capital incremental (muy burdo)</p>
            <p className="text-violet-900 tabular-nums mt-1 text-lg font-bold">{formatGlobalAmount(capitalOrdenMagnitud)}</p>
            <p className="text-[11px] text-violet-800 mt-2 leading-relaxed">
              {brecha} × mediana de inversión por unidad. Ignora financiamiento, demoras y costos no cargados en tabla de inversiones.
            </p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Revisa el ranking por margen y ajusta metas con datos frescos.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/reportes')}
            className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-100"
          >
            Reportes
          </button>
          <button
            type="button"
            onClick={() => navigate('/vehiculos/inventario')}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            Inventario
          </button>
        </div>
      </div>
    </div>
  );
};

export default Metas;
