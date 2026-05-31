/** Definiciones OpenAI de herramientas (solo lectura). */

import type { AiToolName } from '../types';

export type OpenAiToolDefinition = {
  type: 'function';
  function: {
    name: AiToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const periodParams = {
  type: 'object',
  properties: {
    periodo: {
      type: 'string',
      enum: ['today', 'week', 'month', 'year', 'custom'],
      description: 'Preset de periodo. Default: month. Para año actual usa year; para año específico usa anio.',
    },
    desde: { type: 'string', description: 'YYYY-MM-DD si periodo=custom' },
    hasta: { type: 'string', description: 'YYYY-MM-DD si periodo=custom' },
    anio: { type: 'number', description: 'Año específico (ej: 2024, 2023). Usa esto para consultas de un año histórico.' },
  },
};

export const AI_TOOL_DEFINITIONS: OpenAiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'getResumenFinancieroPeriodo',
      description:
        'Resumen ejecutivo del periodo con capas separadas: ingresos (PEN/USD), OPEX operativo, CAPEX (inversion_compra), ' +
        'utilidad OPERATIVA (sin CAPEX), insights automáticos y meses destacados. ' +
        'Usar para rentabilidad, mejor/peor mes operativo, anomalías. Para año 2024 usa anio=2024.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getIngresosPeriodo',
      description:
        'Ingresos del periodo (totales, conteo, desglose por tipo). Solo roles financieros. ' +
        'Para consultas históricas como "ingresos de 2024" usa anio=2024. ' +
        'NO usar para gastos ni inversiones.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getIngresosHistoricosPorMes',
      description:
        'Ranking histórico de ingresos por mes (todos los años o un año). ' +
        'Usar para: "mes con más ingresos histórico", "mejor mes histórico", "récord histórico", ' +
        'comparar meses entre años. Sin anio = escanea todo el histórico disponible.',
      parameters: {
        type: 'object',
        properties: {
          anio: { type: 'number', description: 'Opcional. Filtrar a un solo año; omitir para histórico completo.' },
          limit: { type: 'number', description: 'Top N meses (default 12, max 36)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGastosPeriodo',
      description:
        'Gastos del periodo con total_opex_pen y total_capex_pen separados. ' +
        'Interpreta total_opex_pen como costo operativo recurrente; CAPEX en total_capex_pen (inversion_compra). ' +
        'Para año 2024 usa anio=2024. tipo_gasto=inversion_compra solo para consultas CAPEX.',
      parameters: {
        ...periodParams,
        properties: {
          ...periodParams.properties,
          tipo_gasto: { type: 'string', description: 'Filtrar por categoría: combustible, mantenimiento, operativo_vehiculo, etc.' },
          subtipo_gasto: { type: 'string', description: 'Subtipo operativo vehicular (ej: mantenimiento, frenos, motor)' },
          subtipo_grupo: {
            type: 'string',
            enum: ['mantenimiento'],
            description: 'Filtrar solo gastos de mantenimiento/reparación vehicular (motor, frenos, llantas, etc.)',
          },
          solo_mantenimiento: {
            type: 'boolean',
            description: 'Si true, solo subtipos de mantenimiento/reparación vehicular',
          },
          limit: { type: 'number', description: 'Máximo de filas (default 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGastosPorCategoria',
      description:
        'Totales por categoría: categorias_operativas_opex (sin CAPEX) y categorias_capex (inversion_compra) por separado. ' +
        'Para año 2024 usa anio=2024.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculosConMasGasto',
      description:
        'Ranking de vehículos con mayor gasto operativo en el periodo. ' +
        'Para mantenimiento/reparación/taller usa solo_mantenimiento=true o subtipo_grupo=mantenimiento. ' +
        'NO usar gasto operativo total si la pregunta es de mantenimiento. ' +
        'Para inversión de compra usa getRankingInversionVehiculos.',
      parameters: {
        ...periodParams,
        properties: {
          ...periodParams.properties,
          limit: { type: 'number', description: 'Top N vehículos (default 10)' },
          solo_mantenimiento: {
            type: 'boolean',
            description: 'Si true, ranking solo por gastos de mantenimiento/reparación',
          },
          subtipo_grupo: {
            type: 'string',
            enum: ['mantenimiento'],
            description: 'Equivalente a solo_mantenimiento',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPendientesRevision',
      description: 'Gastos en estado pendiente_revision sin clasificar. Incluye posibles duplicados.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Máximo filas (default 50)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGastosGlobales',
      description: 'Resumen de gastos_globales (no vehículo): conteo, monto y últimos movimientos.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Máximo filas recientes (default 30)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPrestamosActivos',
      description: 'Préstamos financieros activos con capital, cuota e interés. Solo roles financieros.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMovimientosRecientes',
      description: 'Últimos gastos visibles para el usuario (máx 50).',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Default 30' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getHistorialVehiculo',
      description:
        'Gastos operativos históricos de un vehículo específico (combustible, mantenimiento, etc). ' +
        'Requiere vehicle_id o placa. ' +
        'Para inversión de compra del vehículo usa getDetalleInversionVehiculo.',
      parameters: {
        type: 'object',
        properties: {
          vehicle_id: { type: 'string', description: 'ID del vehículo' },
          placa: { type: 'string', description: 'Placa si no hay ID' },
          limit: { type: 'number', description: 'Default 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggestCategoriaGasto',
      description: 'Sugiere tipo_gasto y subtipo_gasto. NO modifica datos. Acepta motivo, comentario, monto, vehículo.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Texto libre (motivo + contexto)' },
          motivo: { type: 'string' },
          comentarios: { type: 'string' },
          monto: { type: 'number' },
          vehicle_id: { type: 'string' },
          tipo_gasto: { type: 'string' },
          subtipo_gasto: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPendientesConSugerencia',
      description: 'Pendientes de revisión y gastos globales con sugerencia de clasificación (solo lectura).',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Máximo filas (default 40)' } },
      },
    },
  },
  // ─── Inversiones vehiculares ────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'getRankingInversionVehiculos',
      description:
        'Ranking de vehículos por INVERSIÓN TOTAL de adquisición (valor de compra, GNV, GPS, notarial, seguro, fundas). ' +
        'Usa esto para: "¿qué vehículo costó más?", "mayor inversión", "activo más caro", "cuánto se invirtió en cada carro". ' +
        'Datos de tabla inversiones_generales_vehiculo. Solo roles financieros.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Top N vehículos (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getDetalleInversionVehiculo',
      description:
        'Desglose completo de inversión de adquisición de UN vehículo específico (compra, GNV, GPS, seguro, notarial, total). ' +
        'Usa para: "cuánto costó el carro X", "desglose inversión placa ABC". ' +
        'Solo roles financieros.',
      parameters: {
        type: 'object',
        properties: {
          vehicle_id: { type: 'string', description: 'ID del vehículo' },
          placa: { type: 'string', description: 'Placa del vehículo' },
        },
      },
    },
  },
  // ─── Flota operativa (vehículos + conductores) ───────────────────────────────
  {
    type: 'function',
    function: {
      name: 'getFlotaResumen',
      description:
        'Resumen de flota: total de vehículos, activos, inactivos, disponibles (activos sin conductor vigente), ' +
        'conductores vigentes y asignados. Usar para: "¿cuántos vehículos tiene la empresa?", "¿cuántos activos hay?". ' +
        'No incluye montos ni gastos.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculosDisponibles',
      description:
        'Lista vehículos activos sin conductor vigente asignado (unidades libres). ' +
        'Usar para: "¿qué unidades están libres?", "vehículos disponibles".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Máximo filas (default 50, max 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculosSinConductor',
      description:
        'Vehículos activos que no tienen conductor vigente asignado. ' +
        'Usar para: "¿qué vehículos no tienen conductor?", "carros sin chofer".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Máximo filas (default 50, max 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getConductoresAsignados',
      description:
        'Conductores vigentes con vehículo asignado (placa, marca, modelo). ' +
        'Usar para: "¿quién maneja qué carro?", "asignaciones de conductores".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Máximo filas (default 80, max 120)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculoPorPlaca',
      description:
        'Busca un vehículo por placa y devuelve datos básicos más conductor vigente si existe. ' +
        'Usar para: "datos del vehículo placa ABC", "¿existe la placa X?".',
      parameters: {
        type: 'object',
        properties: {
          placa: { type: 'string', description: 'Placa del vehículo (requerido)' },
        },
        required: ['placa'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getConductorPorVehiculo',
      description:
        'Conductor vigente de un vehículo (por placa o ID) o vehículo asignado a un conductor (por nombre). ' +
        'Usar para: "¿qué conductor tiene la placa ABC?", "¿qué vehículo tiene el conductor Juan?".',
      parameters: {
        type: 'object',
        properties: {
          placa: { type: 'string', description: 'Placa del vehículo' },
          vehicle_id: { type: 'string', description: 'ID numérico del vehículo' },
          conductor: { type: 'string', description: 'Nombre o apellido del conductor' },
        },
      },
    },
  },
  // ─── Inversiones no vehiculares ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'getInversionesNoVehiculares',
      description:
        'Lista inversiones no vehiculares registradas: terrenos, inmuebles, maquinaria, activos generales. ' +
        'Usa para: "¿cuánto invertimos en terrenos?", "inversiones en inmuebles", "activos no vehiculares", "todos los activos fijos". ' +
        'Filtra por subtipo canónico: compra_terreno, laptops, equipamiento_oficina, etc. (también acepta legacy inversion_terreno). ' +
        'NO usar para vehículos (usar getRankingInversionVehiculos). Solo roles financieros.',
      parameters: {
        type: 'object',
        properties: {
          subtipo: {
            type: 'string',
            enum: [
              'compra_terreno',
              'acondicionamiento_areas',
              'laptops',
              'electrodomesticos',
              'sistema_seguridad',
              'equipamiento_taller',
              'compra_software_gestion',
              'muebles_enseres',
              'equipamiento_oficina',
              'inversion_terreno',
              'inversion_inmueble',
              'inversion_general',
              'otros_activos',
            ],
            description: 'Filtrar por subtipo específico. Omitir para ver todos los no-vehiculares.',
          },
          ...periodParams.properties,
        },
      },
    },
  },
];

export const AI_TOOL_NAMES = AI_TOOL_DEFINITIONS.map((t) => t.function.name);
