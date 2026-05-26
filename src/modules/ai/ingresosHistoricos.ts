import type { Ingreso } from '../../data/types';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrencyByCode } from './dateRange';
import { monthLabelEs } from './financialAnalytics';

export type IngresoMesRankingRow = {
  periodo: string;
  anio: number;
  mes: number;
  label: string;
  ingresos_pen: number;
  count: number;
  ingresos_formatted: string;
};

export function buildIngresosHistoricosPorMes(
  ingresos: Ingreso[],
  opts?: { anio?: number; limit?: number },
): {
  alcance: string;
  ranking_meses: IngresoMesRankingRow[];
  mejor_mes_historico: IngresoMesRankingRow | null;
  total_meses_con_datos: number;
} {
  const map = new Map<string, { count: number; total: number }>();

  for (const ing of ingresos) {
    const y = Number(ing.fecha.slice(0, 4));
    const m = Number(ing.fecha.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) continue;
    if (opts?.anio != null && y !== opts.anio) continue;
    const mk = ing.fecha.slice(0, 7);
    const prev = map.get(mk) ?? { count: 0, total: 0 };
    prev.count += 1;
    prev.total += ingresoMontoPEN(ing);
    map.set(mk, prev);
  }

  const ranking = [...map.entries()]
    .map(([periodo, v]) => {
      const anio = Number(periodo.slice(0, 4));
      const mes = Number(periodo.slice(5, 7));
      return {
        periodo,
        anio,
        mes,
        label: monthLabelEs(periodo),
        ingresos_pen: v.total,
        count: v.count,
        ingresos_formatted: formatCurrencyByCode(v.total, 'PEN'),
      };
    })
    .sort((a, b) => b.ingresos_pen - a.ingresos_pen);

  const limit = opts?.limit ?? 24;

  return {
    alcance: opts?.anio != null ? `año ${opts.anio}` : 'histórico completo (todos los años)',
    ranking_meses: ranking.slice(0, limit),
    mejor_mes_historico: ranking[0] ?? null,
    total_meses_con_datos: map.size,
  };
}
