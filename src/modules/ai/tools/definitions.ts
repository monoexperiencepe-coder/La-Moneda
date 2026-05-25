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
        'Resumen financiero del periodo: ingresos, gastos operativos, categorías principales, pendientes y utilidad. ' +
        'Solo roles financieros. Para año 2024 o anteriores, usa anio=2024.',
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
      name: 'getGastosPeriodo',
      description:
        'Gastos operativos del periodo (combustible, mantenimiento, sueldos, etc). ' +
        'Para año 2024 usa anio=2024. Para una categoría específica usa tipo_gasto. ' +
        'NO usar para inversión de compra vehicular (usa getRankingInversionVehiculos).',
      parameters: {
        ...periodParams,
        properties: {
          ...periodParams.properties,
          tipo_gasto: { type: 'string', description: 'Filtrar por categoría: combustible, mantenimiento, operativo_vehiculo, etc.' },
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
        'Totales de gastos agrupados por tipo_gasto/categoría operativa en el periodo. ' +
        'Para año 2024 usa anio=2024.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculosConMasGasto',
      description:
        'Ranking de vehículos con mayor GASTO OPERATIVO recurrente (combustible, mantenimiento, reparaciones) en el periodo. ' +
        'Solo roles financieros. ' +
        'IMPORTANTE: esto es gasto operativo, NO inversión de compra. ' +
        'Para inversión inicial de adquisición usa getRankingInversionVehiculos.',
      parameters: {
        ...periodParams,
        properties: {
          ...periodParams.properties,
          limit: { type: 'number', description: 'Top N vehículos (default 10)' },
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
];

export const AI_TOOL_NAMES = AI_TOOL_DEFINITIONS.map((t) => t.function.name);
