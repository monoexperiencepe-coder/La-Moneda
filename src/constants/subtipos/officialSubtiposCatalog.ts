import type { FinanzaGastoRegistroValue } from '../../data/finanzaGastoRegistro';
import { OFFICIAL_OPERATIVO_SUBTIPO_VALUES } from './operativoOficialCatalog';
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
  { value: 'OTROS / ESPECIFICAR', label: 'Otros / especificar', categoria: 'administrativo_empresa' },
  { value: 'PERMISOS VARIOS', label: 'Permisos varios', categoria: 'administrativo_empresa' },
  { value: 'REPRESENTACIÓN', label: 'Representación', categoria: 'administrativo_empresa' },
  { value: 'ATU', label: 'ATU', categoria: 'administrativo_empresa' },
  { value: 'SUNARP', label: 'SUNARP', categoria: 'administrativo_empresa' },
  { value: 'SUNAT', label: 'SUNAT', categoria: 'administrativo_empresa' },
  { value: 'SUTRAN', label: 'SUTRAN', categoria: 'administrativo_empresa' },
  { value: 'TAXI', label: 'Taxi', categoria: 'administrativo_empresa' },
  { value: 'TRABAJOS EVENTUALES', label: 'Trabajos eventuales', categoria: 'administrativo_empresa' },
  { value: 'TRÁMITES NOTARIALES', label: 'Trámites notariales', categoria: 'administrativo_empresa' },
  { value: 'VIGENCIA DE PODER', label: 'Vigencia de poder', categoria: 'administrativo_empresa' },
  { value: 'NOTARIALES', label: 'Notariales', categoria: 'administrativo_empresa' },
];

const FINANCIERO_PRESTAMO_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'ALQUILERES', label: 'Alquileres', categoria: 'financiero_prestamo' },
  { value: 'PRÉSTAMO', label: 'Préstamo', categoria: 'financiero_prestamo' },
  { value: 'CUOTA COMPRA DE ACTIVOS', label: 'Cuota compra de activos', categoria: 'financiero_prestamo' },
  { value: 'CUOTA DE MANTENIMIENTO', label: 'Cuota de mantenimiento', categoria: 'financiero_prestamo' },
  { value: 'INTERESES', label: 'Intereses', categoria: 'financiero_prestamo' },
  { value: 'MEMBRESÍAS', label: 'Membresías', categoria: 'financiero_prestamo' },
  { value: 'OTROS / ESPECIFICAR', label: 'Otros / especificar', categoria: 'financiero_prestamo' },
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
  { value: 'otros_especificar', label: 'Otros / especificar', categoria: 'inversion_compra' },
];

const REPRESENTACION_INTERNA_SUBTIPOS: readonly OfficialSubtipoEntry[] = [
  { value: 'ALMUERZOS SOCIOS', label: 'Almuerzos socios', categoria: 'representacion_interna' },
  { value: 'REGALOS EMPRESARIALES', label: 'Regalos empresariales', categoria: 'representacion_interna' },
  {
    value: 'INVITACIONES A EVENTOS PARA CLIENTES',
    label: 'Invitaciones a eventos para clientes',
    categoria: 'representacion_interna',
  },
  { value: 'ALOJAMIENTOS', label: 'Alojamientos', categoria: 'representacion_interna' },
  { value: 'TRASLADO EJECUTIVOS', label: 'Traslado ejecutivos', categoria: 'representacion_interna' },
  {
    value: 'REUNIONES CORPORATIVOS INTERNOS',
    label: 'Reuniones corporativos internos',
    categoria: 'representacion_interna',
  },
  { value: 'RECONOCIMIENTOS', label: 'Reconocimientos', categoria: 'representacion_interna' },
  { value: 'CAPACITACION', label: 'Capacitación', categoria: 'representacion_interna' },
  { value: 'MOBILIARIO', label: 'Mobiliario', categoria: 'representacion_interna' },
];

const OPERATIVO_VEHICULO_SUBTIPOS: readonly OfficialSubtipoEntry[] =
  OFFICIAL_OPERATIVO_SUBTIPO_VALUES.map((value) => ({
    value,
    label: value,
    categoria: 'operativo_vehiculo' as const,
  }));

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
