import type { Vehicle } from '../data/types';

export type VehicleFichaTecnicaDraft = {
  placa: string;
  marca: string;
  modelo: string;
  anio: string;
  combustible: string;
  color: string;
  tipoCarroceria: string;
  numeroMotor: string;
  cantidadLlaves: string;
  gps1: string;
  gps2: string;
  impuesto: string;
  kmInicial: string;
  tarjetaPropiedad: string;
  propietarioNombre: string;
};

export function emptyVehicleFichaTecnicaDraft(): VehicleFichaTecnicaDraft {
  return {
    placa: '',
    marca: '',
    modelo: '',
    anio: '',
    combustible: '',
    color: '',
    tipoCarroceria: '',
    numeroMotor: '',
    cantidadLlaves: '',
    gps1: '',
    gps2: '',
    impuesto: '',
    kmInicial: '',
    tarjetaPropiedad: '',
    propietarioNombre: '',
  };
}

export function vehicleToFichaDraft(vehicle: Vehicle): VehicleFichaTecnicaDraft {
  return {
    placa: vehicle.placa ?? '',
    marca: vehicle.marca ?? '',
    modelo: vehicle.modelo ?? '',
    anio: vehicle.anio != null && Number.isFinite(vehicle.anio) ? String(vehicle.anio) : '',
    combustible: vehicle.combustible ?? '',
    color: vehicle.color ?? '',
    tipoCarroceria: vehicle.tipoCarroceria ?? '',
    numeroMotor: vehicle.numeroMotor ?? '',
    cantidadLlaves:
      vehicle.cantidadLlaves != null && Number.isFinite(vehicle.cantidadLlaves)
        ? String(vehicle.cantidadLlaves)
        : '',
    gps1: vehicle.gps1 ?? '',
    gps2: vehicle.gps2 ?? '',
    impuesto: vehicle.impuesto ?? '',
    kmInicial:
      vehicle.kmInicial != null && Number.isFinite(vehicle.kmInicial) ? String(vehicle.kmInicial) : '',
    tarjetaPropiedad: vehicle.tarjetaPropiedad ?? '',
    propietarioNombre: vehicle.propietarioNombre ?? '',
  };
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseOptionalText(raw: string): string | null {
  const t = raw.trim();
  return t === '' ? null : t;
}

/** Convierte borrador de ficha a patch parcial de Vehicle (sin id ni numeroUnidad). */
export function fichaDraftToVehiclePatch(
  draft: VehicleFichaTecnicaDraft,
): Partial<Omit<Vehicle, 'id'>> {
  let anio: number | undefined;
  if (draft.anio.trim() !== '') {
    const n = Number(draft.anio.trim());
    if (Number.isFinite(n)) anio = Math.trunc(n);
  }

  return {
    placa: draft.placa.trim(),
    marca: draft.marca.trim(),
    modelo: draft.modelo.trim(),
    anio,
    combustible: parseOptionalText(draft.combustible),
    color: parseOptionalText(draft.color) ?? undefined,
    tipoCarroceria: parseOptionalText(draft.tipoCarroceria),
    numeroMotor: parseOptionalText(draft.numeroMotor),
    cantidadLlaves: parseOptionalInt(draft.cantidadLlaves),
    gps1: parseOptionalText(draft.gps1),
    gps2: parseOptionalText(draft.gps2),
    impuesto: parseOptionalText(draft.impuesto),
    kmInicial: parseOptionalInt(draft.kmInicial),
    tarjetaPropiedad: parseOptionalText(draft.tarjetaPropiedad),
    propietarioNombre: parseOptionalText(draft.propietarioNombre),
  };
}

/** Solo campos técnicos (sin identidad básica). */
export function fichaTechnicalFromDraft(
  draft: VehicleFichaTecnicaDraft,
): Partial<Omit<Vehicle, 'id'>> {
  const full = fichaDraftToVehiclePatch(draft);
  const { placa: _p, marca: _m, modelo: _mo, anio: _a, ...tech } = full;
  return tech;
}

export function formatFichaText(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : 'Sin registrar';
}

export function formatFichaNumber(value: number | null | undefined): string {
  if (value != null && Number.isFinite(value)) return String(Math.round(value));
  return '0';
}

export function formatFichaGps(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '0';
}
