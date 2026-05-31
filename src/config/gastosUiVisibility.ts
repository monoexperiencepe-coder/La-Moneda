/**
 * Visibilidad UI de `pendiente_revision` (cola temporal en BD).
 * No desactiva bootstrap, RLS, RPC summary, IA tools ni permisos internos.
 */
export const TIPO_GASTO_PENDIENTE_REVISION = 'pendiente_revision';

/** Ocultar en parrilla, pestañas, mover categoría y selects operativos. */
export const HIDE_PENDIENTE_REVISION_IN_OPERATIVE_UI = true;

export function isPendienteRevisionHiddenInOperativeUi(): boolean {
  return HIDE_PENDIENTE_REVISION_IN_OPERATIVE_UI;
}

export function isPendienteRevisionTipoGasto(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim() === TIPO_GASTO_PENDIENTE_REVISION;
}

export function excludePendienteRevisionFromUiTipos<T extends string>(tipos: readonly T[]): T[] {
  if (!isPendienteRevisionHiddenInOperativeUi()) return [...tipos];
  return tipos.filter((t) => t !== TIPO_GASTO_PENDIENTE_REVISION);
}

export function filterGastoTabsForOperativeUi<T extends { tipo_gasto: string }>(tabs: readonly T[]): T[] {
  if (!isPendienteRevisionHiddenInOperativeUi()) return [...tabs];
  return tabs.filter((t) => !isPendienteRevisionTipoGasto(t.tipo_gasto));
}
