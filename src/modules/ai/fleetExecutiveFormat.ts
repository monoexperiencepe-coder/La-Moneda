/**
 * Formato ejecutivo para tools de flota — payloads al LLM y guías de redacción.
 * El usuario final no debe ver IDs, JSON ni campos backend.
 */
import type { AiToolName } from './types';
import { normalizePlaca } from '../../utils/normalizePlaca';

export const FLEET_AI_TOOLS: ReadonlySet<AiToolName> = new Set([
  'getFlotaResumen',
  'getVehiculosDisponibles',
  'getVehiculosSinConductor',
  'getConductoresAsignados',
  'getVehiculoPorPlaca',
  'getConductorPorVehiculo',
]);

export const FLEET_LISTADO_MAX_VISIBLE = 10;

export type VehiculoEjecutivoLinea = {
  placa: string;
  marca: string;
  modelo: string;
  anio?: number;
  activo?: boolean;
  disponible?: boolean;
  conductor?: string | null;
};

function pickVehiculoLinea(row: Record<string, unknown>): VehiculoEjecutivoLinea | null {
  const placa = String(row.placa ?? '').trim();
  if (!placa) return null;
  return {
    placa: normalizePlaca(placa),
    marca: String(row.marca ?? '').trim(),
    modelo: String(row.modelo ?? '').trim(),
    anio: typeof row.anio === 'number' && Number.isFinite(row.anio) ? row.anio : undefined,
    activo: row.activo === true || row.activo === false ? row.activo : undefined,
    disponible: row.disponible === true || row.disponible === false ? row.disponible : undefined,
    conductor: row.conductor != null ? String(row.conductor) : null,
  };
}

/** Una línea lista para copiar al summary (bullet •). */
export function formatVehiculoLineaEjecutiva(v: VehiculoEjecutivoLinea): string {
  const anio = v.anio != null && v.anio > 0 ? ` ${v.anio}` : '';
  const base = `${v.placa} — ${v.marca} ${v.modelo}${anio}`.replace(/\s+/g, ' ').trim();
  return `• ${base}`;
}

export function formatConductorAsignadoLinea(row: Record<string, unknown>): string {
  const nombre = String(row.conductor ?? '').trim();
  const placa = String(row.placa ?? '').trim();
  const marca = String(row.marca ?? '').trim();
  const modelo = String(row.modelo ?? '').trim();
  const unidad = [normalizePlaca(placa), marca, modelo].filter(Boolean).join(' ');
  if (!nombre) return '';
  return unidad ? `• ${nombre} — ${unidad}` : `• ${nombre}`;
}

export function buildListadoEjecutivo(
  lineas: string[],
  total: number,
): { lineas_visibles: string[]; adicionales: number | null; pie_listado: string | null } {
  const visibles = lineas.slice(0, FLEET_LISTADO_MAX_VISIBLE);
  const extra = total > FLEET_LISTADO_MAX_VISIBLE ? total - FLEET_LISTADO_MAX_VISIBLE : 0;
  return {
    lineas_visibles: visibles,
    adicionales: extra > 0 ? extra : null,
    pie_listado: extra > 0 ? `+ ${extra} unidades adicionales` : null,
  };
}

function vehiculosFromPayload(data: Record<string, unknown>): VehiculoEjecutivoLinea[] {
  const raw = data.vehiculos;
  if (!Array.isArray(raw)) return [];
  const out: VehiculoEjecutivoLinea[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const line = pickVehiculoLinea(item as Record<string, unknown>);
    if (line) out.push(line);
  }
  return out;
}

function buildNarrativaFlotaResumen(d: Record<string, unknown>): string {
  const total = Number(d.total ?? 0);
  const activos = Number(d.activos ?? 0);
  const inactivos = Number(d.inactivos ?? 0);
  const disponibles = Number(d.disponibles ?? d.sinConductor ?? 0);
  const parts = [
    `La empresa tiene ${total} vehículo${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}.`,
    `${activos} activo${activos !== 1 ? 's' : ''}${inactivos > 0 ? ` y ${inactivos} inactivo${inactivos !== 1 ? 's' : ''}` : ''}.`,
  ];
  if (disponibles > 0) {
    parts.push(
      `${disponibles} unidad${disponibles !== 1 ? 'es' : ''} activa${disponibles !== 1 ? 's' : ''} sin conductor asignado.`,
    );
  } else {
    parts.push('No hay unidades activas libres en este momento.');
  }
  return parts.join(' ');
}

