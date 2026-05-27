import type { FinanzaGastoRegistroValue } from '../../data/finanzaGastoRegistro';
import { resolveLegacyAliasNormKey } from './legacySubtipoAliases';
import { subtipoDedupeKey } from './subtipoDedupeKey';

export type OfficialSubtipoCategoria = Extract<
  FinanzaGastoRegistroValue,
  | 'administrativo_empresa'
  | 'operativo_vehiculo'
  | 'operativo_flota_general'
  | 'financiero_prestamo'
  | 'inversion_compra'
  | 'representacion_interna'
>;

export interface OfficialSubtipoEntry {
  value: string;
  label: string;
  categoria: OfficialSubtipoCategoria;
}

const ADMINISTRATIVO_EMPRESA_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'administrativo_general', label: 'Administrativo general', categoria: 'administrativo_empresa' },
  { value: 'ALQUILERES', label: 'Alquileres', categoria: 'administrativo_empresa' },
  { value: 'SEGUROS VEHICULAR', label: 'Seguros vehicular', categoria: 'administrativo_empresa' },
  { value: 'DELIVERY', label: 'Delivery', categoria: 'administrativo_empresa' },
  { value: 'INMUEBLE', label: 'Inmueble', categoria: 'administrativo_empresa' },
  { value: 'INTERESES', label: 'Intereses', categoria: 'administrativo_empresa' },
  { value: 'MEMBRESIAS', label: 'Membresías', categoria: 'administrativo_empresa' },
  { value: 'MUNICIPALES', label: 'Municipales', categoria: 'administrativo_empresa' },
  { value: 'OFICINA', label: 'Oficina', categoria: 'administrativo_empresa' },
  { value: 'OTROS /ESPECIFICAR', label: 'Otros / especificar', categoria: 'administrativo_empresa' },
  { value: 'PERMISOS VARIOS', label: 'Permisos varios', categoria: 'administrativo_empresa' },
  { value: 'REPRESENTACIÓN', label: 'Representación', categoria: 'administrativo_empresa' },
  { value: 'ATU', label: 'ATU', categoria: 'administrativo_empresa' },
  { value: 'sunarp', label: 'SUNARP', categoria: 'administrativo_empresa' },
  { value: 'SUNAT', label: 'SUNAT', categoria: 'administrativo_empresa' },
  { value: 'SUTRAN', label: 'SUTRAN', categoria: 'administrativo_empresa' },
  { value: 'revision_tecnica_taxi', label: 'REVISIÓN TÉCNICA TAXI', categoria: 'administrativo_empresa' },
  { value: 'TRABAJOS EVENTUALES', label: 'Trabajos eventuales', categoria: 'administrativo_empresa' },
  { value: 'TRÁMITES NOTARIALES', label: 'Trámites notariales', categoria: 'administrativo_empresa' },
  { value: 'VIGENCIA DE PODER', label: 'Vigencia de poder', categoria: 'administrativo_empresa' },
  { value: 'NOTARIALES', label: 'Notariales', categoria: 'administrativo_empresa' },
];

const FINANCIERO_PRESTAMO_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'ALQUILERES', label: 'Alquileres', categoria: 'financiero_prestamo' },
  { value: 'prestamo', label: 'Préstamo', categoria: 'financiero_prestamo' },
  { value: 'cuota', label: 'Cuota compra de activos', categoria: 'financiero_prestamo' },
  { value: 'cuota', label: 'Cuota de mantenimiento', categoria: 'financiero_prestamo' },
  { value: 'interes', label: 'Intereses', categoria: 'financiero_prestamo' },
  { value: 'membresias', label: 'Membresías', categoria: 'financiero_prestamo' },
  { value: 'prestamo_interes_banca', label: 'Otros / especificar', categoria: 'financiero_prestamo' },
];

