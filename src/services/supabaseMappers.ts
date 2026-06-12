import { cleanConductorRecord } from '../utils/cleanMojibakeText';
import { resolveRecordCreatedBy } from '../utils/amountPermissions';
import { mapConductorId } from '../utils/conductorId';
import { toDateOnlyString } from '../utils/formatting';
import { UUID_REGEX_FLAT } from '../utils/uuidColumn';
import { gastoPrimaryKeyFromRow, ingresoPrimaryKeyFromRow } from '../utils/ingresoRecordId';
import type {
  Vehicle,
  UnidadRegistro,
  Conductor,
  Ingreso,
  Gasto,
  CajaNegocioVehiculo,
  InversionVehiculo,
  InversionGeneralVehiculo,
  GastoCaja,
  Moneda,
  TipoDocumento,
  TipoDomicilio,
  ControlFecha,
  KilometrajeRegistro,
  Pendiente,
  PendientePrioridadV2,
  PendienteRelacionadoTipo,
  PendienteTipo,
  RegistroTiempo,
  VehicleDowntime,
  VehicleDowntimeMotivo,
} from '../data/types';
import { prioridadLegacyFromV2, prioridadV2FromLegacy } from '../utils/pendienteModel';

/** Entero desde Postgres (int/bigint) o PostgREST (number | string | bigint). */
function num(v: unknown): number {
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v !== '') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/** PK de fila: nunca forzar uuid a number (evita id 0 y delete inválido). */
export function mapRowId(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.trim();
  return String(v);
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function bool(v: unknown): boolean {
  return Boolean(v);
}

function boolOrNull(v: unknown): boolean | null {
  if (v == null) return null;
  return Boolean(v);
}

/** jsonb de Postgres / objeto plano; null si vacío o no objeto. */
function jsonRecordOrNull(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return Object.keys(o).length === 0 ? null : o;
}

function isoCreated(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapVehiculoRow(r: Record<string, unknown>): Vehicle {
  return {
    id: num(r.id),
    marca: str(r.marca),
    modelo: str(r.modelo),
    placa: str(r.placa),
    anio: r.anio != null && r.anio !== '' ? num(r.anio) : undefined,
    color: strOrNull(r.color) ?? undefined,
    activo: r.activo === undefined ? true : bool(r.activo),
  };
}

export function vehiculoToInsert(
  empresaId: string,
  row: Omit<Vehicle, 'id'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    marca: row.marca.trim(),
    modelo: row.modelo.trim(),
    placa: row.placa.trim(),
    anio: row.anio != null && Number.isFinite(row.anio) ? row.anio : null,
    color: row.color?.trim() ? row.color.trim() : null,
    activo: row.activo,
  };
}

export function vehiculoPatchToSnake(
  patch: Partial<Omit<Vehicle, 'id'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.marca !== undefined) out.marca = patch.marca.trim();
  if (patch.modelo !== undefined) out.modelo = patch.modelo.trim();
  if (patch.placa !== undefined) out.placa = patch.placa.trim();
  if (patch.anio !== undefined) {
    out.anio = patch.anio != null && Number.isFinite(patch.anio) ? patch.anio : null;
  }
  if (patch.color !== undefined) {
    out.color = patch.color?.trim() ? patch.color.trim() : null;
  }
  if (patch.activo !== undefined) out.activo = patch.activo;
  return out;
}

