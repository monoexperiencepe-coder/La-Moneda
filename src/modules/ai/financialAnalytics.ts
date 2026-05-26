/**
 * Capas financieras (OPEX vs CAPEX), agregados mensuales e insights para el asistente IA.
 * No altera datos en BD — solo interpretación de consultas.
 */
import type { Gasto } from '../../data/types';
import type { Ingreso } from '../../data/types';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import { formatCurrencyByCode, sumMontos, sumMontosByCurrency } from './dateRange';

export const TIPO_GASTO_CAPEX = 'inversion_compra';

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function isCapexTipoGasto(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim() === TIPO_GASTO_CAPEX;
}

export function splitGastosByCapa(gastos: Gasto[]): {
  opex: Gasto[];
  capex: Gasto[];
  pendiente: Gasto[];
  otros: Gasto[];
} {
  const opex: Gasto[] = [];
  const capex: Gasto[] = [];
  const pendiente: Gasto[] = [];
  const otros: Gasto[] = [];
  for (const g of gastos) {
    const t = g.tipo_gasto ?? '';
    if (t === TIPO_GASTO_CAPEX) capex.push(g);
    else if (t === 'pendiente_revision') pendiente.push(g);
    else if (t) opex.push(g);
    else otros.push(g);
  }
  return { opex, capex, pendiente, otros };
}

export function monthKeyFromFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

export function monthLabelEs(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return monthKey;
  return `${MESES_ES[mi]} ${y}`;
}

export type MonthlyBucket = {
  month: string;
  label: string;
  ingresos_pen: number;
  ingresos_usd: number;
  gastos_opex_pen: number;
  gastos_capex_pen: number;
  utilidad_operativa_pen: number;
};

export function buildMonthlyBuckets(
  gastos: Gasto[],
  ingresos: Ingreso[],
): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>();

  const ensure = (mk: string): MonthlyBucket => {
    let b = map.get(mk);
    if (!b) {
      b = {
        month: mk,
        label: monthLabelEs(mk),
        ingresos_pen: 0,
        ingresos_usd: 0,
        gastos_opex_pen: 0,
        gastos_capex_pen: 0,
        utilidad_operativa_pen: 0,
      };
      map.set(mk, b);
    }
    return b;
  };

  for (const ing of ingresos) {
    const mk = monthKeyFromFecha(ing.fecha);
    const b = ensure(mk);
    const cur = ing.moneda?.toUpperCase()?.trim() || 'PEN';
    if (cur === 'USD') b.ingresos_usd += ing.monto;
    else b.ingresos_pen += ing.monto;
  }

  const { opex, capex } = splitGastosByCapa(gastos);
  for (const g of opex) {
    const b = ensure(monthKeyFromFecha(g.fecha));
    b.gastos_opex_pen += g.monto;
  }
  for (const g of capex) {
    const b = ensure(monthKeyFromFecha(g.fecha));
    b.gastos_capex_pen += g.monto;
  }

  for (const b of map.values()) {
    b.utilidad_operativa_pen = b.ingresos_pen - b.gastos_opex_pen;
  }

  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type FinancialInsight = {
  tipo: 'anomalia' | 'capex' | 'margen' | 'crecimiento' | 'concentracion' | 'calidad' | 'observacion';
  texto: string;
  severidad: 'info' | 'alerta';
};