const INVERSION_COMPRA_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'adquisicion_vehiculo', label: 'Adquisición de vehículo', categoria: 'inversion_compra' },
  { value: 'compra_terreno', label: 'Compra terreno', categoria: 'inversion_compra' },
  { value: 'acondicionamiento_areas', label: 'Acondicionamientos de áreas', categoria: 'inversion_compra' },
  { value: 'laptops', label: 'Laptops', categoria: 'inversion_compra' },
  { value: 'electrodomesticos', label: 'Electrodomésticos', categoria: 'inversion_compra' },
  { value: 'sistema_seguridad', label: 'Sistema de seguridad', categoria: 'inversion_compra' },
  { value: 'equipamiento_taller', label: 'Equipamiento de taller', categoria: 'inversion_compra' },
  { value: 'compra_software_gestion', label: 'Compra de software de gestión', categoria: 'inversion_compra' },
  { value: 'muebles_enseres', label: 'Muebles y enseres', categoria: 'inversion_compra' },
  { value: 'equipamiento_oficina', label: 'Equipamiento oficina', categoria: 'inversion_compra' },
];

const REPRESENTACION_INTERNA_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'almuerzo_socios', label: 'Almuerzos socios', categoria: 'representacion_interna' },
  { value: 'regalos', label: 'Regalos empresariales', categoria: 'representacion_interna' },
  { value: 'gasto_representacion', label: 'Invitaciones a eventos para clientes', categoria: 'representacion_interna' },
  { value: 'alojamientos', label: 'Alojamientos', categoria: 'representacion_interna' },
  { value: 'movilidad_socios', label: 'Traslado ejecutivos', categoria: 'representacion_interna' },
  { value: 'reunion_socios', label: 'Reuniones corporativos internos', categoria: 'representacion_interna' },
  { value: 'gasto_representacion', label: 'Reconocimientos', categoria: 'representacion_interna' },
  { value: 'gasto_representacion', label: 'Capacitación', categoria: 'representacion_interna' },
  { value: 'gasto_representacion', label: 'Mobiliario', categoria: 'representacion_interna' },
];