export function mapUnidadRow(r: Record<string, unknown>): UnidadRegistro {
  return {
    id: mapRowId(r.id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
    numeroInterno: str(r.numero_interno),
    marca: str(r.marca),
    modelo: str(r.modelo),
    anio: num(r.anio),
    placa: str(r.placa),
    detalleAuto: str(r.detalle_auto),
    combustible: str(r.combustible),
    color: str(r.color),
    tipoCarroceria: strOrNull(r.tipo_carroceria) ?? undefined,
    numeroMotor: strOrNull(r.numero_motor) ?? undefined,
    cantidadLlaves: r.cantidad_llaves != null ? num(r.cantidad_llaves) : null,
    gps1: strOrNull(r.gps1) ?? undefined,
    gps2: strOrNull(r.gps2) ?? undefined,
    impuestoEstado: strOrNull(r.impuesto_estado) ?? undefined,
    kmInicial: r.km_inicial != null ? num(r.km_inicial) : null,
    tarjetaPropiedad: strOrNull(r.tarjeta_propiedad) ?? undefined,
    propietario: strOrNull(r.propietario) ?? undefined,
    fechaCompraUSD: strOrNull(r.fecha_compra_usd),
    valorCompraUSD: r.valor_compra_usd != null ? num(r.valor_compra_usd) : null,
    tipoCambioCompra: r.tipo_cambio_compra != null ? num(r.tipo_cambio_compra) : null,
    gastoGnv: strOrNull(r.gasto_gnv),
    gastosNotariales: strOrNull(r.gastos_notariales),
    gastosAccesorios: strOrNull(r.gastos_accesorios),
    gpsInstalado: bool(r.gps_instalado),
    gpsProveedor: str(r.gps_proveedor),
    impuestoVehicularVence: strOrNull(r.impuesto_vehicular_vence),
    comentarios: str(r.comentarios),
    createdAt: isoCreated(r.created_at),
  };
}

export function mapConductorRow(r: Record<string, unknown>): Conductor {
  const raw = {
    id: mapConductorId(r.id),
    vehicleId: numOrNull(r.vehicle_id),
    tipoDocumento: str(r.tipo_documento) as TipoDocumento,
    numeroDocumento: str(r.numero_documento),
    nombres: str(r.nombres),
    apellidos: str(r.apellidos),
    celular: str(r.celular),
    domicilio: str(r.domicilio) as TipoDomicilio,
    estadoContrato: str(r.estado_contrato) as Conductor['estadoContrato'],
    estado: str(r.estado) as Conductor['estado'],
    statusOriginal: strOrNull(r.status_original),
    cochera: strOrNull(r.cochera),
    numeroEmergencia: strOrNull(r.numero_emergencia),
    direccion: strOrNull(r.direccion),
    documentoFirmado: boolOrNull(r.documento_firmado),
    fechaInicioContrato: strOrNull(r.fecha_inicio_contrato),
    fechaVencimientoContrato: strOrNull(r.fecha_vencimiento_contrato),
    comentarios: str(r.comentarios),
    createdAt: isoCreated(r.created_at),
  };
  return cleanConductorRecord(raw) as Conductor;
}

export function mapIngresoRow(r: Record<string, unknown>): Ingreso {
  const moneda = (strOrNull(r.moneda) as Moneda | null) ?? 'PEN';
  return {
    id: ingresoPrimaryKeyFromRow(r.id),
    fecha: toDateOnlyString(r.fecha),
    fechaRegistro: toDateOnlyString(r.fecha_registro ?? r.fecha),
    vehicleId: r.vehicle_id != null && r.vehicle_id !== '' ? num(r.vehicle_id) : null,
    esExtraordinario: r.es_extraordinario != null ? Boolean(r.es_extraordinario) : r.vehicle_id == null,
    tipo: str(r.tipo),
    subTipo: strOrNull(r.sub_tipo),
    fechaDesde: strOrNull(r.fecha_desde),
    fechaHasta: strOrNull(r.fecha_hasta),
    metodoPago: str(r.metodo_pago),
    metodoPagoDetalle: str(r.metodo_pago_detalle),
    celularMetodo: strOrNull(r.celular_metodo),
    signo: '+',
    monto: num(r.monto),
    moneda: moneda === 'USD' ? 'USD' : 'PEN',
    tipoCambio: r.tipo_cambio != null && r.tipo_cambio !== '' ? num(r.tipo_cambio) : null,
    montoPENReferencia: r.monto_pen_referencia != null && r.monto_pen_referencia !== '' ? num(r.monto_pen_referencia) : null,
    comentarios: str(r.comentarios),
    detalleOperativo: strOrNull(r.detalle_operativo),
    tipoOperacion: strOrNull(r.tipo_operacion),
    estadoPago: strOrNull(r.estado_pago),
    excelExtra: jsonRecordOrNull(r.excel_extra),
    /** Solo si viene `created_at` desde BD; vacío en registros antiguos sin columna o valor. */
    createdAt:
      r.created_at != null && String(r.created_at).trim() !== ''
        ? String(r.created_at)
        : '',
    createdBy: resolveRecordCreatedBy({
      raw: r,
      excelExtra: jsonRecordOrNull(r.excel_extra),
    }),
  };
}

export function mapGastoCajaRow(r: Record<string, unknown>): GastoCaja {
  return {
    id: num(r.id),
    fecha: toDateOnlyString(r.fecha),
    concepto: str(r.concepto),
    monto: num(r.monto),
    categoria: str(r.categoria) || 'CAJA_GENERAL',
    comentarios: str(r.comentarios),
    excelExtra: jsonRecordOrNull(r.excel_extra),
    createdAt: isoCreated(r.created_at),
  };
}

export function mapCajaNegocioVehiculoRow(r: Record<string, unknown>): CajaNegocioVehiculo {
  return {
    id: num(r.id),
    vehicleId: num(r.vehicle_id),
    fecha: toDateOnlyString(r.fecha),
    monto: num(r.monto),
    concepto: str(r.concepto),
    origenGastoId: numOrNull(r.origen_gasto_id),
    comentarios: str(r.comentarios),
    excelExtra: jsonRecordOrNull(r.excel_extra),
    createdAt: isoCreated(r.created_at),
  };
}

export function mapInversionGeneralVehiculoRow(r: Record<string, unknown>): InversionGeneralVehiculo {
  const monRaw = str(r.moneda).trim().toUpperCase();
  const moneda: Moneda = monRaw === 'USD' ? 'USD' : 'PEN';
  const fc = r.fecha_compra;
  const fechaCompra =
    fc == null || fc === ''
      ? null
      : (() => {
          const d = toDateOnlyString(fc);
          return d === '' ? null : d;
        })();
  return {
    id: mapRowId(r.id),
    vehiculoReferencia: str(r.vehiculo_referencia),
    vehiculoNumero: numOrNull(r.vehiculo_numero),
    placa: strOrNull(r.placa),
    modelo: strOrNull(r.modelo),
    fechaCompra,
    valorCompraUsd: numOrNull(r.valor_compra_usd),
    gastoGnvUsd: numOrNull(r.gasto_gnv_usd),
    gastoNotarialUsd: numOrNull(r.gasto_notarial_usd),
    legFirmasUsd: numOrNull(r.leg_firmas_usd),
    seguroUsd: numOrNull(r.seguro_usd),
    gpsUsd: numOrNull(r.gps_usd),
    fundasAccesoriosUsd: numOrNull(r.fundas_accesorios_usd),
    totalInversionPen: numOrNull(r.total_equivalente_pen),
    montoTotal: num(r.monto_total),
    moneda,
    fuente: str(r.fuente) || 'VALOR DE INVERSION',
    observaciones: strOrNull(r.observaciones),
    createdAt: isoCreated(r.created_at),
  };
}

export function mapInversionVehiculoRow(r: Record<string, unknown>): InversionVehiculo {
  const fc = r.fecha_compra;
  const fechaCompra =
    fc == null || fc === ''
      ? null
      : (() => {
          const d = toDateOnlyString(fc);
          return d === '' ? null : d;
        })();
  return {
    id: num(r.id),
    vehicleId: r.vehicle_id != null && r.vehicle_id !== '' ? num(r.vehicle_id) : null,
    descripcionExcel: str(r.descripcion_excel),
    fechaCompra,
    valorCompraUsd: numOrNull(r.valor_compra_usd),
    gastoGnvUsd: numOrNull(r.gasto_gnv_usd),
    gastoNotarialUsd: numOrNull(r.gasto_notarial_usd),
    legFirmasUsd: numOrNull(r.leg_firmas_usd),
    seguroUsd: numOrNull(r.seguro_usd),
    gpsUsd: numOrNull(r.gps_usd),
    fundasAccesoriosUsd: numOrNull(r.fundas_accesorios_usd),
    totalInversionUsd: numOrNull(r.total_inversion_usd),
    totalInversionPen: numOrNull(r.total_inversion_pen),
    excelExtra: jsonRecordOrNull(r.excel_extra),
    createdAt: isoCreated(r.created_at),
  };
}

function mapGastoVehicleIdFromRow(v: unknown): number | string | null {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '0') return null;
    if (UUID_REGEX_FLAT.test(t)) return t;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function mapGastoRow(r: Record<string, unknown>): Gasto {
  return {
    id: gastoPrimaryKeyFromRow(r.id),
    fecha: toDateOnlyString(r.fecha),
    fechaRegistro: toDateOnlyString(r.fecha_registro ?? r.fecha),
    vehicleId: mapGastoVehicleIdFromRow(r.vehicle_id),
    tipo: str(r.tipo),
    subTipo: strOrNull(r.sub_tipo),
    fechaDesde: strOrNull(r.fecha_desde),
    fechaHasta: strOrNull(r.fecha_hasta),
    metodoPago: str(r.metodo_pago),
    metodoPagoDetalle: str(r.metodo_pago_detalle),
    celularMetodo: strOrNull(r.celular_metodo),
    categoria: str(r.categoria) as Gasto['categoria'],
    motivo: str(r.motivo),
    signo: '-',
    monto: num(r.monto),
    pagadoA: str(r.pagado_a),
    comentarios: str(r.comentarios),
    detalleOperativo: strOrNull(r.detalle_operativo),
    categoriaReal: strOrNull(r.categoria_real),
    subcategoria: strOrNull(r.subcategoria),
    excelExtra: jsonRecordOrNull(r.excel_extra),
    tipo_gasto: strOrNull(r.tipo_gasto),
    subtipo_gasto: strOrNull(r.subtipo_gasto),
    clasificacion_confianza: numOrNull(r.clasificacion_confianza),
    requiere_revision: r.requiere_revision == null ? null : bool(r.requiere_revision),
    clasificacion_manual: r.clasificacion_manual == null ? null : bool(r.clasificacion_manual),
    revisado_por: strOrNull(r.revisado_por),
    revisado_at: strOrNull(r.revisado_at),
    es_global_flota: r.es_global_flota == null ? null : bool(r.es_global_flota),
    origen_clasificacion: strOrNull(r.origen_clasificacion),
    createdAt: isoCreated(r.created_at),
    createdBy: resolveRecordCreatedBy({
      raw: r,
      excelExtra: jsonRecordOrNull(r.excel_extra),
    }),
  };
}

export function unidadToInsert(
  empresaId: string,
  row: Omit<UnidadRegistro, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    numero_interno: row.numeroInterno,
    marca: row.marca,
    modelo: row.modelo,
    anio: row.anio,
    placa: row.placa,
    detalle_auto: row.detalleAuto,
    combustible: row.combustible,
    color: row.color,
    tipo_carroceria: row.tipoCarroceria ?? null,
    numero_motor: row.numeroMotor ?? null,
    cantidad_llaves: row.cantidadLlaves,
    gps1: row.gps1 ?? null,
    gps2: row.gps2 ?? null,
    impuesto_estado: row.impuestoEstado ?? null,
    km_inicial: row.kmInicial,
    tarjeta_propiedad: row.tarjetaPropiedad ?? null,
    propietario: row.propietario ?? null,
    fecha_compra_usd: row.fechaCompraUSD,
    valor_compra_usd: row.valorCompraUSD,
    tipo_cambio_compra: row.tipoCambioCompra,
    gasto_gnv: row.gastoGnv ?? null,
    gastos_notariales: row.gastosNotariales ?? null,
    gastos_accesorios: row.gastosAccesorios ?? null,
    gps_instalado: row.gpsInstalado,
    gps_proveedor: row.gpsProveedor,
    impuesto_vehicular_vence: row.impuestoVehicularVence,
    comentarios: row.comentarios,
  };
}

