import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Info, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import Card from '../../components/Common/Card';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { todayStr, toDateOnlyString } from '../../utils/formatting';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { ingresoMontoPEN } from '../../utils/moneda';
import {
  financialKpiSourceLabel,
  resolveResultadoNetoKpi,
} from '../../utils/financialGlobalKpis';
import {
  distribucionFromSummary,
  formatGastosGlobalTotalDisplay,
  resolveGastosGlobalTotalState,
} from '../../utils/gastosFinancialSummary';
import type { Gasto, Ingreso } from '../../data/types';
import { matchesOperativoTipoNormalized } from '../../utils/operativoTipoGasto';
import { buildCascadaFinanciera, calculateBusinessResult, ingresosSinTipoCambio } from '../../utils/businessResult';
import { buildTopVehiculosUtilidad } from '../../utils/utilidadReal';
import { useAuth } from '../../context/AuthContext';
import { aporteMontoNeto, fetchAportesAccionistas } from '../../services/aportesAccionistasService';
import { fetchInversionesGeneralesVehiculo } from '../../services/inversionesGeneralesVehiculoService';
import type { AporteAccionista, InversionGeneralVehiculo } from '../../data/types';

type ResumenPreset = 'mes_actual' | 'mes_anterior' | 'anio_actual' | 'todo' | 'personalizado';

const CATEGORIA_MAP = [
  { key: 'operativo_vehiculo', label: 'Operativos por vehículo' },
  { key: 'operativo_flota_general', label: 'Operativo flota general' },
  { key: 'administrativo_empresa', label: 'Administrativos' },
  { key: 'financiero_prestamo', label: 'Financieros' },
  { key: 'planilla_laboral', label: 'Planilla' },
  { key: 'inversion_compra', label: 'Inversión con utilidad' },
  { key: 'representacion_interna', label: 'Representación interna' },
  { key: 'otros_gastos_varios', label: 'Otros gastos / Gastos varios' },
  { key: 'gastos_globales', label: 'Globales' },
  { key: 'pendiente_revision', label: 'Pendiente de clasificación' },
] as const;

const MESES_LARGO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

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

/** Frase corta para el héroe (dueño no técnico). */
function periodPhraseHuman(
  preset: ResumenPreset,
  range: { label: string; desde: string | null },
  customYear: number,
  customMonth: number | 'all',
): string {
  if (preset === 'mes_actual') {
    const mm = Number(todayStr().slice(5, 7));
    return `este mes (${MESES_LARGO[mm - 1] ?? 'mes actual'})`;
  }
  if (preset === 'mes_anterior') return 'el mes anterior';
  if (preset === 'anio_actual') return `este año (${todayStr().slice(0, 4)})`;
  if (preset === 'todo') return 'todo el historial registrado';
  if (customMonth === 'all') return `el año ${customYear}`;
  if (typeof customMonth === 'number') {
    return `${MESES_LARGO[customMonth - 1] ?? 'el mes'} ${customYear}`;
  }
  return range.label.toLowerCase();
}

/** Período inmediatamente anterior equivalente (mes→mes anterior, año→año anterior). */
function getPreviousEquivalentRange(
  preset: ResumenPreset,
  range: { desde: string | null; hasta: string | null },
  customMonth: number | 'all',
): { desde: string; hasta: string; compareLabel: string } | null {
  if (preset === 'todo') return null;
  const { desde, hasta } = range;
  if (!desde || !hasta) return null;

  const isFullYear = desde.endsWith('-01-01') && hasta.endsWith('-12-31');
  if (preset === 'anio_actual' || (preset === 'personalizado' && customMonth === 'all') || isFullYear) {
    const y = Number(desde.slice(0, 4));
    if (!Number.isFinite(y)) return null;
    const py = y - 1;
    return { desde: `${py}-01-01`, hasta: `${py}-12-31`, compareLabel: `el año ${py}` };
  }

  const m = Number(desde.slice(5, 7));
  const y = Number(desde.slice(0, 4));
  if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12) return null;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const r = monthRange(py, pm);
  return { ...r, compareLabel: `${MESES_LARGO[pm - 1] ?? 'el mes anterior'} ${py}` };
}

type PeriodTotals = {
  ingresos: number;
  gastos: number;
  resultado: number;
  hasMovement: boolean;
};

