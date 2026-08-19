import { useEffect, useMemo } from 'react';
import { useRegistrosContext } from '../context/RegistrosContext';
import {
  buildUtilidadRealMensualFlota,
  buildUtilidadRealPorVehiculo,
  calcularUtilidadRealVehiculo,
  sumUtilidadRealFlota,
  type UtilidadRealMes,
  type UtilidadRealVehiculo,
} from '../utils/utilidadReal';
import {
  auditUtilidadListaVsDetalle,
  logAuditUtilidadDetalle,
  logAuditUtilidadLista,
} from '../utils/utilidadRealAudit';
import { useEnsureGastosFullForUtilidad } from './useEnsureGastosFullForUtilidad';

const FORMULA =
  'calcularUtilidadRealVehiculo: Σ ingresos(vehicle_id) − Σ gastos(vehicle_id)';

export type UseUtilidadRealCalculosOptions = {
  /** Log DEV de filas ejemplo al tener gastos completos. */
  auditSampleVehicleIds?: number[];
  pantalla?: string;
};

/**
 * Utilidad real unificada: espera histórico completo de gastos antes de calcular.
 * Todas las pantallas de utilidad por vehículo deben usar este hook.
 */
export function useUtilidadRealCalculos(options: UseUtilidadRealCalculosOptions = {}) {
  const { pantalla = 'useUtilidadRealCalculos', auditSampleVehicleIds = [1] } = options;
  const {
    ingresos,
    gastos,
    vehicles,
    gastosLoadScope,
    gastosFullStatus,
    gastosFullError,
    ensureGastosFull,
  } = useRegistrosContext();
  const { gastosReadyForUtilidad, isLoadingGastosFull } = useEnsureGastosFullForUtilidad();

  const gastosSource = gastosLoadScope === 'full' ? 'full_historico' : 'bootstrap_recent';

  const porVehiculo: UtilidadRealVehiculo[] = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return buildUtilidadRealPorVehiculo(vehicles, ingresos, gastos);
  }, [gastosReadyForUtilidad, vehicles, ingresos, gastos]);

  const totalFlota = useMemo(() => {
    if (!gastosReadyForUtilidad) return 0;
    return sumUtilidadRealFlota(ingresos, gastos, vehicles);
  }, [gastosReadyForUtilidad, ingresos, gastos, vehicles]);

  const porMes: UtilidadRealMes[] = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return buildUtilidadRealMensualFlota(ingresos, gastos);
  }, [gastosReadyForUtilidad, ingresos, gastos]);

  useEffect(() => {
    if (!import.meta.env.DEV || !gastosReadyForUtilidad) return;
    for (const vid of auditSampleVehicleIds) {
      const row = porVehiculo.find((r) => r.vehicleId === vid);
      if (!row) continue;
      const v = vehicles.find((x) => x.id === vid);
      logAuditUtilidadLista({
        vehicleId: vid,
        placa: v?.placa,
        ingresos: row.ingresosTotal,
        gastos: row.gastosTotal,
        utilidad: row.utilidadReal,
        gastosSource,
        gastosLoadScope,
        gastosEnMemoria: gastos.length,
        formula: FORMULA,
        pantalla,
      });
    }
    console.warn('[audit:utilidad:lista:resumen]', {
      pantalla,
      gastosLoadScope,
      gastosEnMemoria: gastos.length,
      vehiculosEnLista: porVehiculo.length,
      totalFlota,
      formula: FORMULA,
    });
  }, [
    gastosReadyForUtilidad,
    porVehiculo,
    auditSampleVehicleIds,
    vehicles,
    gastosSource,
    gastosLoadScope,
    gastos.length,
    gastos,
    totalFlota,
    pantalla,
  ]);

  return {
    porVehiculo,
    totalFlota,
    porMes,
    gastosReadyForUtilidad,
    isLoadingGastosFull,
    gastosLoadScope,
    gastosFullStatus,
    gastosFullError,
    retryGastosFull: ensureGastosFull,
    gastosEnMemoria: gastos.length,
    formula: FORMULA,
  };
}

export function useUtilidadRealVehiculo(
  vehicleId: number,
  pantalla = 'VehiculoDetalle',
): {
  ingresosTotal: number;
  gastosTotal: number;
  utilidadReal: number;
  gastosReadyForUtilidad: boolean;
  isLoadingGastosFull: boolean;
} {
  const { ingresos, gastos, vehicles, gastosLoadScope } = useRegistrosContext();
  const { gastosReadyForUtilidad, isLoadingGastosFull } = useEnsureGastosFullForUtilidad();

  const result = useMemo(() => {
    if (!gastosReadyForUtilidad) {
      return { ingresosTotal: 0, gastosTotal: 0, utilidadReal: 0 };
    }
    return calcularUtilidadRealVehiculo(vehicleId, ingresos, gastos);
  }, [gastosReadyForUtilidad, vehicleId, ingresos, gastos]);

  useEffect(() => {
    if (!import.meta.env.DEV || !gastosReadyForUtilidad) return;
    const v = vehicles.find((x) => x.id === vehicleId);
    logAuditUtilidadDetalle({
      vehicleId,
      placa: v?.placa,
      ingresos: result.ingresosTotal,
      gastos: result.gastosTotal,
      utilidad: result.utilidadReal,
      gastosSource: gastosLoadScope === 'full' ? 'full_historico' : 'bootstrap_recent',
      gastosLoadScope,
      gastosEnMemoria: gastos.length,
      cantidadGastosVehiculo: gastos.filter(
        (g) => g.vehicleId != null && String(g.vehicleId) === String(vehicleId),
      ).length,
      formula: FORMULA,
      pantalla,
    });
  }, [gastosReadyForUtilidad, result, vehicleId, vehicles, gastosLoadScope, gastos.length, gastos, pantalla]);

  return {
    ...result,
    gastosReadyForUtilidad,
    isLoadingGastosFull,
  };
}

export function runAuditUtilidadCompare(
  vehicleIdOrPlaca: number | string,
  vehicles: readonly import('../data/types').Vehicle[],
  ingresos: readonly import('../data/types').Ingreso[],
  gastos: readonly import('../data/types').Gasto[],
  gastosLoadScope: 'recent' | 'full',
): void {
  auditUtilidadListaVsDetalle(vehicleIdOrPlaca, vehicles, ingresos, gastos, gastosLoadScope);
}
