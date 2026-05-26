import { mapGastoRow } from '../../../services/supabaseMappers';
import { supabase } from '../../../lib/supabase';
import { fetchGastosByTipo, fetchGastosFinancialSummary, fetchGastosRecent } from '../../../services/gastosService';
import { fetchIngresos } from '../../../services/ingresosService';
import { fetchPrestamosFinancierosDetalle } from '../../../services/prestamosFinancierosService';
import { fetchVehiculos } from '../../../services/vehiculosService';
import { fetchInversionesGeneralesVehiculo } from '../../../services/inversionesGeneralesVehiculoService';
import { filterGastosForUser, type PermissionUser } from '../../../utils/permissions';
import type { Gasto } from '../../../data/types';
import { labelTipoGastoFinanciero } from '../../../utils/tipoGastoLabels';
import { summaryCategoria } from '../../../utils/gastosFinancialSummary';
import {
  filterByDateRange,
  resolveToolDateRange,
  sumMontos,
  sumMontosByCurrency,
  formatCurrencyByCode,
  type AiDateRange,
} from '../dateRange';
import {
  aggregateOpexByTipo,
  buildCapasFinancierasResumen,
  buildMonthlyBuckets,
  detectFinancialInsights,
  narrativeHintsFromInsights,
  splitGastosByCapa,
} from '../financialAnalytics';
import { aiToolDeniedMessage, canExecuteAiTool } from '../permissions';
import type { AiToolName } from '../types';

import { sugerirClasificacionGastoCompleta, sugerirClasificacionGastoFromGasto } from '../../../utils/gastoClasificacionSugerencia';
import { fetchClasificacionMemoriaActivas } from '../../../services/ai/clasificacionMemoriaService';
import { cleanOperationalCommentForUi } from '../../../utils/cleanOperationalComment';
import { enrichToolPayloadForLlm } from '../toolEmptyResults';
import {
  getInversionSubtipoDedupeKey,
  getInversionSubtipoLabel,
  isInversionSubtipoVehicularStored,
} from '../../../utils/inversionSubtipo';

// ─── Debug logging ────────────────────────────────────────────────────────────

