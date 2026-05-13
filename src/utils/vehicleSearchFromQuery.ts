import type { Vehicle } from '../data/types';

/**
 * Extrae N° de vehículo mencionados en el texto de búsqueda (solo IDs que existan en `vehicles`).
 * Soporta: #12, carro 3, vehículo 5, unidad 2, id 8, nº 4, o solo el número si el query completo coincide con un id válido.
 */
export function extractVehicleSearchIds(raw: string, vehicles: Vehicle[]): number[] {
  const q = raw.trim();
  if (!q || vehicles.length === 0) return [];

  const validIds = new Set(vehicles.map((v) => v.id));
  const found = new Set<number>();

  const tryAdd = (n: number) => {
    if (Number.isFinite(n) && validIds.has(n)) found.add(n);
  };

  for (const m of q.matchAll(/#\s*(\d+)/gi)) {
    tryAdd(Number(m[1]));
  }

  for (const m of q.matchAll(
    /\b(?:carro|auto|veh[ií]culo|unidad|veh)\s*#?\s*(\d+)\b/gi,
  )) {
    tryAdd(Number(m[1]));
  }

  for (const m of q.matchAll(/\b(?:id|n[°º])\s*:?\s*(\d+)\b/gi)) {
    tryAdd(Number(m[1]));
  }

  // Solo dígitos: el texto completo debe ser numérico (no extrae subcadenas de fechas u otros textos)
  if (/^\d{1,4}$/.test(q)) {
    tryAdd(Number(q));
  }

  return [...found].sort((a, b) => a - b);
}

/**
 * True si el texto solo identifica unidad(es), sin palabras extra.
 * Así "10" filtra solo al vehículo #10 y no filas del #1 cuya placa u otro campo contenga "10".
 */
export function isStrictVehicleOnlyQuery(raw: string, vehicleSearchIds: number[]): boolean {
  const q = raw.trim();
  if (vehicleSearchIds.length === 0) return false;
  if (/^\d{1,4}$/.test(q)) return true;
  if (/^#\s*\d+\s*$/i.test(q)) return true;
  if (/^(?:carro|auto|veh[ií]culo|unidad|veh)\s*#?\s*\d+\s*$/i.test(q)) return true;
  if (/^(?:id|n[°º])\s*:?\s*\d+\s*$/i.test(q)) return true;
  return false;
}
