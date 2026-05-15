export interface Vehicle {
  id: number;
  marca: string;
  modelo: string;
  placa: string;
  anio?: number;
  color?: string;
  activo: boolean;
}

export type AppRole = 'admin' | 'socio' | 'contador' | 'operador';

export interface AppUserProfile {
  id: string;
  name: string;
  role: AppRole;
}

/** Moneda de registro (préstamos, ingresos multimoneda). */
export type Moneda = 'PEN' | 'USD';

/**
 * Registro alineado a la hoja Fact (ingresos).
 * - fecha = Fecha Movimiento (fecha contable principal, usada en filtros y gráficos)
 * - fechaRegistro = Fecha registro en Fact/hoja (columna negocio; puede diferir de `fecha`)
 * - createdAt = created_at en BD (cuándo se creó la fila en Supabase); puede faltar en datos viejos
 */
export interface Ingreso {
  /** PK Supabase (`bigint` o `uuid`), siempre como string en cliente. */
  id: string;
  fecha: string;
  fechaRegistro: string;
  vehicleId: number;
  /** Tipo maestro (Dim_Tipo INGRESOS): ALQUILER, GARANTÍAS, etc. */
  tipo: string;
  /** Sub Tipo (Dim_SubTipo): p. ej. Día, Semana para ALQUILER */
  subTipo: string | null;
  /** Período cubierto por el cobro de alquiler (Fact: Fecha Desde / Hasta); null si no aplica */
  fechaDesde: string | null;
  fechaHasta: string | null;
  metodoPago: string;
  metodoPagoDetalle: string;
  celularMetodo: string | null;
  signo: '+';
  /** Monto en la moneda indicada (por defecto PEN). */
  monto: number;
  /** Moneda del monto; omitido o PEN = soles. */
  moneda?: Moneda | null;
  /** Tipo de cambio PEN por 1 USD en la fecha del movimiento (obligatorio si moneda USD). */
  tipoCambio?: number | null;
  /** Equivalente en PEN para reportes (si USD: monto × tipoCambio). */
  montoPENReferencia?: number | null;
  comentarios: string;
  /** Contexto de negocio (detalle unidad + comentarios); enriquecido, no sustituye comentarios. */
  detalleOperativo?: string | null;
  /** Línea operativa (tipo | subTipo). */
  tipoOperacion?: string | null;
  /** P. ej. PENDIENTE / PAGADO inferido desde comentarios; null si no aplica. */
  estadoPago?: string | null;
  /** Columnas Excel no mapeadas a campos dedicados (Supabase: excel_extra). */
  excelExtra?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Préstamo solicitado / colocado (lectura rápida en Finanzas, aparte del detalle Fact de ingresos).
 * saldoPendiente en la misma moneda que monto.
 */
export interface Prestamo {
  id: number;
  fecha: string;
  fechaRegistro: string;
  vehicleId: number | null;
  moneda: Moneda;
  /** Capital prestado */
  monto: number;
  /** Tasa de interés anual (%) */
  tasaInteresAnualPct: number;
  /** PEN por 1 USD a la fecha del registro (referencia para pasar a soles) */
  tipoCambio: number | null;
  acreedor: string;
  saldoPendiente: number;
  estado: 'ACTIVO' | 'LIQUIDADO' | 'CANCELADO';
  comentarios: string;
  createdAt: string;
}

/** Abono a capital (misma moneda que el préstamo). */
export interface PrestamoAbono {
  id: number;
  prestamoId: number;
  fecha: string;
  fechaRegistro: string;
  moneda: Moneda;
  monto: number;
  tipoCambio: number | null;
  comentarios: string;
  createdAt: string;
}

/** Préstamo informativo en Supabase (`prestamos_financieros`); no crea gastos automáticamente. */
export type PrestamoFinancieroEstado = 'activo' | 'cancelado';

/** Modalidad de pago del préstamo (Excel v3). */
export type ModalidadPagoPrestamo = 'tasa_anual' | 'cuota_fija';

export interface PrestamoFinanciero {
  id: number;
  empresaId: string;
  codigo: string;
  prestamista: string;
  /** Legacy: alineado con moneda_capital en BD. */
  moneda: Moneda;
  monedaCapital: Moneda;
  monedaPago: Moneda;
  modalidadPago: ModalidadPagoPrestamo;
  titulo: string;
  montoOriginal: number;
  capitalActualEstimado: number;
  /** Solo modalidad tasa_anual; null si cuota_fija. */
  tasaAnual: number | null;
  /** Solo modalidad cuota_fija; opcional si solo interes_mensual_actual. */
  cuotaFijaMensual: number | null;
  /** Cuota mensual en moneda_pago (registro Excel). */
  interesMensualActual: number;
  fechaInicio: string;
  estado: PrestamoFinancieroEstado;
  fechaCancelacion: string | null;
  requiereTramos: boolean;
  notas: string;
  observaciones: string;
  createdAt: string;
}

/** Tramo de interés/capital (`prestamos_tramos`). */
export interface PrestamoFinancieroTramo {
  id: number;
  prestamoFinancieroId: number;
  /** Legacy = moneda_capital en BD. */
  moneda: Moneda;
  monedaCapital: Moneda;
  monedaPago: Moneda;
  modalidadPago: ModalidadPagoPrestamo;
  desde: string;
  hasta: string | null;
  capitalReferencial: number | null;
  tasaAnual: number | null;
  cuotaFijaMensual: number | null;
  /** Cuota explícita en moneda_pago; si es null se deriva según modalidad. */
  interesMensual: number | null;
  evento: string;
  nota: string;
  orden: number;
  createdAt: string;
}

/** Aporte de accionista (`aportes_accionistas`). */
export interface AporteAccionista {
  id: string;
  empresaId: string;
  accionista: string;
  vehiculoReferencia: string | null;
  monto: number;
  moneda: Moneda;
  fechaAporte: string;
  generaInteres: boolean;
  tipo: string;
  observaciones: string;
  createdAt: string;
}

export interface PrestamoFinancieroDetalle {
  prestamo: PrestamoFinanciero;
  tramos: PrestamoFinancieroTramo[];
}

/** Totales estimados solo para UI (no contabilidad). */
export interface PrestamoFinancieroCalculoInfo {
  fechaTopeCalculo: string;
  mesesPagadosEstimados: number;
  totalInteresPagadoEstimado: number;
  capitalActualEstimado: number;
  /** Cuota mensual derivada (modalidad tasa_anual o cuota_fija); montos en moneda de pago del préstamo. */
  interesMensualEstimado: number;
  porTramo: {
    tramoId: number;
    orden: number;
    meses: number;
    interesMensualEfectivo: number;
    subtotalInteres: number;
    desdeEfectivo: string;
    hastaEfectivo: string;
  }[];
}

/**
 * Registro alineado a la hoja Fact (gastos).
 */
export interface Gasto {
  /** PK Supabase (`bigint` o `uuid`), siempre string en cliente. */
  id: string;
  fecha: string;
  fechaRegistro: string;
  /** FK `vehiculos.id`: bigint en muchos entornos; uuid en otros. Nunca usar 0 como «sin vehículo». */
  vehicleId: number | string | null;
  /** Tipo maestro GASTOS (Dim_Tipo): MECÁNICOS, DOCUMENTOS, etc. */
  tipo: string;
  /** Sub Tipo (Dim_SubTipo) */
  subTipo: string | null;
  /** Período cubierto por el gasto (Fact: opcional) */
  fechaDesde: string | null;
  fechaHasta: string | null;
  metodoPago: string;
  metodoPagoDetalle: string;
  celularMetodo: string | null;
  /** Derivado del tipo para gráficos por categoría legacy */
  categoria: CategoriaGasto;
  /** Igual que subTipo en registros nuevos; se mantiene para tablas existentes */
  motivo: string;
  signo: '-';
  monto: number;
  /** A quién va dirigido el pago (taller, persona, entidad); distinto de comentarios generales */
  pagadoA: string;
  comentarios: string;
  /** Contexto de negocio (detalle unidad + comentarios). */
  detalleOperativo?: string | null;
  /** Categoría de la hoja Excel o tipo Fact si no hay categoría de Excel. */
  categoriaReal?: string | null;
  /** Subtipo Fact o refinamiento. */
  subcategoria?: string | null;
  /** Columnas Excel no mapeadas a campos dedicados (Supabase: excel_extra). */
  excelExtra?: Record<string, unknown> | null;
  /** Capa financiera inteligente (public.gastos). */
  tipo_gasto?: string | null;
  subtipo_gasto?: string | null;
  clasificacion_confianza?: number | null;
  requiere_revision?: boolean | null;
  clasificacion_manual?: boolean | null;
  revisado_por?: string | null;
  revisado_at?: string | null;
  es_global_flota?: boolean | null;
  origen_clasificacion?: string | null;
  createdAt: string;
}

/**
 * Costo histórico de inversión / adquisición por unidad (tabla inversiones_vehiculo).
 * No es gasto operativo mensual; no se mezcla con totales de gastos Fact.
 */
/**
 * Total de inversión inicial por vehículo (tabla inversiones_generales_vehiculo).
 * Origen Excel VALOR DE INVERSION; no es fila de public.gastos.
 */
export interface InversionGeneralVehiculo {
  id: string;
  vehiculoReferencia: string;
  vehiculoNumero: number | null;
  placa: string | null;
  modelo: string | null;
  /** Desglose hoja VALOR DE INVERSION (USD + equivalente PEN); null si aún no migró la fila. */
  fechaCompra: string | null;
  valorCompraUsd: number | null;
  gastoGnvUsd: number | null;
  gastoNotarialUsd: number | null;
  legFirmasUsd: number | null;
  seguroUsd: number | null;
  gpsUsd: number | null;
  fundasAccesoriosUsd: number | null;
  totalInversionPen: number | null;
  montoTotal: number;
  moneda: Moneda;
  fuente: string;
  observaciones: string | null;
  createdAt: string;
}

export interface InversionVehiculo {
  id: number;
  vehicleId: number | null;
  descripcionExcel: string;
  fechaCompra: string | null;
  valorCompraUsd: number | null;
  gastoGnvUsd: number | null;
  gastoNotarialUsd: number | null;
  legFirmasUsd: number | null;
  seguroUsd: number | null;
  gpsUsd: number | null;
  fundasAccesoriosUsd: number | null;
  totalInversionUsd: number | null;
  totalInversionPen: number | null;
  excelExtra?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Gasto de caja general (Excel GASTOS). No vehículo; no es fila de public.gastos operativo.
 */
export interface GastoCaja {
  id: number;
  fecha: string;
  concepto: string;
  monto: number;
  categoria: string;
  comentarios: string;
  excelExtra?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FinancialAuditLog {
  id: number;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Caja negocio / utilidad por vehículo (no gasto operativo ni ingreso de arriendo).
 * Tabla public.caja_negocio_vehiculo.
 */
export interface CajaNegocioVehiculo {
  id: number;
  vehicleId: number;
  fecha: string;
  monto: number;
  concepto: string;
  origenGastoId: number | null;
  comentarios: string;
  excelExtra?: Record<string, unknown> | null;
  createdAt: string;
}

/** Categoría operativa de rebaja (no es tipo Fact de gastos). */
export type CategoriaDescuento =
  | 'CHOQUE'
  | 'DESCANSO_MEDICO'
  | 'DIA_AUTORIZADO'
  | 'OTROS'
  | 'PLANCHADO'
  | 'TALLER';

/**
 * Descuento / rebaja: dinero que no ingresa o costo adicional explícito.
 * Vive fuera del formulario de gastos; el monto se guarda negativo para alinear con el margen.
 */
export interface Descuento {
  id: number;
  fecha: string;
  fechaRegistro: string;
  vehicleId: number | null;
  categoria: CategoriaDescuento;
  /** Rebaja: siempre negativo (p. ej. -40) */
  monto: number;
  comentarios: string;
  createdAt: string;
}

export interface UnidadRegistro {
  /** PK en Supabase: uuid como string, o bigint vía PostgREST (siempre string en cliente para no perder precisión ni mezclar con uuid). */
  id: string;
  vehicleId: number | null;
  numeroInterno: string;
  marca: string;
  modelo: string;
  anio: number;
  placa: string;
  detalleAuto: string;
  combustible: string;
  color: string;
  tipoCarroceria?: string;
  numeroMotor?: string;
  cantidadLlaves?: number | null;
  gps1?: string;
  gps2?: string;
  impuestoEstado?: string;
  kmInicial?: number | null;
  tarjetaPropiedad?: string;
  propietario?: string;
  fechaCompraUSD?: string | null;
  valorCompraUSD?: number | null;
  tipoCambioCompra?: number | null;
  /** Campos extra alineados a la hoja UNIDADES del Excel. */
  gastoGnv?: string | null;
  gastosNotariales?: string | null;
  gastosAccesorios?: string | null;
  gpsInstalado: boolean;
  gpsProveedor: string;
  impuestoVehicularVence: string | null;
  comentarios: string;
  createdAt: string;
}

export interface Conductor {
  id: number;
  vehicleId: number | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  celular: string;
  domicilio: TipoDomicilio;
  estadoContrato: 'ABIERTO' | 'CERRADO';
  estado: 'VIGENTE' | 'SUSPENDIDO';
  /** Estado textual original de la hoja CONDUCTORES (columna STATUS). */
  statusOriginal?: string | null;
  /** Hoja CONDUCTORES (Excel): cochera, contacto de emergencia, dirección, contrato. */
  cochera?: string | null;
  numeroEmergencia?: string | null;
  direccion?: string | null;
  documentoFirmado?: boolean | null;
  fechaVencimientoContrato?: string | null;
  comentarios: string;
  createdAt: string;
}

export type TipoControlFecha =
  | 'BAT_MANT_REALIZADO'
  | 'BAT_COMPRA_NUEVA'
  | 'SOAT'
  | 'RT_PARTICULAR'
  | 'RT_TAXI'
  | 'AFOCAT_TAXI'
  | 'INSTALACION_GNV'
  | 'PERMISO_ATU'
  | 'CERT_GNV_ANUAL'
  | 'QUINQUENAL_GNV'
  | 'VENC_BREVETE'
  | 'CREDENCIAL_ATU_BREVETE'
  | 'GPS'
  | 'IMPUESTO'
  /** Columna de vencimiento reconocida como fecha pero sin regla explícita (nombre en comentarios). */
  | 'OTRO_VENCIMIENTO';

export interface ControlFecha {
  id: number;
  vehicleId: number | null;
  tipo: TipoControlFecha;
  fechaVencimiento: string;
  fechaRegistro: string;
  comentarios: string;
  createdAt: string;
}

export interface KilometrajeRegistro {
  id: number;
  vehicleId: number;
  fecha: string;
  fechaRegistro: string;
  kmMantenimiento: number | null;
  kilometraje: number | null;
  descripcion: string;
  costo: number | null;
  createdAt: string;
}

export type EstadoPendiente = 'ABIERTO' | 'EN_CURSO' | 'RESUELTO' | 'CANCELADO';
export type PrioridadPendiente = 'ALTA' | 'MEDIA' | 'BAJA';

/** Tarea / seguimiento (hoja PENDIENTES Excel). */
export interface Pendiente {
  id: number;
  vehicleId: number | null;
  descripcion: string;
  estado: EstadoPendiente;
  fecha: string;
  prioridad: PrioridadPendiente;
  createdAt: string;
}

/**
 * Hoja TIEMPO del Excel: registro operativo asociado a unidad / taller (no es ingreso ni gasto).
 * `valorTiempo` es numérico libre (p. ej. horas de taller o métrica interna).
 */
export interface RegistroTiempo {
  id: number;
  vehicleId: number | null;
  /** Cuándo se cargó el registro en sistema (= F.REGISTRO Excel). */
  fechaRegistro: string;
  /** Fecha del hecho (= FECHA Excel). */
  fecha: string;
  detalleAuto: string | null;
  tipo: string | null;
  descripcion: string | null;
  valorTiempo: number | null;
  createdAt: string;
}

export interface Mantenimiento {
  id: number;
  fechaRegistro: string;
  vehicleId: number;
  documentoResponsable: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  celular: string;
  domicilio: TipoDomicilio;
  cochera: string;
  direccion: string;
  referencia: string;
  documentoFirmado: boolean;
  fechaVencimientoContrato: string;
  mantenimientoRealizado: boolean;
  compraBateriaNueva: boolean;
  kilometraje: number;
  costo: number;
  createdAt: string;
}

export interface Documentacion {
  id: number;
  fecha: string;
  vehicleId: number;
  motivo: string;
  descripcion: string;
  valorTiempo: string;
  soat: string;
  rtParticular: string;
  rtDetaxi: string;
  afocatTaxi: string;
  notas: string;
  createdAt: string;
}

export type CategoriaGasto =
  | 'GASTOS_MECANICOS'
  | 'GASTOS_FIJOS'
  | 'GASTOS_TRIBUTARIOS'
  | 'GASTOS_PROVISIONALES';

export type TipoDocumento = 'DNI' | 'CE' | 'PASAPORTE';
export type TipoDomicilio = 'PROPIO' | 'ALQUILADO' | 'CASA DE FAMILIA';

export interface KPIData {
  totalIngresos: number;
  totalGastos: number;
  /** Suma de montos de descuentos (típicamente ≤ 0) */
  totalDescuentos: number;
  margenNeto: number;
  promedioIngresoDiario: number;
  ingresosPorTipo: Record<string, number>;
  gastosPorCategoria: Record<string, number>;
  descuentosPorCategoria: Record<string, number>;
}

export interface VehicleRentability {
  vehicle: Vehicle;
  totalIngresos: number;
  totalGastos: number;
  totalDescuentos: number;
  margen: number;
}

export interface FilterState {
  mes: number | null;
  anio: number | null;
  vehicleId: number | null;
  fechaDesde: string;
  fechaHasta: string;
}

export type ActiveView =
  | 'dashboard'
  | 'ingresos'
  | 'gastos'
  | 'mantenimiento'
  | 'documentacion'
  | 'reportes';