export function conductorToInsert(
  empresaId: string,
  row: Omit<Conductor, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    tipo_documento: row.tipoDocumento,
    numero_documento: row.numeroDocumento,
    nombres: row.nombres,
    apellidos: row.apellidos,
    celular: row.celular,
    domicilio: row.domicilio,
    estado_contrato: row.estadoContrato,
    estado: row.estado,
    status_original: row.statusOriginal ?? null,
    cochera: row.cochera ?? null,
    numero_emergencia: row.numeroEmergencia ?? null,
    direccion: row.direccion ?? null,
    documento_firmado: row.documentoFirmado,
    fecha_inicio_contrato: row.fechaInicioContrato,
    fecha_vencimiento_contrato: row.fechaVencimientoContrato,
    comentarios: row.comentarios,
  };
}

export function conductorPatchToSnake(
  patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.vehicleId !== undefined) out.vehicle_id = patch.vehicleId;
  if (patch.tipoDocumento !== undefined) out.tipo_documento = patch.tipoDocumento;
  if (patch.numeroDocumento !== undefined) out.numero_documento = patch.numeroDocumento;
  if (patch.nombres !== undefined) out.nombres = patch.nombres;
  if (patch.apellidos !== undefined) out.apellidos = patch.apellidos;
  if (patch.celular !== undefined) out.celular = patch.celular;
  if (patch.domicilio !== undefined) out.domicilio = patch.domicilio;
  if (patch.estadoContrato !== undefined) out.estado_contrato = patch.estadoContrato;
  if (patch.estado !== undefined) out.estado = patch.estado;
  if (patch.statusOriginal !== undefined) out.status_original = patch.statusOriginal;
  if (patch.cochera !== undefined) out.cochera = patch.cochera;
  if (patch.numeroEmergencia !== undefined) out.numero_emergencia = patch.numeroEmergencia;
  if (patch.direccion !== undefined) out.direccion = patch.direccion;
  if (patch.documentoFirmado !== undefined) out.documento_firmado = patch.documentoFirmado;
  if (patch.fechaInicioContrato !== undefined) {
    const fi = patch.fechaInicioContrato;
    out.fecha_inicio_contrato = fi == null || String(fi).trim() === '' ? null : String(fi).trim();
  }
  if (patch.fechaVencimientoContrato !== undefined) {
    const fv = patch.fechaVencimientoContrato;
    out.fecha_vencimiento_contrato =
      fv == null || String(fv).trim() === '' ? null : String(fv).trim();
  }
  if (patch.comentarios !== undefined) out.comentarios = patch.comentarios;
  return out;
}

