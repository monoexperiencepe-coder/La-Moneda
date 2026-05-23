import type { Gasto, Ingreso } from '../data/types';

/** Une detalle de unidad (Excel o vehículo) con comentarios para no perder contexto. */
export function joinDetalleOperativo(detalleDelAuto: string | null | undefined, comentarios: string): string | null {
  const a = (detalleDelAuto ?? '').trim();
  const c = (comentarios ?? '').trim();
  if (a && c) return `${a} — ${c}`;
  if (a) return a;
  if (c) return c;
  return null;
}

export function enrichIngresoOperativo(input: {
  comentarios: string;
  tipo: string;
  subTipo: string | null;
  detalleDelAuto?: string | null;
}): Pick<Ingreso, 'detalleOperativo' | 'tipoOperacion'> {
  const tipoOperacion = [input.tipo.trim(), (input.subTipo ?? '').trim()].filter(Boolean).join(' | ') || null;
  return {
    detalleOperativo: joinDetalleOperativo(input.detalleDelAuto, input.comentarios),
    tipoOperacion,
  };
}

export function enrichGastoOperativo(input: {
  comentarios: string;
  tipo: string;
  subTipo: string | null;
  detalleDelAuto?: string | null;
  categoriaExcelRaw?: string | null;
}): Pick<Gasto, 'detalleOperativo' | 'categoriaReal' | 'subcategoria'> {
  const catExcel = (input.categoriaExcelRaw ?? '').trim();
  const categoriaReal = catExcel || input.tipo.trim() || null;
  const sub = (input.subTipo ?? '').trim();
  return {
    detalleOperativo: joinDetalleOperativo(input.detalleDelAuto, input.comentarios),
    categoriaReal,
    subcategoria: sub || null,
  };
}
