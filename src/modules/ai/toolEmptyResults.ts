import type { AiToolName } from './types';

const EMPTY_MESSAGES: Partial<Record<AiToolName, string>> = {
  getResumenFinancieroPeriodo: 'No encontré movimientos financieros para ese periodo.',
  getIngresosPeriodo: 'No encontré ingresos registrados para ese periodo.',
  getIngresosHistoricosPorMes: 'No encontré ingresos históricos por mes en los registros.',
  getGastosPeriodo: 'No encontré gastos para ese periodo o categoría.',
  getGastosPorCategoria: 'No encontré gastos por categoría en ese periodo.',
  getVehiculosConMasGasto: 'No encontré gastos operativos por vehículo en ese periodo.',
  getPendientesRevision: 'No hay gastos pendientes de revisión en este momento.',
  getGastosGlobales: 'No hay gastos globales registrados.',
  getPrestamosActivos: 'No hay préstamos activos registrados.',
  getMovimientosRecientes: 'No encontré movimientos recientes visibles.',
  getHistorialVehiculo: 'No encontré historial de gastos para ese vehículo.',
  getPendientesConSugerencia: 'No hay pendientes ni gastos globales para sugerir clasificación.',
  getRankingInversionVehiculos: 'No encontré registros de inversión vehicular registrados.',
  getDetalleInversionVehiculo: 'No encontré inversión registrada para ese vehículo.',
  getInversionesNoVehiculares: 'No encontré inversiones no vehiculares registradas para ese subtipo o periodo.',
  getFlotaResumen: 'No hay vehículos registrados en la flota.',
  getVehiculosDisponibles: 'No hay vehículos activos disponibles (todos tienen conductor asignado o están inactivos).',
  getVehiculosSinConductor: 'No hay vehículos activos sin conductor asignado.',
  getConductoresAsignados: 'No hay conductores vigentes con vehículo asignado.',
  getVehiculoPorPlaca: 'No encontré un vehículo con esa placa.',
  getConductorPorVehiculo: 'No encontré conductor ni vehículo con ese criterio.',
};

export function emptyResultMessageForTool(tool: AiToolName): string {
  return EMPTY_MESSAGES[tool] ?? 'No encontré registros para esa consulta.';
}

function countFromData(data: Record<string, unknown>): number | null {
  if (typeof data.count === 'number') return data.count;
  if (Array.isArray(data.filas)) return data.filas.length;
  if (Array.isArray(data.movimientos)) return data.movimientos.length;
  if (Array.isArray(data.prestamos)) return data.prestamos.length;
  if (Array.isArray(data.gastos)) return data.gastos.length;
  if (Array.isArray(data.ranking_meses)) return data.ranking_meses.length;
  if (Array.isArray(data.ranking)) return data.ranking.length;
  if (Array.isArray(data.categorias)) return data.categorias.length;
  if (Array.isArray(data.sugerencias)) return data.sugerencias.length;
  if (Array.isArray(data.items)) return data.items.length;
  if (Array.isArray(data.vehiculos)) return data.vehiculos.length;
  if (Array.isArray(data.asignados)) return data.asignados.length;
  return null;
}

/** Indica si el payload de una tool es vacío (0 registros). */
export function isAiToolResultEmpty(tool: AiToolName, data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (tool === 'getResumenFinancieroPeriodo') {
    const opexCount =
      (d.gastos_operativos_opex as { count?: number } | undefined)?.count ??
      (d.gastos as { count?: number } | undefined)?.count ??
      0;
    const ingresosCount = (d.ingresos as { count?: number } | undefined)?.count ?? 0;
    return opexCount === 0 && ingresosCount === 0;
  }

  if (tool === 'suggestCategoriaGasto') {
    return d.tipo_gasto_sugerido == null && d.categoriaSugerida == null;
  }

  if (tool === 'getFlotaResumen') {
    return (d.total as number | undefined) === 0;
  }

  if (tool === 'getVehiculoPorPlaca' || tool === 'getConductorPorVehiculo') {
    return d.encontrado === false && !Array.isArray(d.coincidencias_nombre);
  }

  const c = countFromData(d);
  if (c != null) return c === 0;

  if (tool === 'getGastosPorCategoria') {
    const cats =
      (d.categorias_operativas_opex as Array<{ count?: number; monto?: number }> | undefined) ??
      (d.categorias as Array<{ count?: number; monto?: number }> | undefined);
    return !cats?.length || cats.every((x) => (x.count ?? 0) === 0 && (x.monto ?? 0) === 0);
  }

  return false;
}

/** Enriquece resultado para el LLM: no inventar si empty. */
export function enrichToolPayloadForLlm(
  tool: AiToolName,
  data: unknown,
): Record<string, unknown> {
  const base =
    data != null && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : { value: data };

  if (!isAiToolResultEmpty(tool, data)) {
    return { ok: true, ...base, empty: false };
  }

  return {
    ok: true,
    ...base,
    empty: true,
    mensaje_sin_datos: emptyResultMessageForTool(tool),
    instruccion:
      'Informa al usuario con este mensaje. No inventes cifras ni registros.',
  };
}
