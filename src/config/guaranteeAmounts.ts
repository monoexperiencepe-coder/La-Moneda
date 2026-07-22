/** Montos de garantía requerida (centralizados; no hardcodear en UI). */
export type GuaranteeVehicleType = 'auto' | 'camioneta';

export const DEFAULT_GUARANTEE_AMOUNTS: Record<GuaranteeVehicleType, number> = {
  auto: 1000,
  camioneta: 1500,
};

export const GUARANTEE_VEHICLE_TYPE_LABELS: Record<GuaranteeVehicleType, string> = {
  auto: 'Auto',
  camioneta: 'Camioneta',
};

export function getDefaultRequiredAmount(vehicleType: GuaranteeVehicleType): number {
  return DEFAULT_GUARANTEE_AMOUNTS[vehicleType];
}
