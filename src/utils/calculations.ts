import { Ingreso, Gasto, Descuento, Vehicle, KPIData, VehicleRentability } from '../data/types';
import { ingresoMontoPEN } from './moneda';

export const calculateKPIs = (
  ingresos: Ingreso[],
  gastos: Gasto[],
  descuentos: Descuento[] = [],
): KPIData => {
  const totalIngresos = ingresos.reduce((sum, i) => sum + ingresoMontoPEN(i), 0);
  const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
  const totalDescuentos = descuentos.reduce((sum, d) => sum + d.monto, 0);
  /** totalDescuentos suele ser ≤ 0; sumarlo resta del margen de forma consistente */
  const margenNeto = totalIngresos - totalGastos + totalDescuentos;

  const uniqueDates = new Set(ingresos.map(i => i.fecha));
  const promedioIngresoDiario = uniqueDates.size > 0 ? totalIngresos / uniqueDates.size : 0;

  const ingresosPorTipo: Record<string, number> = {};
  ingresos.forEach(i => {
    ingresosPorTipo[i.tipo] = (ingresosPorTipo[i.tipo] ?? 0) + ingresoMontoPEN(i);
  });

  const gastosPorCategoria: Record<string, number> = {};
  gastos.forEach(g => {
    gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] ?? 0) + g.monto;
  });

  const descuentosPorCategoria: Record<string, number> = {};
  descuentos.forEach(d => {
    descuentosPorCategoria[d.categoria] = (descuentosPorCategoria[d.categoria] ?? 0) + d.monto;
  });

  return {
    totalIngresos,
    totalGastos,
    totalDescuentos,
    margenNeto,
    promedioIngresoDiario,
    ingresosPorTipo,
    gastosPorCategoria,
    descuentosPorCategoria,
  };
};

export const calculateVehicleRentability = (
  vehicles: Vehicle[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  descuentos: Descuento[] = [],
): VehicleRentability[] => {
  return vehicles
    .filter(v => v.activo)
    .map(vehicle => {
      const vehicleIngresos = ingresos.filter(i => i.vehicleId === vehicle.id);
      const vehicleGastos = gastos.filter(g => g.vehicleId === vehicle.id);
      const vehicleDescuentos = descuentos.filter(d => d.vehicleId === vehicle.id);

      const totalIngresos = vehicleIngresos.reduce((sum, i) => sum + ingresoMontoPEN(i), 0);
      const totalGastos = vehicleGastos.reduce((sum, g) => sum + g.monto, 0);
      const totalDescuentos = vehicleDescuentos.reduce((sum, d) => sum + d.monto, 0);

      return {
        vehicle,
        totalIngresos,
        totalGastos,
        totalDescuentos,
        margen: totalIngresos - totalGastos + totalDescuentos,
      };
    })
    .sort((a, b) => b.margen - a.margen);
};

export const getPercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};
