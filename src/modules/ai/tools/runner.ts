import { mapGastoRow } from '../../../services/supabaseMappers';
import { supabase } from '../../../lib/supabase';
import { fetchGastosByTipo, fetchGastosFinancialSummary, fetchGastosRecent } from '../../../services/gastosService';
import { fetchIngresos } from '../../../services/ingresosService';
import { fetchPrestamosFinancierosDetalle } from '../../../services/prestamosFinancierosService';
import { fetchVehiculos } from '../../../services/vehiculosService';
import { filterGastosForUser, type PermissionUser } from '../../../utils/permissions';
import type { Gasto } from '../../../data/types';
import { labelTipoGastoFinanciero } from '../../../utils/tipoGastoLabels';
import { summaryCategoria } from '../../../utils/gastosFinancialSummary';
import { filterByDateRange, resolveAiDateRange, sumMontos, type AiDateRange } from '../dateRange';
import { aiToolDeniedMessage, canExecuteAiTool } from '../permissions';
import type { AiToolName } from '../types';

import { sugerirClasificacionGastoTexto } from './suggestCategoria';

function mapGastos(rows: Record<string, unknown>[]): Gasto[] {
  return rows.map((r) => mapGastoRow(r));
}

export type AiToolRunResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; denied?: boolean };

export type AiToolContext = {
  user: PermissionUser;
  empresaId: string;
};

const GASTO_SELECT =
  'id,fecha,monto,tipo_gasto,subtipo_gasto,motivo,comentarios,vehicle_id,tipo,sub_tipo';

function clampLimit(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.trunc(v), max);
}

async function fetchGastosInRange(
  ctx: AiToolContext,
  range: AiDateRange,
  opts?: { tipoGasto?: string; limit?: number },
): Promise<Gasto[]> {
  let q = supabase
    .from('gastos')
    .select(GASTO_SELECT)
    .eq('empresa_id', ctx.empresaId)
    .gte('fecha', range.desde)
    .lte('fecha', range.hasta)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });

  if (opts?.tipoGasto) q = q.eq('tipo_gasto', opts.tipoGasto);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = mapGastos((data ?? []) as Record<string, unknown>[]);
  return filterGastosForUser(ctx.user, rows);
}

function aggregateByTipo(gastos: Gasto[]): Array<{ tipo_gasto: string; label: string; count: number; monto: number }> {
  const map = new Map<string, { count: number; monto: number }>();
  for (const g of gastos) {
    const key = g.tipo_gasto ?? 'sin_tipo';
    const prev = map.get(key) ?? { count: 0, monto: 0 };
    map.set(key, { count: prev.count + 1, monto: prev.monto + g.monto });
  }
  return [...map.entries()]
    .map(([tipo_gasto, v]) => ({
      tipo_gasto,
      label: labelTipoGastoFinanciero(tipo_gasto),
      count: v.count,
      monto: v.monto,
    }))
    .sort((a, b) => b.monto - a.monto);
}

function detectAnomalies(gastos: Gasto[]): string[] {
  const warnings: string[] = [];
  const byKey = new Map<string, Gasto[]>();
  for (const g of gastos) {
    const key = `${g.fecha}|${g.monto}|${(g.motivo ?? '').trim().toLowerCase()}`;
    const list = byKey.get(key) ?? [];
    list.push(g);
    byKey.set(key, list);
  }
  for (const [, list] of byKey) {
    if (list.length > 1) {
      warnings.push(
        `Posible duplicado: ${list.length} gastos con misma fecha, monto y motivo (${list[0].fecha}, S/ ${list[0].monto}).`,
      );
    }
  }
  if (gastos.length >= 5) {
    const montos = gastos.map((g) => g.monto).sort((a, b) => a - b);
    const median = montos[Math.floor(montos.length / 2)] ?? 0;
    const outliers = gastos.filter((g) => median > 0 && g.monto > median * 4);
    if (outliers.length > 0) {
      warnings.push(`${outliers.length} gasto(s) con monto inusualmente alto vs mediana del lote.`);
    }
  }
  return warnings.slice(0, 5);
}

function compactGasto(g: Gasto) {
  return {
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    motivo: g.motivo,
    tipo_gasto: g.tipo_gasto ?? null,
    subtipo_gasto: g.subtipo_gasto ?? null,
    vehicle_id: g.vehicleId,
  };
}

