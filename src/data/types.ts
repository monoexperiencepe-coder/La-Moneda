export interface Vehicle {
  id: number;
  marca: string;
  modelo: string;
  placa: string;
  anio?: number;
  color?: string;
  activo: boolean;
}

/** Moneda de registro (préstamos, ingresos multimoneda). */
export type Moneda = 'PEN' | 'USD';

/**
 * Registro alineado a la hoja Fact (ingresos).
 * - fecha = Fecha Movimiento (fecha contable principal, usada en filtros y gráficos)
 * - fechaRegistro = Fecha Registro (cuándo se cargó en el sistema)
 */
export interface Ingreso {
  id: number;
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

/**
 * Registro alineado a la hoja Fact (gastos).
 */
export interface Gasto {
  id: number;
  fecha: string;
  fechaRegistro: string;
  vehicleId: number | null;
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