export function ingresoToInsert(
  empresaId: string,
  row: Omit<Ingreso, 'id' | 'createdAt'>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    vehicle_id: row.vehicleId,
    tipo: row.tipo,
    sub_tipo: row.subTipo,
    fecha_desde: row.fechaDesde,
    fecha_hasta: row.fechaHasta,
    metodo_pago: row.metodoPago,
    metodo_pago_detalle: row.metodoPagoDetalle,
    celular_metodo: row.celularMetodo,
    signo: '+',
    monto: row.monto,
    moneda: row.moneda ?? 'PEN',
    tipo_cambio: row.tipoCambio ?? null,
    monto_pen_referencia: row.montoPENReferencia ?? null,
    comentarios: row.comentarios,
    detalle_operativo: row.detalleOperativo ?? null,
    tipo_operacion: row.tipoOperacion ?? null,
    estado_pago: row.estadoPago ?? 'PAGADO',
    excel_extra: row.excelExtra ?? null,
  };
  /** Columna opcional: omitir si aún no existe en el proyecto Supabase. */
  if (import.meta.env.VITE_INGRESOS_ES_EXTRAORDINARIO === '1') {
    payload.es_extraordinario = row.esExtraordinario ?? false;
  }
  return payload;
}

export type IngresoDetalleManualPatchRow = {
  fecha?: string;
  fechaRegistro?: string;
  vehicleId?: number | null;
  tipo?: string;
  subTipo?: string | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  monto?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number | null;
  montoPENReferencia?: number | null;
  comentarios?: string;
  excelExtra?: Record<string, unknown> | null;
};

