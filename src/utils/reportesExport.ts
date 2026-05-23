import type { Gasto, Ingreso } from '../data/types';
import { ingresoMontoPEN } from './moneda';
import { isIngresoExtraordinario } from './ingresoAlcance';

function escapeCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const lines = [header.join(';')];
  for (const row of rows) {
    lines.push(row.map((c) => (typeof c === 'number' ? String(c) : escapeCell(c))).join(';'));
  }
  const bom = '\ufeff';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportGastosCsv(gastos: Gasto[], suffix = ''): void {
  const header = ['id', 'fecha', 'vehicle_id', 'tipo_gasto', 'subtipo_gasto', 'tipo', 'subtipo', 'monto', 'pagado_a', 'comentarios'];
  const rows = gastos.map((g) => [
    g.id,
    g.fecha,
    g.vehicleId ?? '',
    g.tipo_gasto ?? '',
    g.subtipo_gasto ?? '',
    g.tipo,
    g.subTipo ?? '',
    g.monto.toFixed(2),
    g.pagadoA,
    g.comentarios,
  ]);
  downloadCsv(`gastos${suffix}.csv`, header, rows);
}

export function exportIngresosCsv(ingresos: Ingreso[], suffix = ''): void {
  const header = ['id', 'fecha', 'vehicle_id', 'es_extraordinario', 'tipo', 'subtipo', 'monto_pen', 'comentarios'];
  const rows = ingresos.map((i) => [
    i.id,
    i.fecha,
    i.vehicleId ?? '',
    isIngresoExtraordinario(i) ? 'true' : 'false',
    i.tipo,
    i.subTipo ?? '',
    ingresoMontoPEN(i).toFixed(2),
    i.comentarios,
  ]);
  downloadCsv(`ingresos${suffix}.csv`, header, rows);
}

export interface MensualExportRow {
  mes: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
}

export function exportMensualCsv(year: string, rows: MensualExportRow[]): void {
  const header = ['mes', 'ingresos', 'gastos_operativos', 'utilidad'];
  const data = rows.map((r) => [r.mes, r.ingresos.toFixed(2), r.gastos.toFixed(2), r.utilidad.toFixed(2)]);
  downloadCsv(`reporte_mensual_${year}.csv`, header, data);
}
