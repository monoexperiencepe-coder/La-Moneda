import type { IaClasificacionUiStatus } from '../modules/ai/iaClasificacionTypes';

const STORAGE_PREFIX = 'ia_clasificacion_ui_v1';

export type IaClasificacionUiMap = Record<string, IaClasificacionUiStatus>;

function storageKey(empresaId: string, userId: string): string {
  return `${STORAGE_PREFIX}:${empresaId}:${userId}`;
}

export function loadIaClasificacionUiState(
  empresaId: string,
  userId: string,
): IaClasificacionUiMap {
  try {
    const raw = localStorage.getItem(storageKey(empresaId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IaClasificacionUiMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveIaClasificacionUiState(
  empresaId: string,
  userId: string,
  map: IaClasificacionUiMap,
): void {
  try {
    localStorage.setItem(storageKey(empresaId, userId), JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

export function setIaClasificacionUiStatus(
  empresaId: string,
  userId: string,
  gastoId: number,
  status: IaClasificacionUiStatus,
  current: IaClasificacionUiMap,
): IaClasificacionUiMap {
  const next = { ...current, [String(gastoId)]: status };
  saveIaClasificacionUiState(empresaId, userId, next);
  return next;
}