function aggregatePeriodTotals(
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string | null,
  hasta: string | null,
): PeriodTotals {
  const r = calculateBusinessResult(ingresos, gastos, desde, hasta);
  return { ingresos: r.totalIngresos, gastos: r.totalGastos, resultado: r.resultado, hasMovement: r.hasMovement };
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return null;
    return current > 0 ? 100 : -100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

type CompareLine = { text: string; tone: 'good' | 'bad' | 'neutral' };

function buildComparisonLines(
  cur: PeriodTotals,
  prev: PeriodTotals,
  compareLabel: string,
  formatAmount: (n: number) => string,
): CompareLine[] {
  if (!prev.hasMovement && !cur.hasMovement) return [];
  const lines: CompareLine[] = [];
  const label = compareLabel;

  const dIng = pctDelta(cur.ingresos, prev.ingresos);
  if (dIng != null && (cur.ingresos > 0 || prev.ingresos > 0)) {
    const up = dIng >= 0;
    const abs = Math.abs(Math.round(dIng));
    if (abs >= 1) {
      lines.push({
        text: `${up ? '↑' : '↓'} Ingresos ${abs}% vs ${label}`,
        tone: up ? 'good' : 'bad',
      });
    }
  }

  const diffGas = cur.gastos - prev.gastos;
  if (Math.abs(diffGas) >= 1 && (cur.gastos > 0 || prev.gastos > 0)) {
    if (diffGas > 0) {
      lines.push({
        text: `↓ Gastaste ${formatAmount(diffGas)} más que en ${label}`,
        tone: 'bad',
      });
    } else {
      lines.push({
        text: `↑ Gastaste ${formatAmount(Math.abs(diffGas))} menos que en ${label}`,
        tone: 'good',
      });
    }
  }

  const diffRes = cur.resultado - prev.resultado;
  if (Math.abs(diffRes) >= 1 && (cur.hasMovement || prev.hasMovement)) {
    if (diffRes > 0) {
      lines.push({
        text: `↑ Resultado mejoró ${formatAmount(diffRes)} vs ${label}`,
        tone: 'good',
      });
    } else {
      lines.push({
        text: `↓ Resultado bajó ${formatAmount(Math.abs(diffRes))} vs ${label}`,
        tone: 'bad',
      });
    }
  }

  return lines.slice(0, 3);
}

type PeriodInsight = { tone: 'good' | 'warn' | 'neutral'; text: string };

function buildPeriodInsights(input: {
  cur: PeriodTotals;
  prev: PeriodTotals | null;
  hasCompare: boolean;
  distribucion: { label: string; monto: number; pct: number; key: string }[];
  prevOperativoMonto: number;
}): PeriodInsight[] {
  const {
    cur,
    prev,
    hasCompare,
    distribucion,
    prevOperativoMonto,
  } = input;
  const opVeh = distribucion.find((d) => d.key === 'operativo_vehiculo');
  const opFlota = distribucion.find((d) => d.key === 'operativo_flota_general');
  const opMonto = (opVeh?.monto ?? 0) + (opFlota?.monto ?? 0);
  const top = distribucion[0];
  const picks: PeriodInsight[] = [];
  const add = (item: PeriodInsight) => {
    if (picks.length < 2) picks.push(item);
  };

  if (cur.resultado < 0 && cur.hasMovement) {
    add({
      tone: 'warn',
      text: 'Los gastos del período superan a los ingresos registrados.',
    });
  }

  if (hasCompare && prev?.hasMovement) {
    const dGas = pctDelta(cur.gastos, prev.gastos);
    if (dGas != null && dGas >= 12) {
      add({
        tone: 'warn',
        text: `El gasto total subió ${Math.round(dGas)}% respecto al período anterior.`,
      });
    }
    if (opMonto > 0 && prevOperativoMonto > 0) {
      const dOp = pctDelta(opMonto, prevOperativoMonto);
      if (dOp != null && dOp >= 15) {
        add({
          tone: 'warn',
          text: `El gasto operativo subió ${Math.round(dOp)}% respecto al período anterior.`,
        });
      }
    }
    const dIng = pctDelta(cur.ingresos, prev.ingresos);
    const dGas2 = pctDelta(cur.gastos, prev.gastos);
    if (dIng != null && dGas2 != null && dIng > dGas2 && dIng >= 5 && cur.ingresos > prev.ingresos) {
      add({
        tone: 'good',
        text: 'Los ingresos crecieron más rápido que los gastos frente al período anterior.',
      });
    }
  }

  if (top && top.pct >= 35 && cur.gastos > 0) {
    add({
      tone: 'warn',
      text: `${top.label} concentra gran parte del gasto del período (${top.pct.toFixed(0)}%).`,
    });
  }

  if (opMonto > 0 && cur.gastos > 0 && opMonto / cur.gastos >= 0.5) {
    add({
      tone: 'warn',
      text: 'Más de la mitad del gasto del período es operativo (unidad y/o flota general).',
    });
  }

  if (picks.length === 0 && cur.hasMovement) {
    picks.push({
      tone: 'good',
      text: 'El período se ve estable: sin señales fuertes de desvío.',
    });
  }

  return picks;
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
  if (mapped === 'personal_socios_familiares' || mapped === 'representacion_interna' || mapped === 'personales') {
    return 'representacion_interna';
  }
  return mapped;
}

function sumOperativoGastos(gastos: Gasto[], desde: string, hasta: string): number {
  let s = 0;
  for (const g of gastos) {
    const d = toDateOnlyString(g.fecha);
    if (!d || d < desde || d > hasta) continue;
    if (!matchesOperativoTipoNormalized(normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null))) continue;
    s += g.monto;
  }
  return s;
}

