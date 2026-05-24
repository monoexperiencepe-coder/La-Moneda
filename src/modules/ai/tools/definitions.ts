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
      description: 'Preset de periodo. Default: month.',
    },
    desde: { type: 'string', description: 'YYYY-MM-DD si periodo=custom' },
    hasta: { type: 'string', description: 'YYYY-MM-DD si periodo=custom' },
  },
};

export const AI_TOOL_DEFINITIONS: OpenAiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'getResumenFinancieroPeriodo',
      description:
        'Resumen financiero del periodo: ingresos, gastos, categorías principales, pendientes y observaciones. Solo roles financieros.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getIngresosPeriodo',
      description: 'Lista agregada de ingresos en un periodo (totales y conteo). Solo roles financieros.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGastosPeriodo',
      description: 'Gastos del periodo con totales. Operador ve solo globales y pendiente.',
      parameters: {
        ...periodParams,
        properties: {
          ...periodParams.properties,
          tipo_gasto: { type: 'string', description: 'Filtrar por tipo_gasto opcional' },
          limit: { type: 'number', description: 'Máximo de filas (default 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGastosPorCategoria',
      description: 'Totales de gastos agrupados por tipo_gasto / categoría en el periodo.',
      parameters: periodParams,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getVehiculosConMasGasto',
      description: 'Ranking de vehículos con mayor gasto operativo en el periodo. Solo roles financieros.',
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
      description: 'Gastos en pendiente_revision sin clasificar. Incluye posibles duplicados.',
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
      description: 'Resumen de gastos_globales (conteo, monto, últimos movimientos).',
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
      description: 'Préstamos financieros con estado activo. Solo roles financieros.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMovimientosRecientes',
      description: 'Últimos gastos visibles para el usuario (máx 30).',
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
      description: 'Gastos operativos de un vehículo. Requiere vehicle_id o placa.',
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
      description:
        'Sugiere tipo_gasto y subtipo_gasto para un texto de gasto. NO modifica datos.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Descripción del gasto a clasificar' },
        },
        required: ['texto'],
      },
    },
  },
];

export const AI_TOOL_NAMES = AI_TOOL_DEFINITIONS.map((t) => t.function.name);
