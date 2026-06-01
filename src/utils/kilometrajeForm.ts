import type { KilometrajeRegistro } from '../data/types';
import { todayStr, validateRegistroFechaInput } from './formatting';

export type TipoMantenimientoForm = 'solo_km' | 'simple' | 'completo';

export const TIPO_MANTENIMIENTO_OPTIONS: { value: TipoMantenimientoForm; label: string; hint: string }[] = [
  {
    value: 'solo_km',
    label: 'Solo km semanal',
    hint: 'Solo actualiza el odómetro. No reinicia el control de mantenimiento.',
  },
  {
    value: 'simple',
    label: 'Simple',
    hint: 'Mantenimiento simple: fija el km de mantenimiento y reinicia la variación.',
  },
  {
    value: 'completo',
    label: 'Completo',
    hint: 'Mantenimiento completo: fija el km de mantenimiento y reinicia la variación.',
  },
];

export const KM_AT_LEAST_ONE_ERROR =
  'Ingresa kilometraje de mantenimiento o kilometraje actual.';

export function parseKmInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function buildKilometrajePayload(input: {
  vehicleId: number;
  fecha: string;
  tipo: TipoMantenimientoForm;
  kilometrajeRaw: string;
  kmMantenimientoRaw: string;
  descripcionExtra: string;
}): { ok: true; row: Omit<KilometrajeRegistro, 'id' | 'createdAt'> } | { ok: false; error: string } {
  const fechaVal = validateRegistroFechaInput(input.fecha);
  if (!fechaVal.ok) return { ok: false, error: fechaVal.error };

  const kmAct = parseKmInput(input.kilometrajeRaw);
  const kmMantIn = parseKmInput(input.kmMantenimientoRaw);
  const extra = input.descripcionExtra.trim();

  if (input.tipo === 'solo_km') {
    if (kmAct == null) return { ok: false, error: KM_AT_LEAST_ONE_ERROR };
    return {
      ok: true,
      row: {
        vehicleId: input.vehicleId,
        fecha: fechaVal.value,
        fechaRegistro: todayStr(),
        kmMantenimiento: null,
        kilometraje: kmAct,
        descripcion: extra,
        costo: null,
      },
    };
  }

  if (kmAct == null && kmMantIn == null) {
    return { ok: false, error: KM_AT_LEAST_ONE_ERROR };
  }

  const tag = input.tipo === 'completo' ? 'MANT.COMPLETO' : 'MANT.SIMPLE';
  const descripcion = extra ? `${tag} · ${extra}` : tag;

  const kmMantenimiento = kmMantIn ?? kmAct ?? null;
  const kilometraje = kmAct ?? null;

  return {
    ok: true,
    row: {
      vehicleId: input.vehicleId,
      fecha: fechaVal.value,
      fechaRegistro: todayStr(),
      kmMantenimiento,
      kilometraje,
      descripcion,
      costo: null,
    },
  };
}