function ComparePill({ line }: { line: CompareLine }) {
  const cls =
    line.tone === 'good'
      ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900'
      : line.tone === 'bad'
        ? 'border-rose-200/80 bg-rose-50/90 text-rose-900'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-opacity duration-300 ${cls}`}
    >
      {line.tone === 'good' ? <TrendingUp size={12} className="shrink-0" /> : null}
      {line.tone === 'bad' ? <TrendingDown size={12} className="shrink-0" /> : null}
      {line.text}
    </span>
  );
}

type AlertTone = 'danger' | 'warning' | 'success';

interface ResumenAlert {
  id: string;
  tone: AlertTone;
  title: string;
  text: string;
  href?: string;
}

function KpiChip({
  label,
  value,
  tone,
  tooltip,
  href,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'slate' | 'amber';
  tooltip: string;
  href?: string;
}) {
  const toneClass = {
    emerald: 'text-emerald-800',
    rose: 'text-rose-800',
    slate: 'text-slate-900',
    amber: 'text-amber-900',
  }[tone];

  const inner = (
    <div className="flex min-w-0 flex-col rounded-xl bg-white px-3 py-3 ring-1 ring-slate-100">
      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
        {label}
        <span title={tooltip} aria-label={tooltip} className="inline-flex">
          <Info size={12} className="shrink-0 opacity-40" />
        </span>
      </span>
      <span className={`mt-1 truncate text-lg font-bold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block rounded-xl transition hover:ring-2 hover:ring-violet-200">
        {inner}
      </Link>
    );
  }
  return inner;
}

