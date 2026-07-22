import type { GuaranteeVehicleType } from '../config/guaranteeAmounts';
import { getDefaultRequiredAmount } from '../config/guaranteeAmounts';
import type { Vehicle } from '../data/types';

const CAMIONETA_RE =
  /\b(camioneta|pickup|pick[\s-]?up|suv|van|minivan|4x4|glory|hilux|ranger|frontier|duster|tracker|captur)\b/i;

/**
 * Infiere tipo para garantía. Override manual siempre disponible en formularios.
 */
export function inferGuaranteeVehicleType(
  vehicle: Pick<Vehicle, 'tipoCarroceria' | 'modelo' | 'marca'> | null | undefined,
): GuaranteeVehicleType {
  if (!vehicle) return 'auto';
  const hay = [vehicle.tipoCarroceria, vehicle.modelo, vehicle.marca]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (CAMIONETA_RE.test(hay)) return 'camioneta';
  const carroceria = (vehicle.tipoCarroceria ?? '').trim().toUpperCase();
  if (carroceria === 'SUV' || carroceria.includes('CAMIONETA')) return 'camioneta';
  return 'auto';
}

export function resolveRequiredAmountForVehicle(
  vehicle: Pick<Vehicle, 'tipoCarroceria' | 'modelo' | 'marca'> | null | undefined,
  amounts?: Partial<Record<GuaranteeVehicleType, number>>,
): { vehicleType: GuaranteeVehicleType; requiredAmount: number } {
  const vehicleType = inferGuaranteeVehicleType(vehicle);
  const requiredAmount = amounts?.[vehicleType] ?? getDefaultRequiredAmount(vehicleType);
  return { vehicleType, requiredAmount };
}
