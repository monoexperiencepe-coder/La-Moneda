import type { Gasto, Ingreso } from '../../data/types';
import { resolveAiDateRange, formatCurrencyByCode } from './dateRange';
import { buildTopVehiculosUtilidad } from '../../utils/utilidadReal';
import type { Vehicle } from '../../data/types';
import { getVehicleDisplayNumber } from '../../utils/vehicleDisplayNumber';

export type UtilidadRankPeriodo = 'historico' | 'mes' | 'rango';

export function resolveUtilidadRankPeriodo(args: Record<string, unknown>): {
  periodo: UtilidadRankPeriodo;
  desde: string | null;
  hasta: string | null;
  label: string;
} {
  const raw = String(args.periodo ?? 'historico').trim().toLowerCase();

  if (raw === 'historico' || raw === 'histórico' || raw === 'historical') {
    return { periodo: 'historico', desde: null, hasta: null, label: 'Histórico completo' };
  }

  if (raw === 'mes' || raw === 'month') {
    const range = resolveAiDateRange({ periodo: 'month' });
    return { periodo: 'mes', desde: range.desde, hasta: range.hasta, label: range.label };
  }

  if (raw === 'rango' || raw === 'custom' || raw === 'range') {
    const desdeArg = args.desde != null ? String(args.desde).slice(0, 10) : null;
    const hastaArg = args.hasta != null ? String(args.hasta).slice(0, 10) : null;
    if (desdeArg && hastaArg) {
      return { periodo: 'rango', desde: desdeArg, hasta: hastaArg, label: `${desdeArg} → ${hastaArg}` };
    }
    const range = resolveAiDateRange({ periodo: 'custom', desde: desdeArg, hasta: hastaArg });
    return { periodo: 'rango', desde: range.desde, hasta: range.hasta, label: range.label };
  }

  if (/^\d{4}$/.test(raw)) {
    const y = Number(raw);
    return {
      periodo: 'rango',
      desde: `${y}-01-01`,
      hasta: `${y}-12-31`,
      label: `Año ${y}`,
    };
  }

  const year = Number(args.anio ?? args.year);
  if (Number.isFinite(year) && year >= 2000 && year <= 2100) {
    return {
      periodo: 'rango',
      desde: `${year}-01-01`,
      hasta: `${year}-12-31`,
      label: `Año ${year}`,
    };
  }

  return { periodo: 'historico', desde: null, hasta: null, label: 'Histórico completo' };
}

export function diagnoseUtilidadRankDataSources(
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
): string[] {
  const issues: string[] = [];
  if (ingresos.length === 0) {
    issues.push('public.ingresos: no hay filas cargadas');
  } else if (!ingresos.some((i) => i.vehicleId != null)) {
    issues.push('public.ingresos: hay registros pero ninguno con vehicle_id');
  }
  if (gastos.length === 0) {
    issues.push('public.gastos: no hay filas cargadas');
  } else if (!gastos.some((g) => g.vehicleId != null)) {
    issues.push('public.gastos: hay registros pero ninguno con vehicle_id');
  }
  return issues;
}

export function formatTopVehiculosUtilidadForLlm(
  ranking: ReturnType<typeof buildTopVehiculosUtilidad>,
  vehicles: readonly Vehicle[] = [],
): string[] {
  return ranking.map((r) => {
    const v = vehicles.find((x) => x.id === r.vehicleId);
    const unit = v ? getVehicleDisplayNumber(v) : r.vehicleId;
    return [
      `#${unit} ${r.placa}`,
      `Ingresos: ${formatCurrencyByCode(r.ingresos, 'PEN')}`,
      `Gastos: ${formatCurrencyByCode(r.gastos, 'PEN')}`,
      `Utilidad: ${formatCurrencyByCode(r.utilidad, 'PEN')}`,
    ].join('\n');
  });
}

export function buildUtilidadRankToolPayload(
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  args: Record<string, unknown>,
): Record<string, unknown> {
  const period = resolveUtilidadRankPeriodo(args);
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 10);
  const ranking = buildTopVehiculosUtilidad(vehicles, ingresos, gastos, {
    desde: period.desde,
    hasta: period.hasta,
    limit,
  });
  const lineasRanking = formatTopVehiculosUtilidadForLlm(ranking, vehicles);
  const datosFaltantes = diagnoseUtilidadRankDataSources(ingresos, gastos);

  return {
    _tipo_metrica: 'ranking_utilidad',
    _preserve_summary: true,
    periodo: period,
    formula: 'utilidad = Σ ingresos(vehicle_id, PEN) − Σ gastos(vehicle_id permitidos)',
    fuentes: {
      ingresos: 'public.ingresos — vehicle_id, monto vía ingresoMontoPEN()',
      gastos:
        'public.gastos — vehicle_id; excluye inversion_compra, gastos_globales, compra_activo, inversion_general, gasto_global, financiero_global y no operativos',
    },
    prohibido_mencionar: [
      'ingresos consolidados sin vehículo',
      'caja_negocio_vehiculo como proxy',
      'utilidad no disponible por falta de vehicle_id en ingresos',
    ],
    ranking: ranking.map((r, idx) => {
      const v = vehicles.find((x) => x.id === r.vehicleId);
      const unit = v ? getVehicleDisplayNumber(v) : r.vehicleId;
      return {
        posicion: idx + 1,
        vehicleId: r.vehicleId,
        numeroUnidad: unit,
        placa: r.placa,
        ingresos: r.ingresos,
        gastos: r.gastos,
        utilidad: r.utilidad,
        ingresos_formatted: formatCurrencyByCode(r.ingresos, 'PEN'),
        gastos_formatted: formatCurrencyByCode(r.gastos, 'PEN'),
        utilidad_formatted: formatCurrencyByCode(r.utilidad, 'PEN'),
        linea_compacta: `#${unit} ${r.placa} — Ingresos ${formatCurrencyByCode(r.ingresos, 'PEN')}, Gastos ${formatCurrencyByCode(r.gastos, 'PEN')}, Utilidad ${formatCurrencyByCode(r.utilidad, 'PEN')}`,
      };
    }),
    lineas_ranking: lineasRanking,
    lineas_ranking_compact: ranking.map(
      (r, idx) =>
        `${idx + 1}. ${r.placa} — Ingresos ${formatCurrencyByCode(r.ingresos, 'PEN')}, Gastos ${formatCurrencyByCode(r.gastos, 'PEN')}, Utilidad ${formatCurrencyByCode(r.utilidad, 'PEN')}`,
    ),
    count: ranking.length,
    datos_faltantes: datosFaltantes.length > 0 ? datosFaltantes : null,
    instruccion_respuesta:
      'Presenta el ranking real (top 10) con el formato #N PLACA + Ingresos + Gastos + Utilidad por unidad. No inventes cifras. Si datos_faltantes no es null, indica exactamente qué tabla falta.',
  };
}