const Resumen: React.FC = () => {
  const navigate = useNavigate();
  const { formatGlobalAmount } = useAmountDisplay();
  const { profile } = useAuth();
  const { ingresos, gastos, vehicles, prestamos, gastosFinancialSummary, isLoadingGastosSummary, gastosLoadScope } =
    useRegistrosContext();

  // ── Lazy complementary info ────────────────────────────────────────────────
  const [aportesRows, setAportesRows] = useState<AporteAccionista[]>([]);
  const [inversionesRows, setInversionesRows] = useState<InversionGeneralVehiculo[]>([]);
  useEffect(() => {
    const id = profile?.empresa_id?.trim() || null;
    if (!id) return;
    let cancelled = false;
    void fetchAportesAccionistas(id).then(({ rows }) => {
      if (!cancelled) setAportesRows(rows);
    });
    void fetchInversionesGeneralesVehiculo(id).then((rows) => {
      if (!cancelled) setInversionesRows(rows);
    });
    return () => { cancelled = true; };
  }, [profile?.empresa_id]);
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

  const periodHuman = useMemo(
    () => periodPhraseHuman(preset, range, customYear, customMonth),
    [preset, range, customYear, customMonth],
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

  const totalIngresos = useMemo(() => ingresosP.reduce((s, i) => s + ingresoMontoPEN(i), 0), [ingresosP]);
  const totalGastosLocal = useMemo(() => gastosP.reduce((s, g) => s + g.monto, 0), [gastosP]);
  const localGastosAllTime = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos]);
  const gastosGlobalStateAllTime = useMemo(
    () =>
      resolveGastosGlobalTotalState(
        gastosFinancialSummary,
        localGastosAllTime,
        gastos.length,
        gastosLoadScope,
        isLoadingGastosSummary,
      ),
    [gastosFinancialSummary, localGastosAllTime, gastos.length, gastosLoadScope, isLoadingGastosSummary],
  );
  const useSummaryAllTime = preset === 'todo';
  const totalGastos = useSummaryAllTime
    ? (gastosGlobalStateAllTime.total ?? 0)
    : totalGastosLocal;
  const totalGastosDisplay = useSummaryAllTime
    ? formatGastosGlobalTotalDisplay(gastosGlobalStateAllTime, formatGlobalAmount)
    : formatGlobalAmount(totalGastosLocal);
  const resultadoKpi = useMemo(
    () =>
      resolveResultadoNetoKpi(
        totalIngresos,
        gastosGlobalStateAllTime,
        useSummaryAllTime,
        totalGastosLocal,
        formatGlobalAmount,
      ),
    [totalIngresos, gastosGlobalStateAllTime, useSummaryAllTime, totalGastosLocal, formatGlobalAmount],
  );
  const resultadoNeto = resultadoKpi.value;
  const resultadoNetoDisplay = resultadoKpi.display;
  const hasResultado = resultadoNeto != null;
  const totalesDesdeBd = useSummaryAllTime && gastosGlobalStateAllTime.source === 'rpc';
  const vistaRapidaPeriodo =
    !useSummaryAllTime && gastosLoadScope === 'recent';
  const periodoSourceLabel = useSummaryAllTime
    ? financialKpiSourceLabel(resultadoKpi.gastosSource)
    : vistaRapidaPeriodo
      ? 'Vista rápida (período, memoria parcial)'
      : financialKpiSourceLabel('memoria-periodo');

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[Resumen] gastos source', {
      preset,
      source: useSummaryAllTime ? gastosGlobalStateAllTime.source : 'memory-period',
      total: useSummaryAllTime ? gastosGlobalStateAllTime.total : totalGastosLocal,
      summary: gastosFinancialSummary?.totalGastos ?? null,
    });
  }, [
    preset,
    useSummaryAllTime,
    gastosGlobalStateAllTime,
    totalGastosLocal,
    gastosFinancialSummary,
  ]);

  const hasData =
    ingresosP.length > 0 ||
    gastosP.length > 0 ||
    (useSummaryAllTime && gastosGlobalStateAllTime.source === 'rpc');
  const fmt = (v: number) => (hasData || useSummaryAllTime ? formatGlobalAmount(v) : '—');

  const distribucion = useMemo(() => {
    if (useSummaryAllTime && gastosFinancialSummary) {
      return distribucionFromSummary(gastosFinancialSummary, CATEGORIA_MAP);
    }
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
    })
      .filter((d) => d.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [useSummaryAllTime, gastosFinancialSummary, gastosP, totalGastos]);

  const byKey = useMemo(
    () => Object.fromEntries(distribucion.map((d) => [d.key, d.monto])),
    [distribucion],
  );

  const top3Categorias = useMemo(() => distribucion.slice(0, 3), [distribucion]);

  const previousRange = useMemo(
    () => getPreviousEquivalentRange(preset, range, customMonth),
    [preset, range, customMonth],
  );

  const prevTotals = useMemo(() => {
    if (!previousRange) return null;
    return aggregatePeriodTotals(ingresos, gastos, previousRange.desde, previousRange.hasta);
  }, [ingresos, gastos, previousRange]);

  const curTotals = useMemo(
    (): PeriodTotals => ({
      ingresos: totalIngresos,
      gastos: totalGastos,
      resultado: resultadoNeto ?? 0,
      hasMovement: hasData && hasResultado,
    }),
    [totalIngresos, totalGastos, resultadoNeto, hasData, hasResultado],
  );

  const comparisonLines = useMemo(() => {
    if (!prevTotals || !previousRange) return [];
    return buildComparisonLines(curTotals, prevTotals, previousRange.compareLabel, formatGlobalAmount);
  }, [curTotals, prevTotals, previousRange, formatGlobalAmount]);

  const prevOperativoMonto = useMemo(() => {
    if (!previousRange) return 0;
    return sumOperativoGastos(gastos, previousRange.desde, previousRange.hasta);
  }, [gastos, previousRange]);

  const periodInsights = useMemo(
    () =>
      buildPeriodInsights({
        cur: curTotals,
        prev: prevTotals,
        hasCompare: Boolean(previousRange && prevTotals),
        distribucion,
        prevOperativoMonto,
      }),
    [
      curTotals,
      prevTotals,
      previousRange,
      distribucion,
      prevOperativoMonto,
    ],
  );

  // ── Cascada financiera ─────────────────────────────────────────────────────
  const cascada = useMemo(() => {
    if (totalGastos <= 0 && totalIngresos <= 0) return null;
    return buildCascadaFinanciera(totalIngresos, distribucion, totalGastos);
  }, [totalIngresos, distribucion, totalGastos]);

  // ── Rentabilidad por vehículo (top 3 mejor / peor) ────────────────────────
  const vehiculosRentabilidad = useMemo(() => {
    const all = buildTopVehiculosUtilidad(vehicles, ingresos, gastos, {
      desde: range.desde,
      hasta: range.hasta,
      limit: 999,
    });
    const activos = all.filter((v) => v.ingresos > 0 || v.gastos > 0);
    return {
      top3: activos.slice(0, 3),
      bottom3: activos.length > 3 ? activos.slice(-3).reverse() : [],
    };
  }, [vehicles, ingresos, gastos, range]);

  // ── Deuda activa desde tabla prestamos (ya en contexto) ───────────────────
  const deudaActivaResumen = useMemo(() => {
    const activos = prestamos.filter((p) => p.estado === 'ACTIVO');
    if (activos.length === 0) return null;
    const pen = activos.filter((p) => p.moneda === 'PEN').reduce((s, p) => s + p.saldoPendiente, 0);
    const usd = activos.filter((p) => p.moneda === 'USD').reduce((s, p) => s + p.saldoPendiente, 0);
    return { pen, usd, count: activos.length };
  }, [prestamos]);

  // ── Totales aportes accionistas ────────────────────────────────────────────
  const aportesResumen = useMemo(() => {
    if (aportesRows.length === 0) return null;
    const neto = aportesRows.reduce((s, a) => s + aporteMontoNeto(a), 0);
    const netoPen = aportesRows
      .filter((a) => a.moneda === 'PEN')
      .reduce((s, a) => s + aporteMontoNeto(a), 0);
    const tieneUsd = aportesRows.some((a) => a.moneda === 'USD');
    return { neto, netoPen, tieneUsd, count: aportesRows.length };
  }, [aportesRows]);

  // ── Inversión histórica de flota ──────────────────────────────────────────
  const inversionHistorica = useMemo(() => {
    if (inversionesRows.length === 0) return null;
    const penRows = inversionesRows.filter((r) => r.totalInversionPen != null && r.totalInversionPen > 0);
    if (penRows.length === 0) return null;
    const total = penRows.reduce((s, r) => s + (r.totalInversionPen ?? 0), 0);
    return { total, count: inversionesRows.length };
  }, [inversionesRows]);

  // ── Margen del período ─────────────────────────────────────────────────────
  const margenPct = useMemo(() => {
    if (totalIngresos <= 0 || !hasResultado || resultadoNeto == null) return null;
    return (resultadoNeto / totalIngresos) * 100;
  }, [totalIngresos, hasResultado, resultadoNeto]);

