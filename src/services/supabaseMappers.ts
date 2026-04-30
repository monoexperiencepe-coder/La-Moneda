import { toDateOnlyString } from '../utils/formatting';
import type {
  Vehicle,
  UnidadRegistro,
  Conductor,
  Ingreso,
  Gasto,
  Moneda,
  TipoDocumento,
  TipoDomicilio,
  ControlFecha,
  KilometrajeRegistro,
  Pendiente,
  RegistroTiempo,
} from '../data/types';

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
  return {
    id: num(r.id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
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
    fechaVencimientoContrato: strOrNull(r.fecha_vencimiento_contrato),
    comentarios: str(r.comentarios),
    createdAt: isoCreated(r.created_at),
  };
}

export function mapIngresoRow(r: Record<string, unknown>): Ingreso {
  const moneda = (strOrNull(r.moneda) as Moneda | null) ?? 'PEN';
  return {
    id: num(r.id),
    fecha: toDateOnlyString(r.fecha),
    fechaRegistro: toDateOnlyString(r.fecha_registro ?? r.fecha),
    vehicleId: num(r.vehicle_id),
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
    createdAt: isoCreated(r.created_at),
  };
}

export function mapGastoRow(r: Record<string, unknown>): Gasto {
  return {
    id: num(r.id),
    fecha: toDateOnlyString(r.fecha),
    fechaRegistro: toDateOnlyString(r.fecha_registro ?? r.fecha),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
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
    createdAt: isoCreated(r.created_at),
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
  if (patch.fechaVencimientoContrato !== undefined) {
    out.fecha_vencimiento_contrato = patch.fechaVencimientoContrato;
  }
  if (patch.comentarios !== undefined) out.comentarios = patch.comentarios;
  return out;
}

export function ingresoToInsert(
  empresaId: string,
  row: Omit<Ingreso, 'id' | 'createdAt'>,
): Record<string, unknown> {
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
    signo: '+',
    monto: row.monto,
    moneda: row.moneda ?? 'PEN',
    tipo_cambio: row.tipoCambio ?? null,
    monto_pen_referencia: row.montoPENReferencia ?? null,
    comentarios: row.comentarios,
    detalle_operativo: row.detalleOperativo ?? null,
    tipo_operacion: row.tipoOperacion ?? null,
    estado_pago: row.estadoPago ?? null,
    excel_extra: row.excelExtra ?? null,
  };
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

export function mapPendienteRow(r: Record<string, unknown>): Pendiente {
  const es = str(r.estado).toUpperCase();
  const pr = str(r.prioridad).toUpperCase();
  return {
    id: num(r.id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
    descripcion: str(r.descripcion),
    estado: (['ABIERTO', 'EN_CURSO', 'RESUELTO', 'CANCELADO'].includes(es)
      ? es
      : 'ABIERTO') as Pendiente['estado'],
    fecha: str(r.fecha).slice(0, 10),
    prioridad: (['ALTA', 'MEDIA', 'BAJA'].includes(pr) ? pr : 'MEDIA') as Pendiente['prioridad'],
    createdAt: isoCreated(r.created_at),
  };
}

export function pendienteToInsert(
  empresaId: string,
  row: Omit<Pendiente, 'id' | 'createdAt'>,
): Record<string, unknown> {
  return {
    empresa_id: empresaId,
    vehicle_id: row.vehicleId,
    descripcion: row.descripcion,
    estado: row.estado,
    fecha: row.fecha,
    prioridad: row.prioridad,
  };
}

export function pendientePatchToSnake(patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.vehicleId !== undefined) out.vehicle_id = patch.vehicleId;
  if (patch.descripcion !== undefined) out.descripcion = patch.descripcion;
  if (patch.estado !== undefined) out.estado = patch.estado;
  if (patch.fecha !== undefined) out.fecha = patch.fecha;
  if (patch.prioridad !== undefined) out.prioridad = patch.prioridad;
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
