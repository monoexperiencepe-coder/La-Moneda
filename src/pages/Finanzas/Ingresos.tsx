import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Modal from '../../components/Common/Modal';
import { ColumnCountHintTh } from '../../components/Common/ColumnCountHintTh';
import IncomeForm from '../../components/Forms/IncomeForm';
import type { Ingreso } from '../../data/types';
import Select from '../../components/Common/Select';
import { todayStr } from '../../utils/formatting';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { ingresoMontoPEN } from '../../utils/moneda';
import {
  ingresosExtraordinariosTotal,
  ingresosVehicularesTotal,
} from '../../utils/ingresoAlcance';
import { MESES } from '../../data/catalogs';
import { filterRowsByYearMonth } from '../../utils/filterByYearMonth';
import { useCopilotNarrativeNavigation } from '../../hooks/useCopilotNarrativeNavigation';
import type { CopilotFocusSpec } from '../../modules/copilot/copilotFocusTarget';
import type { NarrativeStep } from '../../modules/copilot/navigationNarrative';
import { resolveIncomeMonthFocusTarget } from '../../modules/copilot/navigationNarrative/resolveIncomeMonthTarget';
import CopilotEvidenceSlot from '../../components/Copilot/CopilotEvidenceSlot';
import { findUltimoIngreso, formatUltimoIngresoLabel } from '../../utils/ingresoUltimoRegistro';
import {
  ingresoPromedioMensualDivisor,
  ingresoPromedioMensualLabel,
} from '../../utils/ingresoPromedioMensual';

const IngresosMesChart = lazy(() => import('../../components/Finanzas/IngresosMesChart'));