const ingresosSinTc = useMemo(
    () => ingresosSinTipoCambio(ingresosP),
    [ingresosP],
  );

  const alertas = useMemo((): ResumenAlert[] => {
    const out: ResumenAlert[] = [];
    const op =
      (byKey.operativo_vehiculo ?? 0) + (byKey.operativo_flota_general ?? 0);

    if (hasData && totalGastos > 0 && totalIngresos > 0 && totalGastos >= totalIngresos * 0.85) {
      out.push({
        id: 'gastos-altos',
        tone: totalGastos >= totalIngresos ? 'danger' : 'warning',
        title: 'Gastos elevados',
        text: 'Los gastos del período consumen casi todo lo que ingresó. Revisa el detalle en Gastos.',
        href: '/finanzas/gastos',
      });
    }

    if (hasResultado && resultadoNeto < 0) {
      out.push({
        id: 'baja-utilidad',
        tone: 'danger',
        title: 'Baja utilidad',
        text: `En ${periodHuman} los gastos superan a los ingresos registrados.`,
      });
    } else if (hasResultado && totalIngresos > 0 && resultadoNeto / totalIngresos < 0.1) {
      out.push({
        id: 'baja-utilidad-margen',
        tone: 'warning',
        title: 'Baja utilidad',
        text: 'Queda poco margen después de gastos. Conviene revisar categorías con más peso.',
      });
    }

    if (totalGastos > 0 && op > totalGastos * 0.55) {
      out.push({
        id: 'exceso-operativo',
        tone: 'warning',
        title: 'Mucho gasto operativo',
        text: 'Más de la mitad del gasto del período es operativo (unidad y/o flota general).',
        href: '/finanzas/gastos',
      });
    }

    if (ingresosSinTc.length > 0) {
      out.push({
        id: 'usd-sin-tc',
        tone: 'warning',
        title: 'Ingresos USD sin tipo de cambio',
        text: `${ingresosSinTc.length} ingreso${ingresosSinTc.length > 1 ? 's' : ''} en USD no tienen tipo de cambio ni monto PEN registrado. Se incluyeron como si fueran soles; el resultado puede no ser exacto.`,
        href: '/finanzas/ingresos',
      });
    }

    const pendienteMonto = byKey.pendiente_revision ?? 0;
    if (pendienteMonto > 0) {
      out.push({
        id: 'pendiente-revision',
        tone: 'warning',
        title: 'Gastos pendientes de clasificación',
        text: `${formatGlobalAmount(pendienteMonto)} en gastos no clasificados reducen el resultado. Clasificarlos mejora la precisión de los reportes por categoría.`,
        href: '/finanzas/gastos',
      });
    }

    if (out.length === 0) {
      out.push({
        id: 'ok',
        tone: 'success',
        title: 'Todo en orden',
        text: 'No hay alertas urgentes con los criterios habituales de este panel.',
      });
    }

    return out;
  }, [
    byKey,
    hasData,
    hasResultado,
    ingresosSinTc.length,
    periodHuman,
    resultadoNeto,
    totalGastos,
    totalIngresos,
    formatGlobalAmount,
  ]);

  const heroTone =
    !hasData || !hasResultado
      ? 'neutral'
      : (resultadoNeto ?? 0) >= 0
        ? 'positive'
        : 'negative';

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10 animate-fade-in">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/90">Finanzas</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">¿Cómo va mi negocio?</h1>
          <p className="mt-1 text-sm text-slate-600">Lo esencial del período que elijas. Sin hojas de cálculo.</p>
        </div>
      </header>

      <Card
        title="¿Qué período miras?"
        subtitle={range.desde && range.hasta ? `${range.label} · ${range.desde} al ${range.hasta}` : range.label}
        compact
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'mes_actual', label: 'Este mes' },
              { id: 'mes_anterior', label: 'Mes anterior' },
              { id: 'anio_actual', label: 'Este año' },
              { id: 'todo', label: 'Todo' },
              { id: 'personalizado', label: 'Elegir…' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                preset === p.id
                  ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/50'
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

      {/* 1 — Héroe */}
      <section
        className={`rounded-2xl border p-5 shadow-sm transition-colors duration-300 sm:p-7 ${
          heroTone === 'positive'
            ? 'border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white'
            : heroTone === 'negative'
              ? 'border-rose-200/80 bg-gradient-to-b from-rose-50/80 to-white'
              : 'border-slate-200 bg-gradient-to-b from-slate-50 to-white'
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {preset === 'todo' ? 'Resultado acumulado' : 'Resultado del período'}
        </p>
        <p
          className={`mt-2 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl ${
            heroTone === 'positive' ? 'text-emerald-900' : heroTone === 'negative' ? 'text-rose-900' : 'text-slate-400'
          }`}
        >
          {hasData ? resultadoNetoDisplay : '—'}
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-700">
          {hasData ? (
            resultadoKpi.value == null ? (
              <>{resultadoNetoDisplay}</>
            ) : resultadoKpi.value >= 0 ? (
              <>
                Te quedaron <strong>{formatGlobalAmount(resultadoKpi.value)}</strong> en {periodHuman}, después de registrar
                todos los gastos del período.
              </>
            ) : (
              <>
                En {periodHuman} los gastos superan a los ingresos por{' '}
                <strong>{formatGlobalAmount(Math.abs(resultadoKpi.value))}</strong>.
              </>
            )
          ) : (
            <>Aún no hay ingresos ni gastos en {periodHuman}. Regístralos en Ingresos o Gastos.</>
          )}
        </p>
        <p
          className="mt-2 text-[11px] text-slate-500"
          title="Ingresos del período menos todos los gastos registrados en el mismo período."
        >
          Ingresos − gastos (todas las categorías) ·{' '}
          <Link to="/finanzas/ingresos" className="font-medium text-violet-700 underline decoration-violet-300">
            Ingresos
          </Link>
          {' · '}
          <Link to="/finanzas/gastos" className="font-medium text-violet-700 underline decoration-violet-300">
            Gastos
          </Link>
        </p>

        {comparisonLines.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4 animate-fade-in">
            {comparisonLines.map((line) => (
              <ComparePill key={line.text} line={line} />
            ))}
          </div>
        ) : previousRange ? (
          <p className="mt-4 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
            Sin datos en {previousRange.compareLabel} para comparar.
          </p>
        ) : null}
      </section>

      {/* 2 — KPIs */}
      {periodoSourceLabel ? (
        <p className="text-[11px] font-medium text-sky-800/90 -mt-2 mb-1">
          Gastos: {periodoSourceLabel}
          {isLoadingGastosSummary ? ' (actualizando…)' : ''}.
          {vistaRapidaPeriodo
            ? ' Los totales del período pueden ser menores al histórico completo hasta cargar más filas.'
            : null}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <KpiChip
          label="Ingresos"
          value={fmt(totalIngresos)}
          tone="emerald"
          tooltip="Suma de ingresos con fecha dentro del período."
        />
        <KpiChip
          label="Gastos"
          value={totalGastosDisplay}
          tone="rose"
          tooltip={
            totalesDesdeBd
              ? 'Suma histórica de todos los gastos (agregado en Supabase, respeta permisos).'
              : 'Suma de todos los gastos del período (operativos, planilla, financieros, etc.).'
          }
        />
        <KpiChip
          label="Resultado del período"
          value={resultadoNetoDisplay}
          tone="slate"
          tooltip="Ingresos del período menos todos los gastos registrados. No equivale a saldo bancario disponible."
        />
        <KpiChip
          label="Margen"
          value={
            margenPct == null
              ? '—'
              : `${margenPct >= 0 ? '' : ''}${margenPct.toFixed(1)}%`
          }
          tone={margenPct == null ? 'slate' : margenPct >= 10 ? 'emerald' : margenPct >= 0 ? 'amber' : 'rose'}
          tooltip="Resultado del período ÷ ingresos × 100. Indica qué fracción de los ingresos queda después de todos los gastos."
        />
      </div>

      {/* 3 — Cascada financiera */}
      {cascada && (totalGastos > 0 || totalIngresos > 0) ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">¿Cómo se formó el resultado?</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Paso a paso: de los ingresos, qué fue saliendo en cada capa hasta llegar al resultado final.
            </p>
          </div>
          <div className="divide-y divide-slate-50 px-5 py-3 space-y-0">
            {/* Ingresos */}
            <CascadaRow
              label="Ingresos del período"
              value={fmt(cascada.totalIngresos)}
              tone="emerald"
              isBold
            />
            {/* Operativos */}
            {cascada.layers[0].monto > 0 ? (
              <CascadaRow
                label={cascada.layers[0].label}
                value={`−${fmt(cascada.layers[0].monto)}`}
                tone="rose"
                pct={cascada.layers[0].pct}
              />
            ) : null}
            <CascadaRow
              label="Resultado operativo"
              value={fmt(cascada.resultadoOperativo)}
              tone={cascada.resultadoOperativo >= 0 ? 'emerald' : 'rose'}
              isSubtotal
            />
            {/* Admin, planilla y otros */}
            {cascada.layers[1].monto > 0 ? (
              <CascadaRow
                label={cascada.layers[1].label}
                value={`−${fmt(cascada.layers[1].monto)}`}
                tone="rose"
                pct={cascada.layers[1].pct}
              />
            ) : null}
            <CascadaRow
              label="Resultado del negocio"
              value={fmt(cascada.resultadoNegocio)}
              tone={cascada.resultadoNegocio >= 0 ? 'emerald' : 'rose'}
              isSubtotal
            />
            {/* Financieros */}
            {cascada.layers[2].monto > 0 ? (
              <>
                <CascadaRow
                  label={cascada.layers[2].label}
                  value={`−${fmt(cascada.layers[2].monto)}`}
                  tone="rose"
                  pct={cascada.layers[2].pct}
                />
                <CascadaRow
                  label="Resultado después de financieros"
                  value={fmt(cascada.resultadoPostFinanciero)}
                  tone={cascada.resultadoPostFinanciero >= 0 ? 'emerald' : 'rose'}
                  isSubtotal
                />
              </>
            ) : null}
            {/* Inversiones */}
            {cascada.layers[3].monto > 0 ? (
              <>
                <CascadaRow
                  label={cascada.layers[3].label}
                  value={`−${fmt(cascada.layers[3].monto)}`}
                  tone="rose"
                  pct={cascada.layers[3].pct}
                />
                <CascadaRow
                  label="Resultado después de inversiones"
                  value={fmt(cascada.resultadoPostInversion)}
                  tone={cascada.resultadoPostInversion >= 0 ? 'emerald' : 'rose'}
                  isSubtotal
                />
              </>
            ) : null}
            {/* Pendientes */}
            {cascada.layers[4].monto > 0 ? (
              <CascadaRow
                label={cascada.layers[4].label}
                value={`−${fmt(cascada.layers[4].monto)}`}
                tone="amber"
                pct={cascada.layers[4].pct}
              />
            ) : null}
            {/* Resultado final */}
            <div className="pt-1">
              <CascadaRow
                label="Resultado general"
                value={fmt(cascada.resultado)}
                tone={cascada.resultado >= 0 ? 'emerald' : 'rose'}
                isBold
                isFinal
              />
            </div>
          </div>
          {!cascada.reconciles ? (
            <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-amber-700">
              Nota: existen gastos con categoría no reconocida que están en el total de gastos pero no en las capas anteriores.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* 4 — Gastos por categoría */}
      <Card
        title="¿En qué se fue el dinero?"
        subtitle="Gastos del período por categoría financiera."
        compact
      >
        {totalGastos <= 0 ? (
          <p className="text-sm text-slate-500">Sin gastos en este período.</p>
        ) : distribucion.length === 0 ? (
          <p className="text-sm text-slate-500">Sin gastos clasificados en este período.</p>
        ) : (
          <div className="space-y-3.5">
            {distribucion.map((d) => (
              <div key={d.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{d.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {formatGlobalAmount(d.monto)} · {d.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, d.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {top3Categorias.length > 0 ? (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-800/90">
              Lo que más te costó este período
            </p>
            <ul className="mt-3 space-y-2.5">
              {top3Categorias.map((d, idx) => (
                <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 text-slate-800">
                    <span className="mr-2 font-bold tabular-nums text-violet-600">{idx + 1}.</span>
                    {d.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                    {formatGlobalAmount(d.monto)}
                    <span className="ml-1.5 font-normal text-slate-500">({d.pct.toFixed(0)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {periodInsights.length > 0 ? (
        <section className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/50 via-white to-white p-4 shadow-sm transition-shadow duration-300 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Insight del período</h2>
              <p className="text-xs text-slate-500">Lectura automática según tus números</p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {periodInsights.map((ins) => (
              <li
                key={ins.text}
                className={`rounded-xl border px-3 py-2.5 text-sm leading-snug ${
                  ins.tone === 'good'
                    ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-950'
                    : ins.tone === 'warn'
                      ? 'border-amber-200/80 bg-amber-50/80 text-amber-950'
                      : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                {ins.tone === 'good' ? '✅ ' : ins.tone === 'warn' ? '⚠️ ' : '· '}
                {ins.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Rentabilidad por vehículo */}
      {(vehiculosRentabilidad.top3.length > 0 || vehiculosRentabilidad.bottom3.length > 0) ? (
        <Card
          title="Rentabilidad por vehículo"
          subtitle="Utilidad real = ingresos del vehículo − gastos operativos del vehículo (excl. CAPEX, globales, financieros)."
          compact
        >
          {vehiculosRentabilidad.top3.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-emerald-800/90">
                Mejor desempeño
              </p>
              <div className="divide-y divide-slate-100">
                {vehiculosRentabilidad.top3.map((v, idx) => (
                  <div key={v.vehicleId} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0">
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">
                        {idx + 1}
                      </span>
                      <span className="truncate text-slate-800">{v.placa}</span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${v.utilidad >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatGlobalAmount(v.utilidad)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {vehiculosRentabilidad.bottom3.length > 0 ? (
            <div className={vehiculosRentabilidad.top3.length > 0 ? 'mt-4 pt-4 border-t border-slate-100' : ''}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-rose-800/90">
                Menor desempeño
              </p>
              <div className="divide-y divide-slate-100">
                {vehiculosRentabilidad.bottom3.map((v, idx) => (
                  <div key={v.vehicleId} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0">
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-xs font-bold text-rose-700">
                        {idx + 1}
                      </span>
                      <span className="truncate text-slate-800">{v.placa}</span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${v.utilidad >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatGlobalAmount(v.utilidad)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <Link
              to="/finanzas/reportes"
              className="text-xs font-semibold text-violet-700 hover:text-violet-900 underline decoration-violet-300"
            >
              Ver rentabilidad completa por vehículo →
            </Link>
          </div>
        </Card>
      ) : null}

      {/* Información complementaria: aportes, deuda, inversión histórica */}
      {(aportesResumen || deudaActivaResumen || inversionHistorica) ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Información financiera adicional</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Datos de contexto que no forman parte del Resultado General del período.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {aportesResumen ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Aportes de accionistas
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {formatGlobalAmount(aportesResumen.netoPen)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Neto PEN ({aportesResumen.count} movimientos)
                  {aportesResumen.tieneUsd ? ' · hay aportes en USD' : ''}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  No suma a ingresos · es capital externo al negocio
                </p>
              </div>
            ) : null}
            {deudaActivaResumen ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Deuda registrada activa{' '}
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    Estimado
                  </span>
                </p>
                {deudaActivaResumen.pen > 0 ? (
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                    {formatGlobalAmount(deudaActivaResumen.pen)}
                  </p>
                ) : null}
                {deudaActivaResumen.usd > 0 ? (
                  <p className={`tabular-nums font-bold text-slate-700 ${deudaActivaResumen.pen > 0 ? 'text-sm mt-0.5' : 'text-lg mt-1'}`}>
                    USD {deudaActivaResumen.usd.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {deudaActivaResumen.count} préstamo{deudaActivaResumen.count !== 1 ? 's' : ''} activo{deudaActivaResumen.count !== 1 ? 's' : ''}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Saldo pendiente registrado · no es deuda contable certificada
                </p>
              </div>
            ) : null}
            {inversionHistorica ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Inversión histórica en flota
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                  {formatGlobalAmount(inversionHistorica.total)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {inversionHistorica.count} vehículo{inversionHistorica.count !== 1 ? 's' : ''} registrado{inversionHistorica.count !== 1 ? 's' : ''}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Costo de compra histórico · sin depreciación ni valoración actual
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Alertas */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-slate-900">Alertas rápidas</h2>
        <p className="mt-0.5 text-xs text-slate-500">Señales para revisar sin entrar a cada módulo.</p>
        <ul className="mt-3 space-y-2">
          {alertas.map((a) => (
            <li
              key={a.id}
              className={`rounded-xl border px-3 py-2.5 ${
                a.tone === 'danger'
                  ? 'border-rose-200 bg-rose-50'
                  : a.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-wide ${
                  a.tone === 'danger' ? 'text-rose-900' : a.tone === 'warning' ? 'text-amber-950' : 'text-emerald-900'
                }`}
              >
                {a.title}
              </p>
              <p className="mt-0.5 text-sm text-slate-800">{a.text}</p>
              {a.href ? (
                <Link
                  to={a.href}
                  className="mt-1.5 inline-block text-xs font-semibold text-violet-800 underline decoration-violet-300"
                >
                  Ver detalle →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

function CascadaRow({
  label,
  value,
  tone,
  pct,
  isBold,
  isSubtotal,
  isFinal,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'amber' | 'slate';
  pct?: number;
  isBold?: boolean;
  isSubtotal?: boolean;
  isFinal?: boolean;
}) {
  const valueCls =
    tone === 'emerald'
      ? 'text-emerald-800'
      : tone === 'rose'
        ? 'text-rose-800'
        : tone === 'amber'
          ? 'text-amber-800'
          : 'text-slate-800';
  const rowCls = isFinal
    ? 'border-t-2 border-slate-200 bg-slate-50/60 mt-1 px-0 py-3'
    : isSubtotal
      ? 'py-2 border-t border-slate-100'
      : 'py-1.5';
  return (
    <div className={`flex items-center justify-between gap-2 text-sm ${rowCls}`}>
      <span
        className={`min-w-0 truncate ${isBold || isFinal ? 'font-bold text-slate-900' : isSubtotal ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
      >
        {isSubtotal || isFinal ? '= ' : isBold ? '' : '− '}
        {label}
        {pct != null && pct > 0 ? (
          <span className="ml-1.5 text-[11px] font-normal text-slate-400">({pct.toFixed(0)}%)</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 tabular-nums ${isBold || isFinal ? `font-bold text-lg ${valueCls}` : isSubtotal ? `font-semibold ${valueCls}` : valueCls}`}
      >
        {value}
      </span>
    </div>
  );
}

export default Resumen;
