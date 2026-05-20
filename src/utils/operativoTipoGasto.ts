/** Gasto operativo ligado a una unidad (vehículo obligatorio). */
export const TIPO_GASTO_OPERATIVO_VEHICULO = 'operativo_vehiculo' as const;

/** Gasto operativo de flota sin vehículo trazable (varios carros o sin unidad). */
export const TIPO_GASTO_OPERATIVO_FLOTA_GENERAL = 'operativo_flota_general' as const;

export type OperativoTipoGasto =
  | typeof TIPO_GASTO_OPERATIVO_VEHICULO
  | typeof TIPO_GASTO_OPERATIVO_FLOTA_GENERAL;

const OPERATIVO_TIPOS = new Set<string>([
  TIPO_GASTO_OPERATIVO_VEHICULO,
  TIPO_GASTO_OPERATIVO_FLOTA_GENERAL,
]);

export function isOperativoTipoGasto(tipo: string | null | undefined): boolean {
  return OPERATIVO_TIPOS.has((tipo ?? '').trim());
}

export function isOperativoVehiculoTipoGasto(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim() === TIPO_GASTO_OPERATIVO_VEHICULO;
}

export function isOperativoFlotaGeneralTipoGasto(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim() === TIPO_GASTO_OPERATIVO_FLOTA_GENERAL;
}

/** Suma gastos operativos (unidad + flota general) en un rango de fechas. */
export function matchesOperativoTipoNormalized(normalizedTipo: string): boolean {
  return (
    normalizedTipo === TIPO_GASTO_OPERATIVO_VEHICULO ||
    normalizedTipo === TIPO_GASTO_OPERATIVO_FLOTA_GENERAL
  );
}