export function ingresoDetalleManualPatchToRow(patch: IngresoDetalleManualPatchRow): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fecha !== undefined) row.fecha = patch.fecha;
  if (patch.fechaRegistro !== undefined) row.fecha_registro = patch.fechaRegistro;
  if (patch.vehicleId !== undefined) row.vehicle_id = patch.vehicleId;
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.subTipo !== undefined) row.sub_tipo = patch.subTipo;
  if (patch.fechaDesde !== undefined) row.fecha_desde = patch.fechaDesde;
  if (patch.fechaHasta !== undefined) row.fecha_hasta = patch.fechaHasta;
  if (patch.monto !== undefined) row.monto = patch.monto;
  if (patch.moneda !== undefined) row.moneda = patch.moneda;
  if (patch.tipoCambio !== undefined) row.tipo_cambio = patch.tipoCambio;
  if (patch.montoPENReferencia !== undefined) row.monto_pen_referencia = patch.montoPENReferencia;
  if (patch.comentarios !== undefined) row.comentarios = patch.comentarios;
  if (patch.excelExtra !== undefined) row.excel_extra = patch.excelExtra;
  return row;
}

export function gastoToInsert(empresaId: string, row: Omit<Gasto, 'id' | 'createdAt'>): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    vehicle_id: row.vehicleId,
    tipo: row.tipo,
    sub_tipo: row.subTipo,
    fecha_desde: row.fechaDesde,
    fecha_hasta: row.fechaHasta,
    metodo_pago: row.metodoPago,
    metodo_pago_detalle: row.metodoPagoDetalle,
    celular_metodo: row.celularMetodo,
    categoria: row.categoria,
    motivo: row.motivo,
    signo: '-',
    monto: row.monto,
    pagado_a: row.pagadoA,
    comentarios: row.comentarios,
    detalle_operativo: row.detalleOperativo ?? null,
    categoria_real: row.categoriaReal ?? null,
    subcategoria: row.subcategoria ?? null,
    excel_extra: row.excelExtra ?? null,
    tipo_gasto: row.tipo_gasto ?? null,
    subtipo_gasto: row.subtipo_gasto ?? null,
    es_global_flota: row.es_global_flota ?? false,
    origen_clasificacion: row.origen_clasificacion ?? null,
    requiere_revision: row.requiere_revision ?? false,
    clasificacion_manual: row.clasificacion_manual ?? false,
    clasificacion_confianza: row.clasificacion_confianza ?? null,
    revisado_at: row.revisado_at ?? new Date().toISOString(),
  };
}

export function mapControlFechaRow(r: Record<string, unknown>): ControlFecha {
  return {
    id: num(r.id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
    tipo: str(r.tipo) as ControlFecha['tipo'],
    fechaVencimiento: toDateOnlyString(r.fecha_vencimiento),
    fechaRegistro: toDateOnlyString(r.fecha_registro),
    comentarios: str(r.comentarios),
    createdAt: isoCreated(r.created_at),
  };
}

export function controlFechaToInsert(
  empresaId: string,
  row: Omit<ControlFecha, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    tipo: row.tipo,
    fecha_vencimiento: row.fechaVencimiento,
    fecha_registro: row.fechaRegistro,
    comentarios: row.comentarios,
  };
}