export function detectFinancialInsights(opts: {
  gastos: Gasto[];
  ingresos: Ingreso[];
  monthly: MonthlyBucket[];
  duplicateWarnings?: string[];
}): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const { opex, capex, pendiente } = splitGastosByCapa(opts.gastos);
  const monthly = opts.monthly;

  if (pendiente.length > 0) {
    insights.push({
      tipo: 'calidad',
      texto: `${pendiente.length} gasto(s) aún en pendiente de revisión (no entran en márgenes operativos hasta clasificarse).`,
      severidad: 'info',
    });
  }

  if (monthly.length >= 2) {
    const withIng = monthly.filter((m) => m.ingresos_pen > 0);
    if (withIng.length >= 2) {
      const bestIng = [...withIng].sort((a, b) => b.ingresos_pen - a.ingresos_pen)[0];
      insights.push({
        tipo: 'observacion',
        texto: `${bestIng.label} concentró la mayor facturación bruta del periodo (S/ ${fmtPen(bestIng.ingresos_pen)}).`,
        severidad: 'info',
      });
    }

    const withMargin = monthly.filter((m) => m.ingresos_pen > 0);
    if (withMargin.length >= 2) {
      const bestMargin = [...withMargin].sort((a, b) => b.utilidad_operativa_pen - a.utilidad_operativa_pen)[0];
      const worstMargin = [...withMargin].sort((a, b) => a.utilidad_operativa_pen - b.utilidad_operativa_pen)[0];
      if (bestMargin.month !== worstMargin.month) {
        insights.push({
          tipo: 'margen',
          texto: `${bestMargin.label} mostró la mejor eficiencia operativa (utilidad operativa S/ ${fmtPen(bestMargin.utilidad_operativa_pen)}).`,
          severidad: 'info',
        });
        if (worstMargin.utilidad_operativa_pen < 0) {
          insights.push({
            tipo: 'margen',
            texto: `${worstMargin.label} fue el mes más débil operativamente (utilidad operativa ${fmtPen(worstMargin.utilidad_operativa_pen)}).`,
            severidad: 'alerta',
          });
        }
      }
    }

    const capexMonths = monthly.filter((m) => m.gastos_capex_pen > 0);
    if (capexMonths.length > 0) {
      const capexAmounts = capexMonths.map((m) => m.gastos_capex_pen);
      const median = [...capexAmounts].sort((a, b) => a - b)[Math.floor(capexAmounts.length / 2)] ?? 0;
      for (const m of capexMonths) {
        const esExtraordinario = m.gastos_capex_pen > Math.max(median * 2, 50_000);
        if (esExtraordinario) {
          insights.push({
            tipo: 'capex',
            texto: `${m.label} registra inversión extraordinaria (CAPEX ~S/ ${fmtPen(m.gastos_capex_pen)}): expansión de activos, no deterioro operativo.`,
            severidad: 'info',
          });
        }
      }
    }

    const last = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    if (prev.ingresos_pen > 0) {
      const growth = ((last.ingresos_pen - prev.ingresos_pen) / prev.ingresos_pen) * 100;
      if (Math.abs(growth) >= 15) {
        insights.push({
          tipo: 'crecimiento',
          texto: `Ingresos ${growth >= 0 ? 'subieron' : 'cayeron'} ~${Math.abs(Math.round(growth))}% entre ${prev.label} y ${last.label} (solo PEN).`,
          severidad: growth < -25 ? 'alerta' : 'info',
        });
      }
    }
  }

  if (opex.length >= 5) {
    const montos = opex.map((g) => g.monto).sort((a, b) => a - b);
    const median = montos[Math.floor(montos.length / 2)] ?? 0;
    const outliers = opex.filter((g) => median > 0 && g.monto > median * 4);
    if (outliers.length > 0) {
      insights.push({
        tipo: 'anomalia',
        texto: `${outliers.length} gasto(s) operativo(s) con monto inusualmente alto vs la mediana del periodo.`,
        severidad: 'alerta',
      });
    }
  }

  const operativosVehiculo = opex.filter((g) => g.tipo_gasto === 'operativo_vehiculo' && g.vehicleId != null);
  if (operativosVehiculo.length >= 3) {
    const byV = new Map<string, number>();
    for (const g of operativosVehiculo) {
      const k = String(g.vehicleId);
      byV.set(k, (byV.get(k) ?? 0) + g.monto);
    }
    const total = sumMontos(operativosVehiculo);
    const top = [...byV.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && total > 0 && top[1] / total > 0.35) {
      insights.push({
        tipo: 'concentracion',
        texto: `Alta concentración de gasto operativo en la unidad ${top[0]} (~${Math.round((top[1] / total) * 100)}% del OPEX vehicular).`,
        severidad: 'info',
      });
    }
  }

  for (const w of opts.duplicateWarnings ?? []) {
    insights.push({ tipo: 'calidad', texto: w, severidad: 'alerta' });
  }

  return insights.slice(0, 12);
}

