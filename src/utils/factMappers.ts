import { CategoriaGasto } from '../data/types';

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Mapea Tipo (columna Fact / Dim_Tipo) → categoría agregada para gráficos KPI */
export function inferCategoriaFromTipoGasto(tipo: string): CategoriaGasto {
  const t = stripAccents(tipo.toUpperCase());

  if (/MECAN|GNV|ACCESOR|IMPLEMENTACION|COMPRA ACTIVO|DEVOLUCION/.test(t)) {
    return 'GASTOS_MECANICOS';
  }
  if (/GASTOS FIJOS|FIJO/.test(t)) {
    return 'GASTOS_FIJOS';
  }
  if (/DOCUMENT|TRIBUTAR|NOTARIAL|AFOCAT|SOAT|RT-/.test(t) || /SEGUROS.*DOCUMENT/.test(t)) {
    return 'GASTOS_TRIBUTARIOS';
  }
  if (/OTROS GASTOS/.test(t)) {
    return 'GASTOS_PROVISIONALES';
  }
  return 'GASTOS_MECANICOS';
}

/** Construye motivo legado (= Sub Tipo Fact) para tablas que aún usan columna motivo */
export function motivoFromFactSubtipo(subTipo: string | null, fallback: string): string {
  return (subTipo && subTipo.trim()) || fallback;
}