export function controlFechaPatchToSnake(
  patch: Partial<Omit<ControlFecha, 'id' | 'createdAt'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.vehicleId !== undefined) out.vehicle_id = patch.vehicleId;
  if (patch.tipo !== undefined) out.tipo = patch.tipo;
  if (patch.fechaVencimiento !== undefined) out.fecha_vencimiento = patch.fechaVencimiento;
  if (patch.fechaRegistro !== undefined) out.fecha_registro = patch.fechaRegistro;
  if (patch.comentarios !== undefined) out.comentarios = patch.comentarios;
  return out;
}

export function mapKilometrajeRow(r: Record<string, unknown>): KilometrajeRegistro {
  return {
    id: num(r.id),
    vehicleId: num(r.vehicle_id),
    fecha: toDateOnlyString(r.fecha),
    fechaRegistro: toDateOnlyString(r.fecha_registro),
    kmMantenimiento: r.km_mantenimiento != null && r.km_mantenimiento !== '' ? num(r.km_mantenimiento) : null,
    kilometraje: r.kilometraje != null && r.kilometraje !== '' ? num(r.kilometraje) : null,
    descripcion: str(r.descripcion),
    costo: r.costo != null && r.costo !== '' ? num(r.costo) : null,
    createdAt: isoCreated(r.created_at),
  };
}

export function kilometrajeToInsert(
  empresaId: string,
  row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    fecha: row.fecha,
    fecha_registro: row.fechaRegistro,
    km_mantenimiento: row.kmMantenimiento,
    kilometraje: row.kilometraje,
    descripcion: row.descripcion,
    costo: row.costo,
  };
}

function parsePendienteMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

const PENDIENTE_TIPOS: PendienteTipo[] = [
  'recordatorio', 'alerta', 'mantenimiento', 'documento', 'financiero', 'conductor', 'vehiculo', 'operacion',
];
const PENDIENTE_PRI_V2: PendientePrioridadV2[] = ['critica', 'alta', 'media', 'baja'];
const PENDIENTE_REL: PendienteRelacionadoTipo[] = [
  'vehiculo', 'conductor', 'documento', 'ingreso', 'gasto', 'ninguno',
];

export function mapPendienteRow(r: Record<string, unknown>): Pendiente {
  const es = str(r.estado).toUpperCase();
  const pr = str(r.prioridad).toUpperCase();
  const prioridad = (['ALTA', 'MEDIA', 'BAJA'].includes(pr) ? pr : 'MEDIA') as Pendiente['prioridad'];
  const meta = parsePendienteMetadata(r.metadata);
  const tipoRaw = str(meta.tipo ?? meta.tipo_pendiente).toLowerCase();
  const tipo = (PENDIENTE_TIPOS.includes(tipoRaw as PendienteTipo) ? tipoRaw : 'operacion') as PendienteTipo;
  const pv2Raw = str(meta.prioridad_v2 ?? meta.prioridadV2).toLowerCase();
  const prioridadV2 = PENDIENTE_PRI_V2.includes(pv2Raw as PendientePrioridadV2)
    ? (pv2Raw as PendientePrioridadV2)
    : prioridadV2FromLegacy(prioridad, undefined);
  const relRaw = str(meta.relacionado_tipo ?? meta.relacionadoTipo).toLowerCase();
  let relacionadoTipo = (PENDIENTE_REL.includes(relRaw as PendienteRelacionadoTipo)
    ? relRaw
    : 'ninguno') as PendienteRelacionadoTipo;
  const relId = meta.relacionado_id ?? meta.relacionadoId ?? null;
  let relacionadoId: string | number | null =
    relId == null || relId === '' ? null : typeof relId === 'number' ? relId : String(relId);
  const vehicleId = r.vehicle_id != null ? num(r.vehicle_id) : null;
  if (relacionadoTipo === 'ninguno' && vehicleId != null) {
    relacionadoTipo = 'vehiculo';
    relacionadoId = vehicleId;
  }
  const tituloDb = str(r.titulo).trim();
  const descripcion = str(r.descripcion);
  const mostrarRaw = meta.mostrar_en_hoy ?? meta.mostrarEnHoy;
  const mostrarEnHoy = mostrarRaw === false || mostrarRaw === 'false' ? false : true;
  const fechaObj = meta.fecha_objetivo ?? meta.fechaObjetivo;
  const fechaObjetivo =
    fechaObj != null && String(fechaObj).trim() !== '' ? String(fechaObj).slice(0, 10) : null;
  const createdByCol = strOrNull(r.created_by);
  const createdByMeta = strOrNull(meta.created_by ?? meta.createdBy);
  const createdByNameMeta = strOrNull(meta.created_by_name ?? meta.createdByName);
  const resolvedAtCol = r.resolved_at != null ? String(r.resolved_at) : null;
  const resolvedAtMeta = meta.resolved_at ?? meta.resolvedAt;
  const resolvedAt =
    resolvedAtCol ??
    (resolvedAtMeta != null && String(resolvedAtMeta).trim() !== '' ? String(resolvedAtMeta) : null);
  const resolvedByCol = strOrNull(r.resolved_by);
  const resolvedByMeta = strOrNull(meta.resolved_by ?? meta.resolvedBy);
  const deletedAtCol = r.deleted_at != null ? String(r.deleted_at) : null;
  const deletedAtMeta = meta.deleted_at ?? meta.deletedAt;
  const deletedAt =
    deletedAtCol ??
    (deletedAtMeta != null && String(deletedAtMeta).trim() !== '' ? String(deletedAtMeta) : null);

  return {
    id: num(r.id),
    vehicleId,
    titulo: tituloDb || undefined,
    descripcion,
    estado: (['ABIERTO', 'EN_CURSO', 'RESUELTO', 'CANCELADO'].includes(es)
      ? es
      : 'ABIERTO') as Pendiente['estado'],
    fecha: str(r.fecha).slice(0, 10),
    prioridad,
    tipo,
    prioridadV2,
    mostrarEnHoy,
    responsable: strOrNull(meta.responsable),
    fechaObjetivo,
    relacionadoTipo,
    relacionadoId,
    createdAt: isoCreated(r.created_at),
    createdBy: createdByCol ?? createdByMeta,
    createdByName: createdByNameMeta,
    resolvedAt,
    resolvedBy: resolvedByCol ?? resolvedByMeta,
    deletedAt,
  };
}