function formatFlotaResumen(data: Record<string, unknown>): Record<string, unknown> {
  return {
    totales: {
      total: data.total,
      activos: data.activos,
      inactivos: data.inactivos,
      disponibles: data.disponibles,
      sin_conductor: data.sinConductor,
      conductores_vigentes: data.conductoresVigentes,
      asignados: data.asignados,
    },
    narrativa_sugerida: buildNarrativaFlotaResumen(data),
    _formato_respuesta: {
      summary: '1–2 frases con cifras. Sin IDs ni JSON.',
      listado: 'Si aplica, bullets solo con • (no guiones -). Máximo 10 ítems + pie "+ N adicionales".',
    },
  };
}

function formatListadoVehiculos(
  data: Record<string, unknown>,
  opts: { titulo_contexto: string; cierre_disponibles?: boolean },
): Record<string, unknown> {
  const vehiculos = vehiculosFromPayload(data);
  const count = Number(data.count ?? vehiculos.length);
  const lineas = vehiculos.map(formatVehiculoLineaEjecutiva);
  const { lineas_visibles, adicionales, pie_listado } = buildListadoEjecutivo(lineas, count);

  let cierre_sugerido: string | null = null;
  if (count === 0) {
    cierre_sugerido = opts.cierre_disponibles
      ? 'No hay unidades libres actualmente.'
      : 'No hay vehículos activos sin conductor en este momento.';
  } else if (count === 1 && lineas_visibles[0]) {
    cierre_sugerido = `La única unidad libre es:\n${lineas_visibles[0]}`;
  } else if (opts.cierre_disponibles && count > 0) {
    cierre_sugerido =
      count <= FLEET_LISTADO_MAX_VISIBLE
        ? 'Todas están activas y disponibles para asignación inmediata.'
        : 'Las unidades listadas están activas y disponibles para asignación.';
  }

  return {
    cantidad: count,
    titulo_contexto: opts.titulo_contexto,
    lineas_listado: lineas_visibles,
    unidades_adicionales: adicionales,
    pie_listado,
    cierre_sugerido,
    _formato_respuesta: {
      summary: `Empieza con "${opts.titulo_contexto}". Luego línea en blanco y lineas_listado (bullets •). Cierra con cierre_sugerido si existe.`,
      prohibido: 'Vehicle ID, vehicle_id, conductor_id, JSON, guiones - como bullets',
    },
  };
}

function formatAsignados(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.asignados;
  const count = Number(data.count ?? (Array.isArray(raw) ? raw.length : 0));
  const lineas: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item == null || typeof item !== 'object') continue;
      const line = formatConductorAsignadoLinea(item as Record<string, unknown>);
      if (line) lineas.push(line);
    }
  }
  const { lineas_visibles, adicionales, pie_listado } = buildListadoEjecutivo(lineas, count);
  return {
    cantidad: count,
    titulo_contexto: 'Conductores vigentes con vehículo asignado',
    lineas_listado: lineas_visibles,
    unidades_adicionales: adicionales,
    pie_listado,
    _formato_respuesta: {
      summary: 'Narrativa breve + bullets • (conductor — placa marca modelo). Sin IDs.',
    },
  };
}

function formatVehiculoPorPlaca(data: Record<string, unknown>): Record<string, unknown> {
  const v = data.vehiculo;
  if (!data.encontrado || v == null || typeof v !== 'object') {
    return {
      encontrado: false,
      placa_buscada: data.placa_buscada ?? null,
      mensaje: 'No encontré un vehículo con esa placa.',
    };
  }
  const row = v as Record<string, unknown>;
  const linea = pickVehiculoLinea(row);
  const conductor = row.conductor != null ? String(row.conductor) : null;
  return {
    encontrado: true,
    placa: row.placa ?? data.placa_buscada,
    unidad_linea: linea ? formatVehiculoLineaEjecutiva(linea).replace(/^•\s*/, '') : null,
    conductor_asignado: conductor,
    activo: row.activo === true,
    disponible: row.disponible === true,
    narrativa_sugerida: conductor
      ? `La placa ${normalizePlaca(String(row.placa ?? ''))} corresponde a ${linea?.marca} ${linea?.modelo}${linea?.anio ? ` ${linea.anio}` : ''}. Conductor vigente: ${conductor}.`
      : `La placa ${normalizePlaca(String(row.placa ?? ''))} corresponde a ${linea?.marca} ${linea?.modelo}${linea?.anio ? ` ${linea.anio}` : ''}. Sin conductor vigente asignado.`,
    _formato_respuesta: { prohibido: 'IDs, vehicle_id, JSON' },
  };
}

