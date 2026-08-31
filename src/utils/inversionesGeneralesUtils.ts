/**
 * Utilidades puras de inversiones_generales_vehiculo — sin dependencias de Supabase.
 * Extraídas aquí para permitir tests unitarios en Node.js (Playwright unit runner).
 */

/**
 * Calcula monto_total a partir del desglose USD.
 * Si la suma es 0 (sin desglose), usa el fallback (por ejemplo el monto_total existente).
 * Resultado nunca negativo.
 */
export function computeInversionMontoTotal(
  desglose: {
    valorCompraUsd?: number | null;
    gastoGnvUsd?: number | null;
    gastoNotarialUsd?: number | null;
    legFirmasUsd?: number | null;
    seguroUsd?: number | null;
    gpsUsd?: number | null;
    fundasAccesoriosUsd?: number | null;
  },
  fallbackMontoTotal?: number | null,
): number {
  const sum = [
    desglose.valorCompraUsd,
    desglose.gastoGnvUsd,
    desglose.gastoNotarialUsd,
    desglose.legFirmasUsd,
    desglose.seguroUsd,
    desglose.gpsUsd,
    desglose.fundasAccesoriosUsd,
  ].reduce<number>((s, v) => {
    const n = Number(v);
    return s + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  if (sum > 0) return sum;
  const fb = Number(fallbackMontoTotal);
  return Number.isFinite(fb) && fb > 0 ? fb : 0;
}