function pendienteMetadataFromRow(row: Omit<Pendiente, 'id' | 'createdAt'>): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    tipo: row.tipo,
    prioridad_v2: row.prioridadV2,
    mostrar_en_hoy: row.mostrarEnHoy,
    responsable: row.responsable,
    fecha_objetivo: row.fechaObjetivo,
    relacionado_tipo: row.relacionadoTipo,
    relacionado_id: row.relacionadoId,
  };
  if (row.createdBy) meta.created_by = row.createdBy;
  if (row.createdByName) meta.created_by_name = row.createdByName;
  if (row.resolvedAt) meta.resolved_at = row.resolvedAt;
  if (row.resolvedBy) meta.resolved_by = row.resolvedBy;
  if (row.deletedAt) meta.deleted_at = row.deletedAt;
  return meta;
}

export function pendienteToInsert(
  empresaId: string,
  row: Omit<Pendiente, 'id' | 'createdAt'>,
): Record<string, unknown> {
  const prioridad = row.prioridad ?? prioridadLegacyFromV2(row.prioridadV2 ?? 'media');
  const titulo = row.titulo?.trim() || row.descripcion.trim().slice(0, 200);
  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    titulo,
    descripcion: row.descripcion,
    estado: row.estado,
    fecha: row.fecha,
    prioridad,
    metadata: pendienteMetadataFromRow({ ...row, prioridad }),
  };
  // Autoría y resolución van en metadata; columnas dedicadas son opcionales (ver migration_pendientes_resolucion.sql).
  return payload;
}

/** Insert mínimo si faltan columnas titulo/metadata (solo tabla base). */
export function pendienteToInsertLegacy(
  empresaId: string,
  row: Omit<Pendiente, 'id' | 'createdAt'>,
): Record<string, unknown> {
  const prioridad = row.prioridad ?? prioridadLegacyFromV2(row.prioridadV2 ?? 'media');
  const titulo = row.titulo?.trim();
  const desc = row.descripcion.trim();
  const descripcion =
    titulo && desc && desc !== titulo ? `${titulo}\n${desc}` : titulo || desc || 'Pendiente';
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    descripcion,
    estado: row.estado,
    fecha: row.fecha,
    prioridad,
  };
}