function formatConductorPorVehiculo(data: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(data.coincidencias_nombre) && data.coincidencias_nombre.length > 0) {
    const nombres = (data.coincidencias_nombre as Array<Record<string, unknown>>)
      .slice(0, 8)
      .map((c) => String(c.nombre ?? '').trim())
      .filter(Boolean);
    return {
      encontrado: false,
      ambiguo: true,
      coincidencias: nombres,
      mensaje: 'Hay varios conductores con ese nombre; pide al usuario ser más específico.',
    };
  }
  if (!data.encontrado) {
    return { encontrado: false, mensaje: 'No encontré conductor ni vehículo con ese criterio.' };
  }
  const c = data.conductor as Record<string, unknown> | null;
  const v = data.vehiculo as Record<string, unknown> | null;
  const nombre = c ? String(c.nombre ?? '').trim() : '';
  const linea =
    v != null ? pickVehiculoLinea(v) : null;
  const unidad =
    linea != null
      ? formatVehiculoLineaEjecutiva(linea).replace(/^•\s*/, '')
      : null;
  return {
    encontrado: true,
    conductor: nombre || null,
    unidad: unidad,
    narrativa_sugerida:
      nombre && unidad
        ? `${nombre} tiene asignada la unidad ${unidad}.`
        : nombre
          ? `${nombre} no tiene vehículo asignado actualmente.`
          : unidad
            ? `La unidad ${unidad} no tiene conductor vigente asignado.`
            : null,
    _formato_respuesta: { prohibido: 'IDs, vehicle_id, conductor_id' },
  };
}

const FLEET_INTERPRETATION =
  'Flota operativa. Redacta como dueño de negocio: placas, marcas, nombres. Usa solo bullets • (no - ni *). ' +
  'Copia lineas_listado tal cual si existen. Nunca IDs, vehicle_id ni "Vehicle ID". Sin JSON visible.';

/** Transforma payload crudo de tool de flota → vista ejecutiva para el modelo. */
export function formatFleetToolPayloadForLlm(
  tool: AiToolName,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const empty = data.empty === true;
  const base = { ok: data.ok !== false, empty };

  if (empty) return { ...base, mensaje_vacio: data.mensaje_vacio ?? data.message };

  switch (tool) {
    case 'getFlotaResumen':
      return { ...base, ...formatFlotaResumen(data), _instruccion_interpretacion: FLEET_INTERPRETATION };
    case 'getVehiculosDisponibles':
      return {
        ...base,
        ...formatListadoVehiculos(data, {
          titulo_contexto: 'Las unidades actualmente libres son:',
          cierre_disponibles: true,
        }),
        _instruccion_interpretacion: FLEET_INTERPRETATION,
      };
    case 'getVehiculosSinConductor':
      return {
        ...base,
        ...formatListadoVehiculos(data, {
          titulo_contexto: 'Los vehículos activos sin conductor son:',
          cierre_disponibles: false,
        }),
        _instruccion_interpretacion: FLEET_INTERPRETATION,
      };
    case 'getConductoresAsignados':
      return { ...base, ...formatAsignados(data), _instruccion_interpretacion: FLEET_INTERPRETATION };
    case 'getVehiculoPorPlaca':
      return { ...base, ...formatVehiculoPorPlaca(data), _instruccion_interpretacion: FLEET_INTERPRETATION };
    case 'getConductorPorVehiculo':
      return { ...base, ...formatConductorPorVehiculo(data), _instruccion_interpretacion: FLEET_INTERPRETATION };
    default:
      return { ...base, ...data, _instruccion_interpretacion: FLEET_INTERPRETATION };
  }
}

export function isFleetAiTool(tool: AiToolName): boolean {
  return FLEET_AI_TOOLS.has(tool);
}
