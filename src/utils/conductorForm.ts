import type { Conductor, TipoDocumento, TipoDomicilio } from '../data/types';
import {
  conductorFieldForEdit,
  sanitizeConductorFieldForSave,
} from './cleanMojibakeText';

export type ConductorEditDraft = {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  domicilio: TipoDomicilio;
  vehicleId: string;
  estadoContrato: 'ABIERTO' | 'CERRADO';
  celular: string;
  cochera: string;
  direccion: string;
  numeroEmergencia: string;
  fechaVencimientoContrato: string;
  documentoFirmado: 'unset' | 'true' | 'false';
  comentarios: string;
  estado: 'VIGENTE' | 'SUSPENDIDO';
  statusOriginal: string;
};

export function conductorToDraft(c: Conductor): ConductorEditDraft {
  return {
    nombres: conductorFieldForEdit(c.nombres),
    apellidos: conductorFieldForEdit(c.apellidos),
    tipoDocumento: c.tipoDocumento,
    numeroDocumento: conductorFieldForEdit(c.numeroDocumento),
    domicilio: c.domicilio,
    vehicleId: c.vehicleId != null ? String(c.vehicleId) : '',
    estadoContrato: c.estadoContrato,
    celular: conductorFieldForEdit(c.celular),
    cochera: conductorFieldForEdit(c.cochera),
    direccion: conductorFieldForEdit(c.direccion),
    numeroEmergencia: conductorFieldForEdit(c.numeroEmergencia),
    fechaVencimientoContrato: conductorFieldForEdit(c.fechaVencimientoContrato),
    documentoFirmado:
      c.documentoFirmado === true ? 'true' : c.documentoFirmado === false ? 'false' : 'unset',
    comentarios: conductorFieldForEdit(c.comentarios),
    estado: c.estado,
    statusOriginal: conductorFieldForEdit(c.statusOriginal),
  };
}

export function parseVehicleIdFromDraft(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

export function validateConductorDraft(d: ConductorEditDraft): string | null {
  if (!d.numeroDocumento.trim()) {
    return 'Indica el número de documento.';
  }
  const cel = d.celular.trim();
  if (cel && !/^[\d\s+\-()]+$/.test(cel)) {
    return 'Celular: solo números, espacios, +, guiones o paréntesis.';
  }
  if (parseVehicleIdFromDraft(d.vehicleId) === 'invalid') {
    return 'Vehículo no válido.';
  }
  return null;
}

export function draftToConductorPatch(
  d: ConductorEditDraft,
): Partial<Omit<Conductor, 'id' | 'createdAt'>> {
  const vehicleId = parseVehicleIdFromDraft(d.vehicleId);
  const docFirm: boolean | null = d.documentoFirmado === 'unset' ? null : d.documentoFirmado === 'true';
  return {
    nombres: sanitizeConductorFieldForSave(d.nombres) ?? '',
    apellidos: sanitizeConductorFieldForSave(d.apellidos) ?? '',
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: sanitizeConductorFieldForSave(d.numeroDocumento) ?? '',
    domicilio: d.domicilio,
    vehicleId: vehicleId === 'invalid' ? null : vehicleId,
    estadoContrato: d.estadoContrato,
    celular: sanitizeConductorFieldForSave(d.celular) ?? '',
    cochera: sanitizeConductorFieldForSave(d.cochera),
    direccion: sanitizeConductorFieldForSave(d.direccion),
    numeroEmergencia: sanitizeConductorFieldForSave(d.numeroEmergencia),
    fechaVencimientoContrato: sanitizeConductorFieldForSave(d.fechaVencimientoContrato),
    documentoFirmado: docFirm,
    comentarios: sanitizeConductorFieldForSave(d.comentarios) ?? '',
    estado: d.estado,
    statusOriginal: sanitizeConductorFieldForSave(d.statusOriginal),
  };
}

export function conductorDraftsEqual(a: ConductorEditDraft, b: ConductorEditDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function whatsappHref(phone: string): string {
  const digits = phoneDigits(phone);
  if (!digits) return '#';
  const num = digits.startsWith('51') ? digits : `51${digits}`;
  return `https://wa.me/${num}`;
}

export function telHref(phone: string): string {
  const digits = phoneDigits(phone);
  if (!digits) return '#';
  const num = digits.startsWith('51') ? digits : `51${digits}`;
  return `tel:+${num}`;
}