const Ingresos: React.FC = () => {
  const { formatGlobalAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { ingresos, vehicles, deleteIngreso, addIngreso, upsertIngreso, toast } = useRegistrosContext();

  /** Ranking por vehículo: mostrar toda la flota o solo unidades con al menos 1 ingreso en el período. */
  const [rankingVehicleScope, setRankingVehicleScope] = useState<'all' | 'with_moves'>('all');
  /** Orden de filas en ranking por vehículo (orden de flota = por id de vehículo). */
  const [rankingVehicleSort, setRankingVehicleSort] = useState<'fleet' | 'moves' | 'total'>('fleet');
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [registrarSaving, setRegistrarSaving] = useState(false);
  const [prefillVehicleId, setPrefillVehicleId] = useState<number | null>(null);
  const [formInstanceKey, setFormInstanceKey] = useState(0);

  useEffect(() => {
    if (searchParams.get('registrar') !== '1') return;
    const raw = searchParams.get('vehicleId');
    const vid = raw ? Number(raw) : NaN;
    setPrefillVehicleId(Number.isFinite(vid) && vid > 0 ? vid : null);
    setFormInstanceKey((k) => k + 1);
    setRegistrarOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('registrar');
    next.delete('vehicleId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const y = searchParams.get('year');
    const m = searchParams.get('month');
    const hm = searchParams.get('highlightMonth');
    if (y && /^\d{4}$/.test(y)) {
      setHistoryYear(y);
      setChartYear(y);
    }
    if (m && /^(0?[1-9]|1[0-2])$/.test(m)) {
      const mm = String(m).padStart(2, '0');
      setHistoryMonth(mm);
      setChartMonth(mm);
    }
    if (hm && /^(0?[1-9]|1[0-2])$/.test(hm)) {
      const mm = String(hm).padStart(2, '0');
      setChartMonth(mm);
      if (y && /^\d{4}$/.test(y)) setChartYear(y);
    }
  }, [searchParams]);

  const openRegistrarModal = () => {
    setPrefillVehicleId(null);
    setFormInstanceKey((k) => k + 1);
    setRegistrarOpen(true);
  };

  const closeRegistrarModal = () => {
    setRegistrarOpen(false);
    setPrefillVehicleId(null);
  };

  const handleRegistrarIngreso = async (data: Omit<Ingreso, 'id' | 'createdAt'>) => {
    const created = await addIngreso(data);
    if (!created) return;
    const enPeriodo = filterRowsByYearMonth([created], historyYear, historyMonth).length > 0;
    if (!enPeriodo) {
      toast.info('Registro guardado, pero no aparece por el filtro actual.');
    }
    closeRegistrarModal();
  };

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const i of ingresos) {
      const y = Number(i.fecha.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [ingresos]);

  const [chartYear, setChartYear] = useState<string>('');
  const [chartMonth, setChartMonth] = useState<string>('ALL');
  const [historyYear, setHistoryYear] = useState<string>('ALL');
  const [historyMonth, setHistoryMonth] = useState<string>('ALL');
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const prevTotalRef = useRef(0);

  const applyNarrativeFilters = useCallback((step: NarrativeStep) => {
    if (step.applyYear != null) {
      const y = String(step.applyYear);
      setChartYear(y);
      setHistoryYear(y);
    }
    if (step.applyMonth != null) {
      const mm = String(step.applyMonth).padStart(2, '0');
      if (step.target === 'income-month') {
        setChartMonth('ALL');
        setHistoryMonth('ALL');
      } else {
        setChartMonth(mm);
        setHistoryMonth(mm);
      }
    }
  }, []);

  useCopilotNarrativeNavigation({
    resolveTarget: (step) => {
      if (step.target === 'ai-evidence-card') {
        return document.querySelector('[data-copilot-target="ai-evidence-card"]') as HTMLElement | null;
      }
      const month = step.applyMonth ?? (step.target === 'income-month' ? step.applyMonth : null);
      if (month != null) {
        const year = step.applyYear ?? (chartYear !== 'ALL' ? chartYear : undefined);
        const resolved = resolveIncomeMonthFocusTarget(month, year);
        if (resolved) return resolved.el;
      }

      if (
        step.target === 'copilot-income-summary'
        || step.target === '#copilot-income-summary'
        || step.target === 'income-month'
      ) {
        return document.getElementById('copilot-income-summary');
      }
      return document.getElementById(step.target.replace(/^#/, ''));
    },
    resolveTargetFromSpec: (spec: CopilotFocusSpec) => {
      if (spec.scrollTarget === 'ai-evidence-card') {
        return document.querySelector('[data-copilot-target="ai-evidence-card"]') as HTMLElement | null;
      }
      if (spec.highlightMonth) {
        const year = searchParams.get('year') ?? (chartYear !== 'ALL' ? chartYear : undefined);
        const resolved = resolveIncomeMonthFocusTarget(spec.highlightMonth, year ?? undefined);
        if (resolved) return resolved.el;
      }
      if (spec.scrollTarget === 'income-summary' || spec.highlightMonth) {
        return document.getElementById('copilot-income-summary');
      }
      return document.getElementById('copilot-scroll-target');
    },
    onApplyFilters: applyNarrativeFilters,
  });

  useEffect(() => {
    if (availableYears.length === 0) {
      setChartYear('');
      return;
    }
    setChartYear((prev) => {
      if (prev === 'ALL') return 'ALL';
      const n = prev ? Number(prev) : NaN;
      if (prev && Number.isFinite(n) && availableYears.includes(n)) return prev;
      return String(availableYears[0]);
    });
  }, [availableYears]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setHistoryYear('ALL');
      return;
    }
    setHistoryYear((prev) => {
      if (prev === 'ALL') return prev;
      const n = Number(prev);
      if (Number.isFinite(n) && availableYears.includes(n)) return prev;
      return 'ALL';
    });
  }, [availableYears]);

  const chartYearNum = chartYear && chartYear !== 'ALL' ? Number(chartYear) : NaN;

  const chartMonthLabel = useMemo(() => {
    if (chartMonth === 'ALL') return '';
    return MESES.find((m) => String(m.value).padStart(2, '0') === chartMonth)?.label ?? '';
  }, [chartMonth]);

  const ingresosChartBase = useMemo(() => {
    if (chartYear === 'ALL') return ingresos;
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return ingresos.filter((i) => i.fecha.startsWith(prefix));
  }, [ingresos, chartYear, chartYearNum]);

  const ingresosVistaGrafico = useMemo(() => {
    if (chartMonth === 'ALL') return ingresosChartBase;
    const mm = chartMonth.padStart(2, '0');
    return ingresosChartBase.filter((i) => i.fecha.slice(5, 7) === mm);
  }, [ingresosChartBase, chartMonth]);

  const totalAnioGrafico = ingresosChartBase.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalVistaGrafico = ingresosVistaGrafico.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalVehicularVista = useMemo(
    () => ingresosVehicularesTotal(ingresosVistaGrafico),
    [ingresosVistaGrafico],
  );
  const totalExtraordinarioVista = useMemo(
    () => ingresosExtraordinariosTotal(ingresosVistaGrafico),
    [ingresosVistaGrafico],
  );

  useEffect(() => {
    const from = prevTotalRef.current;
    const to = totalVistaGrafico;
    if (Math.abs(to - from) < 0.01) {
      setAnimatedTotal(to);
      return;
    }
    const duration = 420;
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedTotal(from + (to - from) * eased);
      if (p < 1) rafId = requestAnimationFrame(tick);
      else prevTotalRef.current = to;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [totalVistaGrafico]);

  const chartData = useMemo(() => {
    if (chartYear === 'ALL') {
      const yearsSet = new Set<number>();
      for (const i of ingresosChartBase) {
        const y = Number(i.fecha.slice(0, 4));
        if (Number.isFinite(y) && y > 0) yearsSet.add(y);
      }
      const yearsSorted = [...yearsSet].sort((a, b) => a - b);
      if (chartMonth === 'ALL') {
        return yearsSorted.map((y) => {
          const prefix = `${y}-`;
          const total = ingresosChartBase
            .filter((i) => i.fecha.startsWith(prefix))
            .reduce((s, i) => s + ingresoMontoPEN(i), 0);
          return { mes: String(y), total };
        });
      }
      const mm = chartMonth.padStart(2, '0');
      return yearsSorted.map((y) => {
        const total = ingresosChartBase
          .filter((i) => i.fecha.startsWith(`${y}-`) && i.fecha.slice(5, 7) === mm)
          .reduce((s, i) => s + ingresoMontoPEN(i), 0);
        return { mes: String(y), total };
      });
    }
    if (chartMonth === 'ALL') {
      return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
        const total = ingresosChartBase
          .filter((i) => i.fecha.slice(5, 7) === month)
          .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: mes.label.slice(0, 3), total };
      });
    }
    if (!Number.isFinite(chartYearNum) || chartMonth.length !== 2) return [];
    const mNum = Number(chartMonth);
    if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) return [];
    const dMax = new Date(chartYearNum, mNum, 0).getDate();
    const mm = chartMonth.padStart(2, '0');
    return Array.from({ length: dMax }, (_, idx) => {
      const d = idx + 1;
      const dd = String(d).padStart(2, '0');
      const iso = `${chartYearNum}-${mm}-${dd}`;
      const total = ingresosChartBase
        .filter((i) => i.fecha === iso)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: String(d), total };
    });
  }, [chartYear, chartMonth, chartYearNum, ingresosChartBase]);

  const chartBucket = chartYear === 'ALL' ? 'year' : chartMonth === 'ALL' ? 'month' : 'day';

  const chartMonthAgg = useMemo(() => {
    if (chartMonth === 'ALL') return null;
    const rows = ingresosVistaGrafico;
    const count = rows.length;
    const total = rows.reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const avgPerMov = count > 0 ? total / count : 0;
    return { count, total, avgPerMov };
  }, [chartMonth, ingresosVistaGrafico]);

  const allYearsRollup = useMemo(() => {
    if (chartYear !== 'ALL') return null;
    const byYear = new Map<number, number>();
    const data = chartMonth === 'ALL' ? ingresosChartBase : ingresosVistaGrafico;
    for (const i of data) {
      const y = Number(i.fecha.slice(0, 4));
      if (!Number.isFinite(y) || y <= 0) continue;
      byYear.set(y, (byYear.get(y) ?? 0) + ingresoMontoPEN(i));
    }
    const yearCount = byYear.size;
    const totalAgg = [...byYear.values()].reduce((s, v) => s + v, 0);
    const avgPerYear = yearCount ? totalAgg / yearCount : 0;
    let peakYear = 0;
    let peakTotal = 0;
    for (const [y, t] of byYear) {
      if (t > peakTotal) {
        peakTotal = t;
        peakYear = y;
      }
    }
    return { yearCount, avgPerYear, peakYear, peakTotal };
  }, [chartYear, chartMonth, ingresosChartBase, ingresosVistaGrafico]);

  const chartYearInsights = useMemo(() => {
    if (chartYear === 'ALL' || !Number.isFinite(chartYearNum)) {
      return {
        avgMonthly: 0,
        peakLabel: '—',
        peakTotal: 0,
        peakMonth: '',
        avgMonthsLabel: '',
      };
    }
    const monthsDivisor = ingresoPromedioMensualDivisor(chartYearNum);
    const avgMonthly = totalAnioGrafico / monthsDivisor;
    const avgMonthsLabel = ingresoPromedioMensualLabel(chartYearNum);
    let peakTotal = 0;
    let peakLabel = '—';
    let peakMonth = '';
    for (const mes of MESES) {
      const mm = String(mes.value).padStart(2, '0');
      const monthTotal = ingresosChartBase
        .filter((i) => i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      if (monthTotal > peakTotal) {
        peakTotal = monthTotal;
        peakLabel = mes.label;
        peakMonth = mm;
      }
    }
    if (peakTotal <= 0) peakLabel = '—';
    return { avgMonthly, peakLabel, peakTotal, peakMonth, avgMonthsLabel };
  }, [chartYear, chartYearNum, totalAnioGrafico, ingresosChartBase]);

  const monthlyFocusRows = useMemo(() => {
    if (chartYear === 'ALL' || !Number.isFinite(chartYearNum)) return [];
    const peakMonth = chartYearInsights.peakMonth;
    return MESES.map((mes) => {
      const mm = String(mes.value).padStart(2, '0');
      const total = ingresosChartBase
        .filter((i) => i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return {
        month: mm,
        label: mes.label,
        total,
        isPeak: mm === peakMonth && total > 0,
      };
    }).filter((row) => row.total > 0);
  }, [chartYear, chartYearNum, ingresosChartBase, chartYearInsights.peakMonth]);

  const todayTotal = useMemo(
    () => ingresos.filter((i) => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0),
    [ingresos],
  );

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const chartYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...yearOptions],
    [yearOptions],
  );

  const monthFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todo el año' },
      ...MESES.map((m) => ({
        value: String(m.value).padStart(2, '0'),
        label: m.label,
      })),
    ],
    [],
  );

  const vistaRankingLabel = useMemo(() => {
    const yLabel = chartYear === 'ALL' ? 'todos los años' : chartYear || '—';
    if (chartMonth === 'ALL') return yLabel;
    return `${chartMonthLabel} · ${yLabel}`;
  }, [chartYear, chartMonth, chartMonthLabel]);

  const historyMonthOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todos los meses' },
      ...MESES.map((m) => ({
        value: String(m.value).padStart(2, '0'),
        label: m.label,
      })),
    ],
    [],
  );

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...yearOptions],
    [yearOptions],
  );

  const ingresosHistorialFiltrados = useMemo(
    () => filterRowsByYearMonth(ingresos, historyYear, historyMonth),
    [ingresos, historyYear, historyMonth],
  );

  const historialEmptyHint = useMemo(() => {
    if (ingresos.length === 0) return 'No hay ingresos registrados.';
    const parts: string[] = [];
    if (historyYear !== 'ALL') parts.push(`año ${historyYear}`);
    if (historyMonth !== 'ALL') {
      const lab = MESES.find((m) => String(m.value).padStart(2, '0') === historyMonth)?.label ?? 'mes';
      parts.push(lab);
    }
    if (parts.length === 0) return '';
    return `No hay ingresos para ${parts.join(' · ')}. Cambie año o mes, o use «Todos».`;
  }, [ingresos.length, historyYear, historyMonth]);

  const totalCardTitle = useMemo(() => {
    if (chartYear === 'ALL') {
      return chartMonth === 'ALL' ? 'Total histórico' : `Total ${chartMonthLabel} (todos los años)`;
    }
    if (chartMonth === 'ALL') return `Total ${chartYear}`;
    return `Total ${chartMonthLabel} ${chartYear}`;
  }, [chartYear, chartMonth, chartMonthLabel]);

  const ultimoIngresoCard = useMemo(() => {
    let pool = ingresos;
    if (chartYear !== 'ALL') {
      pool = pool.filter((i) => i.fecha.slice(0, 4) === String(chartYear));
    }
    if (chartMonth !== 'ALL' && chartYear !== 'ALL') {
      pool = pool.filter((i) => i.fecha.slice(5, 7) === chartMonth);
    }
    return formatUltimoIngresoLabel(findUltimoIngreso(pool));
  }, [ingresos, chartYear, chartMonth]);

  const chartTrendTitle = useMemo(() => {
    if (chartYear === 'ALL') return chartMonth === 'ALL' ? 'Ingresos por año' : `${chartMonthLabel} por año`;
    return chartMonth === 'ALL' ? 'Tendencia mensual' : 'Tendencia por día';
  }, [chartYear, chartMonth, chartMonthLabel]);

  const chartTrendSubtitle = useMemo(() => {
    if (chartYear === 'ALL') {
      return chartMonth === 'ALL' ? 'Histórico completo' : `Todos los años · ${chartMonthLabel}`;
    }
    return chartMonth === 'ALL' ? String(chartYear) : `${chartMonthLabel} ${chartYear}`;
  }, [chartYear, chartMonth, chartMonthLabel]);

  /** Texto tipo Gastos («Subtipos mostrados: …») para el período del gráfico y ranking. */
  const graficoRankingResumen = useMemo(() => {
    let periodLabel: string;
    if (chartYear === 'ALL') {
      periodLabel = chartMonth === 'ALL' ? 'Todos los años' : `${chartMonthLabel} (todos los años)`;
    } else if (chartMonth === 'ALL') {
      periodLabel = `Año ${chartYear}`;
    } else {
      periodLabel = `${chartMonthLabel} ${chartYear}`;
    }
    const count = ingresosVistaGrafico.length;
    const total = ingresosVistaGrafico.reduce((s, i) => s + ingresoMontoPEN(i), 0);
    return { periodLabel, count, total };
  }, [chartYear, chartMonth, chartMonthLabel, ingresosVistaGrafico]);

  const getVehicleLabel = useCallback(
    (vehicleId: number) => {
      const v = vehicles.find((x) => x.id === vehicleId);
      return v ? `${v.marca} ${v.modelo} (${v.placa})` : `#${vehicleId}`;
    },
    [vehicles],
  );

  const vehicleRankingRows = useMemo(() => {
    const map = new Map<number, { total: number; count: number }>();
    for (const i of ingresosVistaGrafico) {
      const raw = i.vehicleId;
      if (raw == null || !Number.isFinite(Number(raw))) continue;
      const id = Number(raw);
      const cur = map.get(id) ?? { total: 0, count: 0 };
      cur.total += ingresoMontoPEN(i);
      cur.count += 1;
      map.set(id, cur);
    }

    const seen = new Set<number>();
    const rows: Array<{ vehicleId: number; total: number; count: number }> = [];
    const byFleetOrder = [...vehicles].sort((a, b) => a.id - b.id);
    for (const v of byFleetOrder) {
      seen.add(v.id);
      const agg = map.get(v.id) ?? { total: 0, count: 0 };
      rows.push({ vehicleId: v.id, ...agg });
    }
    const orphanIds = [...map.keys()].filter((id) => !seen.has(id)).sort((a, b) => a - b);
    for (const id of orphanIds) {
      const agg = map.get(id)!;
      rows.push({ vehicleId: id, ...agg });
    }
    return rows;
  }, [ingresosVistaGrafico, vehicles]);

  const displayedVehicleRows = useMemo(() => {
    let rows =
      rankingVehicleScope === 'with_moves'
        ? vehicleRankingRows.filter((r) => r.count > 0)
        : vehicleRankingRows;
    if (rankingVehicleSort === 'fleet') {
      return rows;
    }
    rows = [...rows];
    if (rankingVehicleSort === 'moves') {
      rows.sort(
        (a, b) => b.count - a.count || b.total - a.total || a.vehicleId - b.vehicleId,
      );
    } else {
      rows.sort(
        (a, b) => b.total - a.total || b.count - a.count || a.vehicleId - b.vehicleId,
      );
    }
    return rows;
  }, [vehicleRankingRows, rankingVehicleScope, rankingVehicleSort]);

  const displayedVehicleGrand = useMemo(
    () =>
      displayedVehicleRows.reduce(
        (acc, r) => ({ count: acc.count + r.count, total: acc.total + r.total }),
        { count: 0, total: 0 },
      ),
    [displayedVehicleRows],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Finanzas</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">💵 Ingresos</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {ingresos.length} movimientos registrados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={openRegistrarModal}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-700"
          >
            + Registrar ingreso
        </button>
        </div>
      </div>

      <CopilotEvidenceSlot />

      <div id="copilot-income-summary" className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_56px_-28px_rgba(15,23,42,0.18)]">
        <div
          className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-800"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-24 -top-28 h-60 w-60 rounded-full bg-gradient-to-br from-emerald-100/50 to-transparent blur-3xl" aria-hidden />

        <div className="relative p-4 sm:p-6">
          <div className="mb-5 border-b border-slate-100 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumen ejecutivo</p>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{totalCardTitle}</p>
                <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-emerald-900 sm:text-2xl">
                  {formatGlobalAmount(animatedTotal)}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
                  {ultimoIngresoCard.kind === 'empty'
                    ? 'Sin ingresos registrados'
                    : `Último ingreso: ${ultimoIngresoCard.label}`}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                {chartMonth === 'ALL' ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {chartYear === 'ALL' ? 'Promedio anual' : 'Promedio mensual'}
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {formatGlobalAmount(
                        chartYear === 'ALL' ? (allYearsRollup?.avgPerYear ?? 0) : chartYearInsights.avgMonthly,
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {chartYear === 'ALL'
                        ? allYearsRollup?.yearCount
                          ? `En ${allYearsRollup.yearCount} año${allYearsRollup.yearCount === 1 ? '' : 's'} con datos`
                          : 'Sin años con datos'
                        : chartYearInsights.avgMonthsLabel}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Movimientos</p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {chartMonthAgg?.count ?? 0}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">En el mes filtrado</p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                {chartMonth === 'ALL' ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {chartYear === 'ALL' ? 'Año más alto' : 'Mes más alto'}
                    </p>
                    <p className="mt-1.5 text-sm font-bold capitalize leading-snug text-slate-900 sm:text-base">
                      {chartYear === 'ALL'
                        ? allYearsRollup?.peakYear
                          ? String(allYearsRollup.peakYear)
                          : '—'
                        : chartYearInsights.peakLabel}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-700 sm:text-lg">
                      {formatGlobalAmount(
                        chartYear === 'ALL' ? (allYearsRollup?.peakTotal ?? 0) : chartYearInsights.peakTotal,
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Promedio / movimiento
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {formatGlobalAmount(chartMonthAgg?.avgPerMov ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">En el mes filtrado</p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/90 to-white p-3.5 shadow-sm ring-1 ring-emerald-900/[0.05] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Ingreso hoy</p>
                <p className="mt-1.5 text-lg font-bold tabular-nums text-emerald-900 sm:text-xl">
                  {formatGlobalAmount(todayTotal)}
                </p>
              </div>
            </div>

            {chartYear !== 'ALL' && monthlyFocusRows.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Ingresos por mes · {chartYear}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {monthlyFocusRows.map((row) => {
                    const amountFormatted = formatGlobalAmount(row.total);
                    return (
                      <div
                        key={row.month}
                        data-copilot-target="income-month"
                        data-copilot-month={row.month}
                        data-copilot-year={chartYear}
                        data-copilot-amount={amountFormatted}
                        className={`rounded-xl border p-2.5 sm:p-3 ${
                          row.isPeak
                            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white ring-1 ring-emerald-900/[0.06]'
                            : 'border-slate-100 bg-white shadow-sm'
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {row.label}
                        </p>
                        <p
                          data-copilot-target="income-month-value"
                          data-copilot-month={row.month}
                          data-copilot-year={chartYear}
                          data-copilot-amount={amountFormatted}
                          className="mt-0.5 text-sm font-bold tabular-nums text-emerald-900 sm:text-base"
                        >
                          {amountFormatted}
                        </p>
                        {row.isPeak ? (
                          <p className="mt-1 text-[10px] font-medium text-emerald-700/90">Mayor ingreso</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {ingresos.length > 0 ? (
              <>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-slate-600">Ingresos vehiculares</span>
                  <span className="font-semibold tabular-nums text-emerald-800">{formatGlobalAmount(totalVehicularVista)}</span>
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-violet-800">Ingresos extraordinarios</span>
                  <span className="font-semibold tabular-nums text-violet-900">{formatGlobalAmount(totalExtraordinarioVista)}</span>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Período del gráfico y del ranking
                </p>
                <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                  <Select
                    label="Año"
                    options={chartYearOptions}
                    value={chartYear}
                    onChange={setChartYear}
                  />
                  <Select
                    label="Mes"
                    options={monthFilterOptions}
                    value={chartMonth}
                    onChange={setChartMonth}
                  />
                </div>
                <p className="mb-2.5 mt-3 text-[11px] leading-snug text-slate-600">
                  <span className="font-semibold text-slate-800">Gráfico y ranking muestran:</span>{' '}
                  <span>{graficoRankingResumen.periodLabel}</span>
                  {' — '}
                  <span className="tabular-nums">{graficoRankingResumen.count} movimientos</span>
                  {' · '}
                  <span className="tabular-nums font-semibold text-emerald-800">
                    {formatGlobalAmount(graficoRankingResumen.total)}
                  </span>
                </p>
              </div>
              </>
            ) : (
              <p className="mt-4 text-xs text-slate-400">Sin fechas para graficar.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{chartTrendTitle}</h2>
                <span className="text-xs font-medium tabular-nums text-slate-400">{chartTrendSubtitle}</span>
              </div>
              <div className="relative h-[11rem] rounded-xl border border-slate-100 bg-gradient-to-b from-emerald-50/40 to-white px-1 pt-1 shadow-inner shadow-slate-900/[0.04] sm:h-44 lg:h-[14rem]">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
                    Sin ingresos para el período seleccionado (año / mes).
                  </div>
                ) : (
                  <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-emerald-50/80" />}>
                    <IngresosMesChart chartData={chartData} bucket={chartBucket} />
                  </Suspense>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col border-t border-slate-100 pt-5 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ranking · {vistaRankingLabel}
                </h2>
              </div>

              <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Opciones del ranking
                </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="shrink-0 text-xs font-semibold text-slate-600">Unidades en la tabla</span>
                      <div
                        className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                        role="group"
                        aria-label="Qué unidades listar"
                      >
                        <button
                          type="button"
                          aria-pressed={rankingVehicleScope === 'all'}
                          onClick={() => setRankingVehicleScope('all')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            rankingVehicleScope === 'all'
                              ? 'bg-slate-800 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          aria-pressed={rankingVehicleScope === 'with_moves'}
                          onClick={() => setRankingVehicleScope('with_moves')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            rankingVehicleScope === 'with_moves'
                              ? 'bg-slate-800 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Solo con ingresos
                        </button>
                      </div>
                    </div>
                    <div className="hidden h-6 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="shrink-0 text-xs font-semibold text-slate-600">Orden de la lista</span>
                      <div
                        className="inline-flex w-fit flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                        role="group"
                        aria-label="Cómo ordenar el ranking"
                      >
                        <button
                          type="button"
                          aria-pressed={rankingVehicleSort === 'fleet'}
                          onClick={() => setRankingVehicleSort('fleet')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            rankingVehicleSort === 'fleet'
                              ? 'bg-emerald-700 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-emerald-50'
                          }`}
                        >
                          Orden de flota
                        </button>
                        <button
                          type="button"
                          aria-pressed={rankingVehicleSort === 'moves'}
                          onClick={() => setRankingVehicleSort('moves')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            rankingVehicleSort === 'moves'
                              ? 'bg-emerald-700 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-emerald-50'
                          }`}
                        >
                          Más movimientos
                        </button>
                        <button
                          type="button"
                          aria-pressed={rankingVehicleSort === 'total'}
                          onClick={() => setRankingVehicleSort('total')}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            rankingVehicleSort === 'total'
                              ? 'bg-emerald-700 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-emerald-50'
                          }`}
                        >
                          Mayor monto
                        </button>
                      </div>
        </div>
        </div>
      </div>

              {displayedVehicleRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-8 text-center text-sm text-slate-500">
                  {rankingVehicleScope === 'with_moves' ? (
                    <>
                      Ninguna unidad con ingresos en {vistaRankingLabel}. Elija «Todas las unidades» arriba para ver
                      toda la flota (incluye 0 movimientos).
                    </>
                  ) : (
                    <>Sin ingresos en {vistaRankingLabel} para este ranking.</>
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm shadow-slate-900/[0.03]">
                  <div className="max-h-[min(280px,44vh)] overflow-y-auto lg:max-h-[min(300px,40vh)]">
                    <table className="min-w-full text-left text-[13px]">
                      <thead className="sticky top-0 z-[1] bg-slate-50/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="w-12 py-2.5 pl-3 pr-1 font-semibold tabular-nums">ID</th>
                          <th className="py-2.5 pl-0 pr-2 font-semibold">Unidad</th>
                          <ColumnCountHintTh
                            className="min-w-[3.25rem]"
                            hint="Cantidad de registros de ingreso en el período elegido arriba (año y mes). Las opciones de lista y orden están en el recuadro sobre la tabla."
                          />
                          <th className="py-2.5 pr-3 text-right font-semibold tabular-nums">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedVehicleRows.map((row) => (
                          <tr
                            key={row.vehicleId}
                            className="border-b border-slate-50 transition-colors hover:bg-emerald-50/50"
                          >
                            <td className="py-2.5 pl-3 pr-1 font-mono text-xs font-bold tabular-nums text-slate-500">
                              #{row.vehicleId}
                            </td>
                            <td className="py-2.5 pl-0 pr-2 font-medium leading-snug text-slate-900">
                              {getVehicleLabel(row.vehicleId)}
                            </td>
                            <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{row.count}</td>
                            <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                              {formatGlobalAmount(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                        <tr>
                          <td className="py-2.5 pl-3 pr-1" aria-hidden />
                          <td className="py-2.5 pl-0 pr-2 text-sm font-bold text-slate-900">Total</td>
                          <td className="py-2.5 pr-2 text-right text-sm font-bold tabular-nums text-slate-800">
                            {displayedVehicleGrand.count}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-sm font-bold tabular-nums text-emerald-900">
                            {formatGlobalAmount(displayedVehicleGrand.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
            <h2 id="copilot-scroll-target" className="text-lg font-semibold tracking-tight text-slate-900">Historial de ingresos</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
              Los filtros de año y mes solo aplican a la tabla inferior. El gráfico y el ranking usan «Año del gráfico
              y ranking» y «Mes (gráfico y ranking)».
            </p>
          </div>
          <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 [&_.label]:mb-0.5 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
            <Select
              label="Año (tabla)"
              options={historyYearOptions}
              value={historyYear}
              onChange={setHistoryYear}
            />
            <Select
              label="Mes (tabla)"
              options={historyMonthOptions}
              value={historyMonth}
              onChange={setHistoryMonth}
            />
          </div>
        </div>
        <RegistrosTable
          mode="ingresos"
          ingresos={ingresosHistorialFiltrados}
          vehicles={vehicles}
          onDeleteIngreso={deleteIngreso}
          onIngresoDetalleSaved={upsertIngreso}
        />
      </div>

      <Modal
        isOpen={registrarOpen}
        onClose={closeRegistrarModal}
        closeLocked={registrarSaving}
        title="Registrar ingreso"
        size="xl"
      >
        <IncomeForm
          key={formInstanceKey}
          vehicles={vehicles}
          ingresos={ingresos}
          onSubmit={handleRegistrarIngreso}
          onLoadingChange={setRegistrarSaving}
          noCard
          prefillVehicleId={prefillVehicleId}
        />
      </Modal>
    </div>
  );
};

export default Ingresos;