function logToolResult(tool: AiToolName, data: unknown, meta?: { range?: { desde: string; hasta: string }; source_table?: string }) {
  if (!import.meta.env.DEV) return;
  const d = data as Record<string, unknown> | null;
  const rows =
    d != null
      ? (d.count ?? d.ranking_length ?? (Array.isArray(d.ranking) ? d.ranking.length : null) ?? (Array.isArray(d.filas) ? d.filas.length : null) ?? (Array.isArray(d.movimientos) ? d.movimientos.length : null))
      : null;
  console.log(
    '[tool-result]',
    JSON.stringify({
      tool,
      rows: rows ?? '?',
      source_table: meta?.source_table ?? 'gastos',
      date_range: meta?.range ?? null,
    }),
  );
}

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
      const range = resolveToolDateRange(args);
      const [ingresosAll, gastosAll, pendientes] = await Promise.all([
        fetchIngresos(ctx.empresaId),
        fetchGastosInRange(ctx, range, { limit: 800 }),
        fetchGastosByTipo('pendiente_revision', ctx.empresaId),
      ]);
      const ingresos = filterByDateRange(ingresosAll, range);
      const gastos = gastosAll;
      const pendientesVisibles = filterGastosForUser(ctx.user, pendientes);
      const ingresosByCurrency = sumMontosByCurrency(ingresos);
      const capas = buildCapasFinancierasResumen(gastos, ingresos);
      const monthly = buildMonthlyBuckets(gastos, ingresos);
      const dupWarnings = detectAnomalies(gastos);
      const insights = detectFinancialInsights({
        gastos,
        ingresos,
        monthly,
        duplicateWarnings: dupWarnings,
      });
      const categoriasOpex = aggregateOpexByTipo(gastos).slice(0, 8);
      const { capex } = splitGastosByCapa(gastos);

      if (import.meta.env.DEV) {
        console.log('[currency-normalization]', JSON.stringify({
          tool: name,
          capas: {
            opex_pen: capas.gastos_operativos_opex.total_pen,
            capex_pen: capas.inversiones_capex.total_pen,
            utilidad_operativa_pen: capas.utilidad_operativa_pen.value,
          },
          date_range: range,
        }));
      }

      return {
        periodo: range,
        capas_financieras: capas,
        ingresos: {
          count: ingresos.length,
          totalsByCurrency: ingresosByCurrency,
          nota_moneda: 'Ingresos separados por moneda (PEN / USD). NO mezclar.',
        },
        gastos_operativos_opex: {
          total_pen: capas.gastos_operativos_opex.total_pen,
          count: capas.gastos_operativos_opex.count,
          moneda: 'PEN',
          nota: 'Solo OPEX. EXCLUYE inversion_compra (CAPEX).',
        },
        inversiones_capex: {
          total_pen: capas.inversiones_capex.total_pen,
          count: capas.inversiones_capex.count,
          moneda: 'PEN',
          nota: 'CAPEX = compra activos / vehículos / terrenos. No es gasto operativo.',
        },
        utilidad_operativa_pen: capas.utilidad_operativa_pen.value,
        flujo_neto_pen: capas.flujo_neto_pen.value,
        nota_utilidad:
          'Utilidad OPERATIVA = Ingresos PEN − OPEX PEN. NO restar CAPEX aquí. Mencionar CAPEX aparte si es relevante.',
        categorias_opex_principales: categoriasOpex,
        meses_destacados: monthly.slice(-6),
        insights_automaticos: narrativeHintsFromInsights(insights),
        pendientesRevision: {
          count: pendientesVisibles.length,
          monto: sumMontos(pendientesVisibles),
        },
        muestra_capex_reciente: capex.slice(0, 5).map(compactGasto),
        warnings: dupWarnings,
      };
    }
    case 'getIngresosPeriodo': {
      const range = resolveToolDateRange(args);
      const all = await fetchIngresos(ctx.empresaId);
      const ingresos = filterByDateRange(all, range);

      const byCurrency = sumMontosByCurrency(ingresos);

      // Per-currency breakdown by tipo
      const porTipoByCurrency: Record<string, Array<{ tipo: string; monto: number; count: number }>> = {};
      for (const ing of ingresos) {
        const cur = ing.moneda?.toUpperCase()?.trim() || 'PEN';
        if (!porTipoByCurrency[cur]) porTipoByCurrency[cur] = [];
        const key = ing.tipo ?? 'sin_tipo';
        const existing = porTipoByCurrency[cur].find((x) => x.tipo === key);
        if (existing) {
          existing.monto += ing.monto;
          existing.count += 1;
        } else {
          porTipoByCurrency[cur].push({ tipo: key, monto: ing.monto, count: 1 });
        }
      }
      for (const cur of Object.keys(porTipoByCurrency)) {
        porTipoByCurrency[cur].sort((a, b) => b.monto - a.monto);
      }

      if (import.meta.env.DEV) {
        console.log('[currency-normalization]', JSON.stringify({
          tool: name,
          currencies_detected: Object.keys(byCurrency),
          totals: Object.entries(byCurrency).map(([cur, v]) => ({
            currency: cur,
            total: v.total,
            rows: v.count,
            formatted: formatCurrencyByCode(v.total, cur),
          })),
          date_range: range,
        }));
      }

      const result = {
        periodo: range,
        count: ingresos.length,
        totalsByCurrency: byCurrency,
        porTipoByCurrency,
        nota_moneda: 'Los totales están separados por moneda. NO sumes PEN y USD.',
      };
      logToolResult(name, result, { range, source_table: 'ingresos' });
      return result;
    }
    case 'getGastosPeriodo': {
      const range = resolveToolDateRange(args);
      const tipoGasto = typeof args.tipo_gasto === 'string' ? args.tipo_gasto : undefined;
      const limit = clampLimit(args.limit, 100, 200);
      const gastos = await fetchGastosInRange(ctx, range, { tipoGasto, limit });
      const { opex, capex } = splitGastosByCapa(gastos);
      const scope =
        tipoGasto === 'inversion_compra' ? 'capex' : tipoGasto ? 'filtro' : 'opex_default';
      const result = {
        periodo: range,
        alcance: scope,
        total_opex_pen: sumMontos(opex),
        total_capex_pen: sumMontos(capex),
        count: gastos.length,
        nota:
          'Por defecto interpreta total_opex_pen como gasto operativo. CAPEX (inversion_compra) va en total_capex_pen.',
        filas_muestra: gastos.slice(0, 12).map(compactGasto),
        warnings: detectAnomalies(gastos),
      };
      logToolResult(name, result, { range, source_table: 'gastos' });
      return result;
    }
    case 'getGastosPorCategoria': {
      const range = resolveToolDateRange(args);
      const gastos = await fetchGastosInRange(ctx, range, { limit: 500 });
      const opexCats = aggregateOpexByTipo(gastos);
      const capexCats = aggregateByTipo(gastos.filter((g) => g.tipo_gasto === 'inversion_compra'));
      return {
        periodo: range,
        categorias_operativas_opex: opexCats,
        categorias_capex: capexCats,
        nota: 'Usa categorias_operativas_opex para análisis de gasto recurrente. CAPEX aparte.',
      };
    }
    case 'getVehiculosConMasGasto': {
      const range = resolveToolDateRange(args);
      const limit = clampLimit(args.limit, 10, 20);
      const [gastos, vehiculos] = await Promise.all([
        fetchGastosInRange(ctx, range, { limit: 500 }),
        fetchVehiculos(ctx.empresaId),
      ]);
      const operativos = gastos.filter(
        (g) => g.tipo_gasto === 'operativo_vehiculo' && g.vehicleId != null,
      );
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
      return {
        periodo: range,
        ranking,
        nota: 'Ranking solo gasto operativo por vehículo (excluye inversion_compra / CAPEX).',
      };
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
      const { opex, capex } = splitGastosByCapa(gastos);
      return {
        vehicle_id: vehicleId,
        total_opex_pen: sumMontos(opex),
        total_capex_pen: sumMontos(capex),
        count_opex: opex.length,
        gastos_operativos_muestra: opex.slice(0, 15).map(compactGasto),
        inversiones_capex_muestra: capex.slice(0, 5).map(compactGasto),
        nota: 'OPEX = mantenimiento/combustible operativo. CAPEX (inversion_compra) no cuenta como gasto operativo del vehículo.',
      };
    }
    case 'suggestCategoriaGasto': {
      const texto = String(args.texto ?? args.motivo ?? '').trim();
      const memoria = await fetchClasificacionMemoriaActivas(ctx.empresaId);
      const completa = sugerirClasificacionGastoCompleta(
        {
          motivo: typeof args.motivo === 'string' ? args.motivo : texto,
          comentarios: typeof args.comentarios === 'string' ? args.comentarios : undefined,
          monto: typeof args.monto === 'number' ? args.monto : undefined,
          vehicleId:
            typeof args.vehicle_id === 'number'
              ? args.vehicle_id
              : typeof args.vehicle_id === 'string' && args.vehicle_id
                ? Number(args.vehicle_id)
                : null,
          subtipo_gasto: typeof args.subtipo_gasto === 'string' ? args.subtipo_gasto : undefined,
          tipo_gasto: typeof args.tipo_gasto === 'string' ? args.tipo_gasto : undefined,
          tipo: typeof args.tipo === 'string' ? args.tipo : undefined,
          subTipo: typeof args.sub_tipo === 'string' ? args.sub_tipo : undefined,
        },
        { memoria, trackMemoriaUso: true },
      );
      return {
        texto: texto || String(args.motivo ?? ''),
        tipo_gasto_sugerido: completa.tipo_gasto_sugerido,
        subtipo_sugerido: completa.subtipo_sugerido,
        razon: completa.razon,
        confianza: completa.confianza,
        necesita_revision_humana: completa.necesita_revision_humana,
        fuente: completa.fuente,
        memoria_match: completa.memoria_match,
        categoriaSugerida: completa.tipo_gasto_sugerido,
        subtipoSugerido: completa.subtipo_sugerido,
        labelCategoria: completa.tipo_gasto_sugerido
          ? labelTipoGastoFinanciero(completa.tipo_gasto_sugerido)
          : null,
        motivo: completa.razon,
      };
    }
    case 'getPendientesConSugerencia': {
      const limit = clampLimit(args.limit, 40, 100);
      const [pendientes, globales, vehiculos, memoria] = await Promise.all([
        filterGastosForUser(ctx.user, await fetchGastosByTipo('pendiente_revision', ctx.empresaId)),
        filterGastosForUser(ctx.user, await fetchGastosByTipo('gastos_globales', ctx.empresaId)),
        fetchVehiculos(ctx.empresaId),
        fetchClasificacionMemoriaActivas(ctx.empresaId),
      ]);
      const merged = [...pendientes, ...globales]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(b.id) - Number(a.id))
        .slice(0, limit);
      const placaById = new Map(vehiculos.map((v) => [String(v.id), v.placa ?? '']));
      const sugerencias = merged.map((g) => {
        const sug = sugerirClasificacionGastoFromGasto(g, { memoria, trackMemoriaUso: true });
        const comentarioLimpio = cleanOperationalCommentForUi(g.comentarios) || null;
        return {
          id: g.id,
          fecha: g.fecha,
          monto: g.monto,
          motivo: g.motivo,
          comentario: comentarioLimpio,
          tipo_actual: g.tipo_gasto,
          subtipo_actual: g.subtipo_gasto,
          vehicle_id: g.vehicleId,
          placa: g.vehicleId != null ? placaById.get(String(g.vehicleId)) ?? null : null,
          tipo_gasto_sugerido: sug.tipo_gasto_sugerido,
          subtipo_sugerido: sug.subtipo_sugerido,
          razon: sug.razon,
          confianza: sug.confianza,
          necesita_revision_humana: sug.necesita_revision_humana,
          fuente: sug.fuente,
          memoria_match: sug.memoria_match,
        };
      });
      return {
        count: sugerencias.length,
        totalPendientes: pendientes.length,
        totalGlobales: globales.length,
        sugerencias,
        nota: 'Solo sugerencias. Revisar y aplicar manualmente en Finanzas (no hay auto-aplicar en fase 1).',
      };
    }
    case 'getRankingInversionVehiculos': {
      const limit = clampLimit(args.limit, 10, 50);
      const inversiones = await fetchInversionesGeneralesVehiculo(ctx.empresaId);

      // Group totals by currency (each vehicle has its own moneda)
      const totalesByCurrency: Record<string, { total: number; count: number }> = {};
      for (const inv of inversiones) {
        const cur = inv.moneda ?? 'PEN';
        const entry = totalesByCurrency[cur] ?? { total: 0, count: 0 };
        entry.total += inv.montoTotal;
        entry.count += 1;
        totalesByCurrency[cur] = entry;
      }

      const ranking = inversiones
        .map((inv) => ({
          vehiculo_referencia: inv.vehiculoReferencia,
          vehiculo_numero: inv.vehiculoNumero,
          placa: inv.placa,
          modelo: inv.modelo,
          fecha_compra: inv.fechaCompra,
          moneda: inv.moneda,
          valor_compra: inv.valorCompraUsd,
          gasto_gnv: inv.gastoGnvUsd,
          gasto_notarial: inv.gastoNotarialUsd,
          seguro: inv.seguroUsd,
          gps: inv.gpsUsd,
          fundas_accesorios: inv.fundasAccesoriosUsd,
          total_inversion_pen: inv.totalInversionPen,
          monto_total: inv.montoTotal,
          monto_total_formatted: formatCurrencyByCode(inv.montoTotal, inv.moneda ?? 'PEN'),
        }))
        .sort((a, b) => b.monto_total - a.monto_total)
        .slice(0, limit);

      if (import.meta.env.DEV) {
        console.log('[currency-normalization]', JSON.stringify({
          tool: name,
          currencies_detected: Object.keys(totalesByCurrency),
          totals: Object.entries(totalesByCurrency).map(([cur, v]) => ({
            currency: cur,
            total: v.total,
            count: v.count,
            formatted: formatCurrencyByCode(v.total, cur),
          })),
        }));
      }

      const result = {
        count: inversiones.length,
        totales_por_moneda: totalesByCurrency,
        ranking,
        nota: 'Inversión inicial de adquisición. Moneda por vehículo. No mezclar PEN y USD en totales. No incluye gastos operativos.',
      };
      logToolResult(name, { count: inversiones.length, ranking_length: ranking.length }, { source_table: 'inversiones_generales_vehiculo' });
      return result;
    }

    case 'getDetalleInversionVehiculo': {
      const vehicleIdArg = typeof args.vehicle_id === 'string' ? args.vehicle_id.trim() : '';
      const placaArg = typeof args.placa === 'string' ? args.placa.trim().toUpperCase() : '';

      const [inversiones, vehiculos] = await Promise.all([
        fetchInversionesGeneralesVehiculo(ctx.empresaId),
        fetchVehiculos(ctx.empresaId),
      ]);

      let found = inversiones.find((inv) =>
        placaArg ? (inv.placa ?? '').toUpperCase() === placaArg : false,
      );

      if (!found && vehicleIdArg) {
        const v = vehiculos.find((vv) => String(vv.id) === vehicleIdArg);
        if (v?.placa) {
          const vPlaca = v.placa.toUpperCase();
          found = inversiones.find((inv) => (inv.placa ?? '').toUpperCase() === vPlaca);
        }
      }

      if (!found && vehicleIdArg) {
        found = inversiones.find((inv) =>
          inv.vehiculoReferencia.toLowerCase().includes(vehicleIdArg.toLowerCase()),
        );
      }

      if (!found) {
        logToolResult(name, { count: 0 }, { source_table: 'inversiones_generales_vehiculo' });
        return {
          encontrado: false,
          empty: true,
          mensaje_sin_datos: `No encontré inversión registrada para "${placaArg || vehicleIdArg}". Verifica la placa o referencia.`,
          instruccion: 'Informa al usuario con este mensaje.',
        };
      }

      const moneda = found.moneda ?? 'PEN';
      const result = {
        encontrado: true,
        vehiculo: {
          referencia: found.vehiculoReferencia,
          placa: found.placa,
          modelo: found.modelo,
          fecha_compra: found.fechaCompra,
        },
        desglose_inversion: {
          moneda,
          valor_compra: found.valorCompraUsd,
          gasto_gnv: found.gastoGnvUsd,
          gasto_notarial: found.gastoNotarialUsd,
          leg_firmas: found.legFirmasUsd,
          seguro: found.seguroUsd,
          gps: found.gpsUsd,
          fundas_accesorios: found.fundasAccesoriosUsd,
          monto_total: found.montoTotal,
          monto_total_formatted: formatCurrencyByCode(found.montoTotal, moneda),
          equivalente_pen: found.totalInversionPen,
          equivalente_pen_formatted: found.totalInversionPen != null ? formatCurrencyByCode(found.totalInversionPen, 'PEN') : null,
        },
        nota: `Moneda original: ${moneda}. Inversión inicial de adquisición. Para gastos operativos usa getHistorialVehiculo.`,
      };
      logToolResult(name, { count: 1 }, { source_table: 'inversiones_generales_vehiculo' });
      return result;
    }

    case 'getInversionesNoVehiculares': {
      const subtipoFilter = typeof args.subtipo === 'string' ? args.subtipo.trim() : null;
      const dateRange = resolveToolDateRange(args);

      const all = await fetchGastosByTipo('inversion_compra', ctx.empresaId);
      const accessible = filterGastosForUser(ctx.user, all);

      const nonVehicular = accessible.filter(
        (g) => !isInversionSubtipoVehicularStored(g.subtipo_gasto ?? ''),
      );

      const filtered = dateRange
        ? filterByDateRange(nonVehicular, dateRange)
        : nonVehicular;

      const finalFiltered = subtipoFilter
        ? filtered.filter(
            (g) =>
              getInversionSubtipoDedupeKey(g.subtipo_gasto ?? '') ===
                getInversionSubtipoDedupeKey(subtipoFilter)
              || (g.subtipo_gasto ?? '').trim() === subtipoFilter,
          )
        : filtered;

      const totalesByCurrency = sumMontosByCurrency(finalFiltered);
      const bySubtipo: Record<string, { count: number; totalsByCurrency: typeof totalesByCurrency }> = {};
      for (const g of finalFiltered) {
        const sub = g.subtipo_gasto ?? 'sin_subtipo';
        const entry = bySubtipo[sub] ?? { count: 0, totalsByCurrency: {} };
        entry.count += 1;
        const cur = 'PEN';
        const prev = entry.totalsByCurrency[cur] ?? { total: 0, count: 0 };
        prev.total += g.monto ?? 0;
        prev.count += 1;
        entry.totalsByCurrency[cur] = prev;
        bySubtipo[sub] = entry;
      }

      const ultimas = finalFiltered
        .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
        .slice(0, 20)
        .map((g) => ({
          fecha: g.fecha,
          subtipo: g.subtipo_gasto,
          subtipo_label: getInversionSubtipoLabel(g.subtipo_gasto ?? ''),
          monto: g.monto,
          monto_formatted: formatCurrencyByCode(g.monto ?? 0, 'PEN'),
          moneda: 'PEN',
          comentario: g.comentarios,
        }));

      const result = {
        count: finalFiltered.length,
        subtipo_filtro: subtipoFilter ?? 'todos (no vehicular)',
        totales_por_moneda: totalesByCurrency,
        por_subtipo: bySubtipo,
        ultimas_inversiones: ultimas,
        nota: 'Inversiones no vehiculares (terrenos, inmuebles, activos generales). NO incluye inversiones vehiculares. Separar PEN y USD.',
      };
      logToolResult(name, { count: finalFiltered.length }, { range: dateRange ?? undefined, source_table: 'gastos(inversion_compra)' });
      return result;
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
    return { ok: true, data: enrichToolPayloadForLlm(name, data) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al ejecutar herramienta';
    return { ok: false, error: msg };
  }
}
