import type { TipoControlFecha } from './types';

/** Opciones para selects de control de fechas (única fuente de etiquetas). */
export const TIPOS_CONTROL_FECHA_OPTIONS: { value: TipoControlFecha; label: string }[] = [
  { value: 'BAT_MANT_REALIZADO', label: 'BAT — mant. realizado' },
  { value: 'BAT_COMPRA_NUEVA', label: 'BAT — compra nueva' },
  { value: 'SOAT', label: 'SOAT' },
  { value: 'RT_PARTICULAR', label: 'RT particular' },
  { value: 'RT_TAXI', label: 'RT taxi' },
  { value: 'AFOCAT_TAXI', label: 'AFOCAT' },
  { value: 'INSTALACION_GNV', label: 'Instalación GNV' },
  { value: 'PERMISO_ATU', label: 'Permiso ATU' },
  { value: 'CERT_GNV_ANUAL', label: 'Cert. GNV anual' },
  { value: 'QUINQUENAL_GNV', label: 'Quinquenal GNV' },
  { value: 'VENC_BREVETE', label: 'Venc. brevete' },
  { value: 'CREDENCIAL_ATU_BREVETE', label: 'Cred. ATU brevete' },
  { value: 'GPS', label: 'GPS' },
  { value: 'IMPUESTO', label: 'Impuesto' },
  { value: 'OTRO_VENCIMIENTO', label: 'Otro' },
];

/** Columnas tabla Documentación: mismos tipos en orden operativo. */
export const DOC_MODULE_COLUMNS: { tipo: TipoControlFecha; th: string; label: string }[] = [
  { tipo: 'SOAT', th: 'SOAT', label: 'SOAT' },
  { tipo: 'RT_PARTICULAR', th: 'RT part.', label: 'RT particular' },
  { tipo: 'RT_TAXI', th: 'RT taxi', label: 'RT taxi' },
  { tipo: 'AFOCAT_TAXI', th: 'AFOCAT', label: 'AFOCAT' },
  { tipo: 'INSTALACION_GNV', th: 'Inst. GNV', label: 'Instalación GNV' },
  { tipo: 'CERT_GNV_ANUAL', th: 'Cert GNV', label: 'Cert. GNV anual' },
  { tipo: 'QUINQUENAL_GNV', th: 'Quinq.', label: 'Quinquenal GNV' },
  { tipo: 'PERMISO_ATU', th: 'ATU', label: 'Permiso ATU' },
  { tipo: 'CREDENCIAL_ATU_BREVETE', th: 'Cred ATU', label: 'Credencial ATU / brevete' },
  { tipo: 'VENC_BREVETE', th: 'Brevete', label: 'Venc. brevete' },
  { tipo: 'GPS', th: 'GPS', label: 'GPS' },
  { tipo: 'IMPUESTO', th: 'Impuesto', label: 'Impuesto vehicular' },
  { tipo: 'BAT_MANT_REALIZADO', th: 'BAT mant', label: 'BAT mant. realizado' },
  { tipo: 'BAT_COMPRA_NUEVA', th: 'BAT cmp', label: 'BAT compra nueva' },
  { tipo: 'OTRO_VENCIMIENTO', th: 'Otro', label: 'Otro vencimiento' },
];