const OPERATIVO_VEHICULO_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'documentos', label: 'AFOCAT', categoria: 'operativo_vehiculo' },
  { value: 'atu', label: 'ATU', categoria: 'operativo_vehiculo' },
  { value: 'documentos', label: 'Garantías', categoria: 'operativo_vehiculo' },
  { value: 'multas_tramites', label: 'Municipales', categoria: 'operativo_vehiculo' },
  { value: 'otros_operativo', label: 'Oficina', categoria: 'operativo_vehiculo' },
  { value: 'otros_operativo', label: 'Otros / especificar', categoria: 'operativo_vehiculo' },
  { value: 'multas_tramites', label: 'Permisos varios', categoria: 'operativo_vehiculo' },
  { value: 'autopartes', label: 'Faro / arreglos', categoria: 'operativo_vehiculo' },
  { value: 'revision_tecnica_particular', label: 'REVISIÓN TÉCNICA PARTICULAR', categoria: 'operativo_vehiculo' },
  { value: 'revision_tecnica_taxi', label: 'REVISIÓN TÉCNICA TAXI', categoria: 'operativo_vehiculo' },
  { value: 'sat', label: 'SAT', categoria: 'operativo_vehiculo' },
  { value: 'documentos', label: 'Seguros', categoria: 'operativo_vehiculo' },
  { value: 'documentos', label: 'SOAT', categoria: 'operativo_vehiculo' },
  { value: 'sunarp', label: 'SUNARP', categoria: 'operativo_vehiculo' },
  { value: 'sunat', label: 'SUNAT', categoria: 'operativo_vehiculo' },
  { value: 'sutran', label: 'SUTRAN', categoria: 'operativo_vehiculo' },
  { value: 'movilidad', label: 'Taxi o delivery', categoria: 'operativo_vehiculo' },
  { value: 'otros_operativo', label: 'Trabajos eventuales', categoria: 'operativo_vehiculo' },
  { value: 'multas_tramites', label: 'Trámites notariales', categoria: 'operativo_vehiculo' },
  { value: 'otros_operativo', label: 'Útiles de oficina', categoria: 'operativo_vehiculo' },
  { value: 'accesorios', label: 'Accesorios', categoria: 'operativo_vehiculo' },
  { value: 'aire_acondicionado', label: 'Aire acondicionado', categoria: 'operativo_vehiculo' },
  { value: 'bateria', label: 'Batería', categoria: 'operativo_vehiculo' },
  { value: 'combustible', label: 'Combustible', categoria: 'operativo_vehiculo' },
  { value: 'documentos', label: 'Documentos', categoria: 'operativo_vehiculo' },
  { value: 'electricidad', label: 'Electricista', categoria: 'operativo_vehiculo' },
  { value: 'frenos', label: 'Frenos', categoria: 'operativo_vehiculo' },
  { value: 'gnv', label: 'GNV taller', categoria: 'operativo_vehiculo' },
  { value: 'gps_chips', label: 'GPS equipos', categoria: 'operativo_vehiculo' },
  { value: 'impuesto_vehicular', label: 'Impuesto vehicular', categoria: 'operativo_vehiculo' },
  { value: 'interior', label: 'Fundas o forros auto', categoria: 'operativo_vehiculo' },
  { value: 'mantenimiento', label: 'Mantenimiento simple', categoria: 'operativo_vehiculo' },
  { value: 'mantenimiento', label: 'Mantenimiento completo', categoria: 'operativo_vehiculo' },
  { value: 'motor', label: 'Motor taller', categoria: 'operativo_vehiculo' },
  { value: 'suspension', label: 'Suspensión', categoria: 'operativo_vehiculo' },
  { value: 'llantas', label: 'Llantas', categoria: 'operativo_vehiculo' },
  { value: 'planchado_pintura', label: 'Planchado / pintura', categoria: 'operativo_vehiculo' },
  { value: 'gps_chips', label: 'GPS recarga chips', categoria: 'operativo_vehiculo' },
  { value: 'accesorios', label: 'Canasta o regalo', categoria: 'operativo_vehiculo' },
  { value: 'multas_callao', label: 'Multa Callao', categoria: 'operativo_vehiculo' },
  { value: 'documentos', label: 'Devolución garantía', categoria: 'operativo_vehiculo' },
];

export const OFFICIAL_SUBTIPOS_BY_CATEGORIA: Record<
  OfficialSubtipoCategoria,
  readonly OfficialSubtipoEntry[]
> = {
  administrativo_empresa: ADMINISTRATIVO_EMPRESA_SUBTIPOS,
  financiero_prestamo: FINANCIERO_PRESTAMO_SUBTIPOS,
  inversion_compra: INVERSION_COMPRA_SUBTIPOS,
  representacion_interna: REPRESENTACION_INTERNA_SUBTIPOS,
  operativo_vehiculo: OPERATIVO_VEHICULO_SUBTIPOS,
  operativo_flota_general: OPERATIVO_VEHICULO_SUBTIPOS,
};

export function getOfficialSubtiposForCategoria(categoria: string): readonly OfficialSubtipoEntry[] {
  if (categoria in OFFICIAL_SUBTIPOS_BY_CATEGORIA) {
    return OFFICIAL_SUBTIPOS_BY_CATEGORIA[categoria as OfficialSubtipoCategoria];
  }
  return [];
}

export function getOfficialSubtipoLabel(categoria: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const aliasCanon = resolveLegacyAliasNormKey(trimmed) ?? trimmed;
  const targetKey = subtipoDedupeKey(aliasCanon);
  const entry = getOfficialSubtiposForCategoria(categoria).find((item) => {
    const itemKey = subtipoDedupeKey(resolveLegacyAliasNormKey(item.value) ?? item.value);
    return itemKey === targetKey || item.value === trimmed || item.value === aliasCanon;
  });
  return entry?.label ?? null;
}