export function fmtPen(amount: number): string {
  return formatCurrencyByCode(amount, 'PEN');
}

export function fmtUsd(amount: number): string {
  return formatCurrencyByCode(amount, 'USD');
}

/** Resumen de capas para tools / LLM (compacto). */
export function buildCapasFinancierasResumen(gastos: Gasto[], ingresos: Ingreso[]) {
  const { opex, capex, pendiente } = splitGastosByCapa(gastos);
  const ingresosByCur = sumMontosByCurrency(ingresos);
  const totalIngresosPen = ingresosByCur.PEN?.total ?? 0;
  const totalIngresosUsd = ingresosByCur.USD?.total ?? 0;
  const totalOpexPen = sumMontos(opex);
  const totalCapexPen = sumMontos(capex);
  const utilidadOperativaPen = totalIngresosPen - totalOpexPen;
  const flujoTotalPen = totalIngresosPen - totalOpexPen - totalCapexPen;

  return {
    ingresos: {
      pen: { total: totalIngresosPen, count: ingresosByCur.PEN?.count ?? 0, formatted: fmtPen(totalIngresosPen) },
      usd: { total: totalIngresosUsd, count: ingresosByCur.USD?.count ?? 0, formatted: fmtUsd(totalIngresosUsd) },
    },
    gastos_operativos_opex: {
      total_pen: totalOpexPen,
      count: opex.length,
      formatted: fmtPen(totalOpexPen),
      nota: 'Excluye inversion_compra (CAPEX) y separa pendientes de revisión.',
    },
    inversiones_capex: {
      total_pen: totalCapexPen,
      count: capex.length,
      formatted: fmtPen(totalCapexPen),
      nota: 'Compras de activos, vehículos, terrenos, equipamiento — no son gasto operativo recurrente.',
    },
    pendientes_revision: {
      count: pendiente.length,
      total_pen: sumMontos(pendiente),
      formatted: fmtPen(sumMontos(pendiente)),
    },
    utilidad_operativa_pen: {
      value: utilidadOperativaPen,
      formatted: fmtPen(utilidadOperativaPen),
      formula: 'Ingresos PEN − Gastos operativos (OPEX) PEN. Sin CAPEX.',
    },
    flujo_neto_pen: {
      value: flujoTotalPen,
      formatted: fmtPen(flujoTotalPen),
      formula: 'Ingresos PEN − OPEX PEN − CAPEX PEN.',
    },
  };
}

export function aggregateOpexByTipo(gastos: Gasto[]): Array<{ tipo_gasto: string; label: string; count: number; monto: number }> {
  const { opex } = splitGastosByCapa(gastos);
  const map = new Map<string, { count: number; monto: number }>();
  for (const g of opex) {
    const key = g.tipo_gasto ?? 'sin_tipo';
    const prev = map.get(key) ?? { count: 0, monto: 0 };
    map.set(key, { count: prev.count + 1, monto: prev.monto + g.monto });
  }
  return [...map.entries()]
    .map(([tipo_gasto, v]) => ({
      tipo_gasto,
      label: labelTipoGastoFinanciero(tipo_gasto),
      count: v.count,
      monto: v.monto,
    }))
    .sort((a, b) => b.monto - a.monto);
}

export function narrativeHintsFromInsights(insights: FinancialInsight[]): string[] {
  return insights.map((i) => i.texto);
}