async function runToolImpl(name: AiToolName, args: Record<string, unknown>, ctx: AiToolContext): Promise<unknown> {
  switch (name) {
    case 'getResumenFinancieroPeriodo': {
      const range = resolveAiDateRange(args);
      const [ingresosAll, gastos, summaryAll, pendientes] = await Promise.all([
        fetchIngresos(ctx.empresaId),
        fetchGastosInRange(ctx, range, { limit: 500 }),
        fetchGastosFinancialSummary(ctx.empresaId),
        fetchGastosByTipo('pendiente_revision', ctx.empresaId),
      ]);
      const ingresos = filterByDateRange(ingresosAll, range);
      const pendientesVisibles = filterGastosForUser(ctx.user, pendientes);
      const byCat = aggregateByTipo(gastos);
      const totalIngresos = sumMontos(ingresos);
      const totalGastos = sumMontos(gastos);
      const utilidad = totalIngresos - totalGastos;
      const pendienteSummary = summaryCategoria(summaryAll, 'pendiente_revision');
      return {
        periodo: range,
        ingresos: { total: totalIngresos, count: ingresos.length },
        gastos: { total: totalGastos, count: gastos.length },
        utilidad,
        categoriasPrincipales: byCat.slice(0, 6),
        pendientesRevision: {
          count: pendienteSummary.count,
          monto: pendienteSummary.monto,
          muestra: pendientesVisibles.slice(0, 5).map(compactGasto),
        },
      };
    }
    case 'getIngresosPeriodo': {
      const range = resolveAiDateRange(args);
      const all = await fetchIngresos(ctx.empresaId);
      const ingresos = filterByDateRange(all, range);
      return {
        periodo: range,
        total: sumMontos(ingresos),
        count: ingresos.length,
        porTipo: Object.entries(
          ingresos.reduce<Record<string, number>>((acc, i) => {
            const k = i.tipo ?? 'sin_tipo';
            acc[k] = (acc[k] ?? 0) + i.monto;
            return acc;
          }, {}),
        )
          .map(([tipo, monto]) => ({ tipo, monto }))
          .sort((a, b) => b.monto - a.monto),
      };
    }
    case 'getGastosPeriodo': {
      const range = resolveAiDateRange(args);
      const tipoGasto = typeof args.tipo_gasto === 'string' ? args.tipo_gasto : undefined;
      const limit = clampLimit(args.limit, 100, 200);
      const gastos = await fetchGastosInRange(ctx, range, { tipoGasto, limit });
      return {
        periodo: range,
        total: sumMontos(gastos),
        count: gastos.length,
        filas: gastos.map(compactGasto),
        warnings: detectAnomalies(gastos),
      };
    }
    case 'getGastosPorCategoria': {
      const range = resolveAiDateRange(args);
      const gastos = await fetchGastosInRange(ctx, range, { limit: 500 });
      return { periodo: range, categorias: aggregateByTipo(gastos) };
    }
    case 'getVehiculosConMasGasto': {
      const range = resolveAiDateRange(args);
      const limit = clampLimit(args.limit, 10, 20);
      const [gastos, vehiculos] = await Promise.all([
        fetchGastosInRange(ctx, range, { limit: 500 }),
        fetchVehiculos(ctx.empresaId),
      ]);
      const operativos = gastos.filter((g) => g.tipo_gasto === 'operativo_vehiculo' && g.vehicleId != null);
      const byVehicle = new Map<string, { monto: number; count: number }>();
      for (const g of operativos) {
        const vid = String(g.vehicleId);
        const prev = byVehicle.get(vid) ?? { monto: 0, count: 0 };
        byVehicle.set(vid, { monto: prev.monto + g.monto, count: prev.count + 1 });
      }
      const placaById = new Map(vehiculos.map((v) => [String(v.id), v.placa ?? v.modelo ?? `ID ${v.id}`]));
      const ranking = [...byVehicle.entries()]
        .map(([vehicle_id, v]) => ({
          vehicle_id,
          placa: placaById.get(vehicle_id) ?? vehicle_id,
          monto: v.monto,
          count: v.count,
        }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, limit);
      return { periodo: range, ranking };
    }
    case 'getPendientesRevision': {
      const limit = clampLimit(args.limit, 50, 100);
      const rows = filterGastosForUser(ctx.user, await fetchGastosByTipo('pendiente_revision', ctx.empresaId));
      const slice = rows.slice(0, limit);
      return {
        count: rows.length,
        totalMonto: sumMontos(rows),
        filas: slice.map(compactGasto),
        warnings: detectAnomalies(slice),
      };
    }
    case 'getGastosGlobales': {
      const limit = clampLimit(args.limit, 30, 80);
      const [summary, rows] = await Promise.all([
        fetchGastosFinancialSummary(ctx.empresaId),
        filterGastosForUser(ctx.user, await fetchGastosByTipo('gastos_globales', ctx.empresaId)),
      ]);
      const cat = summaryCategoria(summary, 'gastos_globales');
      return {
        count: cat.count,
        totalMonto: cat.monto,
        recientes: rows.slice(0, limit).map(compactGasto),
      };
    }
    case 'getPrestamosActivos': {
      const { detalle, error } = await fetchPrestamosFinancierosDetalle(ctx.empresaId);
      if (error) throw new Error(error);
      const activos = detalle.filter((d) => d.prestamo.estado === 'activo');
      return {
        count: activos.length,
        prestamos: activos.map((d) => ({
          id: d.prestamo.id,
          codigo: d.prestamo.codigo,
          titulo: d.prestamo.titulo,
          prestamista: d.prestamo.prestamista,
          capitalActual: d.prestamo.capitalActualEstimado,
          moneda: d.prestamo.monedaCapital,
          cuotaFija: d.prestamo.cuotaFijaMensual,
          interesMensual: d.prestamo.interesMensualActual,
        })),
      };
    }
    case 'getMovimientosRecientes': {
      const limit = clampLimit(args.limit, 30, 50);
      const rows = filterGastosForUser(ctx.user, await fetchGastosRecent(ctx.empresaId, { limit }));
      return { count: rows.length, movimientos: rows.map(compactGasto), warnings: detectAnomalies(rows) };
    }
    case 'getHistorialVehiculo': {
      const limit = clampLimit(args.limit, 50, 100);
      let vehicleId = typeof args.vehicle_id === 'string' ? args.vehicle_id.trim() : '';
      if (!vehicleId && typeof args.placa === 'string') {
        const vehiculos = await fetchVehiculos(ctx.empresaId);
        const placa = args.placa.trim().toUpperCase();
        const match = vehiculos.find((v) => (v.placa ?? '').toUpperCase() === placa);
        if (match) vehicleId = String(match.id);
      }
      if (!vehicleId) throw new Error('Indica vehicle_id o placa válida.');
      const { data, error } = await supabase
        .from('gastos')
        .select(GASTO_SELECT)
        .eq('empresa_id', ctx.empresaId)
        .eq('vehicle_id', vehicleId)
        .order('fecha', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const gastos = filterGastosForUser(ctx.user, mapGastos((data ?? []) as Record<string, unknown>[]));
      return {
        vehicle_id: vehicleId,
        count: gastos.length,
        total: sumMontos(gastos),
        gastos: gastos.map(compactGasto),
      };
    }
    case 'suggestCategoriaGasto': {
      const texto = String(args.texto ?? '').trim();
      if (!texto) throw new Error('texto requerido');
      const sug = sugerirClasificacionGastoTexto(texto);
      if (!sug) {
        return {
          texto,
          categoriaSugerida: null,
          subtipoSugerido: null,
          confianza: 0.25,
          motivo: 'Sin coincidencia clara en reglas locales. Revisar manualmente o dar más contexto.',
        };
      }
      return {
        texto,
        categoriaSugerida: sug.tipo_gasto,
        subtipoSugerido: sug.subtipo_gasto,
        labelCategoria: labelTipoGastoFinanciero(sug.tipo_gasto),
        confianza: 0.82,
        motivo: sug.razon,
      };
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

export async function executeAiTool(
  name: AiToolName,
  args: Record<string, unknown>,
  ctx: AiToolContext,
): Promise<AiToolRunResult> {
  if (!canExecuteAiTool(ctx.user, name)) {
    return { ok: false, error: aiToolDeniedMessage(name), denied: true };
  }
  try {
    const data = await runToolImpl(name, args, ctx);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al ejecutar herramienta';
    return { ok: false, error: msg };
  }
}