export function pendientePatchToSnake(patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.vehicleId !== undefined) out.vehicle_id = patch.vehicleId;
  if (patch.titulo !== undefined) out.titulo = patch.titulo;
  if (patch.descripcion !== undefined) out.descripcion = patch.descripcion;
  if (patch.estado !== undefined) out.estado = patch.estado;
  if (patch.fecha !== undefined) out.fecha = patch.fecha;
  if (patch.prioridad !== undefined) out.prioridad = patch.prioridad;
  const metaPatch: Record<string, unknown> = {};
  if (patch.tipo !== undefined) metaPatch.tipo = patch.tipo;
  if (patch.prioridadV2 !== undefined) metaPatch.prioridad_v2 = patch.prioridadV2;
  if (patch.mostrarEnHoy !== undefined) metaPatch.mostrar_en_hoy = patch.mostrarEnHoy;
  if (patch.responsable !== undefined) metaPatch.responsable = patch.responsable;
  if (patch.fechaObjetivo !== undefined) metaPatch.fecha_objetivo = patch.fechaObjetivo;
  if (patch.relacionadoTipo !== undefined) metaPatch.relacionado_tipo = patch.relacionadoTipo;
  if (patch.relacionadoId !== undefined) metaPatch.relacionado_id = patch.relacionadoId;
  if (patch.createdBy !== undefined) metaPatch.created_by = patch.createdBy;
  if (patch.createdByName !== undefined) metaPatch.created_by_name = patch.createdByName;
  if (patch.resolvedAt !== undefined) metaPatch.resolved_at = patch.resolvedAt;
  if (patch.resolvedBy !== undefined) metaPatch.resolved_by = patch.resolvedBy;
  if (patch.deletedAt !== undefined) metaPatch.deleted_at = patch.deletedAt;
  if (Object.keys(metaPatch).length > 0) out.metadata = metaPatch;
  if (patch.prioridadV2 !== undefined && patch.prioridad === undefined) {
    out.prioridad = prioridadLegacyFromV2(patch.prioridadV2);
  }
  return out;
}

export function mapRegistroTiempoRow(r: Record<string, unknown>): RegistroTiempo {
  const fr = r.fecha_registro;
  const fechaRegistro =
    typeof fr === 'string'
      ? fr
      : fr instanceof Date
        ? fr.toISOString()
        : isoCreated(fr);
  return {
    id: num(r.id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
    fechaRegistro,
    fecha: str(r.fecha).slice(0, 10),
    detalleAuto: strOrNull(r.detalle_auto),
    tipo: strOrNull(r.tipo),
    descripcion: strOrNull(r.descripcion),
    valorTiempo: numOrNull(r.valor_tiempo),
    createdAt: isoCreated(r.created_at),
  };
}

export function registroTiempoToInsert(
  empresaId: string,
  row: Omit<RegistroTiempo, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    fecha_registro: row.fechaRegistro,
    fecha: row.fecha,
    detalle_auto: row.detalleAuto,
    tipo: row.tipo,
    descripcion: row.descripcion,
    valor_tiempo: row.valorTiempo,
  };
}

export function registroTiempoPatchToSnake(
  patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.vehicleId !== undefined) out.vehicle_id = patch.vehicleId;
  if (patch.fechaRegistro !== undefined) out.fecha_registro = patch.fechaRegistro;
  if (patch.fecha !== undefined) out.fecha = patch.fecha;
  if (patch.detalleAuto !== undefined) out.detalle_auto = patch.detalleAuto;
  if (patch.tipo !== undefined) out.tipo = patch.tipo;
  if (patch.descripcion !== undefined) out.descripcion = patch.descripcion;
  if (patch.valorTiempo !== undefined) out.valor_tiempo = patch.valorTiempo;
  return out;
}

const DOWNTIME_MOTIVOS = [
  'taller',
  'multa',
  'mantenimiento',
  'accidente',
  'sin_conductor',
  'administrativo',
  'otro',
] as const;

export function mapVehicleDowntimeRow(r: Record<string, unknown>): VehicleDowntime {
  const mot = str(r.motivo).toLowerCase();
  const est = str(r.estado).toLowerCase();
  return {
    id: num(r.id),
    vehicleId: num(r.vehicle_id),
    fechaInicio: str(r.fecha_inicio).slice(0, 10),
    fechaFin: r.fecha_fin != null && String(r.fecha_fin).trim() !== '' ? str(r.fecha_fin).slice(0, 10) : null,
    motivo: (DOWNTIME_MOTIVOS.includes(mot as (typeof DOWNTIME_MOTIVOS)[number])
      ? mot
      : 'otro') as VehicleDowntimeMotivo,
    comentario: str(r.comentario),
    estado: est === 'cerrado' ? 'cerrado' : 'activo',
    createdAt: isoCreated(r.created_at),
  };
}

export function vehicleDowntimeToInsert(
  empresaId: string,
  row: Omit<VehicleDowntime, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    fecha_inicio: row.fechaInicio,
    fecha_fin: row.fechaFin,
    motivo: row.motivo,
    comentario: row.comentario ?? '',
    estado: row.estado,
  };
}

export function vehicleDowntimePatchToSnake(
  patch: Partial<Omit<VehicleDowntime, 'id' | 'createdAt'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.fechaInicio !== undefined) out.fecha_inicio = patch.fechaInicio;
  if (patch.fechaFin !== undefined) out.fecha_fin = patch.fechaFin;
  if (patch.motivo !== undefined) out.motivo = patch.motivo;
  if (patch.comentario !== undefined) out.comentario = patch.comentario;
  if (patch.estado !== undefined) out.estado = patch.estado;
  return out;
}
